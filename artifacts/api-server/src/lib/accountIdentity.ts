import { createPublicKey, createVerify } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";

import type { NextFunction, Request, Response } from "express";

import {
  bearerToken,
  configuredMultiplayerAccountIdentityProvider,
  configuredMultiplayerTrustedUserDisplayNameHeader,
  configuredMultiplayerTrustedUserIdHeader,
} from "./multiplayerAuth";

export const MULTIPLAYER_IDENTITY_REQUIRED_ERROR = "MULTIPLAYER_IDENTITY_REQUIRED";
export const MULTIPLAYER_IDENTITY_INVALID_ERROR = "MULTIPLAYER_IDENTITY_INVALID";

const DEFAULT_OIDC_USER_ID_CLAIM = "sub";
const DEFAULT_OIDC_DISPLAY_NAME_CLAIM = "name";
const DEFAULT_JWKS_CACHE_TTL_MS = 5 * 60 * 1000;
const CLOCK_TOLERANCE_SECONDS = 60;

interface OidcIdentityVerifierConfig {
  issuer: string;
  audience: string;
  jwksUrl: string;
  userIdClaim: string;
  displayNameClaim: string;
  allowInsecureJwksUrl: boolean;
}

interface JwtHeader extends Record<string, unknown> {
  alg?: unknown;
  kid?: unknown;
  typ?: unknown;
}

interface JwtClaims extends Record<string, unknown> {
  aud?: unknown;
  exp?: unknown;
  iss?: unknown;
  nbf?: unknown;
}

interface JwksCacheEntry {
  expiresAt: number;
  keys: Array<Record<string, unknown>>;
}

export interface VerifiedMultiplayerIdentity {
  userId: string;
  displayName?: string;
}

export class MultiplayerIdentityError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 401,
  ) {
    super(message);
  }
}

const jwksCache = new Map<string, JwksCacheEntry>();

export function resolveConfiguredAccountIdentity(req: Request, res: Response, next: NextFunction): void {
  if (configuredMultiplayerAccountIdentityProvider() !== "oidc") {
    next();
    return;
  }

  void resolveOidcRequestIdentity(req.headers)
    .then((identity) => {
      applyVerifiedIdentityToHeaders(req.headers, identity);
      next();
    })
    .catch((error: unknown) => {
      sendIdentityError(res, error);
    });
}

export async function resolveConfiguredSocketIdentityHeaders(
  headers: IncomingHttpHeaders,
  identityToken?: string,
): Promise<IncomingHttpHeaders> {
  if (configuredMultiplayerAccountIdentityProvider() !== "oidc") {
    return headers;
  }

  const identity = await verifyConfiguredOidcIdentityToken(identityToken || identityTokenFromHeaders(headers));
  const resolvedHeaders = { ...headers };
  applyVerifiedIdentityToHeaders(resolvedHeaders, identity);
  return resolvedHeaders;
}

export function identityTokenFromSearchParams(searchParams: URLSearchParams): string | undefined {
  return normalizeToken(
    searchParams.get("identityToken")
      ?? searchParams.get("accountIdentityToken")
      ?? searchParams.get("oidcToken")
      ?? undefined,
  );
}

export async function verifyConfiguredOidcIdentityToken(
  token: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): Promise<VerifiedMultiplayerIdentity> {
  const normalizedToken = normalizeToken(token);
  if (!normalizedToken) {
    throw new MultiplayerIdentityError(
      MULTIPLAYER_IDENTITY_REQUIRED_ERROR,
      "Account identity token is required.",
    );
  }
  const config = oidcIdentityVerifierConfig(env);
  return verifyOidcIdentityToken(normalizedToken, config);
}

export async function verifyOidcIdentityToken(
  token: string,
  config: OidcIdentityVerifierConfig,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<VerifiedMultiplayerIdentity> {
  assertJwksUrlAllowed(config);
  const { header, payload, signingInput, signature } = parseJwt(token);
  if (header.alg !== "RS256") {
    throw new MultiplayerIdentityError(
      MULTIPLAYER_IDENTITY_INVALID_ERROR,
      "Account identity token uses an unsupported signing algorithm.",
    );
  }
  validateOidcClaims(payload, config, nowSeconds);

  const jwks = await fetchJwks(config.jwksUrl);
  if (!verifyRs256Signature(signingInput, signature, header, jwks.keys)) {
    throw new MultiplayerIdentityError(
      MULTIPLAYER_IDENTITY_INVALID_ERROR,
      "Account identity token signature is invalid.",
    );
  }

  const userId = claimString(payload, config.userIdClaim);
  if (!userId) {
    throw new MultiplayerIdentityError(
      MULTIPLAYER_IDENTITY_INVALID_ERROR,
      `Account identity token is missing ${config.userIdClaim}.`,
    );
  }
  const displayName = claimString(payload, config.displayNameClaim);
  return displayName ? { userId, displayName } : { userId };
}

export function clearOidcJwksCacheForTests(): void {
  jwksCache.clear();
}

function resolveOidcRequestIdentity(headers: IncomingHttpHeaders): Promise<VerifiedMultiplayerIdentity> {
  return verifyConfiguredOidcIdentityToken(identityTokenFromHeaders(headers));
}

function identityTokenFromHeaders(headers: IncomingHttpHeaders): string | undefined {
  const authorization = Array.isArray(headers.authorization) ? headers.authorization[0] : headers.authorization;
  const bearer = bearerToken(authorization);
  if (bearer) {
    return bearer;
  }
  const headerToken = headers["x-account-identity-token"];
  return normalizeToken(Array.isArray(headerToken) ? headerToken[0] : headerToken);
}

function applyVerifiedIdentityToHeaders(
  headers: IncomingHttpHeaders,
  identity: VerifiedMultiplayerIdentity,
): void {
  headers[configuredMultiplayerTrustedUserIdHeader()] = identity.userId;
  if (identity.displayName) {
    headers[configuredMultiplayerTrustedUserDisplayNameHeader()] = identity.displayName;
  }
}

function sendIdentityError(res: Response, error: unknown): void {
  if (error instanceof MultiplayerIdentityError) {
    res.status(error.status).json({ error: error.code, message: error.message });
    return;
  }
  res.status(401).json({
    error: MULTIPLAYER_IDENTITY_INVALID_ERROR,
    message: "Account identity token is invalid.",
  });
}

function oidcIdentityVerifierConfig(env: NodeJS.ProcessEnv): OidcIdentityVerifierConfig {
  const issuer = normalizeEnvString(env.MULTIPLAYER_OIDC_ISSUER);
  const audience = normalizeEnvString(env.MULTIPLAYER_OIDC_AUDIENCE);
  const jwksUrl = normalizeEnvString(env.MULTIPLAYER_OIDC_JWKS_URL);
  if (!issuer || !audience || !jwksUrl) {
    throw new MultiplayerIdentityError(
      MULTIPLAYER_IDENTITY_INVALID_ERROR,
      "OIDC identity provider configuration is incomplete.",
      500,
    );
  }
  return {
    issuer,
    audience,
    jwksUrl,
    userIdClaim: normalizeEnvString(env.MULTIPLAYER_OIDC_USER_ID_CLAIM) || DEFAULT_OIDC_USER_ID_CLAIM,
    displayNameClaim: normalizeEnvString(env.MULTIPLAYER_OIDC_DISPLAY_NAME_CLAIM) || DEFAULT_OIDC_DISPLAY_NAME_CLAIM,
    allowInsecureJwksUrl: env.NODE_ENV !== "production" || parseBooleanEnv(env.MULTIPLAYER_OIDC_ALLOW_INSECURE_JWKS),
  };
}

function parseJwt(token: string): {
  header: JwtHeader;
  payload: JwtClaims;
  signature: Buffer;
  signingInput: string;
} {
  const segments = token.split(".");
  if (segments.length !== 3 || segments.some((segment) => !segment)) {
    throw new MultiplayerIdentityError(
      MULTIPLAYER_IDENTITY_INVALID_ERROR,
      "Account identity token must be a compact JWT.",
    );
  }
  return {
    header: decodeJwtJson<JwtHeader>(segments[0], "header"),
    payload: decodeJwtJson<JwtClaims>(segments[1], "payload"),
    signature: Buffer.from(segments[2], "base64url"),
    signingInput: `${segments[0]}.${segments[1]}`,
  };
}

function decodeJwtJson<T extends Record<string, unknown>>(segment: string, label: string): T {
  try {
    const parsed = JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(`${label} is not an object.`);
    }
    return parsed as T;
  } catch {
    throw new MultiplayerIdentityError(
      MULTIPLAYER_IDENTITY_INVALID_ERROR,
      `Account identity token ${label} is invalid.`,
    );
  }
}

function validateOidcClaims(payload: JwtClaims, config: OidcIdentityVerifierConfig, nowSeconds: number): void {
  if (payload.iss !== config.issuer) {
    throw new MultiplayerIdentityError(
      MULTIPLAYER_IDENTITY_INVALID_ERROR,
      "Account identity token issuer is invalid.",
    );
  }
  if (!audienceIncludes(payload.aud, config.audience)) {
    throw new MultiplayerIdentityError(
      MULTIPLAYER_IDENTITY_INVALID_ERROR,
      "Account identity token audience is invalid.",
    );
  }
  if (typeof payload.exp !== "number" || payload.exp <= nowSeconds - CLOCK_TOLERANCE_SECONDS) {
    throw new MultiplayerIdentityError(
      MULTIPLAYER_IDENTITY_INVALID_ERROR,
      "Account identity token is expired.",
    );
  }
  if (typeof payload.nbf === "number" && payload.nbf > nowSeconds + CLOCK_TOLERANCE_SECONDS) {
    throw new MultiplayerIdentityError(
      MULTIPLAYER_IDENTITY_INVALID_ERROR,
      "Account identity token is not valid yet.",
    );
  }
}

function audienceIncludes(aud: unknown, expected: string): boolean {
  if (typeof aud === "string") {
    return aud === expected;
  }
  return Array.isArray(aud) && aud.some((value) => value === expected);
}

async function fetchJwks(jwksUrl: string): Promise<JwksCacheEntry> {
  const cached = jwksCache.get(jwksUrl);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached;
  }
  const response = await fetch(jwksUrl, { headers: { accept: "application/json" } });
  if (!response.ok) {
    throw new MultiplayerIdentityError(
      MULTIPLAYER_IDENTITY_INVALID_ERROR,
      "OIDC JWKS endpoint could not be loaded.",
    );
  }
  const body = await response.json() as unknown;
  const keys = body && typeof body === "object" && Array.isArray((body as { keys?: unknown }).keys)
    ? (body as { keys: unknown[] }).keys.filter(isRecord)
    : [];
  if (keys.length === 0) {
    throw new MultiplayerIdentityError(
      MULTIPLAYER_IDENTITY_INVALID_ERROR,
      "OIDC JWKS endpoint did not return signing keys.",
    );
  }
  const entry = { expiresAt: now + DEFAULT_JWKS_CACHE_TTL_MS, keys };
  jwksCache.set(jwksUrl, entry);
  return entry;
}

function verifyRs256Signature(
  signingInput: string,
  signature: Buffer,
  header: JwtHeader,
  keys: Array<Record<string, unknown>>,
): boolean {
  for (const jwk of matchingSigningKeys(keys, header)) {
    try {
      const verify = createVerify("RSA-SHA256");
      verify.update(signingInput);
      verify.end();
      const publicKey = createPublicKey({ key: jwk, format: "jwk" } as Parameters<typeof createPublicKey>[0]);
      if (verify.verify(publicKey, signature)) {
        return true;
      }
    } catch {
      continue;
    }
  }
  return false;
}

function matchingSigningKeys(keys: Array<Record<string, unknown>>, header: JwtHeader): Array<Record<string, unknown>> {
  return keys.filter((jwk) => {
    if (jwk.kty !== "RSA") {
      return false;
    }
    if (jwk.use && jwk.use !== "sig") {
      return false;
    }
    if (jwk.alg && jwk.alg !== "RS256") {
      return false;
    }
    return typeof header.kid !== "string" || jwk.kid === header.kid;
  });
}

function assertJwksUrlAllowed(config: OidcIdentityVerifierConfig): void {
  let url: URL;
  try {
    url = new URL(config.jwksUrl);
  } catch {
    throw new MultiplayerIdentityError(
      MULTIPLAYER_IDENTITY_INVALID_ERROR,
      "OIDC JWKS URL is invalid.",
      500,
    );
  }
  if (url.protocol !== "https:" && !config.allowInsecureJwksUrl) {
    throw new MultiplayerIdentityError(
      MULTIPLAYER_IDENTITY_INVALID_ERROR,
      "OIDC JWKS URL must use https.",
      500,
    );
  }
}

function claimString(payload: JwtClaims, claim: string): string | undefined {
  const value = payload[claim];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeToken(value: string | null | undefined): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeEnvString(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseBooleanEnv(value: string | undefined): boolean {
  return /^(1|true|yes|on)$/i.test(normalizeEnvString(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

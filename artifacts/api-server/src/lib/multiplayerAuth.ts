import { createHash, timingSafeEqual } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";

import type { NextFunction, Request, Response } from "express";

export const MULTIPLAYER_AUTH_ERROR = "MULTIPLAYER_AUTH_REQUIRED";
export const MULTIPLAYER_TRUSTED_USER_REQUIRED_ERROR = "MULTIPLAYER_TRUSTED_USER_REQUIRED";
export const INTERNAL_MULTIPLAYER_USER_ID_HEADER = "x-worlddomination-user-id";
export const INTERNAL_MULTIPLAYER_USER_DISPLAY_NAME_HEADER = "x-worlddomination-user-display-name";

export type MultiplayerAccountIdentityProvider = "trusted-header" | "oidc";

export function configuredMultiplayerApiAuthToken(): string {
  return normalizeAuthToken(process.env.MULTIPLAYER_API_AUTH_TOKEN);
}

export function configuredMultiplayerTrustedUserIdHeader(): string {
  const configured = normalizeHeaderName(process.env.MULTIPLAYER_TRUSTED_USER_ID_HEADER);
  return configured || (configuredMultiplayerAccountIdentityProvider() === "oidc" ? INTERNAL_MULTIPLAYER_USER_ID_HEADER : "");
}

export function configuredMultiplayerTrustedUserDisplayNameHeader(): string {
  const configured = normalizeHeaderName(process.env.MULTIPLAYER_TRUSTED_USER_DISPLAY_NAME_HEADER);
  return configured
    || (configuredMultiplayerAccountIdentityProvider() === "oidc" ? INTERNAL_MULTIPLAYER_USER_DISPLAY_NAME_HEADER : "");
}

export function configuredMultiplayerRequireTrustedUser(): boolean {
  return parseBoolean(process.env.MULTIPLAYER_REQUIRE_TRUSTED_USER);
}

export function configuredMultiplayerAccountIdentityProvider(
  env: NodeJS.ProcessEnv = process.env,
): MultiplayerAccountIdentityProvider {
  const raw = normalizeEnvString(env.MULTIPLAYER_ACCOUNT_IDENTITY_PROVIDER || env.MULTIPLAYER_IDENTITY_PROVIDER)
    .toLowerCase();
  return raw === "oidc" || raw === "oidc-jwt" || raw === "jwt" ? "oidc" : "trusted-header";
}

export function requireMultiplayerApiAuth(req: Request, res: Response, next: NextFunction): void {
  if (readRequestAuthTokens(req).some((token) => isMultiplayerApiAuthorized(token))) {
    next();
    return;
  }

  res.status(401).json({
    error: MULTIPLAYER_AUTH_ERROR,
    message: "Multiplayer API authorization is required.",
  });
}

export function requireTrustedMultiplayerUser(req: Request, res: Response, next: NextFunction): void {
  if (!configuredMultiplayerRequireTrustedUser()) {
    next();
    return;
  }

  if (trustedMultiplayerUserIdFromHeaders(req.headers)) {
    next();
    return;
  }

  res.status(401).json({
    error: MULTIPLAYER_TRUSTED_USER_REQUIRED_ERROR,
    message: "Trusted multiplayer user identity is required.",
  });
}

export function readRequestAuthTokens(req: Request): string[] {
  return uniqueAuthTokens([
    bearerToken(req.headers.authorization),
    headerString(req.headers["x-multiplayer-auth"]),
    queryString(req.query.apiAuthToken),
    queryString(req.query.multiplayerAuthToken),
  ]);
}

export function isMultiplayerApiAuthorized(
  providedToken: string | undefined,
  requiredToken = configuredMultiplayerApiAuthToken(),
): boolean {
  const normalizedRequired = normalizeAuthToken(requiredToken);
  if (!normalizedRequired) {
    return true;
  }

  const normalizedProvided = normalizeAuthToken(providedToken);
  if (!normalizedProvided) {
    return false;
  }

  return constantTimeEqual(normalizedProvided, normalizedRequired);
}

export function authTokenFromSearchParams(searchParams: URLSearchParams): string | undefined {
  return normalizeAuthToken(searchParams.get("apiAuthToken") ?? searchParams.get("multiplayerAuthToken") ?? undefined);
}

export function trustedMultiplayerUserIdFromHeaders(
  headers: IncomingHttpHeaders,
  trustedHeaderName = configuredMultiplayerTrustedUserIdHeader(),
): string | undefined {
  if (!trustedHeaderName) {
    return undefined;
  }
  const value = headers[trustedHeaderName];
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}

export function trustedMultiplayerUserDisplayNameFromHeaders(
  headers: IncomingHttpHeaders,
  trustedHeaderName = configuredMultiplayerTrustedUserDisplayNameHeader(),
): string | undefined {
  if (!trustedHeaderName) {
    return undefined;
  }
  const value = headers[trustedHeaderName];
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}

export function bearerToken(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const match = /^Bearer\s+(.+)$/i.exec(value);
  return match?.[1];
}

function normalizeAuthToken(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEnvString(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeHeaderName(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function parseBoolean(value: string | null | undefined): boolean {
  return /^(1|true|yes|on)$/i.test(typeof value === "string" ? value.trim() : "");
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftHash = createHash("sha256").update(left).digest();
  const rightHash = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftHash, rightHash);
}

function headerString(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function queryString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function uniqueAuthTokens(values: Array<string | undefined>): string[] {
  const tokens: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const token = normalizeAuthToken(value);
    if (!token || seen.has(token)) {
      continue;
    }
    tokens.push(token);
    seen.add(token);
  }
  return tokens;
}

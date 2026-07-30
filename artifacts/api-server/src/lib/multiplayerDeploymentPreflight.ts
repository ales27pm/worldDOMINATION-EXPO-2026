const ENABLED_ENV_VALUES = new Set(["1", "true", "yes", "on"]);

export function assertMultiplayerDeploymentPreflight(env: NodeJS.ProcessEnv = process.env): void {
  const errors = multiplayerDeploymentPreflightErrors(env);
  if (errors.length > 0) {
    throw new Error(`Multiplayer deployment preflight failed: ${errors.join(" ")}`);
  }
}

export function multiplayerDeploymentPreflightErrors(env: NodeJS.ProcessEnv = process.env): string[] {
  const errors: string[] = [];
  const databaseStoreEnabled = parseBooleanEnv(env.MULTIPLAYER_DATABASE_STORE);
  const trustedUserRequired = parseBooleanEnv(env.MULTIPLAYER_REQUIRE_TRUSTED_USER);
  const databaseUrl = normalizeEnvString(env.DATABASE_URL);
  const apiAuthToken = normalizeEnvString(env.MULTIPLAYER_API_AUTH_TOKEN);
  const trustedUserHeader = normalizeEnvString(env.MULTIPLAYER_TRUSTED_USER_ID_HEADER);
  const accountDirectoryStore = normalizeEnvString(env.MULTIPLAYER_ACCOUNT_DIRECTORY_STORE);
  const identityProvider = configuredIdentityProvider(env);
  const host = normalizeEnvString(env.HOST).toLowerCase();

  if (identityProvider === "invalid") {
    addError(errors, "MULTIPLAYER_ACCOUNT_IDENTITY_PROVIDER must be trusted-header or oidc.");
  }
  if (databaseStoreEnabled && !databaseUrl) {
    addError(errors, "DATABASE_URL is required when MULTIPLAYER_DATABASE_STORE=1.");
  }
  if (trustedUserRequired && identityProvider !== "oidc" && !trustedUserHeader) {
    addError(errors, "MULTIPLAYER_TRUSTED_USER_ID_HEADER is required when MULTIPLAYER_REQUIRE_TRUSTED_USER=1.");
  }
  if (identityProvider === "oidc") {
    addOidcConfigErrors(errors, env, shouldRunProductionPreflight(env));
  }

  if (!shouldRunProductionPreflight(env)) {
    return errors;
  }

  if (!apiAuthToken) {
    addError(errors, "MULTIPLAYER_API_AUTH_TOKEN is required for production multiplayer deployments.");
  }
  if (!databaseStoreEnabled) {
    addError(errors, "MULTIPLAYER_DATABASE_STORE=1 is required for production multiplayer deployments.");
  }
  if (!databaseUrl) {
    addError(errors, "DATABASE_URL is required for production multiplayer deployments.");
  }
  if (identityProvider !== "oidc" && !trustedUserHeader) {
    addError(errors, "MULTIPLAYER_TRUSTED_USER_ID_HEADER is required for production multiplayer deployments.");
  }
  if (identityProvider === "trusted-header" && !isLoopbackHost(host)) {
    addError(errors, "HOST must bind to loopback when MULTIPLAYER_ACCOUNT_IDENTITY_PROVIDER=trusted-header.");
  }
  if (!trustedUserRequired) {
    addError(errors, "MULTIPLAYER_REQUIRE_TRUSTED_USER=1 is required for production multiplayer deployments.");
  }
  if (accountDirectoryStore !== "postgres") {
    addError(errors, "MULTIPLAYER_ACCOUNT_DIRECTORY_STORE=postgres is required for production multiplayer deployments.");
  }

  return errors;
}

function addOidcConfigErrors(errors: string[], env: NodeJS.ProcessEnv, requireHttps: boolean): void {
  const issuer = normalizeEnvString(env.MULTIPLAYER_OIDC_ISSUER);
  const audience = normalizeEnvString(env.MULTIPLAYER_OIDC_AUDIENCE);
  const jwksUrl = normalizeEnvString(env.MULTIPLAYER_OIDC_JWKS_URL);
  if (!issuer) {
    addError(errors, "MULTIPLAYER_OIDC_ISSUER is required when MULTIPLAYER_ACCOUNT_IDENTITY_PROVIDER=oidc.");
  }
  if (!audience) {
    addError(errors, "MULTIPLAYER_OIDC_AUDIENCE is required when MULTIPLAYER_ACCOUNT_IDENTITY_PROVIDER=oidc.");
  }
  if (!jwksUrl) {
    addError(errors, "MULTIPLAYER_OIDC_JWKS_URL is required when MULTIPLAYER_ACCOUNT_IDENTITY_PROVIDER=oidc.");
  }
  if (requireHttps && jwksUrl && !isHttpsUrl(jwksUrl)) {
    addError(errors, "MULTIPLAYER_OIDC_JWKS_URL must be https for production multiplayer deployments.");
  }
}

function shouldRunProductionPreflight(env: NodeJS.ProcessEnv): boolean {
  return env.NODE_ENV === "production" || parseBooleanEnv(env.MULTIPLAYER_PRODUCTION_PREFLIGHT);
}

function configuredIdentityProvider(env: NodeJS.ProcessEnv): "trusted-header" | "oidc" | "invalid" {
  const raw = normalizeEnvString(env.MULTIPLAYER_ACCOUNT_IDENTITY_PROVIDER || env.MULTIPLAYER_IDENTITY_PROVIDER).toLowerCase();
  if (!raw || raw === "trusted-header" || raw === "trusted_header" || raw === "header") {
    return "trusted-header";
  }
  if (raw === "oidc" || raw === "oidc-jwt" || raw === "jwt") {
    return "oidc";
  }
  return "invalid";
}

function normalizeEnvString(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseBooleanEnv(value: string | undefined): boolean {
  return ENABLED_ENV_VALUES.has(normalizeEnvString(value).toLowerCase());
}

function addError(errors: string[], error: string): void {
  if (!errors.includes(error)) {
    errors.push(error);
  }
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function isLoopbackHost(value: string): boolean {
  return value === "127.0.0.1" || value === "::1" || value === "localhost";
}

#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const args = new Set(process.argv.slice(2));
const staticOnly = args.has("--static-only");
const jsonOutput = args.has("--json");
const envFiles = readArgValues("--env-file");
const env = {
  ...process.env,
  ...Object.assign({}, ...envFiles.map((envFile) => readEnvFile(envFile))),
};
const checks = [];

void main().catch((error) => {
  checks.push({
    name: "release readiness script completed",
    status: "fail",
    message: error instanceof Error ? error.message : "Unexpected release readiness failure.",
  });
  finish();
});

async function main() {
  checkStaticReleaseConfig();
  if (!staticOnly) {
    await checkProductionEnvironment();
  }
  finish();
}

function finish() {
  const failures = checks.filter((check) => check.status === "fail");
  if (jsonOutput) {
    process.stdout.write(`${JSON.stringify({ ok: failures.length === 0, checks }, null, 2)}\n`);
  } else if (failures.length === 0) {
    console.log(`[release-readiness] ok ${checks.length} checks passed${staticOnly ? " (static only)" : ""}`);
  } else {
    console.error(`[release-readiness] failed ${failures.length}/${checks.length} checks`);
    for (const failure of failures) {
      console.error(`- ${failure.name}: ${failure.message}`);
    }
  }

  process.exitCode = failures.length === 0 ? 0 : 1;
}

function checkStaticReleaseConfig() {
  const appConfig = readJson("artifacts/mobile/app.json");
  const expo = record(appConfig.expo);
  const ios = record(expo.ios);
  const android = record(expo.android);

  passIf("app name is configured", nonEmptyString(expo.name), "expo.name is required.");
  passIf("app slug is configured", nonEmptyString(expo.slug), "expo.slug is required.");
  passIf("app version is semver", /^\d+\.\d+\.\d+$/.test(String(expo.version ?? "")), "expo.version must be x.y.z.");
  passIf("deep link scheme is configured", nonEmptyString(expo.scheme), "expo.scheme is required.");
  passIf("ios bundle identifier is configured", nonEmptyString(ios.bundleIdentifier), "expo.ios.bundleIdentifier is required.");
  passIf("android package is configured", nonEmptyString(android.package), "expo.android.package is required.");

  const eas = readJson("artifacts/mobile/eas.json");
  const build = record(eas.build);
  const submit = record(eas.submit);
  const preview = record(build.preview);
  const previewAndroid = record(preview.android);
  const previewIos = record(preview.ios);
  const previewEnv = record(preview.env);
  const qualificationBaseline = record(build["qualification-baseline"]);
  const qualificationBaselineEnv = record(qualificationBaseline.env);
  const qualificationVariant = record(build["qualification-variant"]);
  const qualificationVariantEnv = record(qualificationVariant.env);
  const production = record(build.production);
  const productionAndroid = record(production.android);
  const productionIos = record(production.ios);
  const productionEnv = record(production.env);
  const submitProduction = record(submit.production);
  const submitAndroid = record(submitProduction.android);
  const submitIos = record(submitProduction.ios);

  passIf("preview build is internal distribution", preview.distribution === "internal", "build.preview.distribution must be internal.");
  passIf("preview android emits installable apk", previewAndroid.buildType === "apk", "build.preview.android.buildType must be apk.");
  passIf("preview ios targets physical devices", previewIos.simulator === false, "build.preview.ios.simulator must be false.");
  passIf(
    "ordinary preview keeps unqualified R3F effects off",
    previewEnv.EXPO_PUBLIC_R3F_BATTLE_INSTANCING === "0" &&
      previewEnv.EXPO_PUBLIC_R3F_CONQUEST_PULSE === "0" &&
      previewEnv.EXPO_PUBLIC_R3F_ORDER_REVEAL === "0" &&
      previewEnv.EXPO_PUBLIC_R3F_STYLIZED_WATER === "0" &&
      previewEnv.EXPO_PUBLIC_R3F_QUALIFICATION === "0",
    "build.preview.env must explicitly disable every unqualified R3F effect.",
  );
  passIf(
    "R3F baseline qualification profile is fail-closed",
    qualificationBaseline.extends === "preview" &&
      qualificationBaselineEnv.EXPO_PUBLIC_R3F_BATTLE_INSTANCING === "0" &&
      qualificationBaselineEnv.EXPO_PUBLIC_R3F_CONQUEST_PULSE === "0" &&
      qualificationBaselineEnv.EXPO_PUBLIC_R3F_ORDER_REVEAL === "0" &&
      qualificationBaselineEnv.EXPO_PUBLIC_R3F_STYLIZED_WATER === "0" &&
      qualificationBaselineEnv.EXPO_PUBLIC_R3F_QUALIFICATION === "1",
    "build.qualification-baseline must extend preview, enable qualification, and disable all candidate effects.",
  );
  passIf(
    "R3F variant qualification profile enables only proposed effects",
    qualificationVariant.extends === "preview" &&
      qualificationVariantEnv.EXPO_PUBLIC_R3F_BATTLE_INSTANCING === "1" &&
      qualificationVariantEnv.EXPO_PUBLIC_R3F_CONQUEST_PULSE === "1" &&
      qualificationVariantEnv.EXPO_PUBLIC_R3F_ORDER_REVEAL === "1" &&
      qualificationVariantEnv.EXPO_PUBLIC_R3F_STYLIZED_WATER === "0" &&
      qualificationVariantEnv.EXPO_PUBLIC_R3F_QUALIFICATION === "1",
    "build.qualification-variant must enable instancing, pulse, and reveal with water disabled.",
  );
  passIf("production build is store distribution", production.distribution === "store", "build.production.distribution must be store.");
  passIf("production android emits app bundle", productionAndroid.buildType === "app-bundle", "build.production.android.buildType must be app-bundle.");
  passIf("production ios targets physical devices", productionIos.simulator === false, "build.production.ios.simulator must be false.");
  passIf("production build auto-increments", production.autoIncrement === true, "build.production.autoIncrement must be true.");
  passIf("production channel is configured", production.channel === "production", "build.production.channel must be production.");
  passIf(
    "production keeps unqualified R3F effects off",
    productionEnv.EXPO_PUBLIC_R3F_BATTLE_INSTANCING === "0" &&
      productionEnv.EXPO_PUBLIC_R3F_CONQUEST_PULSE === "0" &&
      productionEnv.EXPO_PUBLIC_R3F_ORDER_REVEAL === "0" &&
      productionEnv.EXPO_PUBLIC_R3F_STYLIZED_WATER === "0" &&
      productionEnv.EXPO_PUBLIC_R3F_QUALIFICATION === "0",
    "build.production.env must explicitly disable every R3F effect until physical comparison passes.",
  );
  passIf("android submit starts as internal draft", submitAndroid.track === "internal" && submitAndroid.releaseStatus === "draft", "submit.production.android must use internal/draft first.");
  passIf("ios submit bundle matches app config", submitIos.bundleIdentifier === ios.bundleIdentifier, "submit.production.ios.bundleIdentifier must match app config.");

  const mobileIgnore = readText("artifacts/mobile/.gitignore");
  passIf("mobile credentials are ignored", /(^|\n)credentials\.json(\n|$)/.test(mobileIgnore), "artifacts/mobile/.gitignore must ignore credentials.json.");
  passIf("apple private keys are ignored", /(^|\n)\*\.p8(\n|$)/.test(mobileIgnore), "artifacts/mobile/.gitignore must ignore *.p8.");
  passIf("android keystores are ignored", /(^|\n)\*\.jks(\n|$)/.test(mobileIgnore), "artifacts/mobile/.gitignore must ignore *.jks.");
}

async function checkProductionEnvironment() {
  requireExact("NODE_ENV", "production");
  requirePositiveInteger("PORT");
  requireNonEmpty("DATABASE_URL");
  requireExact("MULTIPLAYER_DATABASE_STORE", "1");
  requireSecret("MULTIPLAYER_API_AUTH_TOKEN", 32);
  checkAccountIdentity();
  requireExact("MULTIPLAYER_REQUIRE_TRUSTED_USER", "1");
  requireExact("MULTIPLAYER_ACCOUNT_DIRECTORY_STORE", "postgres");
  requireNonEmpty("ALLOWED_ORIGINS");

  requireHttpsUrl("EXPO_PUBLIC_API_BASE_URL");
  requirePublicDomain("EXPO_PUBLIC_DOMAIN");
  passIf(
    "app origin is allowed by API CORS",
    allowedOrigins().has(`https://${trim(env.EXPO_PUBLIC_DOMAIN)}`),
    "ALLOWED_ORIGINS must include https://$EXPO_PUBLIC_DOMAIN.",
  );
  await checkLiveApiHealth();

  checkContacts();
  checkInvitationDelivery();
  checkStoreSubmissionInputs();
  checkDeviceProof();
}

async function checkLiveApiHealth() {
  const apiBaseUrl = normalizeApiBaseUrl(trim(env.EXPO_PUBLIC_API_BASE_URL));
  if (!isHttpsUrl(apiBaseUrl) || isLocalhostUrl(apiBaseUrl)) {
    passIf("live API health endpoint responds", false, "EXPO_PUBLIC_API_BASE_URL must be a public https API URL before live health can be checked.");
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  const healthUrl = `${apiBaseUrl}/healthz`;
  try {
    const response = await fetch(healthUrl, {
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    const body = await readJsonResponse(response);
    passIf(
      "live API health endpoint responds",
      response.ok && body?.status === "ok",
      `${healthUrl} must return HTTP 2xx JSON with status=ok.`,
    );
    passIf(
      "live API uses durable hosting",
      !isEphemeralTunnelUrl(apiBaseUrl),
      "Replace account-less quick-tunnel hosting with a durable production API hostname.",
    );
  } catch (error) {
    passIf(
      "live API health endpoint responds",
      false,
      `${healthUrl} could not be verified: ${error instanceof Error ? error.message : "request failed"}.`,
    );
    passIf(
      "live API uses durable hosting",
      !isEphemeralTunnelUrl(apiBaseUrl),
      "Replace account-less quick-tunnel hosting with a durable production API hostname.",
    );
  } finally {
    clearTimeout(timeout);
  }
}

function checkAccountIdentity() {
  const provider = identityProvider();
  passIf(
    "account identity provider is configured",
    provider === "trusted-header" || provider === "oidc",
    "Set MULTIPLAYER_ACCOUNT_IDENTITY_PROVIDER to trusted-header or oidc.",
  );
  if (provider === "oidc") {
    requireHttpsUrl("MULTIPLAYER_OIDC_ISSUER");
    requireNonEmpty("MULTIPLAYER_OIDC_AUDIENCE");
    requireHttpsUrl("MULTIPLAYER_OIDC_JWKS_URL");
    return;
  }
  requireNonEmpty("MULTIPLAYER_TRUSTED_USER_ID_HEADER");
  requireEvidence(
    "trusted identity boundary proof is attached",
    "MULTIPLAYER_IDENTITY_BOUNDARY_PROOF_ARTIFACT",
    "MULTIPLAYER_IDENTITY_BOUNDARY_PROOF_URL",
    "Attach evidence that an authenticated upstream proxy owns and sanitizes the trusted user header, or deploy OIDC identity.",
  );
}

function checkContacts() {
  const contactsJson = trim(env.MULTIPLAYER_CONTACTS_JSON);
  const contactsPath = trim(env.MULTIPLAYER_CONTACTS_PATH);
  passIf(
    "persistent account contact directory is configured",
    trim(env.MULTIPLAYER_ACCOUNT_DIRECTORY_STORE).toLowerCase() === "postgres",
    "Set MULTIPLAYER_ACCOUNT_DIRECTORY_STORE=postgres for production contact discovery.",
  );
  if (contactsJson) {
    try {
      const parsed = JSON.parse(contactsJson);
      const contacts = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.contacts) ? parsed.contacts : [];
      passIf(
        "trusted contacts json has entries",
        contacts.some((contact) => nonEmptyString(contact?.ownerUserId) && nonEmptyString(contact?.userId)),
        "MULTIPLAYER_CONTACTS_JSON must contain contacts with ownerUserId and userId.",
      );
    } catch {
      fail("trusted contacts json is valid", "MULTIPLAYER_CONTACTS_JSON is not valid JSON.");
    }
  }
  if (contactsPath) {
    requireExistingFile("MULTIPLAYER_CONTACTS_PATH");
  }
}

function checkInvitationDelivery() {
  const webhookUrl = trim(env.MULTIPLAYER_INVITATION_WEBHOOK_URL);
  const smtpUrl = trim(env.MULTIPLAYER_INVITATION_EMAIL_SMTP_URL);
  const smtpFrom = trim(env.MULTIPLAYER_INVITATION_EMAIL_FROM);
  passIf(
    "deployed invitation notification channel is configured",
    Boolean(webhookUrl || (smtpUrl && smtpFrom)),
    "Set MULTIPLAYER_INVITATION_WEBHOOK_URL or both MULTIPLAYER_INVITATION_EMAIL_SMTP_URL and MULTIPLAYER_INVITATION_EMAIL_FROM.",
  );
  if (webhookUrl) {
    passIf("invitation webhook is https", isHttpsUrl(webhookUrl), "MULTIPLAYER_INVITATION_WEBHOOK_URL must be https.");
  }
  if (smtpUrl || smtpFrom) {
    passIf("smtp invitation channel is complete", Boolean(smtpUrl && smtpFrom), "SMTP invitations require URL and from address.");
  }
  checkInvitationNotificationProof();
}

function checkStoreSubmissionInputs() {
  passIf(
    "Expo automation token is configured",
    Boolean(trim(env.EXPO_TOKEN) || trim(env.EAS_ACCESS_TOKEN)),
    "Set EXPO_TOKEN or EAS_ACCESS_TOKEN for non-interactive EAS build/submit.",
  );
  requireExistingFile("GOOGLE_SERVICE_ACCOUNT_KEY_PATH");
  checkIosSubmissionInputs();
  requireNonEmpty("APPLE_TEAM_ID");
}

function checkDeviceProof() {
  const proofArtifact = trim(env.MULTIPLAYER_DEVICE_PROOF_ARTIFACT);
  const proofUrl = trim(env.MULTIPLAYER_DEVICE_PROOF_URL);
  passIf(
    "deployed multi-client proof is attached",
    Boolean((proofArtifact && fileExists(proofArtifact)) || (proofUrl && isHttpsUrl(proofUrl))),
    "Set MULTIPLAYER_DEVICE_PROOF_ARTIFACT to an existing evidence file or MULTIPLAYER_DEVICE_PROOF_URL to an https evidence URL.",
  );

  const physicalArtifact = trim(env.MULTIPLAYER_PHYSICAL_DEVICE_PROOF_ARTIFACT);
  const physicalUrl = trim(env.MULTIPLAYER_PHYSICAL_DEVICE_PROOF_URL);
  if (physicalUrl) {
    passIf(
      "physical multi-device proof is attached",
      isHttpsUrl(physicalUrl),
      "MULTIPLAYER_PHYSICAL_DEVICE_PROOF_URL must be an https evidence URL.",
    );
    return;
  }
  if (!physicalArtifact || !fileExists(physicalArtifact)) {
    passIf(
      "physical multi-device proof is attached",
      false,
      "Set MULTIPLAYER_PHYSICAL_DEVICE_PROOF_ARTIFACT to a physical-multi-device JSON evidence file or MULTIPLAYER_PHYSICAL_DEVICE_PROOF_URL to an https evidence URL.",
    );
    return;
  }

  try {
    const proof = readJsonFile(physicalArtifact);
    const devices = Array.isArray(proof.devices) ? proof.devices : [];
    const uniqueDeviceIds = new Set(devices.map((device) => trim(device?.id)).filter(Boolean));
    passIf(
      "physical multi-device proof is attached",
      proof.kind === "physical-multi-device" &&
        uniqueDeviceIds.size >= 2 &&
        nonEmptyString(proof.matchId) &&
        isHttpsUrl(proof.apiBaseUrl) &&
        validIsoDate(proof.verifiedAt),
      "Physical proof JSON must declare kind=physical-multi-device, two distinct device ids, matchId, https apiBaseUrl, and verifiedAt.",
    );
  } catch {
    passIf(
      "physical multi-device proof is attached",
      false,
      "MULTIPLAYER_PHYSICAL_DEVICE_PROOF_ARTIFACT must contain valid JSON.",
    );
  }
}

function checkInvitationNotificationProof() {
  const artifact = trim(env.MULTIPLAYER_INVITATION_NOTIFICATION_PROOF_ARTIFACT);
  const proofUrl = trim(env.MULTIPLAYER_INVITATION_NOTIFICATION_PROOF_URL);
  if (proofUrl) {
    passIf(
      "deployed invitation delivery proof is attached",
      isHttpsUrl(proofUrl),
      "MULTIPLAYER_INVITATION_NOTIFICATION_PROOF_URL must be an https evidence URL.",
    );
    return;
  }
  if (!artifact || !fileExists(artifact)) {
    passIf(
      "deployed invitation delivery proof is attached",
      false,
      "Set MULTIPLAYER_INVITATION_NOTIFICATION_PROOF_ARTIFACT to a verified delivery artifact or MULTIPLAYER_INVITATION_NOTIFICATION_PROOF_URL to an https evidence URL.",
    );
    return;
  }

  try {
    const proof = readJsonFile(artifact);
    passIf(
      "deployed invitation delivery proof is attached",
      proof.notification?.type === "multiplayer.seat_invitation.created" &&
        proof.notification?.recipientMatched === true &&
        proof.notification?.inviterMatched === true &&
        validIsoDate(proof.notification?.receivedAt),
      "Invitation proof JSON must confirm the invitation event, recipient, inviter, and receivedAt timestamp.",
    );
  } catch {
    passIf(
      "deployed invitation delivery proof is attached",
      false,
      "MULTIPLAYER_INVITATION_NOTIFICATION_PROOF_ARTIFACT must contain valid JSON.",
    );
  }
}

function checkIosSubmissionInputs() {
  const keyPath = trim(env.ASC_API_KEY_PATH);
  const keyId = trim(env.ASC_API_KEY_ID);
  const issuerId = trim(env.ASC_API_KEY_ISSUER_ID);
  if (keyPath || keyId || issuerId) {
    passIf(
      "App Store Connect submission credentials are complete",
      Boolean(keyPath && fileExists(keyPath) && keyId && issuerId),
      "ASC_API_KEY_PATH, ASC_API_KEY_ID, and ASC_API_KEY_ISSUER_ID must all be configured, and the key file must exist.",
    );
    return;
  }

  const proofArtifact = trim(env.EAS_IOS_SUBMISSION_PROOF_ARTIFACT);
  if (!proofArtifact || !fileExists(proofArtifact)) {
    passIf(
      "finished iOS store submission is proven",
      false,
      "Configure local ASC API-key inputs or set EAS_IOS_SUBMISSION_PROOF_ARTIFACT to a finished EAS submission-status JSON artifact.",
    );
    return;
  }

  try {
    const proof = readJsonFile(proofArtifact);
    const eas = readJson("artifacts/mobile/eas.json");
    const expectedAscAppId = trim(eas.submit?.production?.ios?.ascAppId);
    passIf(
      "finished iOS store submission is proven",
      proof.status === "FINISHED" &&
        proof.platform === "IOS" &&
        proof.error === null &&
        nonEmptyString(proof.id) &&
        trim(proof.iosConfig?.ascAppIdentifier) === expectedAscAppId,
      "EAS submission proof must be FINISHED for IOS, have no error, and match submit.production.ios.ascAppId.",
    );
  } catch {
    passIf(
      "finished iOS store submission is proven",
      false,
      "EAS_IOS_SUBMISSION_PROOF_ARTIFACT must contain valid JSON.",
    );
  }
}

function requireEvidence(name, artifactName, urlName, message) {
  const artifact = trim(env[artifactName]);
  const proofUrl = trim(env[urlName]);
  passIf(
    name,
    Boolean((artifact && fileExists(artifact)) || (proofUrl && isHttpsUrl(proofUrl))),
    message,
  );
}

function requireExact(name, expected) {
  passIf(`${name}=${expected}`, trim(env[name]) === expected, `${name} must be ${expected}.`);
}

function requirePositiveInteger(name) {
  const value = Number(trim(env[name]));
  passIf(`${name} is positive integer`, Number.isInteger(value) && value > 0, `${name} must be a positive integer.`);
}

function requireNonEmpty(name) {
  passIf(`${name} is configured`, Boolean(trim(env[name])), `${name} is required.`);
}

function requireSecret(name, minLength) {
  passIf(`${name} has production length`, trim(env[name]).length >= minLength, `${name} must be at least ${minLength} characters.`);
}

function requireHttpsUrl(name) {
  const value = trim(env[name]);
  passIf(`${name} is https URL`, isHttpsUrl(value), `${name} must be an https URL.`);
  passIf(`${name} is not localhost`, !isLocalhostUrl(value), `${name} must not point at localhost.`);
}

function requirePublicDomain(name) {
  const value = trim(env[name]);
  passIf(`${name} is configured`, Boolean(value), `${name} is required.`);
  passIf(`${name} is a hostname`, /^[a-z0-9.-]+$/i.test(value) && !value.includes(".."), `${name} must be a bare hostname.`);
}

function requireExistingFile(name) {
  const value = trim(env[name]);
  passIf(`${name} is configured`, Boolean(value), `${name} is required.`);
  if (value) {
    passIf(`${name} exists`, fileExists(value), `${name} must point to an existing file.`);
  }
}

function allowedOrigins() {
  return new Set(trim(env.ALLOWED_ORIGINS).split(",").map((value) => value.trim()).filter(Boolean));
}

function identityProvider() {
  const raw = trim(env.MULTIPLAYER_ACCOUNT_IDENTITY_PROVIDER || env.MULTIPLAYER_IDENTITY_PROVIDER).toLowerCase();
  if (!raw || raw === "trusted-header" || raw === "trusted_header" || raw === "header") {
    return "trusted-header";
  }
  if (raw === "oidc" || raw === "oidc-jwt" || raw === "jwt") {
    return "oidc";
  }
  return "invalid";
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), "utf8"));
}

function readText(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function readEnvFile(filePath) {
  const resolved = path.resolve(filePath);
  const values = {};
  for (const line of fs.readFileSync(resolved, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(trimmed);
    if (!match) continue;
    values[match[1]] = unquote(match[2].trim());
  }
  return values;
}

function readArgValues(name) {
  const values = [];
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] !== name) continue;
    const value = process.argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${name} requires a value.`);
    }
    values.push(value);
  }
  return values;
}

function unquote(value) {
  if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function passIf(name, condition, message) {
  checks.push(condition ? { name, status: "pass" } : { name, status: "fail", message });
}

function fail(name, message) {
  checks.push({ name, status: "fail", message });
}

function fileExists(filePath) {
  try {
    return fs.statSync(path.resolve(filePath)).isFile();
  } catch {
    return false;
  }
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function trim(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

function isLocalhostUrl(value) {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
  } catch {
    return /\/\/(localhost|127\.0\.0\.1|\[::1\])(?::|\/|$)/i.test(value);
  }
}

function isEphemeralTunnelUrl(value) {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === "trycloudflare.com" || hostname.endsWith(".trycloudflare.com");
  } catch {
    return false;
  }
}

function validIsoDate(value) {
  return nonEmptyString(value) && Number.isFinite(Date.parse(value));
}

function normalizeApiBaseUrl(value) {
  const trimmed = value.replace(/\/+$/, "");
  return /\/api$/i.test(trimmed) ? trimmed : `${trimmed}/api`;
}

async function readJsonResponse(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

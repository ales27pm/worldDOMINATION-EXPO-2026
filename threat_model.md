# Threat Model

## Project Overview

A Node.js/Express 5 API server (TypeScript, pnpm workspaces) backed by PostgreSQL (Drizzle ORM) and Google Cloud Storage (Replit Object Storage). A previous Replit autoscale target is documented at `https://code-react-native.replit.app`, but current verification on 2026-07-29 returned Replit 404 not-live pages for `/`, `/api/healthz`, `/api/health`, and `/healthz`; treat that URL as an intended or stale deployment target until a fresh deployment is proven. Companion artifacts include a mobile (Expo/React Native) game app ("World Domination", client-side single-player storage via AsyncStorage/SQLite plus optional server-authoritative multiplayer through the API) and a design/mockup sandbox (dev-only canvas).

The API currently exposes:
- `GET /api/healthz` — health check, unauthenticated
- `GET /api/storage/public-objects/*filePath` — streams public GCS objects to clients, unauthenticated by design
- `/api/account/*` — trusted-header account profile and contact directory routes, protected by `MULTIPLAYER_API_AUTH_TOKEN` when configured and always requiring the configured trusted user header
- `/api/multiplayer/*` — server-authoritative multiplayer create/join/action/lobby/invitation/SSE/WebSocket surfaces, protected by `MULTIPLAYER_API_AUTH_TOKEN` when configured, optionally bound to a trusted upstream user header, able to filter `scope=mine` lobby reads to that trusted user's claimed or invited matches, and able to require that trusted header through `MULTIPLAYER_REQUIRE_TRUSTED_USER=1`

## Assets

- **GCS object storage** — public and private buckets. Private objects are protected by an ACL system (`objectAcl.ts`). Public objects are intentionally served without auth.
- **Database** — PostgreSQL connection managed via `DATABASE_URL` env var. Schema (`lib/db/src/schema/index.ts`) currently includes trusted account profiles, account contacts, and the server-authoritative multiplayer match store table.
- **Application secrets** — `DATABASE_URL`, GCP credentials (acquired via Replit sidecar at `http://127.0.0.1:1106`), `PUBLIC_OBJECT_SEARCH_PATHS`, `PRIVATE_OBJECT_DIR`, optional multiplayer API/invitation secrets such as `MULTIPLAYER_API_AUTH_TOKEN`, `MULTIPLAYER_INVITATION_WEBHOOK_TOKEN`, and SMTP credentials embedded in `MULTIPLAYER_INVITATION_EMAIL_SMTP_URL`.
- **Replit sidecar** — internal endpoint used for GCP token exchange and signed URL generation.

## Trust Boundaries

- **Browser/Client → API** — all client requests cross this boundary. Health and public storage are intentionally unauthenticated. Account routes and multiplayer routes can require a shared deployment token through `MULTIPLAYER_API_AUTH_TOKEN`; trusted account/contact operations, user-bound multiplayer operations, and `scope=mine` lobby reads trust only the configured upstream header from `MULTIPLAYER_TRUSTED_USER_ID_HEADER`. Deployments must strip client-supplied copies of that header and inject only the authenticated user ID before enabling strict trusted-user behavior; the app still does not implement first-party password/session login.
- **API → GCS** — API uses GCP external account credentials via the Replit sidecar. Compromise of sidecar endpoint or credential leak would expose all storage.
- **API → PostgreSQL** — direct connection; SQL injection would give full DB access. Account/contact and multiplayer match persistence use `pg` parameter placeholders, and the workspace Drizzle schema defines the table shape.
- **API → notification services** — optional multiplayer invitation delivery can call a configured webhook and/or SMTP server after a trusted-user invitation is saved. Payloads intentionally omit player tokens, session IDs, cards, missions, and full game state, but webhook/SMTP credentials and endpoint configuration are sensitive operational secrets.
- **Public → Private GCS** — the ACL system (`objectAcl.ts`) enforces this boundary per-object. `ObjectStorageService.downloadObject()` gates on `opts.assumePublic === true || aclPolicy.visibility === 'public'` and throws `ObjectNotFoundError` otherwise — the public-objects route passes `assumePublic: true` only because it already restricts the search to `PUBLIC_OBJECT_SEARCH_PATHS`, and any object outside that path space or without public ACL is correctly rejected. This boundary is properly enforced in the current code.

## Scan Anchors

- Production entry points: `artifacts/api-server/src/app.ts`, `artifacts/api-server/src/routes/`
- Highest-risk code: `artifacts/api-server/src/lib/objectStorage.ts`, `artifacts/api-server/src/lib/objectAcl.ts`, `artifacts/api-server/src/routes/storage.ts`
- Public (unauthenticated) surfaces, when the API is deployed: `GET /api/healthz`, `GET /api/storage/public-objects/*filePath`
- Authenticated / admin surfaces: account and multiplayer routes require shared-token auth when `MULTIPLAYER_API_AUTH_TOKEN` is configured; trusted account/multiplayer routes depend on a trusted upstream auth proxy/header rather than in-app password/session login, and `MULTIPLAYER_REQUIRE_TRUSTED_USER=1` can reject multiplayer requests missing that header.
- Dev-only: `artifacts/mockup-sandbox/` (design canvas)
- Boilerplate/template code, not project-specific: `artifacts/mobile/server/serve.js` and `artifacts/mobile/server/templates/landing-page.html` are copied verbatim from the `expo` artifact skill template (`.local/skills/artifacts/artifacts/expo/files/server/serve.js`). It reflects `Host`/`X-Forwarded-Host` into the landing page HTML unescaped; this is a shared platform template behind Replit's reverse proxy (not attacker-controlled in normal deployment) and not something this project's code introduced — treat changes here as template-level, not app-level, findings.

## Threat Categories

### Spoofing / Authentication

There is no global first-party password/session auth guard. The `cookie-parser` dependency is included but unused. Account routes always require the configured trusted upstream user header. Multiplayer routes have optional shared-token middleware, optional trusted-header user binding for seat claims, invitations, user-scoped lobby reads, snapshots, WebSockets, and actions, and opt-in strict trusted-user enforcement through `MULTIPLAYER_REQUIRE_TRUSTED_USER`; all future routes that assume a user account must add explicit middleware rather than relying on cookies or a global session.

All API endpoints MUST validate caller identity before accessing user-scoped data or private storage. Unauthenticated access to `GET /api/storage/public-objects/*` is intentional and acceptable only as long as those objects are truly public. Trusted-header multiplayer deployments must ensure the reverse proxy strips any client-supplied copy of the trusted header and injects only the authenticated user ID before enabling `MULTIPLAYER_REQUIRE_TRUSTED_USER=1`.

### Tampering / Input Validation

The `filePath` parameter in the public objects endpoint is sanitized: encoded traversal sequences (`%2f`, `%2e%2e`) are blocked on the raw URL, and literal `..` segments are blocked after decoding. Since GCS does not resolve `..` patterns as directory traversal in object names, residual double-encoded bypasses (`%252e%252e`) are not exploitable in practice.

Account/contact writes use the trusted header identity as the owner and parameterized SQL through the account directory store. Multiplayer write operations use player tokens, optional client-session IDs, optional trusted user IDs, expected-version checks, and the canonical game reducer. REST handlers discard body-supplied trusted user IDs and inject only the configured trusted header value before calling the authority. User-scoped lobby reads use the same trusted header and return redacted summaries only for matches with a matching claimed seat or pending invitation. With `MULTIPLAYER_REQUIRE_TRUSTED_USER=1`, multiplayer REST/SSE middleware and WebSocket upgrades reject requests that do not carry the configured trusted user header.

### Information Disclosure

- ACL enforcement before serving is correctly implemented: `downloadObject()` throws `ObjectNotFoundError` unless the object is under a public search path (`assumePublic`) or has `aclPolicy.visibility === 'public'`. There is no current bypass allowing a private-ACL object to be streamed publicly.
- CORS is configured with an allowlist of allowed origins derived from `REPLIT_DOMAINS` and `ALLOWED_ORIGINS` env vars. `credentials: false` is enforced until a session mechanism is introduced. This is correctly hardened.
- The sidecar endpoint (`http://127.0.0.1:1106`) must remain internal. It is not validated to be localhost-only in application code, relying on Replit platform networking.
- `logger.ts` redacts `req.headers.authorization`, `req.headers.cookie`, and `res.headers['set-cookie']` from logs — appropriate given no session mechanism exists yet.
- Multiplayer invitation webhook and SMTP email payloads are redacted to avoid player tokens, session IDs, full game state, cards, and missions. Trusted user IDs used as email recipients are still personal data and should be treated as sensitive in SMTP provider logs and webhook receivers.

### Denial of Service

Per-IP rate limiting is applied globally (120 req/min) and more strictly on the storage endpoint (60 req/min) using `express-rate-limit` with `trust proxy: 1` so that `req.ip` reflects the real client IP from Replit's reverse proxy. IPv6 addresses are normalized to /56 subnets.

### Elevation of Privilege

The ACL system (`objectAcl.ts`) is well-structured but the `ObjectAccessGroupType` enum is empty — no access groups are implemented. If private object routes are added before this is populated, authorization checks will always throw an error (denying access), which is safe-by-default but incomplete.

All future database queries MUST use parameterized APIs such as Drizzle ORM or `pg` placeholders — no raw SQL string interpolation.

# Threat Model

## Project Overview

worldDOMINATION consists of:

- An Expo/React Native game for web, Android, and iOS.
- A Node.js/Express 5 authority API.
- PostgreSQL persistence through Drizzle and parameterized `pg` queries.
- Optional webhook and SMTP delivery for multiplayer invitations.

Game art, audio, fonts, and 3D models are versioned under
`artifacts/mobile/assets` and shipped with the client. The production system
does not require a runtime object-storage service or a second game repository.

The API exposes:

- `GET /api/healthz`, intentionally unauthenticated.
- `/api/account/*`, requiring the configured deployment token and trusted
  account identity.
- `/api/multiplayer/*`, covering match creation, joins, actions, lobby reads,
  invitations, snapshots, SSE, and WebSockets.

## Protected Assets

- Canonical game and multiplayer state.
- Account profiles, contacts, invitations, and seat claims.
- Player tokens, client session IDs, cards, missions, and hidden orders.
- `DATABASE_URL`, `MULTIPLAYER_API_AUTH_TOKEN`, trusted identity configuration,
  webhook tokens, and SMTP credentials.
- Store signing credentials and physical-device qualification evidence.

## Trust Boundaries

### Client to API

All browser and native requests are untrusted. User-scoped routes must validate
the deployment token and configured account identity. Body-supplied identity
values are never authoritative.

### Authentication Proxy to API

Trusted-header deployments must terminate on a controlled proxy that removes
client-supplied copies of `MULTIPLAYER_TRUSTED_USER_ID_HEADER` and injects only
the authenticated identity. `MULTIPLAYER_REQUIRE_TRUSTED_USER=1` is required
for production. OIDC deployments must validate issuer, audience, and JWKS.

### API to PostgreSQL

The database contains authoritative account and multiplayer data. Queries must
use Drizzle or parameterized `pg` placeholders. Production requires the
Postgres match and account-directory stores rather than JSON fallbacks.

### API to Notification Services

Invitation delivery may call a configured webhook or SMTP server. Payloads
must omit player tokens, client session IDs, cards, missions, and full game
state. Recipient identifiers and delivery credentials remain sensitive.

## Security Properties

- Health is the only intentionally public API route.
- Account and multiplayer routers own their authentication middleware.
- Expected-version checks and the canonical reducer serialize game actions.
- User-scoped lobby reads return redacted summaries only for claimed or invited
  matches.
- WebSocket upgrades enforce the same token and trusted-identity rules as REST.
- CORS accepts only `ALLOWED_ORIGINS` in production and never enables
  credentialed cross-origin requests.
- Authorization, cookies, and set-cookie headers are redacted from logs.
- Global per-client rate limiting uses IPv6 subnet normalization.
- Release readiness fails closed when identity, database, notification, store,
  or physical-device evidence is missing.

## Deployment Assumptions

`trust proxy` is set to one hop. Production must therefore place the API behind
exactly one controlled reverse proxy that sanitizes forwarding and trusted
identity headers. Exposing the Express process directly while accepting
forwarded headers violates this model.

The mobile app has no first-party password/session implementation. A shared
deployment token alone is not a user identity and must not authorize
user-scoped operations without trusted-header or OIDC identity.

## Scan Anchors

- `artifacts/api-server/src/app.ts`
- `artifacts/api-server/src/routes/account.ts`
- `artifacts/api-server/src/routes/multiplayer.ts`
- `artifacts/api-server/src/lib/accountIdentity.ts`
- `artifacts/api-server/src/lib/multiplayerAuthority.ts`
- `artifacts/api-server/src/lib/multiplayerStore.ts`
- `lib/db/src/schema/index.ts`
- `scripts/release-readiness.cjs`

Future routes must declare their authentication and authorization boundary
explicitly. Do not rely on router ordering, cookies, or client-provided user
identifiers as implicit security controls.

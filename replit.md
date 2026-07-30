# WorldDOMINATION Expo

Expo/React Native World Domination game with an Express API, server-authoritative multiplayer, and Postgres-backed account/contact readiness work.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm run release:readiness:static` — verify checked-in Expo/EAS release profile and signing-secret hygiene without production secrets
- `pnpm run release:readiness` — fail-closed production gate for live API, DB, trusted identity, contacts, notifications, store-submit credentials, and multi-device proof evidence
- Required env: `DATABASE_URL` — Postgres connection string
- Production multiplayer env also requires `MULTIPLAYER_DATABASE_STORE=1`, `MULTIPLAYER_ACCOUNT_DIRECTORY_STORE=postgres`, `MULTIPLAYER_API_AUTH_TOKEN`, `MULTIPLAYER_TRUSTED_USER_ID_HEADER`, `MULTIPLAYER_REQUIRE_TRUSTED_USER=1`, and a notification handoff before the release readiness gate passes.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Mobile release: Expo/EAS profiles in `artifacts/mobile/eas.json`; local EAS credentials/signing material must stay ignored.

## Where things live

- `lib/db/src/schema/index.ts` — Drizzle schema for account profiles, account contacts, and multiplayer match persistence.
- `artifacts/api-server/src/routes/account.ts` — trusted-header account profile and contact directory routes.
- `artifacts/api-server/src/routes/multiplayer.ts` — multiplayer REST/SSE routes, including contact discovery.
- `artifacts/mobile/app/multiplayer.tsx` — Expo multiplayer command surface for lobby, invitations, contacts, and seat invites.

## Architecture decisions

- Account identity is trusted-header based. A deployment proxy or auth middleware must strip client-supplied trusted headers and inject the authenticated user ID.
- Production startup and release readiness require Postgres-backed multiplayer plus `MULTIPLAYER_ACCOUNT_DIRECTORY_STORE=postgres`.
- JSON/path contacts remain a local/operator fallback; production contact discovery is expected to use the account directory tables.

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details

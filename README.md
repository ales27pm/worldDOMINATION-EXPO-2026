# worldDOMINATION

Cross-platform Expo implementation of the classic and Same Time RISK game
variants. The production application lives in `artifacts/mobile`; the
monorepo also contains the server-authoritative multiplayer API and shared
database packages.

Canonical repository:
[ales27pm/worldDOMINATION-EXPO-2026](https://github.com/ales27pm/worldDOMINATION-EXPO-2026).
`main` is the production source branch. Older worldDOMINATION repositories are
historical donors only and are not alternate runtimes.

## Current Capabilities

- Classic 42-territory and expanded 48-territory boards
- Same Time reinforcement, sealed orders, playback, and movement phases
- Web, Android, and iOS through one Expo runtime
- JSON web persistence and native SQLite persistence
- Server-authoritative REST, SSE, and WebSocket multiplayer
- Postgres-backed matches, accounts, contacts, and invitations
- Transparent map HUD and renderer-neutral camera interaction
- Deterministic classic/expanded GLB territory meshes for the 3D renderer
- Playwright browser coverage plus deterministic game and persistence tests

The current web build is deployed at
[worlddomination.expo.app](https://worlddomination.expo.app).

## Requirements

- Node.js 22.13 or newer
- pnpm 11
- Expo/EAS credentials only for release builds and deployment
- Android SDK for native Android builds
- macOS with Xcode for iOS builds

## Install

```bash
corepack enable
pnpm install --frozen-lockfile
```

## Run Locally

```bash
pnpm --filter @workspace/mobile run dev -- --web
```

The API can be built and started separately:

```bash
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/api-server run start
```

## Validate

```bash
pnpm run typecheck
pnpm --filter @workspace/mobile run test:unit
pnpm --filter @workspace/mobile run test:vitest
pnpm --filter @workspace/mobile run map:glb:check
pnpm --filter @workspace/mobile run map:glb:smoke
pnpm --filter @workspace/mobile run test:browser:run
pnpm --filter @workspace/api-server run test:authority
pnpm run release:readiness:static
```

Local environment files, signing credentials, native build directories,
browser output, and APK/AAB/IPA artifacts are intentionally excluded from Git.

## Repository Layout

- `artifacts/mobile`: Expo application and canonical TypeScript game engine.
- `artifacts/api-server`: multiplayer/account API.
- `lib`: database and generated API contracts.
- `scripts/release-readiness.cjs`: fail-closed release checks.
- `docs`: donor provenance and sanitized physical-device evidence.

See [docs/CONSOLIDATION.md](./docs/CONSOLIDATION.md) for the retired donor
matrix and
[WORLDDOMINATION_EXPO_BASE_IMPLEMENTATION_REPORT.md](./WORLDDOMINATION_EXPO_BASE_IMPLEMENTATION_REPORT.md)
for architecture, implementation history, validation evidence, and remaining
release gates.

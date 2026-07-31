# Repository Consolidation

## Canonical Source

The only production source repository is:

- Remote: `https://github.com/ales27pm/worldDOMINATION-EXPO-2026.git`
- Branch: `main`
- Runtime: `artifacts/mobile`

The repository is an Expo-first monorepo. It keeps the mobile/web game, the
server-authoritative multiplayer API, shared database and API contracts,
release checks, and evidence needed to audit the remaining release gates.

## Retained Layout

| Path | Purpose |
| --- | --- |
| `artifacts/mobile` | Expo app, TypeScript rules engine, web export, native configuration, tests, and bundled runtime assets |
| `artifacts/api-server` | Account, contact, invitation, and multiplayer authority API |
| `lib/db` | Postgres schema and database verification |
| `lib/api-spec` | OpenAPI source contract |
| `lib/api-zod` | Runtime response validation |
| `lib/api-client-react` | Generated typed health client |
| `scripts/release-readiness.cjs` | Static and live release gate |
| `docs/evidence` | Sanitized, source-revision-bound physical-device evidence |

Runtime art is bundled under `artifacts/mobile/assets`. The app does not
depend on a second source checkout, raw attachment directory, hosted mockup
workspace, or external object-storage sidecar.

## Historical Donors

The donor checkouts were clean and synchronized before local removal. Their
remote repositories retain the original histories.

| Repository | Frozen revision | Historical role |
| --- | --- | --- |
| `worldDOMINATION` | `08c84e67db560f7c693a6053c130469d6384b3eb` | Swift rules and regression oracle |
| `worldDOMINATION-808` | `953b780696e2f921c6a13fe957e30db2d3455fa6` | Swift rules and SceneKit reference |
| `worldDOMINATION_2026` | `b28291d0d31b9c60166dbef04a3ff1f5d53f85a0` | Browser presentation and test donor |
| `worldDOMINATIONweb` | `900c2cba424568922c5b8b16a703ffba95cec7b9` | Portable domain-test oracle |
| `worldDOMINATION-React-Native` | `714f33a96ecd6bcc9b3a2f0a571034e5d320fafb` | Superseded React Native snapshot |
| `wD_google` | `3c377403114f3b6b6d7a568ac03f90c6e2511169` | README-only historical snapshot |
| `worldDOMINATION_reactnative2026` | no commits | Empty repository |
| `worldDOMINATION_reactNATIVE` | no commits | Empty repository |

The implementation report records the controlled porting decisions and
validation history. Donor code should be recovered only for archaeology:

```bash
git clone https://github.com/ales27pm/worldDOMINATION.git
git -C worldDOMINATION checkout 08c84e67db560f7c693a6053c130469d6384b3eb
```

Do not merge a donor repository wholesale or introduce a second game runtime.

## Deliberately Excluded

- Replit project metadata, preview-only mockup tooling, and agent caches.
- Raw screenshots, videos, copied manuals, and intermediate generated art.
- Generated API bundles, native build folders, browser exports, dependencies,
  release binaries, credentials, and local environment files.
- The unused Replit-sidecar object-storage endpoint. Production game assets
  are versioned and bundled with the Expo app.

These exclusions are either reproducible from committed source, preserved in
Git history, or recoverable from the historical remotes above.

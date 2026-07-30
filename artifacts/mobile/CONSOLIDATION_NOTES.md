# WorldDOMINATION Expo Consolidation Notes

Generated: 2026-07-29

The consolidation base is `worldDOMINATION_EXPO/artifacts/mobile`. Keep its Expo Router shell, React Native gameplay UI, TypeScript game model, Same Time RISK resolver, assets, and native SQLite persistence as the production target.

Source classifications:

- `worldDOMINATION_EXPO/artifacts/mobile`: primary base.
- `worldDOMINATION_2026/web`: browser presentation and Vite/Vitest test-lane reference only.
- `worldDOMINATIONweb`: legacy TypeScript domain-test donor and Same Time behavior oracle.
- `worldDOMINATION` and `worldDOMINATION-808`: Swift rule-test donors; SceneKit is future presentation reference only.
- `worldDOMINATION-React-Native`: predecessor snapshot, not a merge base.
- `wD_google`, `worldDOMINATION_reactNATIVE`, and `worldDOMINATION_reactnative2026`: ignored for code consolidation.

First implementation slice:

- Add a pure unit test lane under this mobile app before moving production behavior.
- Port core dice and map invariants first: dice tier thresholds, lower-tier casualty rank, 42/48 map counts, extra territory IDs, normalized anchors, symmetric adjacency, and rendered path coverage.
- Start Same Time resolver regressions next: border clashes, original commitment subtraction, mass invasion/spoils sequencing, third-party invasions, and surge chains.
- Add reducer and rule regressions for Same Time readiness/queued moves, mandatory card trading, card-set valuation, destroy-player mission fallback, and Same Time mission timing.
- Add persistence guardrails: web/native repository API type parity, older-save normalization coverage, and JSON fallback runtime tests for save/restore/delete, campaign archives, tournament progress, high scores, and legacy imports.
- Port classic setup and battle regressions: random allocation totals, Territory Grab uniqueness, reinforcement minimum/continent bonuses, conquest occupy bounds, and mandatory trade clearing.
- Add a browser-preview smoke lane that compiles the Expo web export and verifies the generated route bundle plus map/piece/battle-view assets.

Tournament UI parity slice:

- Add canonical tournament campaign summaries in `game/tournament.ts` for objective names, allocation names, opponent count, averaged general difficulty, territory count, and maximum points.
- Update `app/tournament.tsx` to render the web donor's scanning data pattern with React Native components and shared game metadata.
- Add Node tests for first/final campaign summaries and tournament setup translation.

Classic/Same Time regression slice:

- Add reducer-level tests for classic 60% domination, classic mission, and Capital RISK victory declaration on turn advance.
- Add reducer-level protection for Classic RISK's single direct-neighbor tactical move per turn.
- Add Same Time phase-machine coverage for simultaneous eliminations, kill credit, and card transfer to the surviving final recipient.

Rendered browser smoke slice:

- Install Playwright and Puppeteer in the Expo mobile package; Puppeteer's postinstall build/download script is explicitly denied in `pnpm-workspace.yaml` so the smoke uses the host's system browser.
- Extend `scripts/browser-smoke.js` to serve the Expo web export with a client-route fallback and render both `/` and `/game?autostart=1` through Playwright with system Chrome.
- Verify rendered home/menu text, seeded game HUD/map text, page-error absence, and loaded map/piece images in `pnpm run test:browser:run`.

Native SQLite validation slice:

- Extract native SQLite persistence into `db/sqliteRepository.ts`, keeping `db/repository.native.ts` as the Expo SQLite opener and public native export surface.
- Add Node `node:sqlite` in-memory tests for the native SQL schema and statements: autosave summary/state/delete, completed campaign archive, commander stats, tournament progress including score-submitted state, high-score seeding/trimming, and legacy import aggregation.
- Extend repository contract coverage so JSON and SQLite adapter factories remain internal while their return shapes stay aligned with web/native repository exports.

Browser UI parity validation slice:

- Keep the Expo app as the browser target; add no React DOM donor runtime.
- Extend the preview-only `/game?autostart=1` hook to accept validated setup parameters for Same Time, restricted reinforcement, expanded-map, objective, allocation, and commander count previews.
- Expand `scripts/browser-smoke.js` to render home, setup, classic expanded-map, and Same Time expanded-map routes in fresh Playwright browser contexts.
- Assert setup controls, extended territory labels, map view-mode cycling, Same Time command text, loaded map/piece images, and page-error absence in the rendered Chrome smoke.

Records surface parity slice:

- Add the seeded/high-score tournament ledger to `app/records.tsx` so Hall of Records covers both campaign archives and tournament standings.
- Reuse the existing repository `listHighScores()` API and shared `HighScoreRecord` type; do not add a second tournament persistence path.
- Extend rendered browser smoke coverage for `/records` and `/tournament`, including seeded leaderboard data and page-error absence.

Prototype-inspired battle presentation slice:

- Add `game/battlePresentation.ts` as a display-only battle outlook helper inspired by the Swift prototype's battle blueprint/odds plaque concept.
- Render the outlook in the compact `BattleReportCard` using existing `BattleReport` force counts, losses, dice tiers, and player colors; combat resolution remains unchanged.
- Add unit tests for missing legacy counts, attacker edge, defender edge, even-field labeling, and survivor counts.
- Extend the browser export smoke to assert the battle outlook UI ships in the Expo web bundle.

Campaign event feed parity slice:

- Add `game/eventFeed.ts` as a display-only snapshot helper translated from the Swift campaign event feed tests.
- Lock newest-first recent event selection, oldest-to-newest ticker display order, visible event IDs, empty-state behavior, custom limits, newest turn labels, and highlight-trigger semantics.
- Wire `EventTicker` and `DispatchLog` to the shared snapshot helper while preserving the reducer log as the only source of truth.
- Extend the browser export smoke to assert the dispatch empty-state UI ships in the Expo web bundle.

Vitest lane audit slice:

- Add a real Vitest/Vite compatibility lane with `vitest.config.mjs` and `pnpm run test:vitest`, satisfying the report's explicit Vite/Vitest test-lane requirement without replacing the existing Node test harness.
- Keep Vitest tests under `vitest/` so the `node:test` compiler/run path remains stable and scoped to `test/`.
- Wire `pnpm test` to run both the established Node unit suite and the Vitest pure-rule smoke lane.

Deterministic fixture slice:

- Add optional random providers to pure dice helpers, classic battle resolution, Same Time tiered combat, border clashes, defended-group order shuffling, and `resolveSameTimeRound`.
- Add shared `test/helpers/gameState.ts` fixtures for classic/Same Time game setup, deterministic random sequences, cards, territory assignment, and attack orders.
- Refactor classic, Same Time phase-machine, and Same Time resolver tests onto the shared fixtures where they need minimal game states or deterministic rolls.

Same Time camera parity slice:

- Extend `game/camera.ts` attention scoring to cover `sameTimeReinforce`, `sameTimeBattle`, and `sameTimeMove` instead of falling through to the default board camera.
- Keep the Expo-native `MapViewport`/`WorldBoard` path; no React DOM donor map code is introduced.
- Add camera unit tests for queued Same Time attack orders, selected attack targets, direct tactical-move corridors, and portrait required-point framing.

Rendered save/restore slice:

- Make `app/game.tsx` wait for `GameProvider` save restoration before redirecting a direct `/game` load without an in-memory campaign.
- Extend `scripts/browser-smoke.js` to autosave a seeded browser campaign, verify the fallback repository's `worlddomination.db.saveSlot` in localStorage, and reload `/game` in a fresh page to prove restore renders.
- Keep this as browser-fallback validation only; native SQLite remains the production iOS/Android repository path.
- Defer broader gameplay/records UI polish and optional battle presentation work to later slices.

Rendered battle playback slice:

- Add a browser-smoke-only Same Time battle playback preview seed through the existing dev/smoke autostart guard.
- Extend rendered Chrome smoke to assert the Same Time battle playback modal and transition into movement after acknowledging playback.
- Keep seeded playback state out of production setup flows.

Responsive rendered validation slice:

- Extend the rendered Chrome smoke beyond a single phone viewport with desktop classic-map and landscape Same Time route checks.
- Assert critical command controls stay visible in viewport and do not introduce horizontal page overflow.
- Keep this validation in the Expo web preview lane so mobile-native UI remains the production implementation.

Sea-route parity slice:

- Extract sea-route edge construction into a pure `game/mapRoutes.ts` helper while keeping `WorldBoard` as the rendering owner.
- Add map tests that every authored sea route is backed by symmetric territory adjacency.
- Lock standard/expanded route filtering and the Alaska-Kamchatka wrapped edge split.

Same Time playback gate slice:

- Add a deterministic reducer regression for a Same Time battle that produces playback.
- Assert tactical movement cannot be queued while playback is pending.
- Assert `ST_ACK_PLAYBACK` is the transition that opens simultaneous movement with fresh movement readiness flags.

Same Time order-resolution gate slice:

- Add a deterministic queued-attack reducer regression for the report's "all active commanders seal" invariant.
- Assert the first sealed commander does not resolve queued attacks or mutate committed armies.
- Assert the final sealed commander resolves the order, clears queued attacks, and opens battle playback.

Rendered Same Time orders slice:

- Add a browser-smoke-only Same Time attack-order preview seed through the existing autostart guard.
- Extend rendered Chrome smoke to assert the order-staging phase label and `Seal Attack Orders` command are visible in landscape.
- Keep this as validation-only setup state; normal setup and production game flow continue through the reducer phase machine.

Archive idempotency slice:

- Add shared completion keys for completed campaign records across JSON and SQLite repositories.
- Make duplicate `recordCompletedCampaign` calls delete autosave without duplicating archive rows or commander stats.
- Add JSON and SQLite regressions for duplicate completion archive calls.

Same Time reinforcement/alliance slice:

- Add a pure regression for Same Time reinforcement math: owned territory count, largest connected empire, Same Time continent bonus, and minimum one reinforcement.
- Add a reducer regression that Same Time I-Com alliances lapse when the simultaneous round ends, even if their classic-style expiry fields would otherwise survive longer.

Defended battle tie slice:

- Add a Same Time resolver regression that defended battle ties favor the defender, unlike border-clash ties, and keep the target unconquered without minting armies or conquest credit.

Bounded surge slice:

- Add a Same Time resolver regression that declared surge chains stop after their explicit follow-on target, documenting the Expo simplification and protecting against accidental unbounded surge cascades.

Restricted reinforcement slice:

- Add a Same Time reducer regression for the optional Restricted Reinforcement rule: per-territory placement is capped by friendly neighboring territories plus one, further placement at the cap is rejected, and undo restores both armies and remaining reinforcement count.

Rendered setup restricted-reinforcement slice:

- Extend the Playwright browser smoke to select Same Time RISK on the setup screen and assert the Restricted Reinforcement control and explanatory copy render only for that mode.

Rendered roster/dispatch overlay slice:

- Add accessibility labels to the commander roster and field dispatch icon controls and their close buttons.
- Extend the Playwright browser smoke to open the roster and dispatch overlays from a seeded classic game, assert their headings/content render, and verify they do not introduce horizontal overflow.

Managed Android/iOS static export verifier slice:

- Add `pnpm run verify:static-build` to validate the managed Expo static export after `EXPO_PUBLIC_DOMAIN=example.com pnpm build`.
- Verify Android and iOS manifests point at non-empty launch bundles and that the static export includes the world map, piece sprites, and battle-view assets.
- Keep native APK/simulator claims separate because this managed Expo workspace has no checked-in `android/` or `ios/` native project.

Report evidence audit slice:

- Add a current evidence audit to `WORLDDOMINATION_EXPO_BASE_IMPLEMENTATION_REPORT.md` that classifies requirement groups as Verified, Partial, or Not present.
- Tie completed consolidation claims to current files and commands instead of relying on intent or prior progress notes.
- Keep unresolved product scope explicit: release signing/device distribution, live production multiplayer deployment, and any future unported donor-oracle edge cases are not claimed complete.

Native Android debug compile slice:

- Use the existing local Android tooling under `/home/ales27pm/.local/android-tooling`: JDK 17, Android SDK, platform-tools, and Gradle wrapper generated by Expo prebuild.
- Run `pnpm exec expo prebuild --platform android --no-install` from `artifacts/mobile`, then `./gradlew assembleDebug` from `artifacts/mobile/android` with `JAVA_HOME`, `ANDROID_HOME`, and `ANDROID_SDK_ROOT` pointed at the local tooling.
- Verified `android/app/build/outputs/apk/debug/app-debug.apk` was produced with application id `com.worlddomination.app`, debug variant, version `1.0.0`.

Fresh install policy slice:

- Keep Puppeteer's postinstall browser download denied through `pnpm-workspace.yaml` `allowBuilds.puppeteer: false`.
- Explicitly allow trusted build-script packages required by fresh installs and native build tooling: `@swc/core`, `esbuild`, `msw`, and `unrs-resolver`.
- Verified the stricter `allowBuilds` policy no longer blocks a fresh macOS host install where `esbuild` needs its native package workaround.

Native iOS simulator compile slice:

- Keep Xcode work remote per user instruction: `ssh -p 2222 ales27pm@127.0.0.1`.
- Synced the workspace to `/Users/ales27pm/worlddomination-risk-scan-ios-build` without local generated `android/`, `ios/`, `.expo/`, or validation-output directories.
- Installed user-local Node 22.13.1 on the macOS host at `/Users/ales27pm/.local/node-v22.13.1-darwin-x64` because the default Node 20 path could not run the current Corepack pnpm.
- Ran `corepack pnpm@11.9.0 install --frozen-lockfile`, `pnpm exec expo prebuild --platform ios --no-install`, `pod install`, and `xcodebuild -workspace worldDOMINATION.xcworkspace -scheme worldDOMINATION -configuration Debug -sdk iphonesimulator -destination "platform=iOS Simulator,name=iPhone 16" -derivedDataPath build/DerivedData CODE_SIGNING_ALLOWED=NO build`.
- Verified `ios/build/DerivedData/Build/Products/Debug-iphonesimulator/worldDOMINATION.app` was produced with bundle id `com.worlddomination.app`, bundle name `worldDOMINATION`, version `1.0.0`, and bundled React Native/Hermes/Expo frameworks.
- Installed and launched the app on the booted iPhone 16 simulator; this is unsigned simulator Debug evidence only, not signed device/TestFlight/App Store readiness.

Server-authoritative multiplayer foundation slice:

- Add `artifacts/api-server/src/lib/multiplayerAuthority.ts` as the server-owned match authority over the canonical Expo `createGame`/`gameReducer` rules engine.
- Add a pluggable match store with an in-memory default, JSON-file persistence when `MULTIPLAYER_MATCH_STORE_PATH` is configured, and Postgres persistence with version-guarded writes when `MULTIPLAYER_DATABASE_STORE=1` plus `DATABASE_URL` are configured.
- Add the workspace Drizzle schema for `multiplayer_matches` in `lib/db/src/schema/index.ts` so `pnpm --filter @workspace/db run push` can provision the table.
- Expose REST endpoints through `artifacts/api-server/src/routes/multiplayer.ts`: create match, read redacted snapshot, join a human seat, submit a version-checked action, and subscribe to server-sent redacted snapshot updates.
- Gate submitted actions with per-seat player tokens and current-player authority; reject stale expected versions, wrong actors, and reducer-invalid commands.
- Redact hidden state from snapshots: other commanders' cards, missions, unrevealed capitals, deploy logs, Same Time staged orders, Same Time staged moves, and staged-order log lines.
- Version seat claims so joins are visible through snapshot versions, and publish join/action update notifications for match subscribers.
- Add `pnpm -C artifacts/api-server run test:authority` covering seat claims, token secrecy, hidden-info redaction, reducer-owned version advancement, JSON-file restore across authority instances, Postgres SQL insert/version-guarded-update/select/delete behavior through a fake query client, stale Postgres write rejection, store compare-and-swap miss handling, stale-version rejection, wrong-actor rejection, invalid-action rejection, Same Time order redaction, and join/action update notifications.
- Keep this classified as a backend foundation only; live DB migration/deployment, live multi-worker load testing, matchmaking, full account identity/per-user authorization beyond shared deployment-token auth, and deployed/physical multi-device gameplay proof remain future work.

Optional real Postgres verification slice:

- Add `pnpm -C artifacts/api-server run test:authority:postgres`, guarded by `DATABASE_URL`, to run the authority test lane with the optional real-Postgres persistence case enabled.
- Keep the real DB test isolated in a temporary schema, then drop that schema, so it verifies table creation, JSONB persistence/restore, and version-guarded stale-write rejection without clearing a shared `multiplayer_matches` table.
- Force configured multiplayer DB/file stores off during the normal authority lane's singleton-backed router integration, so accidental `MULTIPLAYER_DATABASE_STORE=1` test runs do not redirect that integration through a shared database.
- Keep live production DB migration/deployment and live multi-worker deployed-Postgres load testing as follow-up gaps; workspace validation now has `DATABASE_URL` available through the ignored local Postgres env file and the optional real-Postgres authority case passes against that local target.

Expo multiplayer command slice:

- Add `artifacts/mobile/lib/multiplayerClient.ts` as a typed REST/SSE/WebSocket client for the server-authoritative match endpoints.
- Add `artifacts/mobile/lib/multiplayerSession.ts` for local reconnect-token persistence keyed by API base URL, match id, player token, and player id.
- Add `app/multiplayer.tsx` and a home-menu entry for create-host, join-seat, refresh-snapshot, lobby-refresh/filter/select, automatic WebSocket/EventSource/polling watch, and clear-token flows.
- Add unit coverage for API base URL normalization, REST path construction, redacted filtered match-list query construction, typed API errors without token leakage, WebSocket URL construction and preference, event-stream subscription, polling fallback, and local reconnect-session save/load/clear behavior.
- Add `app/multiplayer-game.tsx` and `lib/multiplayerGameplay.ts` so a linked seat can open the shared battlefield, render server snapshots through the existing game surface, gate controls to the local current player, submit composed `GameAction`s with the current snapshot version and seat token, and refresh after version conflicts.
- Extend rendered browser smoke coverage for the multiplayer command route and battlefield fallback while keeping deployed/physical multi-device end-to-end gameplay proof as future work.

Multiplayer WebSocket transport slice:

- Add `artifacts/api-server/src/lib/multiplayerSocket.ts` and attach it from `artifacts/api-server/src/index.ts` so `/api/multiplayer/matches/:matchId/socket` upgrades stream redacted snapshots from the server authority.
- Keep REST commands and SSE snapshots as compatible transports; WebSocket is an additional preferred snapshot stream, not a new gameplay authority.
- Extend `artifacts/mobile/lib/multiplayerClient.ts` to prefer WebSocket snapshots, then EventSource snapshots, then polling.
- Add API tests for WebSocket route parsing and redacted snapshot streaming through a real `ws` client; add mobile tests for WebSocket URL construction and preference before EventSource.
- Keep live DB migration/deployment, live multi-worker load testing, full account identity/per-user authorization beyond shared deployment-token auth, client-session-bound seat tokens, optional trusted-user header binding, opt-in strict trusted-user enforcement, trusted-header invitations/listing, deployed account invitation delivery, production matchmaking beyond ranked local lobby/quick-match discovery, and deployed/physical multi-device gameplay proof as follow-up gaps.

Multiplayer shared-token auth slice:

- Add `artifacts/api-server/src/lib/multiplayerAuth.ts` with opt-in multiplayer API authorization through `MULTIPLAYER_API_AUTH_TOKEN`.
- Gate multiplayer REST routes with bearer, `x-multiplayer-auth`, or query-token credentials when the server token is configured; leave local/dev behavior unchanged when it is unset.
- Enforce the same optional auth token on multiplayer WebSocket upgrades.
- Extend `artifacts/mobile/lib/multiplayerClient.ts`, `lib/multiplayerSession.ts`, `app/multiplayer.tsx`, and `app/multiplayer-game.tsx` so clients can use `EXPO_PUBLIC_MULTIPLAYER_API_AUTH_TOKEN` or a command-screen token and persist it with reconnect sessions.
- Add API tests for missing/valid shared-token REST auth and auth-protected WebSocket streaming; add mobile tests for REST auth headers, WebSocket/EventSource auth query tokens, optional auth-token persistence, and legacy session compatibility.
- Keep full account identity, per-user authorization, live DB migration/deployment, live multi-worker load testing, matchmaking/lobbies, and deployed/physical multi-device gameplay proof as follow-up gaps.

Multiplayer client-session identity slice:

- Add optional client-session IDs and labels to server seat claims, persist them in JSON/Postgres match records, expose only the viewing player's session ID in snapshots, and redact rival session IDs.
- Reject actions for session-bound seats when the submitted session ID is missing or mismatched, while leaving legacy unbound seat-token flows compatible.
- Generate a local Expo client session ID on create/join, persist it with the reconnect token, show the session label in the command screen, and include the session ID with server-backed gameplay actions.
- Add backend tests for session-bound seat identity, rival session redaction, and missing/wrong session rejection; add mobile tests for session ID generation, REST payloads, action submission, optional session persistence, and legacy session compatibility.
- Keep this as client-session binding, not user accounts; full account identity, per-user authorization, live DB migration/deployment, live multi-worker load testing, matchmaking/lobbies, and deployed/physical multi-device gameplay proof remain follow-up gaps.

Multiplayer trusted-user identity slice:

- Add optional trusted upstream user binding through `MULTIPLAYER_TRUSTED_USER_ID_HEADER`.
- Strip any REST body-supplied `userId` before create/join/action handling, then inject only the configured trusted header value.
- Persist trusted user IDs in JSON/Postgres seat claims, expose only the viewing player's own user ID in snapshots, and redact rival/public user IDs from snapshots and lobby summaries.
- Require the same trusted user ID for user-bound token snapshots, WebSocket streams, and server-backed gameplay actions while preserving legacy unbound token flows.
- Add opt-in strict trusted-user enforcement through `MULTIPLAYER_REQUIRE_TRUSTED_USER=1` so configured deployments can reject multiplayer REST, SSE, and WebSocket access when the trusted header is missing.
- Add account-scoped `scope=mine` lobby discovery for matches where the trusted user has a claimed seat or pending invitation, while keeping summaries redacted.
- Add backend coverage for direct authority user-bound seats, rival user ID redaction, missing/wrong trusted user rejection, REST body-userId spoofing rejection, trusted-user WebSocket enforcement, strict trusted-user REST/WebSocket rejection/acceptance, and account-scoped match-list redaction.
- Keep this as proxy/header-backed identity binding, not a full account system or identity provider; live auth deployment, deployed account invitation delivery, broader per-user authorization policy, production matchmaking/contact discovery beyond ranked local quick-match, and physical/deployed multi-device proof remain follow-up gaps.

Multiplayer trusted-user invitation slice:

- Add trusted-user seat invitations on the server authority for unclaimed human seats.
- Persist invitation records in JSON-file and Postgres match stores; add the `multiplayer_matches.invitations` JSONB schema field and guarded SQL column creation for existing DB-backed deployments.
- Expose `POST /api/multiplayer/matches/:matchId/invitations` behind the same optional shared-token auth and trusted-user header injection as other multiplayer routes.
- Exclude invited seats from public `openHumanSeats`, keep invitee user IDs out of public snapshots and lobby summaries, and allow only the matching trusted header user to claim the reserved seat.
- Add `GET /api/multiplayer/invitations` so a trusted-header user can list their own pending redacted invitations without already knowing the match id.
- Extend the Expo multiplayer client with typed `inviteSeat()` and `listInvitations()` request support and unit coverage for the route paths and payload/responses.
- Surface trusted-user invitation creation in the Multiplayer Command screen with local-session-backed player/user-id inputs.
- Surface pending invitations in the Multiplayer Command screen with a refresh button and selectable rows that fill the existing join fields.
- Add backend coverage for pending invitation discovery, invitee ID redaction, missing/wrong invitee rejection, REST body-userId spoofing protection, and fake-Postgres invitation persistence/restore.
- Add browser-smoke coverage for the invite-seat and pending-invitation controls in the rendered command screen.
- Keep this as trusted-header seat reservation and pending invitation discovery, not deployed account invitation delivery, notification, contact discovery, full account policy, production matchmaking, or physical/deployed multi-device proof.

Local two-client multiplayer proof slice:

- Add backend integration coverage that mounts the real multiplayer REST router on a local Express server and attaches the real WebSocket snapshot transport.
- Exercise two independent clients: create host seat, join player 1, read the redacted active lobby list, open separate WebSockets, submit a reducer-owned REST action, and assert both clients receive the same advanced redacted snapshot version.
- Keep this as local runtime proof only; deployed database migration, multi-worker load, full account identity/per-user authorization beyond shared-token, client-session, trusted-header, and trusted-invitation controls, deployed account invitation delivery or production matchmaking beyond ranked local lobby/quick-match discovery, and physical-device or deployed multi-device proof remain follow-up gaps.

Multiplayer redacted lobby listing slice:

- Add `MultiplayerAuthority.listMatches()` and store-level `list(limit)` support for in-memory, JSON-file, and Postgres-backed match stores.
- Expose `GET /api/multiplayer/matches?limit=N` before the parameterized match route so clients can load recent redacted match summaries without receiving player tokens or client session IDs.
- Extend `artifacts/mobile/lib/multiplayerClient.ts` with typed `listMatches()` and add a Multiplayer Command lobby section that refreshes recent matches and fills the join form from an open human seat.
- Extend backend and mobile tests for redacted lobby summaries, REST route integration, Postgres list SQL, and client query construction.
- Keep this as local lobby discovery, not production matchmaking, deployed account invitation delivery, deployed multi-worker discovery, or physical multi-device gameplay proof.

Multiplayer lobby status-filter slice:

- Classify redacted match summaries as `joinable`, `active`, or `finished` from winner/phase and open human seats.
- Add bounded `status=joinable|active|finished|all` filtering to `MultiplayerAuthority.listMatches()` and `GET /api/multiplayer/matches`.
- Extend the Expo client and Multiplayer Command screen with typed status-filtered `listMatches()` calls and compact filter controls defaulting to joinable matches.
- Extend backend, mobile, and rendered browser-smoke coverage for filtered lobby discovery.
- Keep this as local lobby discovery, not deployed matchmaking, deployed account invitation delivery, multi-worker discovery, or physical multi-device proof.

Multiplayer account-scoped lobby slice:

- Add `scope=mine` filtering to `MultiplayerAuthority.listMatches()` and `GET /api/multiplayer/matches` so trusted-header users can load only redacted matches where they have a claimed seat or pending invitation.
- Keep default lobby discovery public; missing trusted identity with `scope=mine` returns an empty list unless strict trusted-user middleware is enabled.
- Extend the Expo client and Multiplayer Command screen with typed Public/Mine lobby scope controls.
- Extend backend, mobile, and rendered browser-smoke coverage for account-scoped lobby discovery.
- Keep this as trusted-header lobby discovery, not a full account system, contact discovery, queue ranking, push/email notification operations, deployed matchmaking, or physical/deployed multi-device proof.

Multiplayer quick-match slice:

- Add `POST /api/multiplayer/quick-match` to the authority-backed REST router.
- Match only gameplay-compatible public seats, skip trusted-user invitation reservations, claim the selected seat with the same optional client-session and trusted-user binding as manual joins, and create a fallback match when no public compatible seat is available.
- Extend `artifacts/mobile/lib/multiplayerClient.ts` and the Multiplayer Command screen with typed `quickMatch()` support and a Quick Match action.
- Extend backend authority tests for public quick-join/fallback behavior and invitation-reservation preservation.
- Extend mobile client tests and rendered browser-smoke coverage for the quick-match route/control.
- Keep this as local server-authoritative quick-match, not deployed production matchmaking, contact discovery, notification delivery, multi-worker discovery proof, or physical/deployed multi-device gameplay proof.

Multiplayer ranked quick-match slice:

- Rank compatible quick-match candidates server-side before joining them: fill lobbies with fewer open public human seats first, then prefer older created matches, older updated matches, and finally stable match IDs.
- Keep all ranked quick-match joins on the existing `joinMatch` path so player-token creation, trusted-invitation skips, session/user de-duplication, and version-conflict handling remain centralized.
- Add backend coverage proving a newer broad lobby does not outrank an older compatible lobby with only one public human seat left.
- Keep this as ranked local quick-match behavior, not deployed production matchmaking, contact discovery, notifications, or physical/deployed multi-device proof.

Multiplayer trusted contact directory slice:

- Add `artifacts/api-server/src/lib/multiplayerContacts.ts` with optional configured contacts from `MULTIPLAYER_CONTACTS_JSON` and/or `MULTIPLAYER_CONTACTS_PATH`.
- Expose `GET /api/multiplayer/contacts` behind the existing multiplayer auth and trusted-user middleware; the response is scoped to the current trusted header user and returns only `userId` plus `displayName`.
- Validate configured JSON, suppress self contacts, deduplicate contact user IDs, and avoid exposing directory owner IDs.
- Extend `artifacts/mobile/lib/multiplayerClient.ts` with typed `listContacts()` and Node client coverage for the route path and response shape.
- Add backend route coverage proving per-user filtering, no owner ID exposure, dedupe, self suppression, and strict missing trusted-user rejection; the authority suite now reports 34/34 pass with `DATABASE_URL` available.
- Keep this as configured trusted-contact discovery, not a deployed account graph, contact import flow, search service, production notification channel, or fully contact-backed invite UX.

Trusted account directory slice:

- Add `account_profiles` and `account_contacts` to `lib/db/src/schema/index.ts` and extend `verify:multiplayer-schema` to prove those tables plus required indexes are applied.
- Add `artifacts/api-server/src/lib/accountDirectory.ts` with a Postgres-backed trusted account/contact store enabled by `MULTIPLAYER_ACCOUNT_DIRECTORY_STORE=postgres`.
- Add `artifacts/api-server/src/routes/account.ts` with trusted-header `GET/PUT /api/account/me`, `GET /api/account/contacts`, `PUT /api/account/contacts/:userId`, and `DELETE /api/account/contacts/:userId`.
- Make `GET /api/multiplayer/contacts` prefer the account directory when configured and use JSON/path contacts only as a fallback.
- Surface Refresh Contacts and contact-select controls in the Expo Multiplayer Command screen so contacts can fill the trusted invite target.
- Extend production startup preflight and release readiness so production requires `MULTIPLAYER_ACCOUNT_DIRECTORY_STORE=postgres`.
- Extend backend coverage for profile updates, contact creation, self-contact rejection, trusted-header enforcement, multiplayer-contact reuse of the account directory, and real Postgres account/contact persistence in an isolated schema.
- Keep this as trusted-header account/contact infrastructure, not a deployed external auth provider, contact import/search service, production notification operation, or live production deployment.

Multiplayer stale-read race coverage slice:

- Add a test-only coordinated match store that forces concurrent contenders to read the same old match record before either version-guarded save runs.
- Verify concurrent direct claims for the same open human seat leave exactly one successful seat claim and one `VERSION_CONFLICT`.
- Verify concurrent quick-match contenders claim at most one public seat from the existing match and create one fallback match for the loser.
- Keep this as deterministic local stale-read race coverage, not live deployed Postgres multi-worker load proof.

Multiplayer invitation alert stream slice:

- Add global match-update subscription support in `MultiplayerAuthority` so user-scoped invitation views can refresh when any match changes.
- Expose `GET /api/multiplayer/invitations/events` as a trusted-header SSE stream that emits the invited user's redacted pending invitation list.
- Extend the Expo multiplayer client with typed `watchInvitations()` support using EventSource first and polling fallback when EventSource is unavailable.
- Surface Watch Invitations / Stop Alerts controls in the Multiplayer Command screen.
- Extend backend coverage with a local Express/SSE route test that listens as the invitee, creates a trusted-user invitation, and verifies the pushed invitation list is redacted.
- Extend mobile client tests for invitation EventSource auth-query URLs and polling fallback, and rendered browser-smoke coverage for the Watch Invitations control.
- Keep this as local SSE/polling invitation alerts, not deployed push/contact notifications, background mobile notifications, full account invitation delivery, production email operations, or physical/deployed multi-device proof.

Multiplayer invitation webhook handoff slice:

- Add `artifacts/api-server/src/lib/multiplayerInvitationDelivery.ts` with optional best-effort invitation delivery through `MULTIPLAYER_INVITATION_WEBHOOK_URL`.
- Support `MULTIPLAYER_INVITATION_WEBHOOK_TOKEN` bearer auth and `MULTIPLAYER_INVITATION_WEBHOOK_TIMEOUT_MS` for bounded notification-service calls.
- Trigger delivery only after the version-guarded invitation reservation is saved, and keep delivery failure non-fatal so the authoritative match record remains consistent.
- Send a recipient-routable payload for trusted account infrastructure while excluding player tokens, session IDs, full game state, cards, and missions.
- Extend backend coverage for webhook request auth, payload shape, redaction, and failure tolerance.
- Keep this as a trusted server-to-server handoff, not push/contact notifications, background mobile notification registration, a full account system, production email operations, or physical/deployed multi-device proof.

Multiplayer invitation SMTP email handoff slice:

- Add `nodemailer` to the API server and extend `artifacts/api-server/src/lib/multiplayerInvitationDelivery.ts` with optional best-effort SMTP delivery through `MULTIPLAYER_INVITATION_EMAIL_SMTP_URL` plus `MULTIPLAYER_INVITATION_EMAIL_FROM`.
- Support optional `MULTIPLAYER_INVITATION_EMAIL_REPLY_TO`, `MULTIPLAYER_INVITATION_EMAIL_SUBJECT_PREFIX`, and `MULTIPLAYER_PUBLIC_APP_URL` settings for reply routing, subject prefix, and a `/multiplayer` command-screen link.
- Compose email invitations only for email-shaped trusted user IDs, and include redacted match/seat/inviter metadata without player tokens, client session IDs, full game state, cards, or missions.
- Preserve best-effort behavior: email failures do not undo the version-guarded seat reservation, and webhook plus email channels can be configured together.
- Extend backend coverage for configured SMTP invitation email delivery and redaction; the authority suite now reports 34/34 pass with `DATABASE_URL` available after the production multiplayer deployment preflight and ranked quick-match coverage was added.
- Keep this as an optional SMTP handoff for trusted account routing, not deployed push/contact notifications, background mobile notification registration, full account/contact discovery, production email deliverability, or physical/deployed multi-device proof.

Multiplayer load-smoke runner slice:

- Add `artifacts/api-server/scripts/multiplayer-load-smoke.cjs` and `pnpm -C artifacts/api-server run smoke:multiplayer:load`.
- Require an explicit `MULTIPLAYER_SMOKE_API_BASE_URL` so the runner does not silently mutate an unintended target.
- Exercise disposable smoke matches through REST and WebSocket: create host, run concurrent quick-match contenders over one public seat, verify exactly one contender claims the hosted seat, report whether the loser creates fallback capacity or joins pre-existing compatible capacity, read the redacted active lobby, verify trusted-header `scope=mine` lobby discovery when configured, open separate host/join sockets, submit a session-bound reducer action, and verify both sockets receive the advanced version.
- Support optional shared auth through `MULTIPLAYER_SMOKE_API_AUTH_TOKEN` or `MULTIPLAYER_API_AUTH_TOKEN`, optional trusted-header identity through `MULTIPLAYER_SMOKE_TRUSTED_USER_HEADER` or `MULTIPLAYER_TRUSTED_USER_ID_HEADER`, bounded timeouts, and multiple rounds.
- Validate the runner locally through the strict trusted-user multi-worker harness; the latest successful run reported `rounds=2`, `joinedExisting=2`, `fallbackCreated=1`, and `scopedLobbyVerified=2` on a non-cleared local DB where pre-existing compatible capacity may be reused.
- Keep this as a targetable operator smoke and local deployment proof artifact; live deployed multi-worker/Postgres load testing is still a separate follow-up until run against that infrastructure.

Local Postgres and multi-worker smoke slice:

- Start a dedicated local `worlddomination-postgres` Docker container on `127.0.0.1:55432` using the locally available Postgres image instead of reusing the unrelated `mongars-postgres-1` container.
- Store the local connection string in ignored `.local/worlddomination-postgres.env`; source it before running DB-backed workspace commands.
- Add `pnpm --filter @workspace/db run verify:multiplayer-schema` to assert the applied `multiplayer_matches` table has the expected non-null columns, primary key, and `updated_at` index.
- Run `pnpm --filter @workspace/db run push` and `pnpm --filter @workspace/db run verify:multiplayer-schema` against the dedicated local DB; result: the schema push completed and the verifier passed with `multiplayerColumns=7 accountProfileColumns=4 accountContactColumns=4`.
- Fix the optional real-Postgres authority test so the disposable `.test-build` resolves `pg` from the real `@workspace/db` package directory instead of the compiled output tree.
- Serialize Postgres match-store schema initialization with a transaction-scoped advisory lock so concurrent worker starts do not race `CREATE TABLE` / `ALTER TABLE` / `CREATE INDEX`.
- Add opt-in `MULTIPLAYER_SOCKET_POLL_INTERVAL_MS` support to the API WebSocket transport so DB-backed cross-worker sockets can observe version changes even though local EventEmitter notifications remain process-local.
- Add `artifacts/api-server/scripts/multiplayer-multiworker-smoke.cjs` and `pnpm -C artifacts/api-server run smoke:multiplayer:multiworker`.
- Run `pnpm -C artifacts/api-server run test:authority:postgres` against the local DB; result: 34/34 pass, no optional Postgres skip, including account-scoped `scope=mine` lobby filtering for claimed and invited trusted users, trusted account/contact directory persistence, configured trusted-contact fallback filtering/redaction, production multiplayer deployment preflight, and ranked quick-match coverage.
- Add `artifacts/api-server/src/lib/multiplayerDeploymentPreflight.ts` and run it before the Express app and WebSocket authority are imported from `src/index.ts`; production API startup now fails closed unless `MULTIPLAYER_API_AUTH_TOKEN`, `MULTIPLAYER_DATABASE_STORE=1`, `DATABASE_URL`, `MULTIPLAYER_TRUSTED_USER_ID_HEADER`, `MULTIPLAYER_REQUIRE_TRUSTED_USER=1`, and `MULTIPLAYER_ACCOUNT_DIRECTORY_STORE=postgres` are present.
- Verify direct production startup failure with missing multiplayer deployment env; result: the built API logs `Multiplayer deployment preflight failed` and reports only env variable names, not secret values.
- Run `MULTIPLAYER_REQUIRE_TRUSTED_USER=1 MULTIPLAYER_TRUSTED_USER_ID_HEADER=x-player-user MULTIPLAYER_MULTIWORKER_WORKERS=2 MULTIPLAYER_SMOKE_ROUNDS=2 pnpm -C artifacts/api-server run smoke:multiplayer:multiworker`; result: success with `socketPollMs=250`, `joinedExisting=2`, `fallbackCreated=1`, and `scopedLobbyVerified=2` on the non-cleared local DB where pre-existing compatible capacity may be reused.
- Keep this as local Postgres and local multi-worker proof; production DB migration/deployment, deployed load balancer behavior, and physical/deployed multi-device gameplay remain separate follow-up gaps.

Release/deployment readiness gate slice:

- Add `artifacts/mobile/eas.json` with EAS `preview` internal-distribution builds and `production` store-distribution builds; Android production emits an app bundle and preview emits an installable APK.
- Add `scripts/release-readiness.cjs` plus root `release:readiness` and `release:readiness:static` scripts.
- Make the readiness gate verify static app identity, EAS profile shape, ignored local credentials, production API env, Postgres-backed multiplayer, trusted-user enforcement, Postgres-backed account/contact discovery, deployed notification handoff, EAS automation token, Google Play service-account key path, App Store Connect API key path/IDs/team, and an explicit deployed or physical multi-device proof artifact/URL.
- Extend mobile ignore rules for `credentials.json`, local keystores, and signing-secret sidecars.
- Validate `pnpm run release:readiness:static` and a synthetic full-production positive path using temporary ignored placeholder files under `.local/release-readiness`.
- Keep this as a fail-closed readiness gate and release profile setup, not a live EAS build, signed store artifact, Play/App Store submission, real production credentials, deployed account provider, or actual physical multi-device proof.

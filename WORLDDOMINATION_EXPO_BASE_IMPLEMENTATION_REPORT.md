# WorldDOMINATION EXPO Base Implementation Report

Generated: 2026-07-29
Last verified advancement: 2026-07-30

## Executive Summary

Use `worldDOMINATION_EXPO/artifacts/mobile` as the consolidation base.

That workspace is the strongest implementation because it already contains the complete Expo mobile app shell, the most advanced Same Time RISK runtime, the current typed game model, mobile setup and gameplay integration, bundled map/art/audio assets, native SQLite persistence, and compatible Expo web fallback storage.

The implementation should not merge repositories wholesale. The correct path is a controlled port:

1. Keep `worldDOMINATION_EXPO/artifacts/mobile` as the source of truth.
2. Pull browser presentation and web test infrastructure from `worldDOMINATION_2026/web`.
3. Translate portable domain tests and selected legacy Same Time oracle behavior from `worldDOMINATIONweb`.
4. Translate Swift rule tests from `worldDOMINATION` and `worldDOMINATION-808`.
5. Treat the Swift SceneKit prototype as future cinematic reference only.
6. Retire or ignore empty, README-only, or superseded repositories for code consolidation.

The desired end state is one coherent Expo-first codebase with:

- A single canonical TypeScript rules engine.
- Mobile-native gameplay as the primary runtime.
- Browser preview and Vite/Vitest lanes for fast rule and UI validation.
- Ported regression tests covering Same Time RISK, dice tiers, maps, missions, cards, tactical moves, persistence, and view alignment.
- Clear separation between production runtime code, browser-only adapters, historical references, and retired snapshots.

## Source Graph Artifacts

This report is derived from the complete crawl graph generated in this workspace:

- Graph JSON: `worlddomination-complete-graph.json`
- Interactive local graph: `worlddomination-complete-graph.html`
- Spreadsheet workbook: `worlddomination-complete-graph.xlsx`

The graph contains 38 nodes and 55 edges. Its reuse map identifies `worldDOMINATION_EXPO/artifacts/mobile` as the primary base, `worldDOMINATION_2026/web` as the web/test donor, `worldDOMINATIONweb` as the domain-test donor, Swift repositories as rule/prototype references, and the remaining empty/README-only repositories as ignored for consolidation.

## Current Implementation Progress

As of the current 2026-07-30 working tree, the EXPO base has advanced beyond the initial consolidation plan. The implementation remains centered on `worldDOMINATION_EXPO/artifacts/mobile`; the donor repositories are still references, not alternate production targets.

### 2026-07-30 Live Release Advancement

This is the authoritative release snapshot. Older URLs, artifact versions, credential conclusions, readiness totals, and notification-hosting notes later in the report are retained as dated history.

- Expo project authority is verified as owner account `ales27pm` for `@ales27pm/worlddomination`, project ID `f9205fa6-ad0e-4808-877d-a8f4cf1856fb`. The earlier wrong-owner token conclusion is superseded.
- The current production web alias is `https://worlddomination.expo.app`; immutable deployment `https://worlddomination--3lbqel0tgd.expo.app` is the matching release. Alias and immutable index hashes match, and the deployed bundle contains the current China atlas fill, expanded `W. Africa`, and private API base.
- Real production navigation was exercised through Home -> New Campaign -> Setup -> Launch. Standard and expanded maps rendered without page or console errors. Current captures are `.local/release-evidence/live-web-map-standard-20260730.png` and `.local/release-evidence/live-web-map-expanded-20260730.png`; both show China without an inland border, while West Africa remains expanded-mode-only.
- The current R3F web export is `.local/web-builds/expo-dist-r3f-native-20260730`, 17 MB, with a lazy 1 MB `R3FGameMap` chunk and the indexed canonical GLBs. `eas-cli/21.0.3 deploy --dry-run` also produced `.local/web-builds/worlddomination-web-r3f-20260730-deploy.tar.gz`, 16,422 bytes with SHA-256 `61d59fe5eed107de9725fa8626112514f844a7e85882b773a4f5dd9a0964dbf6`. This is local EAS packaging evidence; it was not promoted over the production alias.
- A fresh local EAS Android production build completed under `ales27pm` with remote credential `Build Credentials AcpOI7ZatM`, application ID `com.worlddomination.app`, versionCode `11`, and versionName `1.0.0`. Store bundle `.local/eas-builds/worlddomination-production-r3f-native-20260730.aab` is 77,366,836 bytes with SHA-256 `a54aa4528db496dd8d4f7a1cb421d573fb3c2a935902da2f0c171248754e412d`; `jarsigner -verify` exits 0, and its signer SHA-256 remains `97:7D:8A:82:C3:BF:95:F8:54:DB:AE:4A:50:2E:A4:D6:FB:3F:F7:B8:07:AC:A8:A0:3A:D9:57:95:44:AE:D8:D8`. Bundletool confirms versionCode 11. The AAB contains Hermes and Expo GL for all four Android ABIs, the native PNG board atlas, the R3F demand-render/contact-shadow code, and both canonical GLBs at their exact indexed sizes.
- Google Play submission is not claimed. No `GOOGLE_SERVICE_ACCOUNT_KEY_PATH` or equivalent Google service-account JSON is available in the workspace or supplied release environment.
- The production API image now binds only to `127.0.0.1:4401`. Production trusted-header preflight rejects non-loopback binding, with backend regression coverage; the API typecheck and isolated authority suite pass 37/37, including the real `DATABASE_URL` Postgres contract.
- Port 10000 is now private Tailscale Serve, not Funnel. It proxies `/` to the loopback API and `/notify` to the loopback notification receiver. The legacy Cloudflare API and notification quick-tunnel containers are stopped so they cannot bypass Tailscale header sanitization. Live proof confirms unauthenticated API rejection, injected tailnet identity, and stripping of an attempted forged `Tailscale-User-Login` header. Evidence is `.local/release-evidence/tailscale-identity-boundary-20260730.json`.
- The injected account profile was persisted with display name `ales27pm`. Live contact discovery returned the expected account and multiplayer contact, a seat invitation was created for match `2e0d3d9d-703f-44de-b19b-c8eaa8146ea9`, the public lobby redacted the recipient, and the deployed receiver accepted `multiplayer.seat_invitation.created` with the injected inviter identity. Evidence is `.local/release-evidence/private-account-contact-invitation-proof-tailscale-20260730.json`.
- The full readiness gate now passes 45/47 checks. Trusted identity-boundary and deployed notification failures are closed. The only remaining failures are Google Play service-account credentials and physical multi-device proof.
- Physical-device enumeration remains empty: local ADB has no attached device, the Linux host has no mobile USB device, and the SSH macOS host lists only itself plus simulators. Only one human tailnet identity is currently connected, so recipient-side proof from a second authenticated account is also unavailable. No physical or two-user claim is made.
- A fresh R3F signed iOS production build completed through SSH/Xcode 26.3 with EAS buildNumber `11`. IPA `.local/eas-builds/worlddomination-production-ios-r3f-20260730.ipa` is 28,202,673 bytes with SHA-256 `703589aecf5dec97e3f0445d384e51024da10651d490bf0465358f38e2290c7a`; strict deep code-sign verification passes for bundle `com.worlddomination.app`, version `1.0.0`, team `52T7P32J34`, and the active App Store provisioning profile. Its 6,457,291-byte release bundle includes the R3F native path, 1,728,692-byte PNG board atlas, and exact 980,496/1,019,592-byte canonical indexed GLBs. EAS submission `2781fb7c-1e31-4da1-adcb-f6e9bca60474` exited successfully for App Store Connect app `6796113966`, and Apple accepted build 11 for processing. TestFlight processing or physical installation is not claimed.
- Post-submission R3F contract hardening now builds one shared `MapSceneModel` at the renderer boundary and feeds that exact model to both SVG and R3F, with revisions covering every renderer-facing field. It also emits each newly observed battle presentation once, suppresses restored or repeated battle snapshots, resolves equal-depth border hits by canonical territory order, repairs native demand-render pick registration, and records renderer-neutral active camera/battle frame profiles against a 60 Hz budget. R3F territory-name parity now comes from a deterministic 1024x1024 IM Fell English atlas rendered as one merged, depth-aware mesh; classic and expanded scenes report 42/42 and 48/48 labels respectively. The exact patch passes TypeScript, 109 Node tests, 2 Vitest tests, the complete Playwright/export matrix including a same-revision live `3D -> 2D -> 3D` switch, native Android 15 emulator classic/expanded label proof plus the earlier renderer-switch/raycast/save/restore proof, real iOS 26.3 Simulator classic/expanded label proof plus the earlier renderer-switch/tap/raycast/combat proof through the SSH macOS host, and fresh SSH/Xcode simulator compilation. The signed versionCode 11 AAB and buildNumber 11 IPA above predate this patch and remain historical distribution evidence; they are not claimed to contain the patch.
- The macOS QEMU guest was recovered after its graphical login session ended. Its service now supports an explicit display backend and runs headlessly for stable SSH/QMP access; the existing macOS disk was not reset or replaced.

### 2026-07-29 Atlas and Release Advancement

This is a historical snapshot. The 2026-07-30 section above supersedes its EAS URLs, readiness total, credential state, and live identity/notification conclusions.

- `game/mapGeometry.ts` now owns mode-specific SVG paths and hit testing. The classic board exposes the canonical 42 territories, includes Madagascar, and merges the painted North Africa and West Africa regions into one North Africa territory. The expanded board exposes 48 territories and restores West Africa as one of the six optional territories.
- `WorldBoard.tsx` uses those same paths for borders, hit targets, view overlays, selections, and occupation highlights. China is painted as one continuous atlas region and the erroneous baked inland border is covered; its one correct outer SVG border remains visible.
- Unit coverage now checks standard/expanded counts, exact optional IDs, Madagascar/West Africa mode membership, China taps, merged North Africa taps, and every active territory anchor in both modes. The current mobile Node lane passes 87/87.
- The Playwright browser smoke now renders and distinguishes both `/game?autostart=1` and `/game?autostart=1&extra=1`, requiring Madagascar on both maps and West Africa only on the expanded map. The full rendered route matrix passes across portrait, landscape, and desktop with 97 loaded game images.
- Visual inspection artifacts are under ignored `.local/map-refactor/`. Generated art-direction references are `artifacts/mobile/assets/map-fixes/risk-ii-extended-atlas-redesign-reference.png` and the focused final `artifacts/mobile/assets/map-fixes/africa-china-single-outline-reference.png`; runtime geometry remains the traced SVG rather than replacing the aligned board raster with generated artwork.
- `DATABASE_URL` is available through ignored `.local/worlddomination-postgres.env`; the dedicated `worlddomination-postgres` container is bound to `127.0.0.1:55432`, and a fresh schema verification passes for `multiplayer_matches`, `account_profiles`, and `account_contacts`.
- The current EAS production alias is `https://worlddomination.expo.app`; immutable deployment `https://worlddomination--vcg72n9h7i.expo.app` is also live. Both returned HTTP 200 with JSON metadata during the current verification.
- The latest saved production-readiness evidence passes 44/47 checks. The three remaining failures are trusted identity-boundary/live OIDC proof, Google Play service-account credentials, and physical multi-device proof.
- A fresh goal audit confirms the public Tailscale API returns HTTP 200 with `{"status":"ok"}`. Its deployed proof records strict unauthenticated rejection, persisted account profiles and contacts, contact discovery, pending invitation and scoped-lobby discovery, recipient redaction, and a delivered `multiplayer.seat_invitation.created` webhook. The deployed identity mode is still `trusted-header`, so authenticated upstream header ownership or live OIDC remains unproven.
- Physical-device enumeration is currently empty: local ADB reports no Android devices, the Linux host exposes no matching mobile USB device, and SSH-hosted `xcrun xctrace list devices` reports only the macOS host plus iOS simulators. No physical multi-device claim is made.
- EAS iOS submission `abad5f39-36fb-4bed-a33e-77cf32451ef1` is `FINISHED` with no submission error for App Store Connect app `6796113966`. This proves submission completion, not direct TestFlight install or physical-device proof.
- The currently reattached EAS token authenticates to a different Expo owner and cannot read project `f9205fa6-ad0e-4808-877d-a8f4cf1856fb`. Earlier signed APK/AAB/IPA artifacts remain valid historical evidence, but a fresh credential-backed local EAS Android build is blocked until an `ales27pm` project-authorized token is supplied. Native Gradle and SSH/Xcode compilation remain independent validation paths.
- Fresh post-atlas Android validation completed with `./gradlew :app:bundleRelease` in 7m50s. It produced `artifacts/mobile/android/app/build/outputs/bundle/release/app-release.aab` at 73,599,881 bytes with SHA-256 `8640b033be44aa3997e4a17d8eb2ffe4f855c7e7c1340f8fe38d26c726286635`, and `jarsigner -verify` reports `jar verified`. This native project currently signs its release variant with `debug.keystore`, so this artifact is compile/bundle evidence only and does not replace the earlier EAS-signed production AAB.
- Fresh post-atlas iOS validation also completed entirely through `ssh -p 2222 ales27pm@127.0.0.1` with Xcode 26.3. The generic iOS Simulator `xcodebuild` exited 0 and produced `/Users/ales27pm/worlddomination-risk-scan-ios-build/artifacts/mobile/ios/build/DerivedData/Build/Products/Debug-iphonesimulator/worldDOMINATION.app` at 213 MB with a universal `worldDOMINATION` Mach-O for `x86_64` and `arm64`. Existing pod deployment-target, duplicate-library, Metal search-path, and always-run script warnings were nonfatal.
- Final isolated Playwright captures are `.local/map-refactor/final-standard.png`, `.local/map-refactor/final-expanded.png`, `.local/map-refactor/final-standard-portrait.png`, and `.local/map-refactor/final-expanded-landscape.png`. The standard captures have Madagascar without West Africa; the expanded captures have Madagascar and West Africa. Desktop and mobile visual inspection confirms the China inland line is absent and the Africa split is mode-specific.

Validated progress now present in the EXPO base:

- Playwright and Puppeteer are installed in the mobile package. The current workspace also has runnable browser caches under `~/.cache/ms-playwright` and `~/.cache/puppeteer`, so the rendered smoke can fall back to installed Chromium/Chrome when system Chrome is unavailable.
- The test harness is in place with `test`, `test:unit`, `test:vitest`, `test:browser`, and `test:browser:run` scripts.
- `pnpm test` currently runs both the compiled Node unit lane and Vitest lane, covering 109 Node tests and 2 Vitest tests.
- Rule coverage now protects dice tiers and casualties, classic allocation/reinforcement/battle/tactical-move/card/victory behavior, missions, cards, map counts/anchors/adjacency/sea routes, camera behavior, battle presentation summaries, event feed ordering, and tournament state.
- Atlas coverage protects the canonical 42-territory classic map, 48-territory expanded map, classic Madagascar membership, optional expanded West Africa, mode-specific North Africa geometry, China hit geometry, and every active territory anchor.
- Same Time RISK coverage now includes reinforcement readiness, restricted reinforcement caps and undo behavior, mandatory card blocking, attack order queue/cancel/clamp behavior, all-active seal gates, no-order transition behavior, playback gates, tactical movement, conquest card awards, alliance expiry, simultaneous elimination/card transfer, border clashes, defended ties, third-party vulnerability, mass invasion/spoils, and bounded surge behavior.
- Persistence has been split into tested JSON and SQLite adapters while preserving aligned public web/native repository entry points through `db/repository.ts` and `db/repository.native.ts`.
- Persistence tests cover save summary, save/restore/delete, completed-campaign archive idempotency, duplicate legacy import idempotency, commander stats, tournament progress, and highscores.
- The rendered browser smoke now exports the Expo web build and verifies home, setup, restricted Same Time setup controls, records, tournament, multiplayer command including quick-match, joinable/active/finished lobby filter controls, pending-invitation refresh and alert-watch controls, contact refresh/select controls, trusted-user invite controls, multiplayer battlefield fallback, classic standard and expanded maps, commander roster, field dispatch, Same Time gameplay, orders, playback, and save/restore across portrait, landscape, and desktop viewports with 97 loaded game images. Its R3F lane additionally verifies registered pick-mesh count, the active-frame profile schema, finite battle presentation, save/restore suppression, and one-shot rendering of versioned multiplayer snapshots. Its browser launcher can use `BROWSER_SMOKE_CHROME`, system Chrome/Chromium, the installed Playwright Chromium cache, or the installed Puppeteer Chrome cache.
- Static Expo Go export remains the Android/iOS bundle validation path through `EXPO_PUBLIC_DOMAIN=example.com pnpm build`, followed by `pnpm run verify:static-build` manifest, launch-bundle, and bundled-asset checks. Historical previews remain recorded below; the current EAS production alias is `https://worlddomination.expo.app`, and immutable deployment `https://worlddomination--vcg72n9h7i.expo.app` is live with the Tailscale-hosted API base embedded in its deployed bundle.
- Native Android debug compilation has also been verified from the generated Expo prebuild project. The exact current source completed the x86_64 emulator build with `./gradlew :app:assembleDebug -PreactNativeArchitectures=x86_64 --no-daemon --max-workers=2 --console=plain`; `artifacts/mobile/android/app/build/outputs/apk/debug/app-debug.apk` is 70,575,068 bytes with SHA-256 `a2c74c66a6f6f5757086dd5ef9c1316e768ea8ad9eeef666bc3c5108228b06f6`. The command required `JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64` and `ANDROID_HOME=/home/ales27pm/.local/android-tooling/android-sdk-1785090272`. This ABI-limited APK is current emulator compile evidence, not a distribution artifact. Local EAS Android preview release packaging now also succeeds through `eas-cli/21.0.3`, producing signed APK `.local/eas-builds/worlddomination-preview-eas-20260729-174942.apk` at 103 MB; `apksigner verify --verbose --print-certs` verifies APK Signature Scheme v2 with one RSA signer. Local EAS Android production store packaging also succeeds, producing signed AAB `.local/eas-builds/worlddomination-production-eas-20260729-182100.aab` at 70 MB with remote versionCode 2; `jarsigner -verify` reports `jar verified`, and `keytool -printcert -jarfile` shows the same SHA-256 signer fingerprint `97:7D:8A:82:C3:BF:95:F8:54:DB:AE:4A:50:2E:A4:D6:FB:3F:F7:B8:07:AC:A8:A0:3A:D9:57:95:44:AE:D8:D8`.
- Native iOS simulator Debug compilation has now been verified through the SSH macOS/Xcode host with `xcodebuild`; the current simulator app is `/Users/ales27pm/worlddomination-risk-scan-ios-build/artifacts/mobile/ios/build/DerivedData/Build/Products/Debug-iphonesimulator/worldDOMINATION.app`, 230,452 KiB, with a universal `worldDOMINATION` Mach-O for x86_64 and arm64 simulator architectures. A signed local EAS iOS production build also completed over SSH, producing `/Users/ales27pm/worlddomination-risk-scan-ios-build/.local/eas-builds/worlddomination-production-ios-20260729-192700.ipa`, copied back to `.local/eas-builds/worlddomination-production-ios-20260729-192700.ipa`, SHA-256 `8859b8b7cb1396c1043d79319697103f435f7c64430df6f517fb9cb9ca05a520`.
- Release/distribution readiness has a checked-in EAS profile gate: `artifacts/mobile/eas.json` defines an internal `preview` build for installable device testing and a `production` store build with Android app-bundle output, while `scripts/release-readiness.cjs` fails closed unless live API health returns JSON `status=ok`, Postgres-backed multiplayer, verified account identity, Postgres-backed account/contact discovery, deployed notification handoff, EAS automation, store-submit credentials, and deployed/physical multi-device proof evidence are all present. `pnpm run release:readiness:static` verifies checked-in EAS/app/signing hygiene at 19/19 checks. The latest saved full run passes 44/47; trusted identity-boundary/live OIDC proof, Google Play service-account credentials, and physical multi-device proof remain missing.
- The Expo project remains linked to `@ales27pm/worlddomination` with project ID `f9205fa6-ad0e-4808-877d-a8f4cf1856fb`. The currently attached EAS token authenticates as `ales27pm` and completed the current credential-backed local EAS Android production build. Historical preview/production builds and the signed iOS build remain recorded below. No Replit target is used.
- A server-authoritative multiplayer foundation now exists in `artifacts/api-server`: server-owned matches, optional JSON-file match persistence, optional Postgres-backed match persistence with version-guarded compare-and-swap writes through the workspace DB package, transaction-locked Postgres schema initialization for concurrent worker starts, production multiplayer startup preflight that fails closed in `NODE_ENV=production` or when `MULTIPLAYER_PRODUCTION_PREFLIGHT=1`, optional shared-token multiplayer API auth through `MULTIPLAYER_API_AUTH_TOKEN`, optional trusted upstream user binding through `MULTIPLAYER_TRUSTED_USER_ID_HEADER`, opt-in strict trusted-user enforcement through `MULTIPLAYER_REQUIRE_TRUSTED_USER`, Postgres-backed trusted account profiles and account contacts through `MULTIPLAYER_ACCOUNT_DIRECTORY_STORE=postgres`, JSON/path trusted contact fallback support through `MULTIPLAYER_CONTACTS_JSON` or `MULTIPLAYER_CONTACTS_PATH`, per-user `GET /api/multiplayer/contacts` filtering, trusted-user seat invitations with pending-invitation discovery plus local SSE invitation-list alerts on match updates, optional trusted webhook delivery through `MULTIPLAYER_INVITATION_WEBHOOK_URL`, and optional SMTP email delivery through `MULTIPLAYER_INVITATION_EMAIL_SMTP_URL` for email-shaped trusted user IDs, server-authoritative quick-match over ranked compatible public seats with fallback match creation, human seat tokens, optional client-session-bound seat claims, version-checked action submission through the canonical Expo reducer, redacted snapshots for hidden player information, rival session IDs, rival trusted user IDs, and invitee trusted user IDs, redacted match-list/lobby summaries with joinable/active/finished status filtering plus trusted-user `scope=mine` filtering for claimed or invited seats, versioned seat claims, SSE/WebSocket snapshot fan-out on local match updates, and an opt-in WebSocket polling fallback for DB-backed cross-worker version observation.
- API deployment packaging now exists at `artifacts/api-server/Dockerfile`, with root `.dockerignore` excluding local build output and signing material. `docker build -f artifacts/api-server/Dockerfile -t worlddomination-api:local .` succeeds, and a production-env container smoke using the local Postgres URL, shared API auth, strict trusted-header identity, and the EAS web origins returns `{"status":"ok"}` from `/api/healthz`. The same container has also been exposed through a Cloudflare quick tunnel at `https://balance-stars-obtaining-serves.trycloudflare.com`; public health returns `{"status":"ok"}`, CORS now allows `https://worlddomination--8w8fse82mn.expo.app`, and `pnpm -C artifacts/api-server run smoke:multiplayer:load` passed against `https://balance-stars-obtaining-serves.trycloudflare.com/api` with strict trusted-header identity, `rounds=1`, `joinedExisting=1`, `fallbackCreated=1`, and `scopedLobbyVerified=1`. This is public HTTPS proof, not durable production infrastructure. Route middleware was tightened so account/multiplayer auth no longer intercepts unrelated public health routes, with backend regression coverage in `pnpm --filter @workspace/api-server run test:authority`.
- Expo client integration has started with a `Multiplayer Command` route, a `Multiplayer Battlefield` route, typed REST client, typed trusted-contact listing, contact refresh/select controls that can fill the trusted invite target, optional `EXPO_PUBLIC_MULTIPLAYER_API_AUTH_TOKEN` or UI-entered API auth token support, local reconnect-token storage, quick-match/create-host/join-seat/invite-seat/refresh/public-or-mine lobby-filter-select/pending-invitation-refresh-and-select/watch-invitation-alert flows, WebSocket snapshot watching with EventSource and native polling fallback, invitation alert watching with EventSource and polling fallback, a shared gameplay surface that can submit composed `GameAction`s through the server with local-seat command gating, and rendered browser smoke coverage for the multiplayer command and battlefield route surfaces.
- Local multiplayer proof now covers a real two-client REST/WebSocket loop against the API: one host seat and one joined seat connect to a local Express server, receive server snapshots over separate WebSockets, query the redacted active-match list, submit a reducer-owned action through REST, and observe the same advanced version without leaking seat tokens.
- A reusable operator smoke runner now exists at `artifacts/api-server/scripts/multiplayer-load-smoke.cjs` and is exposed as `pnpm -C artifacts/api-server run smoke:multiplayer:load`. When pointed at a configured API base URL, it creates disposable smoke matches, runs concurrent quick-match contenders over the same public seat, verifies exactly one contender claims the hosted seat, reports whether the loser creates fallback capacity or joins pre-existing compatible capacity, verifies the redacted active-match list, verifies trusted-header `scope=mine` lobby discovery when a trusted-user header is configured, opens two WebSocket viewers, submits a reducer-owned REST action, and verifies both viewers receive the advanced version without logging or leaking player tokens. Current local validation ran it through the strict trusted-user multi-worker harness and reported `scopedLobbyVerified=2`.
- Quick-match candidate selection is now explicitly ranked server-side: after setup, public-seat, invitation, session, and trusted-user compatibility filters pass, the authority fills lobbies with fewer open public human seats first, then prefers older created matches, older updated matches, and stable match IDs.
- A dedicated local Postgres target is now available through the ignored `.local/worlddomination-postgres.env` file. It points at the dedicated `worlddomination-postgres` Docker container bound to `127.0.0.1:55432`, not the unrelated `mongars` database container. The local Drizzle migration path has also been exercised with `pnpm --filter @workspace/db run push`, and `pnpm --filter @workspace/db run verify:multiplayer-schema` now verifies the applied `multiplayer_matches`, `account_profiles`, and `account_contacts` table shapes and required indexes.
- A non-destructive multi-worker smoke harness now exists at `artifacts/api-server/scripts/multiplayer-multiworker-smoke.cjs` and is exposed as `pnpm -C artifacts/api-server run smoke:multiplayer:multiworker`. It requires `DATABASE_URL`, starts multiple built API workers with `MULTIPLAYER_DATABASE_STORE=1`, enables `MULTIPLAYER_SOCKET_POLL_INTERVAL_MS` for cross-worker WebSocket version observation, fronts the workers with a local round-robin HTTP/WebSocket proxy, and runs the existing load smoke through that proxy. Current local validation ran `MULTIPLAYER_REQUIRE_TRUSTED_USER=1`, `MULTIPLAYER_TRUSTED_USER_ID_HEADER=x-player-user`, `MULTIPLAYER_MULTIWORKER_WORKERS=2`, and `MULTIPLAYER_SMOKE_ROUNDS=2` against the local Postgres target, with `socketPollMs=250`, `joinedExisting=2`, `fallbackCreated=1`, and `scopedLobbyVerified=2` on a non-cleared local database where pre-existing compatible capacity may be reused.
- Local concurrency proof now forces stale-read races against the match store: concurrent direct claims for the same seat leave exactly one winner and one `VERSION_CONFLICT`, while concurrent quick-match contenders claim at most one public seat and create a fallback match for the loser.
- Optional real Postgres verification is now wired and passing through `pnpm -C artifacts/api-server run test:authority:postgres`: with the local `DATABASE_URL` set, it runs the authority suite with an isolated temporary schema and verifies real `multiplayer_matches` table creation, JSONB persistence/restore, version-guarded stale-write rejection, and trusted account/contact directory profile plus contact persistence without clearing a shared table.
- Client-session identity now extends the multiplayer foundation beyond shared deployment-token auth: Expo clients generate a local session ID when claiming a seat, persist it with the reconnect token, send it on server-backed gameplay actions, and the authority rejects missing or mismatched session IDs for session-bound seats while keeping legacy unbound seats compatible.
- Trusted-user identity can now be layered in by a deployment proxy or auth middleware: REST routes delete any body-supplied `userId`, inject only the configured trusted header value, persist that user ID in seat claims, expose it only to the matching viewer, redact rival/public user IDs, return redacted `scope=mine` match lists for matches where that trusted user has a claimed seat or pending invitation, and require the same trusted user ID for user-bound snapshot, WebSocket, and action access. Deployments can set `MULTIPLAYER_REQUIRE_TRUSTED_USER=1` to reject anonymous multiplayer REST, SSE, and WebSocket access when the trusted header is missing.
- Full account identity has advanced beyond trusted headers: `artifacts/api-server/src/lib/accountIdentity.ts` adds `MULTIPLAYER_ACCOUNT_IDENTITY_PROVIDER=oidc` support with RS256 JWT verification against `MULTIPLAYER_OIDC_JWKS_URL`, issuer/audience/expiry validation, configurable user/display-name claims, REST middleware injection into the existing trusted-user path, and WebSocket `identityToken` query support. Shared API auth now checks all supported token locations so an OIDC bearer token can coexist with `x-multiplayer-auth`. Backend tests cover OIDC REST account identity, body/header spoofing rejection, wrong-audience failure, OIDC WebSocket identity, and OIDC production preflight without requiring a trusted upstream header.
- Trusted-user invitations now reserve open human seats for specific trusted user IDs: invitation records persist through JSON and Postgres match stores, invited seats no longer appear as public open seats, invitee IDs stay out of public snapshots and lobby summaries, the Expo command screen can create a reservation from the local claimed seat token, invited users can list their own pending redacted invitations through the trusted header, watch their pending invitation list through local SSE/polling alerts, and a configured server can hand a redacted account-routing payload to a trusted invitation webhook or send a redacted SMTP email invitation after the version-guarded reservation is saved. Invited seats can only be claimed when the trusted header matches the reserved user.
- Generated validation output directories such as `.browser-build`, `.test-build`, and `static-build` are treated as disposable and should be removed after validation.

The report should therefore be read as a consolidation baseline plus an implementation-progress record. Product completion is still not claimed because the current 45/47 gate lacks Google Play service-account submission credentials and physical multi-device proof. The API/database deployment is live but private to the tailnet and runs on the local production host, not an independently managed public service; only one human tailnet identity is connected, deployed multi-worker load proof is still absent, Apple processing/TestFlight availability and physical installation of buildNumber 9 are not yet proven, and remaining donor edge cases are still explicit unresolved scope.

No Replit target is used for the current build work. A historical Replit URL documented in older notes returned HTTP 404 not-live pages on 2026-07-29 and remains only negative historical evidence; the checked-in release readiness gate now makes missing live deployment proof an explicit blocker instead of an implicit assumption.

## Historical Evidence Audit (2026-07-29)

The table below preserves the detailed 2026-07-29 audit. The authoritative 2026-07-30 release snapshot above supersedes its older URLs, artifact versions, identity boundary, notification state, readiness totals, and credential conclusions.

Status legend:

- Verified: current files and validation commands directly prove the requirement group.
- Partial: current implementation or tests cover the main requirement, but the evidence does not prove the full broader claim.
- Not present: the current managed Expo workspace does not contain this requirement.

| Requirement group | Status | Current evidence | Residual risk |
| --- | --- | --- | --- |
| EXPO base remains source of truth | Verified | Production code and scripts are under `worldDOMINATION_EXPO/artifacts/mobile`; donor references are documented in `CONSOLIDATION_NOTES.md`. | None for consolidation routing. |
| Single canonical TypeScript rules engine | Verified | Runtime rules stay in `game/types.ts`, `game/engine.ts`, `game/sameTime.ts`, `game/dice.ts`, `game/mapData.ts`, `game/mapShapes.ts`, `game/missions.ts`, and related pure helpers. No donor production engine is introduced. | Future donor ports must continue avoiding parallel engines. |
| Test harness and Vite/Vitest lane | Verified | `package.json` defines `test`, `test:unit`, `test:vitest`, `test:browser`, and `test:browser:run`; `vitest.config.mjs` and `vitest/rule-lane.test.ts` provide the Vite/Vitest compatibility lane. | Browser smoke is Playwright over Expo web export, not Vitest Browser Mode. |
| Classic RISK rule protection | Verified | `test/game/classicRules.test.ts`, `test/game/cards.test.ts`, and `test/game/missions.test.ts` cover setup allocation, reinforcement, card rules, mandatory trades, conquest/occupy bounds, tactical move, domination, capital, and mission victory. | More scenario coverage can be added as behavior changes. |
| Same Time RISK resolver and phase machine | Verified | `test/game/sameTime.resolveRound.test.ts` and `test/game/sameTime.phaseMachine.test.ts` cover reinforcement readiness, mandatory card blocks, restricted caps, order queue/cancel/clamp, all-active seal gate, playback gate, tactical movement, alliances, simultaneous elimination/card transfer, border clashes, defended ties, third-party vulnerability, mass invasion/spoils, and bounded surge. | Remaining donor-oracle edge cases should be added if discovered during future semantic comparison. |
| Dice, map, missions, event feed, camera, tournament, and presentation regressions | Verified | `test/game/dice.test.ts`, `mapData.test.ts`, `missions.test.ts`, `eventFeed.test.ts`, `camera.test.ts`, `tournament.test.ts`, and `battlePresentation.test.ts` cover the named report groups. | Snapshot breadth is intentionally focused rather than exhaustive UI screenshot coverage. |
| Classic/expanded atlas geometry | Verified | `game/mapGeometry.ts` supplies mode-specific paths and hit testing. Standard mode merges North/West Africa, includes Madagascar, and exposes 42 territories; expanded mode exposes West Africa and all 48. China has one continuous fill and one outer border. `mapData.test.ts` verifies every 42/48 territory anchor, and browser smoke distinguishes both rendered routes. | The generated PNG is an art-direction reference only; runtime alignment remains tied to the traced SVG and painted board raster. |
| Native/web persistence API alignment | Verified | `db/jsonRepository.ts`, `db/sqliteRepository.ts`, `db/repository.ts`, `db/repository.native.ts`, and `db/types.ts` keep adapter contracts aligned; `test/db/*.test.ts` covers save/restore/delete/archive/stats/tournament/high-score/legacy-import behavior. | SQLite tests run through Node SQLite for schema/statement validation, not an iOS/Android simulator runtime. |
| Browser preview and rendered UI validation | Verified | `scripts/browser-smoke.js` exports Expo web, serves it, resolves a runnable browser from `BROWSER_SMOKE_CHROME`, system Chrome/Chromium, Playwright Chromium, or Puppeteer Chrome, and verifies home/setup/restricted setup/records/tournament/multiplayer command with quick-match, joinable/active/finished lobby filter controls, pending-invitation refresh and alert-watch controls, contact refresh/select controls, and trusted-user invite controls/multiplayer battlefield fallback/classic roster/dispatch/Same Time/orders/playback/save-restore across portrait, landscape, and desktop viewports. Current validation installed Playwright 1.62.0 and Puppeteer 25.4.0 browser caches, then `pnpm -C artifacts/mobile run test:browser:run` passed with 97 rendered game images. | Smoke assertions are targeted; they do not replace full visual regression screenshots. |
| Managed Android/iOS static export, local web export, and EAS web preview | Verified | `EXPO_PUBLIC_DOMAIN=example.com pnpm build` creates Android/iOS static Expo Go bundles; `pnpm run verify:static-build` verifies manifests, launch bundles, world-map asset, piece sprites, and battle views. Current local Expo web export also produced `.local/web-builds/expo-dist-eas-20260729-174514` at 13 MB, `eas deploy --dry-run --export-dir ../../.local/web-builds/expo-dist-eas-20260729-174514 --non-interactive` succeeded with the generated deploy tarball archived under `.local/web-builds/eas-deploy-tarballs/deploy-eas-20260729-174514.tar.gz`, and `eas deploy --export-dir ../../.local/web-builds/expo-dist-eas-20260729-174514 --non-interactive` published `https://worlddomination--roovt59bzs.expo.app`. A later API-wired EAS deployment published `https://worlddomination--8w8fse82mn.expo.app` from `.local/web-builds/expo-dist-eas-api-20260729-190701`; HTTPS checks returned `200 text/html` for `/`, `200 application/json` for `/metadata.json`, and the deployed JS bundle contains `https://balance-stars-obtaining-serves.trycloudflare.com/api` as the default API base. Playwright rendered `/` and `/multiplayer` on the API-wired URL with no page/console errors and no horizontal overflow; earlier Playwright rendering also passed for the first deployed home, records, tournament, and multiplayer command routes. | This proves live EAS static web previews and that the latest web bundle is wired to the public API tunnel. It is not an EAS production alias or durable production API hosting. |
| Native Android debug binary compile | Verified | `ANDROID_HOME=/home/ales27pm/.local/android-tooling/android-sdk-1785090272 ANDROID_SDK_ROOT=/home/ales27pm/.local/android-tooling/android-sdk-1785090272 JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64 ./gradlew :app:assembleDebug -PreactNativeArchitectures=x86_64 --no-daemon --max-workers=2 --console=plain` completed successfully from `artifacts/mobile/android`. The exact-source x86_64 debug APK is `artifacts/mobile/android/app/build/outputs/apk/debug/app-debug.apk`, 70,575,068 bytes, SHA-256 `a2c74c66a6f6f5757086dd5ef9c1316e768ea8ad9eeef666bc3c5108228b06f6`. | This proves an ABI-limited Android emulator Debug compile, separate from the all-ABI EAS release AAB evidence below. |
| Native iOS/Xcode simulator binary compile | Verified | Xcode work ran through `ssh -p 2222 ales27pm@127.0.0.1` on macOS with Xcode 26.3. The exact synchronized source passed remote Node 22 TypeScript validation, then `xcodebuild -workspace ios/worldDOMINATION.xcworkspace -scheme worldDOMINATION -configuration Debug -sdk iphonesimulator -destination "generic/platform=iOS Simulator" -derivedDataPath ios/build/DerivedData CODE_SIGNING_ALLOWED=NO DEBUG_INFORMATION_FORMAT=dwarf COMPILER_INDEX_STORE_ENABLE=NO build` ended with `** BUILD SUCCEEDED **`. The current output is `/Users/ales27pm/worlddomination-risk-scan-ios-build/artifacts/mobile/ios/build/DerivedData/Build/Products/Debug-iphonesimulator/worldDOMINATION.app`, 230,452 KiB, with a universal x86_64/arm64 simulator executable, bundle id `com.worlddomination.app`, and executable SHA-256 `a778084dd3cc68f1418b1004c5c709616bc6710d8a11c21e8d9ced0a1562d253`. | This proves unsigned Debug simulator compilation through SSH/Xcode, not signed physical-device install, TestFlight, App Store readiness, or simulator runtime behavior. |
| Release signing, distribution readiness gate, and local EAS builds | Partial | `artifacts/mobile/app.json` now sets `owner: "ales27pm"`, `expo.ios.infoPlist.ITSAppUsesNonExemptEncryption=false`, and EAS project ID `f9205fa6-ad0e-4808-877d-a8f4cf1856fb` for `@ales27pm/worlddomination`; Replit is not used as an active origin. `artifacts/mobile/eas.json` defines EAS `preview` internal-distribution builds and `production` store-distribution builds, and the iOS submit profile now includes `ascAppId: "6796113966"`. Preview Android emits an installable APK; production Android emits an app bundle; production iOS targets physical devices rather than simulator; submit config starts Android on the internal/draft track and keeps the iOS bundle identifier aligned with `app.json`. `scripts/release-readiness.cjs` and root scripts `release:readiness` / `release:readiness:static` check app identity, EAS profile shape, ignored signing material, live API health JSON, production DB env, trusted-user or OIDC account identity enforcement, Postgres-backed account/contact discovery, notification handoff, EAS automation token, Google Play and App Store Connect credential paths/IDs, and explicit deployed/physical multi-device proof evidence. `eas config --platform android --profile preview --non-interactive` resolves, `eas deploy --dry-run` packages the current web export, real `eas deploy` published `https://worlddomination--roovt59bzs.expo.app`, the API-wired web deploy published `https://worlddomination--8w8fse82mn.expo.app`, `eas build --platform android --profile preview --local --non-interactive` completed locally using remote Android credentials, and `eas build --platform android --profile production --local --non-interactive` completed locally using remote Android credentials after incrementing remote versionCode from 1 to 2. The current local EAS preview APK is `.local/eas-builds/worlddomination-preview-eas-20260729-174942.apk`, 103 MB, and `apksigner verify --verbose --print-certs` verifies APK Signature Scheme v2 with one 2048-bit RSA signer. The current local EAS production AAB is `.local/eas-builds/worlddomination-production-eas-20260729-182100.aab`, 70 MB, and `jarsigner -verify` reports `jar verified`; `keytool -printcert -jarfile` reports SHA256withRSA, 2048-bit RSA, certificate validity from 2026-07-29 to 2053-12-14, and SHA-256 fingerprint `97:7D:8A:82:C3:BF:95:F8:54:DB:AE:4A:50:2E:A4:D6:FB:3F:F7:B8:07:AC:A8:A0:3A:D9:57:95:44:AE:D8:D8`. The signed local EAS iOS production build succeeded over SSH, produced `.local/eas-builds/worlddomination-production-ios-20260729-192700.ipa` at 24 MB with SHA-256 `8859b8b7cb1396c1043d79319697103f435f7c64430df6f517fb9cb9ca05a520`, prepared App Store Connect app ID `6796113966`, created TestFlight group `Team (Expo)`, scheduled EAS submission `abad5f39-36fb-4bed-a33e-77cf32451ef1`, and Apple accepted the uploaded binary for processing. Full production readiness with the public API tunnel and deployed smoke proof now fails 5/44 checks: deployed invitation notification channel, Google service-account path, and local ASC API-key path/key/issuer env fields. | This proves EAS project identity, live EAS static web previews, local EAS Android preview release packaging, local EAS Android production store-bundle signing, signed local EAS iOS production IPA packaging, and iOS binary upload to App Store Connect for Apple processing. It does not prove EAS production alias promotion, remote cloud EAS builds, Play Store internal-track upload, Apple post-processing/TestFlight availability, physical-device install, durable live API/database deployment, or physical multi-device gameplay. |
| API container deployment package | Verified | `artifacts/api-server/Dockerfile` builds from the monorepo root with pnpm 11.9.0, copies the API workspace, DB/API-Zod workspaces, `tsconfig.base.json`, and the shared `artifacts/mobile/game` reducer sources, builds the API bundle, and deploys production dependencies into a runtime Node 22 image. Root `.dockerignore` excludes `.local`, generated browser/test/build output, native Android/iOS directories, node_modules, EAS deploy tarballs, APK/AAB/IPA files, signing keys, and `credentials.json`. `docker build -f artifacts/api-server/Dockerfile -t worlddomination-api:local .` succeeds. A local production-env container smoke with the ignored local Postgres URL, strict trusted-header identity, shared API auth, and EAS web origins returns `{"status":"ok"}` from `http://127.0.0.1:4399/api/healthz`. The same image is currently exposed through Cloudflare quick tunnel `https://balance-stars-obtaining-serves.trycloudflare.com`; public `/api/healthz` returns `{"status":"ok"}`, CORS preflight/GET evidence for `https://worlddomination--8w8fse82mn.expo.app` is saved under `.local/release-evidence/public-api-cors-*20260729.*`, and the public multiplayer smoke passed with `rounds=1`, `joinedExisting=1`, `fallbackCreated=1`, and `scopedLobbyVerified=1`, with evidence saved to `.local/release-evidence/public-multiplayer-smoke-20260729-asc.log`. `artifacts/api-server/src/routes/account.ts` and `src/routes/multiplayer.ts` now scope their auth middleware to `/account` and `/multiplayer`, while `src/routes/index.ts` mounts public health/storage before identity-bound routes; `pnpm --filter @workspace/api-server run test:authority` includes a regression that health stays public even when account/multiplayer auth routers are mounted first. | This proves a locally buildable production API container, public HTTPS health through the current tunnel, browser-origin CORS for the API-wired EAS web deployment, and public API multiplayer smoke behavior. It does not prove the image has been pushed to a registry, deployed to durable public infrastructure, connected to a live production Postgres instance, or load-tested behind a deployed balancer. |
| SceneKit prototype ideas | Partial | `game/battlePresentation.ts`, `components/game/BattleReport.tsx`, `components/game/BattleView.tsx`, `game/camera.ts`, and `game/eventFeed.ts` implement presentation/camera/feed concepts without changing rules. | SceneKit itself is not portable and remains future reference only. |
| Server-authoritative multiplayer backend and Expo client | Partial | `artifacts/api-server/src/lib/multiplayerAuthority.ts` owns matches on the server, creates games with the canonical Expo `createGame`, applies client commands only through `gameReducer`, enforces player-token actor checks, rejects stale `expectedVersion` submissions, supports optional JSON-file persistence through `MULTIPLAYER_MATCH_STORE_PATH`, supports optional Postgres persistence through `MULTIPLAYER_DATABASE_STORE=1` and `DATABASE_URL`, uses transaction-locked schema setup and version-guarded Postgres `UPDATE` saves keyed by match id and previously read version, redacts other commanders' cards, missions, capitals, deploy logs, Same Time orders, Same Time moves, rival client session IDs, rival trusted user IDs, and invitee trusted user IDs from snapshots, returns redacted match-list/lobby summaries without tokens or session IDs, classifies lobby summaries as joinable/active/finished, filters listed summaries by status, filters `scope=mine` summaries to matches where the trusted user has a claimed seat or pending invitation, quick-matches ranked compatible public open seats before creating fallback matches, skips seats reserved by trusted-user invitations, binds newly claimed seats to optional client session IDs and optional trusted upstream user IDs, stores trusted-user invitations for unclaimed seats, excludes invited seats from public open-seat lists, lists pending invitations only for the matching trusted user, streams redacted trusted-user invitation lists over SSE on match updates, emits optional best-effort trusted invitation webhook payloads after saved reservations, rejects invited-seat joins when the trusted user ID is missing or mismatched, rejects bound-seat actions with missing or mismatched session/user IDs, advances versions when seats are claimed or invited, and publishes per-match plus global match update notifications. `lib/db/src/schema/index.ts` defines `multiplayer_matches`, `account_profiles`, and `account_contacts` for DB push/migration, while `lib/db/scripts/verify-multiplayer-schema.cjs` checks the applied local schema. `artifacts/api-server/src/lib/multiplayerAuth.ts` adds optional shared-token multiplayer API authorization through `MULTIPLAYER_API_AUTH_TOKEN`, accepting bearer, `x-multiplayer-auth`, or realtime query-token credentials and using constant-time digest comparison, plus optional trusted-user header extraction through `MULTIPLAYER_TRUSTED_USER_ID_HEADER`, plus opt-in strict trusted-user enforcement through `MULTIPLAYER_REQUIRE_TRUSTED_USER`. `artifacts/api-server/src/lib/multiplayerInvitationDelivery.ts` adds optional best-effort trusted invitation webhook delivery through `MULTIPLAYER_INVITATION_WEBHOOK_URL`, optional bearer auth through `MULTIPLAYER_INVITATION_WEBHOOK_TOKEN`, bounded webhook calls through `MULTIPLAYER_INVITATION_WEBHOOK_TIMEOUT_MS`, optional SMTP email delivery through `MULTIPLAYER_INVITATION_EMAIL_SMTP_URL` and `MULTIPLAYER_INVITATION_EMAIL_FROM`, optional reply-to/subject/app-link email settings, and composite webhook-plus-email fan-out when both channels are configured. `artifacts/api-server/src/routes/multiplayer.ts` exposes `POST /api/multiplayer/quick-match`, redacted `GET /api/multiplayer/matches?status=joinable|active|finished|all&scope=public|mine` lobby listing, `GET /api/multiplayer/invitations` pending trusted-user invitation listing, `GET /api/multiplayer/invitations/events` SSE pending-invitation alert streaming, create/read/join/action REST endpoints, a trusted-user seat invitation endpoint, and `/api/multiplayer/matches/:matchId/events` server-sent snapshot updates behind that auth middleware and strict trusted-user middleware when configured; create/quick-match/join/invite/action handlers delete any body-supplied `userId` and inject only the configured trusted header value. `artifacts/api-server/src/lib/multiplayerSocket.ts` attaches `/api/multiplayer/matches/:matchId/socket` WebSocket upgrades to the HTTP server, enforces the same optional auth token, rejects missing trusted-user headers when `MULTIPLAYER_REQUIRE_TRUSTED_USER=1`, passes the configured trusted user header into snapshot authorization, streams the same redacted snapshots on local authority updates, and supports `MULTIPLAYER_SOCKET_POLL_INTERVAL_MS` for DB-backed cross-worker version observation. `artifacts/mobile/lib/multiplayerClient.ts`, `lib/multiplayerSession.ts`, `lib/multiplayerGameplay.ts`, `app/multiplayer.tsx`, `app/multiplayer-game.tsx`, and the exported `CampaignScreen` surface add a typed Expo REST client with typed `quickMatch`, status- and scope-filtered `listMatches`, typed `inviteSeat`, typed `listInvitations`, typed `watchInvitations` with EventSource and polling fallback, optional API auth token support from `EXPO_PUBLIC_MULTIPLAYER_API_AUTH_TOKEN` or the command screen, WebSocket snapshot watching before EventSource and native polling fallback, local reconnect-token storage including the optional API auth token and client session ID, a command screen for quick-match/create-host/join-seat/invite-seat/refresh/clear-token/public-or-mine lobby-filter-select/pending-invitation-refresh-and-select/watch-invitation-alert/contact-refresh-and-select flows that claims seats with local session IDs, a battlefield route that renders server snapshots through the existing board/gameplay UI, local-player command gating for remote turns, and server-backed action submission with conflict refresh plus client session ID. `pnpm --filter @workspace/db run push` now applies the Drizzle schema against the dedicated local Postgres target, and `pnpm --filter @workspace/db run verify:multiplayer-schema` verifies the resulting public `multiplayer_matches`, `account_profiles`, and `account_contacts` tables and required indexes. `pnpm -C artifacts/api-server run test:authority:postgres` now passes 37/37 against the dedicated local Postgres target, including the formerly optional real-Postgres temp-schema persistence/restore/stale-write case, account-scoped match-list redaction for claimed and invited trusted users, and production multiplayer deployment preflight and ranked quick-match coverage. `pnpm -C artifacts/api-server run smoke:multiplayer:multiworker` passed with two built API workers, `MULTIPLAYER_DATABASE_STORE=1`, two load-smoke rounds, a local HTTP/WebSocket round-robin proxy, `socketPollMs=250`, `joinedExisting=2`, `fallbackCreated=1`, and `scopedLobbyVerified=2` on a non-cleared local DB. `pnpm -C artifacts/mobile test` covers mobile client URL/path/error handling, typed quick-match request path/payload/response handling, status- and scope-filtered match-list URL/query handling, typed invite-seat request paths and payloads, typed pending-invitation list paths and responses, typed invitation EventSource and polling watchers, local session ID generation, REST session ID payloads, REST auth headers, WebSocket/EventSource auth query tokens, WebSocket URL construction and preference before EventSource, event-stream subscription, polling fallback, gameplay action submission with the current snapshot version, seat token, and session ID, conflict-triggered snapshot refresh, local reconnect-token persistence, optional API auth-token persistence, optional session ID persistence, and legacy session compatibility without an API auth token or session ID; `pnpm -C artifacts/mobile run test:browser:run` covers home/setup/restricted setup/records/tournament/multiplayer command and battlefield/classic roster and dispatch/Same Time/orders/playback/save-restore routes across portrait/landscape/desktop, with 97 rendered game images. | This is a REST/SSE/WebSocket authority foundation with optional file-backed or Postgres-backed durability, local Drizzle schema push/verification, shared deployment-token auth, client-session-bound seat tokens, optional trusted upstream user binding, opt-in strict trusted-user enforcement, trusted-header seat invitations with creation, discovery, local SSE/polling alerts surfaced in the Expo command screen, optional trusted webhook/email handoff, local server-authoritative ranked quick-match over public compatible seats, a local redacted public and trusted-user-scoped lobby list, an Expo command/battlefield surface, local two-client realtime/action proof, deterministic local stale-read race coverage for direct seat claims and quick-match collisions, real local Postgres verification, production startup preflight, ranked quick-match selection, and local two-worker/Postgres smoke proof. It does not yet prove a live production database migration/deployment, deployed multi-worker load testing, external account provider/session integration beyond the current shared-token, client-session, trusted-header, strict trusted-user, trusted-invitation, trusted account/contact directory, account-scoped lobby, and optional webhook/email handoff controls, deployed account invitation UX beyond local SSE/polling alerts, contact picking, and optional trusted webhook/email handoff, production push/email/contact notification operations, deployed production matchmaking/contact discovery beyond ranked local quick-match plus public and trusted-user-scoped lobby discovery plus trusted account/contact directory support, or deployed/physical multi-device gameplay through every setup, handoff, battle, card, occupation, diplomacy, and game-over phase. |
| Trusted account and contact directory | Partial | `lib/db/src/schema/index.ts` now defines `account_profiles` and `account_contacts` alongside `multiplayer_matches`. `artifacts/api-server/src/lib/accountDirectory.ts` adds a Postgres-backed trusted account/contact store selected by `MULTIPLAYER_ACCOUNT_DIRECTORY_STORE=postgres`, plus a test-only in-memory store. `artifacts/api-server/src/routes/account.ts` exposes trusted-header `GET/PUT /api/account/me`, `GET /api/account/contacts`, `PUT /api/account/contacts/:userId`, and `DELETE /api/account/contacts/:userId`; these routes require the configured trusted user header and shared API token when configured. `GET /api/multiplayer/contacts` now uses the account directory when configured and falls back to `MULTIPLAYER_CONTACTS_JSON` or `MULTIPLAYER_CONTACTS_PATH` for local/operator cases. The Expo command screen now includes Refresh Contacts and contact-select controls that fill the trusted invite target. `pnpm -C artifacts/api-server run test:authority:postgres` covers account profile updates, contact creation, self-contact rejection, missing trusted-user rejection, multiplayer-contact reuse of the persistent account directory, and real Postgres account/contact persistence in an isolated schema; `pnpm -C artifacts/mobile run test:unit` covers the typed contact client path. | This is a trusted-header account/contact directory and client contact-picking flow. It is not yet a deployed external auth provider, contact import/search system, or production notification operation backed by a live deployment. |
| OIDC account identity verifier | Partial | `artifacts/api-server/src/lib/accountIdentity.ts` supports `MULTIPLAYER_ACCOUNT_IDENTITY_PROVIDER=oidc` with RS256 JWT verification against `MULTIPLAYER_OIDC_JWKS_URL`, issuer/audience/expiry checks, configurable user ID and display-name claims, REST middleware that injects verified identity into the existing trusted-user/account path, and WebSocket `identityToken` query handling for browser-compatible realtime auth. `artifacts/api-server/src/lib/multiplayerAuth.ts` now accepts API auth from any supported location, so `Authorization: Bearer <OIDC JWT>` can coexist with `x-multiplayer-auth: <shared API token>`. Production preflight and `scripts/release-readiness.cjs` now accept OIDC identity config as the production account identity path. `pnpm --filter @workspace/api-server run test:authority` covers OIDC account REST identity, missing token rejection, wrong-audience rejection, spoofed body/header user rejection, OIDC WebSocket identity, and OIDC production preflight. | This proves a provider-neutral verifier and server integration. It does not prove a live OIDC provider, real user pool, hosted callback/sign-in UX, token refresh, or deployed identity operations. |
| Reusable multiplayer load-smoke runner | Partial | `artifacts/api-server/scripts/multiplayer-load-smoke.cjs` and `pnpm -C artifacts/api-server run smoke:multiplayer:load` provide a targetable operator smoke. With `MULTIPLAYER_SMOKE_API_BASE_URL` set, it creates disposable smoke matches, exercises concurrent quick-match seat contention, verifies exactly one contender claims the newly hosted public seat, reports whether the loser creates fallback capacity or joins pre-existing compatible capacity, verifies the redacted active lobby, verifies trusted-header `scope=mine` lobby discovery for host, joined contender, loser, and an unrelated user when `MULTIPLAYER_SMOKE_TRUSTED_USER_HEADER` or `MULTIPLAYER_TRUSTED_USER_ID_HEADER` is configured, opens separate host/join WebSockets, submits a version-checked reducer action over REST, and confirms both sockets receive the advanced version. It also supports optional shared auth via `MULTIPLAYER_SMOKE_API_AUTH_TOKEN` or `MULTIPLAYER_API_AUTH_TOKEN`, plus optional trusted-header identity through `MULTIPLAYER_SMOKE_TRUSTED_USER_HEADER` or `MULTIPLAYER_TRUSTED_USER_ID_HEADER`. Current local validation through the strict trusted-user multi-worker harness reported `joinedExisting=2`, `fallbackCreated=1`, and `scopedLobbyVerified=2` on a non-cleared local DB where pre-existing compatible capacity may be reused. | The script is a reusable proof artifact and can target live infrastructure, but this report does not yet claim a live deployed multi-worker/Postgres load-smoke run. |
| Multi-worker/Postgres smoke harness | Partial | `artifacts/api-server/scripts/multiplayer-multiworker-smoke.cjs` and `pnpm -C artifacts/api-server run smoke:multiplayer:multiworker` start two or more built API workers with `MULTIPLAYER_DATABASE_STORE=1`, proxy HTTP and WebSocket traffic across them, enable configurable `MULTIPLAYER_SOCKET_POLL_INTERVAL_MS` so sockets can observe cross-worker DB-backed version changes, and invoke the reusable load smoke through the proxy. The harness requires `DATABASE_URL`, supports `MULTIPLAYER_MULTIWORKER_WORKERS`, `MULTIPLAYER_SMOKE_ROUNDS`, `MULTIPLAYER_SMOKE_TIMEOUT_MS`, optional shared auth token inputs, optional trusted-header identity, and strict trusted-user mode when `MULTIPLAYER_REQUIRE_TRUSTED_USER=1` is paired with `MULTIPLAYER_TRUSTED_USER_ID_HEADER`. Current workspace validation used the dedicated local Postgres target and passed in strict trusted-user mode with `workers=2`, `rounds=2`, `socketPollMs=250`, `joinedExisting=2`, `fallbackCreated=1`, and `scopedLobbyVerified=2` on a non-cleared local DB where pre-existing compatible capacity may be reused. | This proves local multi-worker/Postgres behavior through a round-robin proxy, not deployed infrastructure, external load balancing, production DB migration, or physical multi-device play. |

## Source Repository Classification

| Repository | Classification | Use |
| --- | --- | --- |
| `worldDOMINATION_EXPO/artifacts/mobile` | Primary base | Keep app, game engine, UI, assets, persistence, context, Expo router shell. |
| `worldDOMINATION_2026/web` | Web donor and test lane | Port browser UI patterns, Vite/Vitest scripts, browser persistence ideas, map alignment tests. |
| `worldDOMINATIONweb` | Legacy domain-test donor | Port Jest domain tests and use `SameTimeEngine` as an oracle for behavior comparisons. |
| `worldDOMINATION` | Swift rule oracle | Translate Swift rule tests into TypeScript regressions. |
| `worldDOMINATION-808` | Swift rule and prototype reference | Translate tests where useful; keep SceneKit prototype as future visual reference. |
| `worldDOMINATION-React-Native` | Predecessor only | Compare only if a regression appears; do not use as base. |
| `wD_google` | Ignore | README-only source, not useful for game implementation. |
| `worldDOMINATION_reactNATIVE` | Ignore | Empty repository. |
| `worldDOMINATION_reactnative2026` | Ignore | Empty repository. |

## Why EXPO Is The Base

### Same Time RISK Runtime

`worldDOMINATION_EXPO/artifacts/mobile/game/sameTime.ts` is a pure rules module for Same Time RISK.

Evidence:

- Lines 1-29 document the intended Same Time design: secret reinforcement, simultaneous attack orders, tiered dice, border clashes, mass invasions, spoils behavior, and surge attacks.
- Lines 36-58 implement Same Time reinforcement calculation and restricted reinforcement caps.
- Lines 139-209 resolve a full simultaneous round: subtract committed armies from origins, resolve border clashes, group target invasions, chain surges, and return territory updates, battle reports, and conquerors.

This should remain the canonical Same Time resolver.

### Reducer and Phase Machine

`worldDOMINATION_EXPO/artifacts/mobile/game/engine.ts` already wires Same Time into the central reducer.

Evidence:

- Lines 788-807 open a fresh Same Time round and initialize per-player reinforcement, readiness, orders, playback, and tactical movement state.
- Lines 821-843 transition from reinforcement into the Same Time battle-order phase.
- Lines 846-917 apply Same Time casualties and handle simultaneous elimination/card transfer semantics.
- Lines 919-936 resolve all attack orders and queue battle playback.
- Lines 938-999 run simultaneous tactical movement, issue conquest cards, resolve victory, expire alliances, increment round, and start the next round.
- Lines 1367-1490 define reducer actions for `ST_READY_REINFORCE`, `ST_QUEUE_ATTACK`, `ST_CANCEL_ATTACK`, `ST_READY_BATTLE`, `ST_ACK_PLAYBACK`, `ST_QUEUE_MOVE`, `ST_CANCEL_MOVE`, and `ST_READY_MOVE`.

This reducer already has the correct shape for implementation. The work is coverage, polishing, and selective donor integration, not replacement.

### Type Model

`worldDOMINATION_EXPO/artifacts/mobile/game/types.ts` is the strongest shared model.

Evidence:

- Lines 99-105 define objectives, allocation, and `TurnStyle = "classic" | "sameTime"`.
- Lines 196-210 define setup options including `turnStyle` and Same Time restricted reinforcement.
- Lines 234-257 add Same Time phases and dice-tier display types.
- Lines 300-338 define `AttackOrder`, `TacticalOrder`, and `SameTimeState`.
- Lines 355-397 place `sameTime`, `coWinners`, history, alliances, setup, and battle data directly into `GameState`.
- Lines 399-429 define the full reducer action union, including Same Time actions.

All donor tests should be adapted to this model instead of creating a parallel domain model.

### Mobile UI Integration

`worldDOMINATION_EXPO/artifacts/mobile/app/setup.tsx` already exposes the main mode switches.

Evidence:

- Lines 43-57 initialize campaign setup state for players, objective, allocation, card rules, extra territories, turn style, and restricted reinforcement.
- Lines 81-100 pass those setup values into `startGame`.
- Lines 163-187 render turn-style selection and Same Time restricted reinforcement.

`worldDOMINATION_EXPO/artifacts/mobile/app/game.tsx` is the current gameplay coordinator.

Evidence:

- Lines 107-141 run the AI loop, including Same Time battle playback handling.
- Lines 157-295 compute phase-aware interactive territory and target sets, including Same Time reinforce, Same Time battle, and Same Time move.
- Lines 330-397 dispatch tap behavior for reinforcement, classic attack/fortify, Same Time attack staging, and Same Time movement staging.
- Lines 455-579 compose the full-bleed map, top bar, view-mode rail, event ticker, battle report, command panel, overlays, battle view, card hand, and dispatch log.

`worldDOMINATION_EXPO/artifacts/mobile/components/game/GamePanel.tsx` is the phase command surface.

Evidence:

- Lines 42-68 give phase-specific player guidance.
- Lines 217-252 implement Same Time reinforcement controls.
- Lines 255-307 implement attack-order staging, queued-order chips, cancellation, and seal action.
- Lines 310-361 implement Same Time tactical movement staging, queued movement chips, cancellation, and confirm action.

### Map and Interaction

`worldDOMINATION_EXPO/artifacts/mobile/components/game/WorldBoard.tsx` is the mobile board implementation.

Evidence:

- Lines 141-220 implement point-in-polygon hit testing over traced territory paths with a piece-center fallback.
- Lines 245-251 explain the native board stack: painted map plus SVG overlays, routes, tints, rings, roundels, labels, legend, and frame.
- Lines 278-310 implement RISK II view modifiers: ownership, threats, strength, and empire.
- Lines 312-335 begin the full 1536 x 1024 board render with bundled map asset, explicit dimensions, and sea/vignette layers.

Do not replace this with the web map. Instead, use the web map as a parity reference and testing source.

### Persistence

`worldDOMINATION_EXPO/artifacts/mobile/db/repository.native.ts` is the production native persistence path.

Evidence:

- Lines 1-10 document native SQLite as the iOS/Android repository and `repository.ts` as the Expo web fallback.
- Lines 28-73 define schema for autosave, campaigns, commander stats, tournament, and high scores.
- Lines 77-87 open SQLite and enable WAL.
- Lines 102-125 save a full serialized campaign state.
- Lines 142-155 restore and normalize saved state.
- Lines 166-188 archive completed campaigns and update stats.

`worldDOMINATION_EXPO/artifacts/mobile/context/GameContext.tsx` already wraps persistence around game state.

Evidence:

- Lines 28-42 migrate and restore saved campaigns.
- Lines 44-61 debounce autosaves and archive completed campaigns.
- Lines 63-78 expose start, dispatch, and abandon operations.

This storage architecture should remain. Browser persistence should be adapter-level parity, not a replacement for native SQLite.

## Donor Implementation Plan

## 1. Integrate `worldDOMINATION_2026/web`

### What To Port

Port these ideas, not the entire codebase:

- Vite test lane and browser test scripts.
- Browser rendering patterns for full-bleed map presentation.
- `MapViewport` camera behavior and attention framing concepts.
- `WorldMap` SVG hit-target and map alignment testing concepts.
- sql.js/IndexedDB persistence semantics as a browser adapter reference.
- Browser UI controls that improve scanning: layers, roster, dispatches, records, tournament surfaces.

### Evidence

`worldDOMINATION_2026/web/package.json`:

- `test` runs both Vitest unit tests and browser Vitest.
- `test:browser` and `test:browser:run` provide browser validation.
- `screenshot:game-map` exists for map screenshot capture.

`worldDOMINATION_2026/web/src/components/game/WorldMap.tsx`:

- Lines 11-20 define the same view modes: board, ownership, threats, strength, empire.
- Lines 43-86 define sea routes and wrapped map edge routes.
- Lines 158-205 compute active territories, sea routes, capital markers, piece colors, and view overlays.
- Lines 207-260 render a full-board SVG with painted board, viewBox controlled by `MapViewport`, sea routes, and map labels.
- Lines 260-430 render traced territory hit targets, overlay tints, selection/target outlines, pieces, capitals, troop roundels, and labels.

`worldDOMINATION_2026/web/src/pages/GamePage.tsx`:

- Lines 41-70 show a browser game page composed around map, HUD, roster, dispatches, and battle views.
- Lines 97-160 compute interactive territories and targets for classic phases.
- Lines 167-174 use attention-based camera framing.
- Lines 249-260 mount a full-bleed map through `MapViewport` and `WorldMap`.

`worldDOMINATION_2026/web/src/db/repository.ts`:

- Lines 99-117 save the serialized campaign and persist the sql.js database.
- Lines 132-147 load and normalize saved campaign state.
- Lines 156-192 archive completed campaigns, update commander stats, delete autosave, and persist the database.

`worldDOMINATION_2026/web/src/test/mapAsset.test.ts`:

- Lines 50-75 lock the board asset path and territory anchor coordinates.

### Implementation Tasks

1. Add a browser test lane to the EXPO base.
   - Status: implemented in the current EXPO worktree.
   - Vitest and rendered browser-smoke infrastructure now live under `worldDOMINATION_EXPO/artifacts/mobile`.
   - Expo runtime scripts remain intact.
   - `test`, `test:unit`, `test:vitest`, `test:browser`, and `test:browser:run` scripts are present without replacing `typecheck`.

2. Port map alignment tests.
   - Create tests against `game/mapData.ts`, `game/mapShapes.ts`, and `components/game/WorldBoard.tsx` behavior where possible.
   - Preserve the coordinate-locking spirit from `mapAsset.test.ts`.
   - Add a test that every active territory has a path if hit testing depends on path data.
   - Add a test that active territory coordinates remain normalized.

3. Port browser persistence ideas.
   - Keep native SQLite as primary.
   - Status: implemented for the current adapter contract.
   - `db/repository.ts` and `db/repository.native.ts` keep aligned public APIs through JSON and SQLite adapter implementations.
   - Parity-style tests now cover save summary, save/restore, delete, completed-campaign archive, tournament progress, and high scores.
   - Keep schema/version migration centralized in `db/types.ts` and `db/migrate.ts`.

4. Use web UI as parity reference only.
   - Compare `WorldMap` and `WorldBoard` for view modes, routes, target states, and piece count presentation.
   - Do not transplant React DOM UI into React Native screens.
   - Port behavior and test expectations, not markup.

### Expected Result

The EXPO base gains fast repeatable browser/unit validation while retaining its mobile-native runtime and UI. Browser preview becomes a supported validation surface, not a competing application.

## 2. Integrate `worldDOMINATIONweb`

### What To Port

Port:

- Portable domain tests from `__tests__/domain/game-engine.test.ts`.
- Selected behavioral comparisons from `src/domain/SameTimeEngine.ts`.
- Any test data or deterministic dice/random helpers that make rule regressions precise.

Do not port:

- Its Expo shell wholesale.
- Its older class-style `GameEngine` as a new runtime.
- Swift and TypeScript duplicate models as production code.

### Evidence

`worldDOMINATIONweb/__tests__/domain/game-engine.test.ts`:

- Lines 29-51 cover classic random allocation and seeded armies.
- Lines 53-71 cover territory grab allocation uniqueness.
- Lines 73-102 cover classic and Same Time reinforcement calculations.
- Lines 104-126 cover dice battles and conquest.
- Lines 128-166 cover domination and mission victory.

`worldDOMINATIONweb/src/domain/SameTimeEngine.ts`:

- Lines 27-99 implement a legacy multi-attacker Same Time battle resolver.
- Lines 101-136 implement spoils of war resolution between surviving attackers.
- Lines 138-173 implement border clash resolution.

### Implementation Tasks

1. Translate domain tests to the EXPO reducer model.
   - Replace `new GameEngine()` setup with `createGame(setup)` and `gameReducer`.
   - Replace string player IDs with numeric player indexes used by EXPO.
   - Replace legacy enum names with EXPO `TerritoryId`, `GameSetup`, `GamePhase`, and `GameAction`.

2. Create deterministic roll injection where missing.
   - Status: implemented where needed for current tests.
   - Pure dice and Same Time paths now support deterministic test scenarios without changing production randomness.
   - Keep production behavior unchanged.

3. Use legacy SameTimeEngine as an oracle only.
   - Compare high-level outcomes for equivalent scenarios: winner, armies remaining, territory ownership, spoils required, border clash behavior.
   - Do not preserve legacy behavior where EXPO intentionally differs and documents the reason.
   - Record differences explicitly in tests as EXPO invariants.

4. Add regression tests for:
   - Random allocation count and player army totals.
   - Territory grab uniqueness.
   - Same Time reinforcement formula.
   - Classic conquest ownership transfer.
   - Domination victory.
   - Mission victory.
   - Multi-attacker spoils/mass invasion.
   - Border clash.

### Expected Result

The EXPO codebase gains portable TypeScript domain coverage without introducing a second production engine.

## 3. Integrate `worldDOMINATION` and `worldDOMINATION-808`

### What To Port

Port:

- Swift dice tests.
- Swift Same Time battle tests.
- Swift map invariant tests.
- Swift mission/card/trade tests.
- Campaign event feed tests if the EXPO dispatch log or records surface should preserve equivalent behavior.

Use as reference only:

- SceneKit world/battle prototype.
- Swift UI implementation details.
- Prototype battle balancing and cinematic camera ideas.

### Evidence

`worldDOMINATION/RiskConquestTests/DiceSystemTests.swift`:

- Lines 6-18 test attacker dice tier thresholds.
- Lines 20-31 test defender dice tier thresholds.
- Lines 33-52 test casualty scaling when attacker wins.
- Lines 54-79 test casualty scaling when defender wins.

`worldDOMINATION/RiskConquestTests/RiskConquestTests.swift`:

- Lines 28-56 test spoils requirement when multiple attackers survive.
- Lines 58-78 test no spoils for a single attacker.
- Lines 80-100 test deterministic border clash resolution.
- Lines 102-138 test original commitments and border clash classification.
- Lines 141-177 test border clash round cap behavior.
- Lines 181-206 test surge battle classification.
- Lines 210-243 test automatic surge after conquest.
- Lines 247-286 test spoils after mass invasion.
- Lines 288-324 test border clash before third-party invasion.
- Lines 326-366 test surge order after earlier phases.
- Lines 368-387 test restored extra territories and map adjacency/count invariants.
- Lines 389-461 test mission edge cases including destroy fallback and Same Time mission timing.
- Lines 463-520 test mandatory card trading behavior.

`worldDOMINATION/RiskConquestTests/CampaignEventFeedSnapshotTests.swift`:

- Lines 6-26 test event feed limits and ordering.
- Lines 28-37 test empty state.
- Lines 39-58 test highlight triggers only on newest event change.
- Lines 60-72 test custom limit behavior.

`worldDOMINATION-808/RiskConquest/Prototype/Views/WorldSceneView.swift`:

- Lines 5-18 mount a SceneKit `SCNView`, disable direct camera control, play at 60 FPS, and attach the controller.

`worldDOMINATION-808/RiskConquest/Prototype/Controllers/WorldSceneController.swift`:

- Lines 6-27 define the scene, camera nodes, map roots, terrain roots, territory roots, effects roots, planning roots, and selection state.
- Lines 35-39 attach tap gesture handling.
- Lines 41-58 trigger territory fly-in camera behavior.
- Lines 77-99 apply campaign state to territory visuals.
- Lines 105-187 render planning options and valid/locked targets.
- Lines 189-244 render attack preview lines, target rings, reticles, and pulse effects.

`worldDOMINATION-808/RiskConquest/Prototype/Models/CampaignBattleGenerator.swift`:

- Lines 3-24 generate a battle blueprint from hostile neighboring territories.
- Lines 26-49 generate a specific attack blueprint.
- Lines 51-124 create attacker/defender battle participants, palettes, environment/audio data, odds, and troop commitments.
- Lines 141-158 compute default attack commitment.
- Lines 160-220 estimate battle stats and odds.

### Implementation Tasks

1. Translate Swift dice tests to TypeScript.
   - Status: implemented in the current unit lane.
   - Add tests for attacker thresholds: 1-3 white, 4-7 yellow, 8-12 next tier, 13-18 red, 19+ black.
   - Add tests for defender thresholds.
   - Add casualty-scaling tests keyed to lower dice tier rank.
   - Verify tie behavior matches EXPO sameTime.ts comments: ties favor defender in defended battles; border clash ties do not remove armies.

2. Translate Swift Same Time tests to EXPO `resolveSameTimeRound`.
   - Status: implemented for the main resolver and phase-machine behaviors listed below.
   - Border clash classification.
   - Round caps.
   - Mass invasion and spoils ordering.
   - Surge chain handling.
   - Original troop commitment subtraction.
   - Third-party invasion after clash.
   - Simultaneous elimination and card transfer.

3. Translate map invariants.
   - Status: implemented in the current unit lane.
   - `42` standard territories.
   - `48` expanded territories.
   - Extra territories list.
   - Symmetric adjacency.
   - Every active territory has map data.
   - Every rendered territory has a shape path or a deliberate fallback.

4. Translate mission/card tests.
   - Status: implemented for the core card and mission invariants listed below.
   - Destroy-player mission fallback.
   - Same Time mission timing.
   - Mandatory trade blocks deployment.
   - Mandatory trade clears only when cards drop below five.

5. Keep SceneKit as future reference.
   - Do not port SceneKit code into Expo directly.
   - Use it as product/design input for future battle presentation:
     - fly-in camera
     - valid target rings
     - attack preview line
     - reticle
     - campaign event feed
     - battle blueprint/odds concept

### Expected Result

The EXPO TypeScript codebase inherits the strongest proven behavior guarantees from Swift while avoiding a native-rewrite detour.

## 4. Handle Superseded And Ignored Repositories

### `worldDOMINATION-React-Native`

Classification: predecessor only.

Evidence:

- It is a private Expo/RN-era workspace at commit `714f33a`.
- It contains older API scaffolding, db packages, mockups, and web/native artifacts.
- It is superseded by `worldDOMINATION_EXPO`, which contains the newer mobile runtime and Same Time implementation.

Policy:

- Do not use as base.
- Do not port code unless a regression investigation needs historical comparison.
- Keep available as a source of old assets or deployment notes only.

### `wD_google`

Classification: ignore.

Evidence:

- Repository contains only `README.md` from initial commit `3c37740`.

Policy:

- Ignore for code consolidation.

### `worldDOMINATION_reactNATIVE`

Classification: ignore.

Evidence:

- Repository is cloned but has no useful source files or commits.

Policy:

- Ignore or archive.

### `worldDOMINATION_reactnative2026`

Classification: ignore.

Evidence:

- Repository is cloned but has no useful source files or commits.

Policy:

- Ignore or archive.

## Target Architecture

### Runtime

Canonical runtime stays in:

- `game/types.ts`
- `game/engine.ts`
- `game/sameTime.ts`
- `game/dice.ts`
- `game/mapData.ts`
- `game/mapShapes.ts`
- `game/missions.ts`
- `game/tournament.ts`
- `game/ai.ts`
- `game/analysis.ts`

Rules must remain framework-independent wherever possible. UI should dispatch typed actions and render state, not duplicate rules.

### UI

Canonical mobile UI stays in:

- `app/setup.tsx`
- `app/game.tsx`
- `app/records.tsx`
- `app/tournament.tsx`
- `components/game/*`
- `context/GameContext.tsx`
- `context/TournamentContext.tsx`

Web UI donor ideas should be implemented as React Native compatible behavior, not DOM-only markup.

### Persistence

Native:

- `db/repository.native.ts`
- `expo-sqlite`
- WAL enabled
- autosave, campaigns, commander stats, tournament, high scores

Web fallback:

- `db/repository.ts`
- same API as native
- tested for parity

Future browser/Vite lane:

- May use sql.js/IndexedDB patterns from `worldDOMINATION_2026/web`.
- Must not replace native repository.

### Tests

Recommended structure inside `worldDOMINATION_EXPO/artifacts/mobile`:

```text
test/
  game/
    dice.test.ts
    sameTime.resolveRound.test.ts
    sameTime.phaseMachine.test.ts
    mapData.test.ts
    missions.test.ts
    cards.test.ts
    setupAllocation.test.ts
  db/
    repository.contract.test.ts
    repository.web.test.ts
  ui/
    mapAlignment.test.ts
    setupScreen.test.tsx
    gamePanel.sameTime.test.tsx
  browser/
    mapViewport.browser.test.tsx
    gameScreen.browser.test.tsx
```

The exact folder can follow local conventions, but the key is to separate pure rules, persistence contracts, UI, and browser rendering checks.

## Implementation Sequence

### Phase 0: Baseline And Guardrails

1. Work from `worldDOMINATION_EXPO/artifacts/mobile`.
2. Run current baseline:
   - `pnpm install` if dependencies are absent.
   - `pnpm typecheck`
   - `pnpm build`
3. Record current failures before any porting.
4. Add a `CONSOLIDATION_NOTES.md` or update existing docs with source classifications.

Exit criteria:

- Baseline command results are known.
- No donor code has been copied yet.
- The team agrees `worldDOMINATION_EXPO/artifacts/mobile` is the base.

### Phase 1: Test Harness

1. Add unit test runner to EXPO base.
2. Add browser runner only if Expo web/browser rendering is part of the release target.
3. Add deterministic random/dice hooks for pure tests.
4. Add a test helper for creating minimal `GameState` fixtures.

Exit criteria:

- `pnpm test` runs pure unit tests.
- `pnpm typecheck` remains green or has known pre-existing failures.
- Test helpers can build classic and Same Time game states without UI.

### Phase 2: Port Pure Rule Tests

From `worldDOMINATIONweb`:

- Random allocation and seeded armies.
- Territory grab allocation.
- Reinforcement calculations.
- Classic battle conquest.
- Domination victory.
- Mission victory.

From Swift:

- Dice tier thresholds.
- Casualty scaling.
- Border clash.
- Mass invasion/spoils.
- Surge handling.
- Map invariants.
- Mission/card edge cases.

Exit criteria:

- EXPO runtime has regression coverage for all above behaviors.
- Differences from legacy behavior are documented as intentional.
- No second engine is introduced.

### Phase 3: Browser And Persistence Parity

1. Port map alignment checks from `worldDOMINATION_2026/web/src/test/mapAsset.test.ts`.
2. Add persistence contract tests shared by native/web fallback APIs where practical.
3. Compare EXPO fallback repository against sql.js/IndexedDB donor behavior.
4. Add migration tests for older save shapes and missing optional fields.

Exit criteria:

- Save, restore, delete, archive, tournament, and high-score behavior is covered.
- Browser preview behavior does not diverge silently from native behavior.

### Phase 4: UI Improvements From Web Donor

Use `worldDOMINATION_2026/web` as a reference for:

- Full-bleed map framing.
- Attention/camera behavior.
- View mode controls.
- Roster/dispatch overlays.
- Battle presentation controls.
- Records/tournament scanning layout.

Implementation rules:

- Keep React Native components.
- Keep Expo Router.
- Use web donor UI as behavior/design reference.
- Test with browser/native preview after each meaningful UI change.

Exit criteria:

- Mobile UI remains primary and usable.
- Expo web preview works if supported by the project.
- Same Time actions remain available and visible in every required phase.

### Phase 5: Prototype-Inspired Battle Presentation

Optional, after rule/test consolidation is stable.

Use `worldDOMINATION-808` SceneKit prototype as inspiration for:

- Territory fly-in camera concept.
- Valid target rings.
- Attack preview line.
- Battle odds plaque.
- Campaign event feed.
- Cinematic battle transition.

Do not attempt to port SceneKit directly into Expo. Implement equivalent concepts with existing Expo/React Native primitives, images, SVG, and animation libraries.

Exit criteria:

- Prototype ideas improve existing `BattleView`, `BattleReport`, `EventTicker`, or map overlays.
- Rules and game state remain unchanged.

## Concrete File Mapping

| Goal | Primary EXPO file | Donor file | Action |
| --- | --- | --- | --- |
| Same Time resolver | `game/sameTime.ts` | `worldDOMINATIONweb/src/domain/SameTimeEngine.ts` | Keep EXPO resolver; use donor as oracle tests. |
| Same Time phase machine | `game/engine.ts` | Swift `GameViewModel+SameTime.swift` tests | Keep EXPO reducer; translate Swift tests. |
| Types | `game/types.ts` | Donor domain models | Keep EXPO numeric-player model; adapt tests. |
| Dice | `game/dice.ts` | Swift `DiceSystemTests.swift` | Translate threshold and casualty tests. |
| Map data | `game/mapData.ts`, `game/mapShapes.ts` | web `mapAsset.test.ts`, Swift map tests | Add coordinate/path/adjacency tests. |
| Mobile setup | `app/setup.tsx` | web `SetupPage.tsx` | Only port useful UI options if missing. |
| Mobile gameplay | `app/game.tsx`, `components/game/*` | web `GamePage.tsx`, `WorldMap.tsx` | Port patterns, not DOM code. |
| Persistence | `db/repository.native.ts`, `db/repository.ts` | web `src/db/repository.ts`, `sqlite.ts`, `idb.ts` | Add adapter parity tests and browser fallback improvements. |
| Records/tournament | `app/records.tsx`, `app/tournament.tsx`, `context/TournamentContext.tsx` | web records/tournament pages | Port layout or data patterns if stronger. |
| Cinematics | `components/game/BattleView.tsx`, `BattleReport.tsx`, `EventTicker.tsx` | Swift SceneKit prototype | Future reference only. |

## Rule Behavior That Must Be Protected

### Same Time RISK

Protect these invariants:

- Each commander stages reinforcements before battle orders.
- Attack orders resolve only after all active players seal them.
- Committed attacking armies leave origin territories before battles resolve.
- Mutual attacks are border clashes.
- Multi-attacker target collisions are mass invasions/spoils.
- Surge chains are bounded and deterministic enough to test.
- Tactical movement is queued and resolved after battle playback.
- Conquest cards are assigned after the round.
- Simultaneous eliminations do not corrupt card transfer or alive state.
- Same Time alliances expire after the current round.
- Same Time missions obey timing rules.

### Classic RISK

Protect:

- Setup allocations.
- Reinforcement minimums and continent bonuses.
- Card trade rules.
- Mandatory trade at five or more cards.
- Attack resolution and occupy behavior.
- Single tactical move per turn.
- Domination, capital, and mission victory.

### Map

Protect:

- 42 standard territories.
- 48 expanded territories.
- Standard mode includes Madagascar and treats the painted West Africa area as part of North Africa.
- Expanded mode exposes West Africa as an optional territory while retaining Madagascar.
- China renders and hit-tests as one territory with no inland split.
- Extra territory IDs.
- Symmetric adjacency.
- Active territory coordinates are normalized.
- Rendered paths exist for tappable territories.
- Every active territory anchor resolves to its own mode-specific hit shape.
- Sea-route wrap behavior remains intentional.

### Persistence

Protect:

- Autosave writes full state plus version.
- Restore normalizes older state shapes.
- Save summary is lightweight and reliable.
- Abandon deletes autosave.
- Completed campaign archives once.
- Commander stats update idempotently enough for UI.
- Tournament progress survives restarts.
- Native and web fallback APIs remain aligned.

## Known Gaps

1. The evidence audit above is current, but this report does not claim complete product readiness because unresolved scope remains.
2. The automated game-rule test lane now exists; future gameplay changes should continue adding focused regressions before UI changes.
3. Native Android debug compilation, native iOS simulator Debug compilation through SSH/Xcode, EAS release profile setup, EAS project linking, production web deployment, the signed Android versionCode 7 AAB, the signed iOS buildNumber 9 IPA, its `FINISHED` App Store Connect submission, and release readiness gating are recorded from the workspace. Real Play Store upload, Apple post-processing/TestFlight availability, remote cloud EAS builds, physical-device install, and physical-device multi-user proof are not proven here.
4. Web donor, legacy TypeScript, and Swift references still require careful semantic mapping for any remaining unported edge cases because player IDs, territory names, and engine flow differ.
5. SceneKit prototype behavior remains design reference only and is not directly portable to Expo.
6. The server-authoritative multiplayer foundation now has live private Tailscale Serve deployment proof for strict upstream identity, Postgres-backed account/contact discovery, seat invitation creation, recipient redaction, and deployed webhook notification delivery. It is still not a complete production multiplayer system because the API/database run on the local private host rather than independently managed multi-worker infrastructure, Google Play submission is unavailable, Apple processing/TestFlight and physical installation are not yet proven, only one human tailnet identity is connected, and deployed/physical gameplay through every phase remains unproven.
7. Replit is not part of the current build plan. The older documented Replit URL remains only negative historical evidence and is not evidence of a live production deployment.

## Recommended First Pull Request

Title:

`Add EXPO rule-test harness and port core dice/map regressions`

Status:

Implemented in the current working tree; final review, commit scoping, and push are still separate delivery steps.

Scope:

- Add a test runner to `worldDOMINATION_EXPO/artifacts/mobile`.
- Add deterministic unit tests for:
  - dice tier thresholds
  - casualty scaling
  - standard/expanded map counts
  - adjacency symmetry
  - normalized coordinates
  - shape coverage for active territories
- Add fixture helpers for `GameState`.
- Do not change gameplay behavior unless tests reveal a current defect.

Why this first:

- It creates the safety net needed before larger Same Time and UI porting.
- It avoids mixing infrastructure, UI changes, and semantic changes in one patch.
- It quickly imports the highest-value Swift and web invariants.

Acceptance criteria:

- `pnpm typecheck` passes.
- `pnpm test` passes.
- Tests can run without launching Expo.
- No donor production engine is added.
- Reported source classifications are documented.

## Recommended Second Pull Request

Title:

`Port Same Time RISK resolver and phase-machine regressions`

Status:

Implemented for the main resolver, phase gates, playback, tactical movement, elimination, card transfer, alliance-expiry, mass-invasion, border-clash, and surge cases currently represented in tests.

Scope:

- Add deterministic Same Time resolver tests.
- Port/translate:
  - border clash
  - mass invasion
  - spoils
  - surge
  - original commitment subtraction
  - third-party invasion after clash
  - simultaneous elimination/card transfer
  - Same Time mission timing
- Add roll injection/refactoring only as needed for deterministic tests.

Acceptance criteria:

- Same Time tests pass deterministically.
- Current EXPO semantics are explicit.
- Legacy/Swift differences are documented.
- No regression in classic turn flow.

## Recommended Third Pull Request

Title:

`Add browser and persistence parity coverage`

Status:

Implemented for the current web smoke and repository contract surfaces. Native SQLite remains the production path, with the JSON/web fallback kept API-aligned.

Scope:

- Add browser runner or Vite lane if Expo web preview is a target.
- Port map alignment tests.
- Add native/web fallback persistence contract tests.
- Verify save/restore/archive/tournament/high-score behavior.

Acceptance criteria:

- Unit and browser tests pass locally.
- Persistence behavior matches across native and web fallback APIs where possible.
- Web-only code does not leak into native runtime.

## Recommended Fourth Pull Request

Title:

`Apply web donor UI parity improvements to EXPO gameplay`

Status:

Partially implemented. Current rendered smoke validates the primary setup, records, tournament, classic gameplay, commander roster, field dispatch, Same Time gameplay, orders, playback, and save/restore surfaces across multiple viewports. Further polish can still be split into smaller UI-only changes.

Scope:

- Improve map view controls, roster, dispatches, battle presentation, and records/tournament surfaces using `worldDOMINATION_2026/web` as reference.
- Keep mobile layout and Expo Router.
- Validate on mobile-sized and desktop/web viewports.

Acceptance criteria:

- Same Time phases remain visible and controllable.
- No text overlap in setup/game panels.
- Full-bleed map remains usable in portrait and landscape.
- Browser preview, if supported, renders the map and assets correctly.

## Validation Commands

From `worldDOMINATION_EXPO/artifacts/mobile`:

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm test:browser:run
EXPO_PUBLIC_DOMAIN=example.com pnpm build
pnpm run verify:static-build
```

The build command creates the static Expo Go deployment bundles and manifests for Android and iOS. The verifier checks platform manifests, launch bundles, and bundled map/piece/battle-view assets.

For release/distribution readiness from the workspace root:

```bash
pnpm run release:readiness:static
pnpm run release:readiness
```

The static readiness command verifies checked-in app identity, EAS preview/production profile shape, and signing-secret ignore rules without production secrets; it currently passes 19/19 checks. With the current partial production environment sourced from `.local/worlddomination-postgres.env`, `.local/worlddomination-api-live.env`, the attached EAS token, `EXPO_PUBLIC_API_BASE_URL=https://balance-stars-obtaining-serves.trycloudflare.com/api`, `EXPO_PUBLIC_DOMAIN=worlddomination--8w8fse82mn.expo.app`, `APPLE_TEAM_ID=52T7P32J34`, and `MULTIPLAYER_DEVICE_PROOF_ARTIFACT=.local/release-evidence/public-multiplayer-smoke-20260729-asc.log`, the full readiness command fails 5/44 checks: notification delivery is not configured, Google Play service-account JSON is unavailable, and local ASC API key path/key/issuer env fields are unavailable. The actual iOS App Store Connect upload succeeded through an EAS-server-held ASC API key, so the remaining ASC readiness failure is specifically about local env/key export, not whether the current IPA reached Apple.

Current local EAS commands:

```bash
cd worldDOMINATION_EXPO/artifacts/mobile
npx --yes eas-cli@21.0.3 project:info
EXPO_PUBLIC_DOMAIN=example.com pnpm exec expo export --platform web --output-dir ../../.local/web-builds/expo-dist-eas-20260729-174514 --clear
npx --yes eas-cli@21.0.3 deploy --dry-run --export-dir ../../.local/web-builds/expo-dist-eas-20260729-174514 --non-interactive
npx --yes eas-cli@21.0.3 deploy --export-dir ../../.local/web-builds/expo-dist-eas-20260729-174514 --non-interactive
EXPO_PUBLIC_DOMAIN=worlddomination--8w8fse82mn.expo.app \
EXPO_PUBLIC_API_BASE_URL=https://balance-stars-obtaining-serves.trycloudflare.com/api \
pnpm exec expo export --platform web --output-dir ../../.local/web-builds/expo-dist-eas-api-20260729-190701 --clear
npx --yes eas-cli@21.0.3 deploy --export-dir ../../.local/web-builds/expo-dist-eas-api-20260729-190701 --non-interactive
ANDROID_HOME=/home/ales27pm/.local/android-tooling/android-sdk-1785090272 \
ANDROID_SDK_ROOT=/home/ales27pm/.local/android-tooling/android-sdk-1785090272 \
JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64 \
npx --yes eas-cli@21.0.3 build --platform android --profile preview --local --non-interactive --output ../../.local/eas-builds/worlddomination-preview-eas-20260729-174942.apk
ANDROID_HOME=/home/ales27pm/.local/android-tooling/android-sdk-1785090272 \
ANDROID_SDK_ROOT=/home/ales27pm/.local/android-tooling/android-sdk-1785090272 \
JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64 \
npx --yes eas-cli@21.0.3 build --platform android --profile production --local --non-interactive --output ../../.local/eas-builds/worlddomination-production-eas-20260729-182100.aab
```

The attached `EAS_ACCESS_TOKEN` authenticated as `ales27pm`. `eas init --non-interactive --force` created/linked `@ales27pm/worlddomination` and wrote project ID `f9205fa6-ad0e-4808-877d-a8f4cf1856fb` to `artifacts/mobile/app.json`. The current local EAS web deploy dry-run succeeded and archived its generated tarball at `.local/web-builds/eas-deploy-tarballs/deploy-eas-20260729-174514.tar.gz`. The initial real EAS web deployment is `https://worlddomination--roovt59bzs.expo.app`; HTTPS checks and Playwright rendering passed for the deployed home, records, tournament, and multiplayer command routes. The API-wired EAS web deployment is `https://worlddomination--8w8fse82mn.expo.app`; HTTPS checks returned `200 text/html` for `/`, `200 application/json` for `/metadata.json`, the deployed JS bundle contains `https://balance-stars-obtaining-serves.trycloudflare.com/api`, and Playwright rendered `/` and `/multiplayer` with no page/console errors and no horizontal overflow. The current local EAS Android preview build succeeded at `.local/eas-builds/worlddomination-preview-eas-20260729-174942.apk` and `apksigner verify --verbose --print-certs` verifies APK Signature Scheme v2 with one RSA signer. The current local EAS Android production build succeeded at `.local/eas-builds/worlddomination-production-eas-20260729-182100.aab` at 70 MB, incremented remote versionCode to 2, and `jarsigner -verify` reports `jar verified`; `keytool -printcert -jarfile` reports SHA-256 signer fingerprint `97:7D:8A:82:C3:BF:95:F8:54:DB:AE:4A:50:2E:A4:D6:FB:3F:F7:B8:07:AC:A8:A0:3A:D9:57:95:44:AE:D8:D8`. The signed local EAS iOS production build succeeded over SSH and produced `.local/eas-builds/worlddomination-production-ios-20260729-192700.ipa`, 24 MB, SHA-256 `8859b8b7cb1396c1043d79319697103f435f7c64430df6f517fb9cb9ca05a520`. EAS prepared App Store Connect app ID `6796113966`, assigned EAS-server-held ASC API key ID `SMG6FC3667`, created TestFlight group `Team (Expo)`, scheduled submission `abad5f39-36fb-4bed-a33e-77cf32451ef1`, and Apple accepted the uploaded binary for processing at `https://appstoreconnect.apple.com/apps/6796113966/testflight/ios`.

For the API container package:

```bash
docker build -f artifacts/api-server/Dockerfile -t worlddomination-api:local .
```

The image builds from the monorepo root and was smoke-tested with production-style env, the ignored local Postgres URL, strict trusted-header identity, and the EAS web origins; `GET http://127.0.0.1:4399/api/healthz` returned `{"status":"ok"}`. The same image is currently exposed through Cloudflare quick tunnel `https://balance-stars-obtaining-serves.trycloudflare.com`; public `GET /api/healthz` returned `{"status":"ok"}`, CORS allows the API-wired EAS web origin, and the public load smoke saved at `.local/release-evidence/public-multiplayer-smoke-20260729-asc.log` passed with `rounds=1`, `joinedExisting=1`, `fallbackCreated=1`, and `scopedLobbyVerified=1`. This is public HTTPS tunnel proof, not durable production API hosting.

For the server-authoritative multiplayer foundation from the workspace root:

```bash
pnpm -C artifacts/api-server run test:authority
DATABASE_URL=postgres://... pnpm -C artifacts/api-server run test:authority:postgres
pnpm -C artifacts/api-server run build
pnpm run typecheck
```

To run the reusable multiplayer REST/WebSocket smoke against a local or deployed API target:

```bash
MULTIPLAYER_SMOKE_API_BASE_URL=http://127.0.0.1:4317/api \
MULTIPLAYER_API_AUTH_TOKEN=loop-secret \
pnpm -C artifacts/api-server run smoke:multiplayer:load
```

To run the local multi-worker/Postgres smoke harness against a caller-provided database target:

```bash
. .local/worlddomination-postgres.env
MULTIPLAYER_MULTIWORKER_WORKERS=2 \
MULTIPLAYER_SMOKE_ROUNDS=2 \
pnpm -C artifacts/api-server run smoke:multiplayer:multiworker
```

Set `MULTIPLAYER_API_AUTH_TOKEN` to require shared-token authorization on account routes and multiplayer REST, SSE, and WebSocket endpoints. Mobile clients can pass the same token through `EXPO_PUBLIC_MULTIPLAYER_API_AUTH_TOKEN` or the Multiplayer Command screen's API Auth Token field. Set `MULTIPLAYER_TRUSTED_USER_ID_HEADER=x-authenticated-user-id` when a trusted proxy or auth middleware is responsible for authenticating users and forwarding a stable user ID; REST handlers ignore body-supplied `userId` values and use only this configured header for account/contact ownership, user-bound seat claims, trusted-user seat invitations, pending invitation listing, `GET /api/multiplayer/matches?scope=mine` lobby discovery, snapshots, WebSockets, and actions. Alternatively set `MULTIPLAYER_ACCOUNT_IDENTITY_PROVIDER=oidc`, `MULTIPLAYER_OIDC_ISSUER=https://...`, `MULTIPLAYER_OIDC_AUDIENCE=...`, and `MULTIPLAYER_OIDC_JWKS_URL=https://...` to verify RS256 OIDC/JWT account identity directly; REST clients can send the identity JWT as `Authorization: Bearer ...` while the shared API token travels through `x-multiplayer-auth`, and browser WebSocket clients can pass the same identity JWT as `identityToken`. Set `MULTIPLAYER_REQUIRE_TRUSTED_USER=1` with either trusted-header or OIDC identity settings to reject multiplayer REST, SSE, and WebSocket requests that do not carry verified identity. Production API startup now also runs a multiplayer deployment preflight when `NODE_ENV=production`, or when `MULTIPLAYER_PRODUCTION_PREFLIGHT=1` is set outside production; that preflight requires `MULTIPLAYER_API_AUTH_TOKEN`, `MULTIPLAYER_DATABASE_STORE=1`, `MULTIPLAYER_ACCOUNT_DIRECTORY_STORE=postgres`, `DATABASE_URL`, strict trusted-user enforcement, and either trusted-header or OIDC identity configuration, and it reports env variable names rather than secret values. Set `MULTIPLAYER_INVITATION_WEBHOOK_URL=https://...` to post a best-effort trusted invitation handoff after a seat reservation is saved; `MULTIPLAYER_INVITATION_WEBHOOK_TOKEN` adds a bearer token and `MULTIPLAYER_INVITATION_WEBHOOK_TIMEOUT_MS` bounds the call. Set `MULTIPLAYER_INVITATION_EMAIL_SMTP_URL=smtp://...` plus `MULTIPLAYER_INVITATION_EMAIL_FROM=invites@example.com` to send best-effort SMTP invitations when the trusted invitee user ID is an email address; `MULTIPLAYER_INVITATION_EMAIL_REPLY_TO`, `MULTIPLAYER_INVITATION_EMAIL_SUBJECT_PREFIX`, and `MULTIPLAYER_PUBLIC_APP_URL` customize reply-to, subject prefix, and the `/multiplayer` app link. Set `MULTIPLAYER_DATABASE_STORE=1` with `DATABASE_URL` to use the workspace Postgres multiplayer match store; set `MULTIPLAYER_ACCOUNT_DIRECTORY_STORE=postgres` with the same `DATABASE_URL` to use Postgres account profiles and contacts. `lib/db/src/schema/index.ts` defines `multiplayer_matches`, `account_profiles`, and `account_contacts` for the existing `pnpm --filter @workspace/db run push` workflow, and `pnpm --filter @workspace/db run verify:multiplayer-schema` verifies that the applied database exposes the required table columns and indexes. Set `MULTIPLAYER_MATCH_STORE_PATH=/path/to/matches.json` to use the JSON-file match store instead. Without either match-store setting, the authority uses the default in-memory match store.

Set `MULTIPLAYER_CONTACTS_JSON='{"contacts":[{"ownerUserId":"user-ada-0001","userId":"user-ben-0001","displayName":"Benedict"}]}'` or `MULTIPLAYER_CONTACTS_PATH=/path/to/multiplayer-contacts.json` only for a local/operator fallback contact directory. With `MULTIPLAYER_ACCOUNT_DIRECTORY_STORE=postgres`, `GET /api/account/contacts` and `GET /api/multiplayer/contacts` return only contacts owned by the current trusted header user and only the redacted `userId` plus `displayName` fields; malformed fallback JSON fails closed with `MULTIPLAYER_CONTACT_DIRECTORY_INVALID`.

The smoke runner requires an explicit `MULTIPLAYER_SMOKE_API_BASE_URL` and accepts `MULTIPLAYER_SMOKE_ROUNDS`, `MULTIPLAYER_SMOKE_TIMEOUT_MS`, `MULTIPLAYER_SMOKE_API_AUTH_TOKEN`, and `MULTIPLAYER_SMOKE_TRUSTED_USER_HEADER`. It creates disposable smoke matches on the target and does not clear target state. A successful run proves the compiled API server, REST routes, hosted-seat quick-match contention, fallback creation on a clean compatible target or safe reuse of pre-existing compatible capacity on a dirty target, redacted lobby response, trusted-header `scope=mine` lobby discovery when a trusted-user header is configured, WebSocket streaming, session-bound action submission, and reducer-owned version advancement on that target. Current local validation through the strict trusted-user multi-worker harness reported `rounds=2`, `joinedExisting=2`, `fallbackCreated=1`, and `scopedLobbyVerified=2` on a non-cleared local database. It is still not a substitute for a deployed multi-worker/Postgres load test unless pointed at that exact production-like deployment.

The multi-worker harness starts built API workers locally, forces `MULTIPLAYER_DATABASE_STORE=1`, fronts them with a local round-robin proxy that preserves WebSocket upgrades, enables `MULTIPLAYER_SOCKET_POLL_INTERVAL_MS` for cross-worker DB-backed version observation, and runs the load smoke against the proxy. It does not clear database state, so use a disposable or explicitly intended production-like database target. Current local validation used the ignored `.local/worlddomination-postgres.env` connection for the dedicated `worlddomination-postgres` Docker container and passed in strict trusted-user mode with `MULTIPLAYER_REQUIRE_TRUSTED_USER=1`, `MULTIPLAYER_TRUSTED_USER_ID_HEADER=x-player-user`, `workers=2`, `rounds=2`, `socketPollMs=250`, `joinedExisting=2`, `fallbackCreated=1`, and `scopedLobbyVerified=2`.

The authority test compiles a disposable backend test build and currently verifies 37 required backend authority/socket/auth/integration cases with `DATABASE_URL` available: server-owned match creation, human seat tokens, token secrecy, hidden-info redaction, redacted match-list summaries, status filters, account-scoped `scope=mine` filtering for claimed and invited trusted users, configured trusted-contact fallback filtering/redaction, trusted account/contact directory ownership and redaction, quick-match ranked public-seat claim/fallback behavior, quick-match preservation of reserved trusted invitations, deterministic stale-read concurrent seat-claim rejection and quick-match collision fallback behavior, trusted-user invitation webhook handoff payload redaction and failure tolerance, configured SMTP invitation email delivery/redaction, trusted-user invitation SSE update streaming, production multiplayer deployment preflight failure and success cases including required account directory store, ranked quick-match scarce-seat selection before recency, route-scoped account/multiplayer auth that leaves health public, OIDC REST account identity, OIDC WebSocket identity, session-bound seat identity, rival session ID redaction, missing/wrong session rejection, trusted-user seat identity, rival user ID redaction, missing/wrong user rejection, trusted-user seat invitations, pending invitation discovery for the invited trusted user, public invitee ID redaction, missing/wrong invitee rejection, REST body-userId spoofing rejection, trusted-user WebSocket enforcement, canonical reducer action application, JSON-file restore across authority instances, Postgres store SQL insert/version-guarded-update/select/delete/list behavior through a fake query client including invitation JSON persistence/restore, real `DATABASE_URL` Postgres table creation/persistence/restore/stale-write rejection plus account/contact persistence in a temporary schema, stale Postgres write rejection, store compare-and-swap miss handling, version conflict rejection, wrong-actor rejection, invalid-action rejection, staged Same Time order redaction, join/action update notifications, WebSocket upgrade route parsing, shared-token REST auth rejection/acceptance, strict trusted-user REST and WebSocket rejection/acceptance, redacted snapshot streaming over an auth-protected real `ws` client, and a two-client REST/WebSocket action loop against the real multiplayer router that also reads the redacted active lobby list. The normal authority test still forces configured multiplayer DB/file stores off for the singleton-backed router integration so accidental `MULTIPLAYER_DATABASE_STORE=1` test runs do not clear a shared database table. The mobile unit lane currently verifies 86 Node cases plus 2 Vitest cases, including the typed multiplayer REST client, typed quick-match request path/payload/response handling, typed contact-list path/response handling, status- and scope-filtered match-list URL/query handling, typed invite-seat request paths and payloads, typed pending-invitation list paths and responses, typed invitation EventSource and polling watchers, local session ID generation, REST session ID payloads, REST auth headers, WebSocket/EventSource auth query tokens, WebSocket URL construction and preference before EventSource, event-stream subscription, polling fallback, gameplay action submission with the current snapshot version, seat token, and session ID, conflict-triggered snapshot refresh, local reconnect-token persistence, optional API auth-token persistence, optional session ID persistence, and legacy session compatibility without an API auth token or session ID. The rendered browser smoke covers home/setup/restricted setup/records/tournament/multiplayer command with contact controls and battlefield/classic roster and dispatch/Same Time/orders/playback/save-restore routes across portrait, landscape, and desktop, with 97 rendered game images.

The current post-atlas rerun supersedes the mobile count in the preceding historical paragraph: 87/87 Node tests pass, plus 2 Vitest cases, and the browser smoke now explicitly covers classic standard and expanded maps.

Current post-atlas correction: the mobile compiled Node lane now passes 87/87, and the complete rendered browser smoke passes the isolated standard/expanded map routes with 97 loaded game images.

`DATABASE_URL` is now available in this workspace through `.local/worlddomination-postgres.env`; that file is ignored by Git. `pnpm --filter @workspace/db run push`, `pnpm --filter @workspace/db run verify:multiplayer-schema`, `test:authority:postgres`, and `smoke:multiplayer:multiworker` were run against the dedicated local Docker Postgres target. A fresh schema check again verifies `multiplayer_matches`, `account_profiles`, and `account_contacts`. A live production database migration was still not executed or claimed.

No Replit target is part of the current build plan. Historical live deployment checks on 2026-07-29 against the older documented Replit URL returned HTTP 404 with a not-live page. A public HTTPS API health endpoint is currently proven through the Cloudflare quick tunnel, but durable production API hosting is still not proven.

For native Android debug compilation in this workspace:

```bash
JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64 \
ANDROID_HOME=/home/ales27pm/.local/android-tooling/android-sdk-1785090272 \
ANDROID_SDK_ROOT=/home/ales27pm/.local/android-tooling/android-sdk-1785090272 \
PATH=/usr/lib/jvm/java-17-openjdk-amd64/bin:/home/ales27pm/.local/android-tooling/android-sdk-1785090272/platform-tools:$PATH \
pnpm exec expo prebuild --platform android --no-install

cd android
JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64 \
ANDROID_HOME=/home/ales27pm/.local/android-tooling/android-sdk-1785090272 \
ANDROID_SDK_ROOT=/home/ales27pm/.local/android-tooling/android-sdk-1785090272 \
PATH=/usr/lib/jvm/java-17-openjdk-amd64/bin:/home/ales27pm/.local/android-tooling/android-sdk-1785090272/platform-tools:$PATH \
./gradlew :app:assembleDebug \
  -PreactNativeArchitectures=x86_64 \
  --no-daemon \
  --max-workers=2 \
  --console=plain
```

The latest successful Android debug artifact is the x86_64 emulator APK at `worldDOMINATION_EXPO/artifacts/mobile/android/app/build/outputs/apk/debug/app-debug.apk`, 70,575,068 bytes, SHA-256 `a2c74c66a6f6f5757086dd5ef9c1316e768ea8ad9eeef666bc3c5108228b06f6`.

The latest post-atlas native release-bundle compile artifact is `worldDOMINATION_EXPO/artifacts/mobile/android/app/build/outputs/bundle/release/app-release.aab` at 73,599,881 bytes. `jarsigner -verify` reports `jar verified`; because `android/app/build.gradle` currently assigns `signingConfigs.debug` to the release build type, use the earlier EAS-signed production AAB for distribution.

For native iOS simulator Debug compilation, run Xcode work only from the SSH macOS host:

```bash
ssh -p 2222 ales27pm@127.0.0.1

# on the macOS host
cd /Users/ales27pm/worlddomination-risk-scan-ios-build/artifacts/mobile
PATH=/Users/ales27pm/.local/node-v22.13.1-darwin-x64/bin:/usr/local/bin:/opt/homebrew/bin:$PATH \
CI=1 EXPO_NO_GIT_STATUS=1 corepack pnpm@11.9.0 exec expo prebuild --platform ios --no-install

cd ios
PATH=/Users/ales27pm/.local/node-v22.13.1-darwin-x64/bin:/usr/local/bin:/opt/homebrew/bin:$PATH \
LANG=en_US.UTF-8 pod install

PATH=/Users/ales27pm/.local/node-v22.13.1-darwin-x64/bin:/usr/local/bin:/opt/homebrew/bin:$PATH \
xcodebuild -workspace worldDOMINATION.xcworkspace \
  -scheme worldDOMINATION \
  -configuration Debug \
  -sdk iphonesimulator \
  -destination "platform=iOS Simulator,name=iPhone 16" \
  -derivedDataPath build/DerivedData \
  CODE_SIGNING_ALLOWED=NO \
  build

APP=/Users/ales27pm/worlddomination-risk-scan-ios-build/artifacts/mobile/ios/build/DerivedData/Build/Products/Debug-iphonesimulator/worldDOMINATION.app
xcrun simctl install booted "$APP"
xcrun simctl launch booted com.worlddomination.app
xcrun simctl get_app_container booted com.worlddomination.app app
```

The latest SSH/Xcode verification used Xcode 26.3 and ran a non-installing generic simulator build from `/Users/ales27pm/worlddomination-risk-scan-ios-build/artifacts/mobile`:

```bash
EXPO_PUBLIC_DOMAIN=example.com \
xcodebuild -workspace ios/worldDOMINATION.xcworkspace \
  -scheme worldDOMINATION \
  -configuration Debug \
  -sdk iphonesimulator \
  -destination "generic/platform=iOS Simulator" \
  -derivedDataPath ios/build/DerivedData \
  CODE_SIGNING_ALLOWED=NO \
  build
```

It ended with `** BUILD SUCCEEDED **` and produced `/Users/ales27pm/worlddomination-risk-scan-ios-build/artifacts/mobile/ios/build/DerivedData/Build/Products/Debug-iphonesimulator/worldDOMINATION.app`.

The latest post-atlas SSH rerun used the same generic simulator command with Xcode 26.3, exited 0, and regenerated the 213 MB universal `x86_64`/`arm64` simulator app at that path.

For browser/UI work, also run a real rendered smoke:

```bash
pnpm test:browser:run
```

The rendered smoke now verifies:

- setup screen
- restricted Same Time setup controls
- multiplayer command screen
- multiplayer battlefield fallback screen
- game screen
- classic 42-territory map with Madagascar and merged North Africa
- expanded 48-territory map with West Africa
- China as one territory without an inland border
- commander roster
- field dispatch
- classic mode
- Same Time mode
- map view modes
- battle playback
- save/restore

## Transparent Map HUD and 3D Renderer Evaluation (2026-07-30)

### Transparent map HUD

The map-facing HUD no longer uses opaque cards or panels. `constants/mapHud.ts` now centralizes the map-overlay treatment:

- passive HUD surfaces: `rgba(21,13,9,0.12)`
- controls: `rgba(21,13,9,0.22)`
- active/focused controls and roster: `rgba(21,13,9,0.34)`
- decision sheets: `rgba(21,13,9,0.40)`
- modal scrim: `rgba(0,0,0,0.08)`
- election parchment: `rgba(238,229,201,0.48)`

The shared values are applied to the top bar, event ticker, command panel, camera and view controls, continent legend, roster, phase banner, battle report, card hand, election panel, and decision/victory/dispatch sheets. Text shadows preserve legibility over the painted map. Full-screen battle and statistics views remain opaque because they replace the map instead of obstructing it.

`scripts/browser-smoke.js` now checks the exact computed alpha values for the passive, control, roster, and dispatch surfaces as well as the camera controls. The full rendered smoke passes across portrait, landscape, and desktop, including 97 game images. TypeScript, 104 Node unit tests, 2 Vitest tests, and `git diff --check` pass. Review screenshots are stored in `.local/transparent-map-hud-20260729/`.

The current HUD and camera build is deployed to `https://worlddomination.expo.app`; `/` and `/game` return `200 text/html`, and the live entry bundle contains `Focus action`, `map-board-transform`, and `map-camera-controls`. EAS deployment `sbfefs2rla` was promoted to the production alias from the exact export at `.local/web-builds/expo-dist-camera-contract-20260730-000920`. A production-alias Playwright run opened the live setup route, launched a real campaign, rendered the map without page errors, measured the idle focus-control background at `0.22`, increased camera scale from `1.36419` to `2.20463` with focal wheel zoom, and measured `49.90 px` of continued bounded motion after pan release. The screenshot and computed-value JSON are stored in `.local/release-evidence/web-camera-contract-20260730/`.

The current local EAS Android production build incremented versionCode from 9 to 10 and produced `.local/eas-builds/worlddomination-production-camera-contract-20260730-001559.aab` at 73,369,051 bytes. `jarsigner -verify` reports `jar verified`; its SHA-256 is `499419c1013e841de27ceaa6d02f0ba5bf3b4f76487df1c559ce21b5f07e9906`, and the signing certificate retains fingerprint `97:7D:8A:82:C3:BF:95:F8:54:DB:AE:4A:50:2E:A4:D6:FB:3F:F7:B8:07:AC:A8:A0:3A:D9:57:95:44:AE:D8:D8`. The embedded Android bundle contains `Focus action`, `map-board-transform`, and `map-camera-controls`. This versionCode 10 AAB has not been uploaded to Google Play because the service-account key remains unavailable.

The first corresponding Xcode simulator rerun reached the final app target but failed while generating its dSYM because the macOS data volume had only 1.1 GiB free (`LLVM ERROR: IO failure on output stream: No space left on device`). This was a packaging-resource failure rather than a source or compile failure. Rebuildable Xcode module/index and CocoaPods caches were removed, increasing free space to 3.9 GiB. The first camera-contract retry exposed one stale ExpoFileSystem response file that still referenced a deleted UIKit `.pcm`; invalidating Xcode's disposable build database correctly regenerated 316 explicit modules. The camera sources passed remote TypeScript validation, and the final generic-simulator build with `DEBUG_INFORMATION_FORMAT=dwarf` and indexing disabled ended with `** BUILD SUCCEEDED **`. Its output is `/Users/ales27pm/worlddomination-risk-scan-ios-build/artifacts/mobile/ios/build/DerivedData/Build/Products/Debug-iphonesimulator/worldDOMINATION.app`, 223,637,504 bytes (213 MB), with a universal `x86_64`/`arm64` executable, bundle ID `com.worlddomination.app`, version `1.0.0`, and executable SHA-256 `a778084dd3cc68f1418b1004c5c709616bc6710d8a11c21e8d9ced0a1562d253`. The authoritative log is `/tmp/worlddomination-camera-contract-xcode-rerun-20260730.log`.

### Camera interaction contract

The existing 2D camera was repaired before introducing a 3D renderer:

- Phase, player, occupation, handoff, and selection changes no longer take camera ownership or recenter the board. The opening state frames once.
- The attention solver is now invoked only by the explicit `Focus action`; `Full board` is also explicit.
- Focus and button-zoom transitions use an exact critically damped spring with continuous velocity.
- Pinch, double-tap, and web-wheel zoom preserve the map point under the gesture focal point.
- Pan release uses frame-rate-independent exponential velocity decay and stops at camera bounds.
- Manual gestures cancel programmatic motion immediately.

`game/cameraMotion.ts` contains the renderer-neutral spring, decay, and focal zoom math. `test/game/cameraMotion.test.ts` verifies focal preservation and equivalent 60/120 Hz spring and decay results. `scripts/browser-smoke.js` verifies camera-button transforms in the rendered application, and the production Playwright evidence above verifies real wheel zoom and release inertia. The R3F camera reuses this contract rather than introducing stock orbit controls.

### 3D renderer decision

| Option | Fit for this repository | Decision |
|---|---|---|
| React Three Fiber 9 with `expo-gl` | One React/TypeScript scene model can serve web, Android, and iOS; current upstream package `@react-three/fiber` 9.6.1 has a native entry point and peer ranges compatible with this app's React 19.1, React Native 0.81, and Expo 54 stack. Its native Canvas uses Expo `GLView`; upstream also carries an Expo 54 `expo-file-system/legacy` compatibility path. Existing reducer, multiplayer snapshots, Expo Router UI, and browser smoke remain reusable. Native rendering must be tested on physical iOS hardware because the R3F documentation warns that iOS simulator OpenGL ES support can be unreliable. The stock native Canvas maps pointers through `PanResponder`, so worldDOMINATION should retain its tested Gesture Handler camera rig and feed camera intent into R3F. | **Use for the first production 3D board.** |
| React Native Filament | Strongest native rendering path: Metal on iOS, OpenGL/Vulkan on Android, separate render threads, PBR, GLB loading, instancing, and a camera manipulator. It has no documented web renderer, supports only perspective cameras at present, requires `react-native-worklets-core` plus native/Babel changes, and would create separate web and native renderer implementations. | Keep as a later native quality/performance bake-off behind a renderer interface. |
| React Native Godot | A complete engine is valuable for a fundamentally different game with engine-owned scenes, physics, animation graphs, and spatial audio. Here it would add a Godot project, PCK/LibGodot asset pipeline, a second runtime/state bridge, and a separate Godot web export while duplicating mature deterministic TypeScript game logic. Available React Native Godot bindings also have materially different platform-support claims. | Do not adopt for the current board-game renderer. Reconsider only for a deliberate full replatform. |

The recommended architecture is a shared `MapSceneModel` derived from canonical game state, a renderer-neutral `CameraIntent`, and an R3F scene with a shallow perspective tabletop, named/extruded territory meshes, raycast pick meshes, instanced army models, atlas textures, selection/battle effects, lighting, and shadows. React Native remains responsible for the transparent HUD and commands. A later `MapRenderer.native.tsx` Filament implementation can consume the same scene model only if physical-device profiling proves R3F insufficient.

### Gate 2 canonical map GLBs

Gate 2 is complete without changing the production SVG renderer. `game/mapSceneGeometry.ts` defines the renderer-neutral asset contract, stable `territory__<territoryId>` mesh naming, board-to-world scale, territory height, and classic/expanded variant identifiers. `scripts/export-map-glb.ts` imports `mapData.ts`, `mapShapes.ts`, and the mode-specific `getTerritoryPath` geometry directly, then uses Three.js `ExtrudeGeometry` and `GLTFExporter` to produce:

- `assets/game/map-3d/world-map-classic.glb`: 42 indexed meshes, merged classic North Africa, 980,496 bytes, SHA-256 `efb2c8d441456f0ceeeb30509d82620348601feb2e102448e389dcf071cc917f`.
- `assets/game/map-3d/world-map-expanded.glb`: 48 indexed meshes, separate West Africa and all six optional territories, 1,019,592 bytes, SHA-256 `225528dd4ae9fd471c33d69924916784e1f009680f75e11e936ed6827b4395ec`.
- `assets/game/map-3d/manifest.json`: deterministic file hashes, canonical-geometry hashes, mesh lists, board dimensions, scale, and extrusion contract.

Each territory is one named glTF mesh and one named node. Node extras carry the canonical `territoryId`, display/continent IDs, stable index from the 48-territory source ordering, variant, optional-territory flag, exact source-path SHA-256, and army anchor transformed into tabletop coordinates. Top-face UVs map back to the full painted-board atlas, while the shallow extrusion is authored on the Y axis for a perspective tabletop. Runtime pick meshes use the parallel stable name `pick__<territoryId>`.

`pnpm --filter @workspace/mobile run map:glb:check` regenerates both assets in memory, requires byte-for-byte equality with the checked-in files, and runs the official Khronos glTF Validator. Both assets report zero errors and zero warnings. `test/game/mapSceneGeometry.test.ts` parses the GLB containers and proves the glTF 2.0 header/chunks, mesh and node counts, unique names, embedded metadata, indexed position/normal/UV attributes, board bounds, extrusion height, and classic/expanded territory order. It also loads both checked-in files through the validated native `game/mapSceneGlb.ts` parser, which copies accessors into renderer-owned typed arrays; the full Node lane now passes 109/109.

`pnpm --filter @workspace/mobile run map:glb:smoke` loads the checked-in GLBs through Three.js `GLTFLoader`, renders them with perspective lighting and shadows through real WebGL, and checks canvas pixels, world bounds, mesh metadata, and unique names at 1280x720 and 390x844. The classic and expanded scenes rendered 42 and 48 meshes respectively with no browser errors; screenshots are under `.local/map-glb-gate2/`. Visual inspection confirms a nonblank, correctly oriented world, merged classic North Africa, separate expanded West Africa, and a single China outline. This proof covers Gate 2 assets only: selection, attack targeting, camera integration, army models, battle animation, Android, and physical iOS remain Gate 3 work, and the SVG board remains active.

### Gate 3 R3F vertical slice status

The first renderer-neutral Gate 3 slice is implemented behind an explicit `2D`/`3D` control. `GameMap` builds one `MapSceneModel` from canonical state and passes the same model instance to either renderer; SVG no longer recomputes ownership, army, capital, tint, or interaction presentation independently. The SVG map remains the default and `GameMap` retains an error-boundary fallback. The new path includes:

- `game/mapSceneModel.ts`, which derives stable territory and pick-mesh identities, ownership, army composition, view-mode tints, capitals, interactions, and deterministic battle effects from canonical `GameState`. Its revision serializes every renderer-facing field, including the active view mode, so owner, army, interaction, view-mode, and battle-only snapshot changes cannot be missed.
- A renderer-neutral presentation cursor that treats the initial battle as historical, presents each genuinely new deterministic battle ID once, and suppresses restored, remounted, stale, or repeatedly polled snapshots.
- `game/mapScenePicking.ts`, which accepts only active canonical pick names, rejects malformed/non-finite hits, selects the nearest valid intersection, and resolves equal-depth border hits by stable territory order.
- `game/mapCameraIntent.ts`, which maps the repaired camera contract into the perspective tabletop without handing camera ownership back to state changes.
- `game/mapFrameProfile.ts`, which records active camera or battle frame deltas and emits deterministic 60 Hz budget metrics: average FPS, p50/p95/p99/max frame time, slow-frame count, estimated drops, and within-budget ratio.
- An R3F tabletop that loads the classic or expanded canonical GLB and painted atlas, renders named extruded territory meshes plus transparent raycast meshes, and adds selection/target halos, lighting, and shadows.
- A deterministic 1024x1024 transparent territory-label atlas generated from the checked-in IM Fell English font. All 48 canonical names are indexed by stable territory order and rendered in one merged depth-aware mesh with one texture/material draw, while classic mode selects its canonical 42-label subset.
- Instanced procedural infantry, cavalry, artillery, army-count roundels, and capital markers.
- Gesture Handler pan, focal pinch, double-tap, wheel, inertia, explicit focus/full-board controls, territory picking, and one deterministic attack animation.

The exact final source passes TypeScript, 109 Node tests, 2 Vitest tests, deterministic GLB and territory-label atlas regeneration, and the Khronos validator with zero GLB errors or warnings. The checked-in label atlas is 250,218 bytes with SHA-256 `39a08d962e2eca221a99a3b3f6a0c306447b74e9a62a29f6a2e15880e775c11f`; its manifest records the exact font hash and canonical label indices. The complete Playwright browser matrix passes across portrait, landscape, and desktop with 97 game images. Its R3F routes prove scene readiness, 42/42 classic pick meshes and labels, 48/48 expanded pick meshes and labels, a nonblank WebGL canvas, the three army classes, camera zoom, a complete active-camera frame-profile contract, Brazil and North Africa raycasts, attack dispatch, finite effect completion, canonical save/restore without replay, and one-shot rendering of a changed multiplayer snapshot without replay on identical polling snapshots. The browser also switches live from R3F to SVG and back on the same game route, requires the identical shared scene revision and territory count in both renderers, verifies R3F unmount cleanup, and proves the remounted scene restores all 42 pick meshes and labels before continuing the interaction suite. The inspected classic browser frame is `.local/release-evidence/r3f-labels-web-classic-20260730.png`. Software SwiftShader is sufficient for functional smoke and profile-schema validation but is not valid evidence for the Gate 4 60 fps target-device requirement.

The native renderer now uses a platform split rather than sending Three.js `GLTFLoader` through Expo GL. Web retains `GLTFLoader` and the WebP atlas. Native resolves Expo assets into a validated GLB parser, uses the 1152x768 RGB PNG atlas required by the native texture path, disables expensive dynamic shadows in favor of deterministic instanced contact shadows, and runs the R3F canvas on demand at DPR 1.25. The shared camera contract explicitly invalidates frames during gestures and motion. The battle effect ends after 2.05 seconds rather than keeping the native canvas hot indefinitely.

The prior Android x86_64 native Canvas crash is resolved. The current contract audit found and repaired a separate demand-render race: `SceneBridge` could publish before native pick meshes entered the Three scene and leave the raycaster with zero registered meshes. It now republishes from the render loop until all canonical meshes are present, and smoke-only native projection exposes deterministic tap coordinates without changing production behavior. On the available Android 15 x86_64 SwiftShader emulator, the exact JavaScript source registered 42/42 classic pick meshes, rendered the canonical board, selected Brazil, exposed only North Africa as its target, changed the complete scene revision, emitted one battle ID, cleared its visual effect after 2.05 seconds, and restored the same canonical battle after process restart without replaying it. A real accessibility tap then switched R3F to SVG and back on the same route: both renderers reported the same 42-territory scene revision, R3F reported `ready=false` while unmounted, and the remount restored 42/42 pick meshes. A known zoom-control transition then produced 62 active frames over 1,034.431 ms: 59.936 average FPS, 16.779 ms p50, 20.818 ms p95, 22.137 ms p99/max, nine slow frames, zero estimated dropped frames, and a 0.855 within-budget ratio. Earlier three-minute idle and five-minute post-battle endurance runs retained the same process and stable native allocation. The current label pass reused that native binary and exact Metro source: Hermes reported classic 42 territories, 42 pick meshes, and 42 labels, then a fresh-storage expanded launch reported 48/48/48. Inspected frames are `.local/release-evidence/r3f-labels-android-classic-20260730.png` and `.local/release-evidence/r3f-labels-android-expanded-20260730.png`. This closes the emulator interaction/persistence and label-parity blockers and establishes an Android emulator profile baseline; SwiftShader timing does not substitute for physical-device profiling.

The current store-signed local EAS Android production build completed 567 tasks in 6m59s and produced `.local/eas-builds/worlddomination-production-r3f-native-20260730.aab`, 77,366,836 bytes, SHA-256 `a54aa4528db496dd8d4f7a1cb421d573fb3c2a935902da2f0c171248754e412d`, versionCode 11. `jarsigner -verify` exits 0 and the established production signer fingerprint is unchanged. Bundletool confirms `com.worlddomination.app` version `1.0.0`, target SDK 36, and versionCode 11. The release bundle contains Hermes, Expo GL for all four ABIs, `world-map-native`, the R3F demand-render/contact-shadow markers, and both canonical indexed GLBs at 980,496 and 1,019,592 bytes.

The current native iOS source also compiles through the required SSH macOS/Xcode path. The exact synchronized patch passed remote TypeScript under Node 22, then the Xcode 26.3 generic iOS Simulator build exited 0 and produced a 230,452 KiB `worldDOMINATION.app` with a universal x86_64/arm64 executable, bundle `com.worlddomination.app` version `1.0.0`, and executable SHA-256 `a778084dd3cc68f1418b1004c5c709616bc6710d8a11c21e8d9ced0a1562d253`. The fresh compile log is `/tmp/worlddomination-r3f-labels-xcode-20260730.log` on the Linux control host. The SSH host still exposes only itself and simulators. The earlier signed local EAS production archive produced buildNumber 11 and submission `2781fb7c-1e31-4da1-adcb-f6e9bca60474`; App Store Connect accepted that earlier binary for processing, but it predates this patch.

The same source now has native iOS runtime evidence on the headless iPhone 16 / iOS 26.3 simulator reached exclusively through SSH. The rendered frame visibly contains the canonical atlas, extruded territories, instanced armies, transparent HUD, camera controls, and readable territory labels. CoreSimulator `idb` taps selected China through the real Gesture Handler/raycast path, exposed `siberia`, `afghanistan`, `india`, and `siam` as targets, tapped India, entered and resolved the battle, and returned to the R3F map. Runtime inspection then reported 42/42 registered picker meshes. A subsequent real `idb` tap switched R3F to SVG and back on the same route: Hermes reported `r3f` with 42 pick meshes, `svg` with R3F unmounted, then `r3f` with 42 pick meshes restored, while the shared 42-territory scene revision remained identical throughout. A known zoom-control transition produced 62 active frames over 1,033.260 ms: 60.004 average FPS, 16.657 ms p50, 16.759 ms p95, 17.016 ms max, zero estimated dropped frames, and a 1.000 within-budget ratio. The current label validation additionally reported classic 42 territories, 42 pick meshes, and 42 labels, then fresh-storage expanded 48/48/48; inspected frames are `.local/release-evidence/r3f-labels-ios-classic-20260730.png` and `.local/release-evidence/r3f-labels-ios-expanded-20260730.png`. These are simulator baseline metrics and visual-parity evidence inside the QEMU macOS guest, not physical-iPhone or target-hardware evidence.

The SSH macOS build host is reachable with macOS 15.7.7 and Xcode 26.3, but `xcrun xctrace list devices` currently exposes only the host and simulators. No physical iPhone is attached, so the physical-iOS part of Gate 3 cannot yet be claimed. The SVG renderer therefore remains the production default and Gate 4 is not open.

Implementation should proceed in four gates:

1. **Complete:** correct the existing 2D camera interaction and codify gesture/focus tests.
2. **Complete:** generate deterministic classic and expanded GLBs from canonical map geometry with one named mesh per territory and stable territory IDs.
3. **In progress:** the R3F selection, attack, camera, three-army-model, finite battle-animation, deterministic picking, save/restore, and multiplayer snapshot slice passes web, Android-emulator, and iOS-simulator interaction validation; validate the same slice on physical Android and iOS hardware.
4. Replace the SVG board only after visual parity, 60 fps target-device profiling, the remaining physical-device interaction checks, and the complete browser/native regression matrix pass.

## Final Recommendation

Continue with `worldDOMINATION_EXPO/artifacts/mobile` as the only production target for the consolidation.

The implemented release now includes the corrected China and mode-specific West Africa atlas, transparent map HUD, repaired renderer-neutral camera contract, deterministic indexed classic/expanded named-territory GLBs, a deterministic territory-name atlas rendered in one merged depth-aware R3F mesh, one shared renderer-boundary scene model consumed by both SVG and R3F, renderer-neutral camera intent and active-frame profiling, and an opt-in R3F tabletop vertical slice with platform-specific asset loading and demand-driven native rendering. The exact source passes 109 Node tests, 2 Vitest cases, deterministic GLB and label-atlas validation, the complete browser smoke including classic 42/42 and expanded 48/48 labels, live same-revision `3D -> 2D -> 3D` switching, R3F frame-profile schema, save/restore, and multiplayer snapshot presentation, Android-emulator classic 42/42/42 and expanded 48/48/48 territory/pick/label registration plus the earlier native renderer-switch/raycast/attack/restore validation, iOS-simulator classic 42/42/42 and expanded 48/48/48 registration plus the earlier native renderer-switch/tap/raycast/combat and camera-profile validation, and a fresh SSH/Xcode iOS compile. The deployed Expo web alias was not changed. The signed Android versionCode 11 AAB and signed iOS buildNumber 11 IPA were produced and verified before this final source patch, so they remain valid historical distribution evidence but are not current-patch artifacts. App Store Connect accepted build 11 through submission `2781fb7c-1e31-4da1-adcb-f6e9bca60474`, but Apple processing and TestFlight installation are not claimed. The SVG map remains the production default because physical Android/iOS profiling and the Gate 4 parity/60 fps contract are still open. The private Tailscale deployment verifies loopback-only API hosting, upstream identity ownership, Postgres-backed account/contact discovery, invitation redaction, and deployed webhook notification delivery. The current release gate remains 45/47; external work still includes a Google Play service-account key for internal-track upload, physical Android and iOS R3F profiling, two physical devices or a second authenticated human account for end-to-end multiplayer proof, and TestFlight processing/installation verification. Keep SceneKit as reference material only.

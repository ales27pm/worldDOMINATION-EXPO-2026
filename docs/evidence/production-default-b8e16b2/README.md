# Production-default release evidence

Captured on 2026-07-31 from canonical source commit
`b8e16b24fa9d717225c531a02ef1dc4fb0806b85` after R3F became the
production-default renderer.

## Results

| Surface | Result | Evidence |
| --- | --- | --- |
| Web export | Pass | 152-file static export and deploy dry-run archive |
| Android release | Pass | Signed production AAB validated with bundletool |
| Android runtime | Pass | Emulator default-R3F and full-board captures |
| iOS direct build | Pass | Release device build, signed installation, default-R3F and full-board captures |
| App Store Connect | Pass | Build 19 uploaded and processed for TestFlight |
| TestFlight install | Pass | Build 19 installed, launched, and recentered on a physical iPhone 16 Pro |
| Multiplayer | Pass | Two distinct trusted identities joined one exact match and converged after a reducer-owned action |

## Files

| File | Purpose |
| --- | --- |
| `release-record.json` | Artifact, delivery, runtime, and integrity record |
| `android-default-r3f.png` | Android default renderer is the nonblank R3F board |
| `android-full-board.png` | Android full-board recenter on the round table |
| `ios-xcode-default-r3f.png` | Physical iOS direct-Xcode R3F smoke |
| `ios-xcode-full-board.png` | Physical iOS direct-Xcode full-board framing |
| `ios-testflight-build19-installed.png` | TestFlight lists installed build 19 with Open enabled |
| `ios-testflight-build19-default-r3f.png` | Store-signed build 19 default-R3F runtime |
| `ios-testflight-build19-full-board.png` | Store-signed build 19 full-board framing |
| `two-user-multiplayer-proof.json` | Sanitized REST/WebSocket convergence and isolation result |

## Boundaries

The accepted native qualification pair is Android emulator plus physical iOS;
physical Android hardware is not required by the current release contract.

The Android AAB and iOS IPA are intentionally excluded from Git because of
their size. Their byte counts and SHA-256 digests are recorded in
`release-record.json`.

The multiplayer identity proof targets the same live, Postgres-backed API
process over loopback so it can supply two distinct trusted proxy identities.
The tailnet HTTPS health route was checked separately. A single Tailscale login
cannot honestly represent two users because Tailscale Serve replaces the
configured identity header with the connected account.

Google Play delivery is the only incomplete store step in this record. The
signed AAB is ready, but non-interactive EAS Submit could not create a Play
submission without a Google service-account JSON key.

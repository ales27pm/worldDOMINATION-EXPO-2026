# Android Emulator R3F Qualification

## Accepted Same-Source Release Pair

The current accepted Android record was captured on 2026-07-31 from exact
source `391b4949ec67330cd6e390681a1be34de7bdffeb` on an Android 15
`sdk_gphone64_x86_64` emulator using host GPU acceleration. It is paired with
the physical-iOS record from the same source and canonical classic-board
fixture.

- Camera: 76 samples over 1,266.644 ms, 60.001 average FPS, 16.834 ms p95,
  zero estimated drops, and 1.000 within budget.
- Battle: 124 samples over 2,066 ms, 60.019 average FPS, 17 ms p95/p99/max,
  zero estimated drops, and 1.000 within budget.
- Scene fingerprint: `13236:383488f9`, identical to physical iOS.
- Release contract version 2: `pass`, with no failures.

Files for this accepted record:

- `release-pair-391b494.json`: SHA-256
  `c70075f733187c2ba1d033257bc127feafe621037468b7ecb65943fcaca531a6`
- `release-pair-391b494-full-board.png`: SHA-256
  `459eca59aff7e0f0a79906072239aa8c02d9135d9bd5c298078c7f0bec6e018c`
- `../release-pair-391b494.json`: canonical pair decision, SHA-256
  `35a923ac8eea9c72458fbe82b806668999b814025709e7d1f6180460d2a413d3`

The renderer-level status inside the Android record remains `ineligible`
because it is an emulator capture. Its `metricStatus` is `pass`, and release
contract version 2 deliberately accepts that Android result when paired with
matching passing physical-iOS evidence.

Captured on 2026-07-31 from exact source
`efcbb0ad90aa28f8d4a4a0c31887495db7e65f47`.

## Runtime

- Android 15 x86_64 `sdk_gphone64_x86_64` AVD
- Host GPU acceleration on an NVIDIA GeForce RTX 2070
- App `1.0.0`, native build `1`
- Classic board fixture, 42 territories, R3F renderer
- Qualification environment `simulator`

The local x86_64 release APK completed 529 Gradle tasks. It was
52,434,238 bytes with SHA-256
`b474512c3921f5ccf182407479309b25c26f562c3bd2ce9530024f67fe930475`.
The APK used the generated local debug keystore and is qualification
evidence, not a store-distribution artifact.

## Interaction

The run used the explicit release qualification route, entered normal
gameplay, deployed on Argentina, exercised the full-board camera control,
selected Argentina through the native R3F raycaster, attacked Brazil,
rolled the battle, and dismissed the battle modal. The same legal attack
was repeated in-process before the final camera control sweep.

The first battle recorded one 126 ms first-use frame and failed the dropped
frame threshold. The warmed final record passes both metric profiles:

- Camera: 78 samples over 1,299.645 ms, 60.016 average FPS, 16.890 ms p95,
  16.932 ms max, zero estimated drops.
- Battle: 124 samples over 2,067 ms, 59.990 average FPS, 17 ms p95/p99/max,
  zero estimated drops.

The final renderer-level status remains `ineligible` because the runtime is
a simulator, while `metricStatus` is `pass`. Release contract version 2
accepts this Android result when paired with matching physical-iOS evidence.

## China parity smoke

The later exact source
`864d9cfecaa8704c3aac06ac2e4194e3c7c381e2` repairs the R3F-only China
regression: the 3D renderer no longer samples the obsolete split China area
from the board raster. It draws the canonical China mesh with the corrected
atlas fill and one outer contour, while the SVG renderer remains unchanged.

A forced all-ABI Android release rebuild completed 565 Gradle tasks and
produced a 114,503,487-byte APK with SHA-256
`3090417da7f5ffc1b3a421e92e189ef847b097adc100ef97f8347301e84fbeda`.
The installed Android 15 emulator build reports the same package, version,
native build, and target SDK as the qualification build. Its bundle contains
the full `864d9cf` revision and the corrected China material colors. The
native R3F full-board smoke run rendered the round table, camera controls,
pieces, labels, and a single continuous China region; the focused runtime log
contained no React Native, Expo GL, or Android fatal error.

This is source-parity and native-render evidence, not a replacement
performance capture. The accepted camera and battle metrics above remain tied
to `efcbb0a`; a future paired release record must still use one exact source
revision on Android and physical iOS.

## Files

- `cold-fail.json`: SHA-256
  `aba60732b3d16ac8114725b5dfe949f916edb652d68b1ae15aeb7379021ad5a7`
- `control-sweep-pass.json`: SHA-256
  `cadc1a2503f6fd0cd51079f2353b939c0c938e9a3365ec3e13ab681a644d0b49`
- `r3f-battle-ready.png`: SHA-256
  `f5f6455f9f38f0facb9ddf4fd62dbd7ead0d02a6085cdb99e0e08090fb5f0a92`
- `r3f-full-board-table.png`: SHA-256
  `9faa2cc739891f841583e21c4bbf54bcb1d9b4d163c6a4780c937aa172041de6`
- `r3f-china-parity-864d9cf.png`: SHA-256
  `845d216235a577b40b579712f9672dc39eb9377adc44643ef05bcea8c4839a57`

The historical records above explain how the emulator policy and China-parity
fix were established. They are superseded for the release decision by the
accepted same-source `391b494` pair at the top of this file. Physical Android
hardware is not required by the current renderer policy.

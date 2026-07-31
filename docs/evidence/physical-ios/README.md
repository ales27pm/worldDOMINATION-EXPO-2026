# Physical iOS R3F Qualification

## Accepted Same-Source Release Pair

The current accepted iOS record was captured on 2026-07-31 from exact source
`391b4949ec67330cd6e390681a1be34de7bdffeb` on a physical iPhone 16 Pro
(`iPhone17,1`) running iOS 26.6. It is paired with the Android emulator record
from the same source and canonical classic-board fixture.

- Camera: 77 samples over 1,283.578 ms, 59.989 average FPS, 16.773 ms p95,
  zero estimated drops, and 1.000 within budget.
- Battle: 124 samples over 2,067 ms, 59.990 average FPS, 17 ms p95/p99/max,
  zero estimated drops, and 1.000 within budget.
- Scene fingerprint: `13236:383488f9`, identical to Android.
- Release contract version 2: `pass`, with no failures.

Files for this accepted record:

- `release-pair-391b494.json`: SHA-256
  `76721454b9c155446cd0aa72dd4bc3ac1706092c1daef310b99bebae897ed890`
- `release-pair-391b494-full-board.png`: SHA-256
  `fefa13e682ad380dcce347786009dbdf254ded4db36ef275f82d6137130edf4c`
- `../release-pair-391b494.json`: canonical pair decision, SHA-256
  `35a923ac8eea9c72458fbe82b806668999b814025709e7d1f6180460d2a413d3`

This closes the physical-iOS half of Gate 4. The signed device app was built
through SSH/Xcode, installed on the connected iPhone, and exercised through
the complete camera, battle, turn-handoff, and full-board fixture.

These records were exported by build 15 of source revision
`0c136a5c57e5fd0d9bd68946fbf2244da29622ce` on a physical iPhone 16 Pro.
They are retained because the iOS side of the release-pair contract remains
physical-only.

- `cold-fail.json`: complete cold battle profile; failed the dropped-frame
  ratio threshold.
- `warm-pass.json`: warmed camera and battle profiles; passed.
- `control-sweep-pass.json`: final camera-control and battle profile; passed.
- `home.png`, `r3f-board.png`, `r3f-battle-result.png`, and
  `r3f-full-board-table.png`: sanitized visual evidence from the same device
  session.

The records below are retained as historical physical-device evidence. They
were not combined with another source revision. The accepted `391b494` pair
above now satisfies the same-source, same-fixture, provenance, recency, and
passing camera/battle requirements. Browser and iOS Simulator evidence remain
ineligible.

# Physical iOS R3F Qualification

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

The iOS record alone does not open Gate 4. Contract version 2 accepts either an
Android emulator or Android hardware for the other half, while retaining the
same-source, same-fixture, provenance, recency, and passing camera/battle
profile requirements. Browser and iOS Simulator evidence remain ineligible.

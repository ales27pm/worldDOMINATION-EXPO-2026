# Physical iOS R3F Qualification

These records were exported by build 15 of source revision
`0c136a5c57e5fd0d9bd68946fbf2244da29622ce` on a physical iPhone 16 Pro.
They are retained because physical performance cannot be regenerated from a
simulator or browser run.

- `cold-fail.json`: complete cold battle profile; failed the dropped-frame
  ratio threshold.
- `warm-pass.json`: warmed camera and battle profiles; passed.
- `control-sweep-pass.json`: final camera-control and battle profile; passed.
- `home.png`, `r3f-board.png`, `r3f-battle-result.png`, and
  `r3f-full-board-table.png`: sanitized visual evidence from the same device
  session.

The iOS record alone does not open Gate 4. The checked-in physical qualifier
still requires a passing same-source Android and iOS evidence pair.

import { equal } from "node:assert/strict";
import { test } from "node:test";

import { hasCompleteR3FEffectRenderEvidence } from "../../game/r3fEffectRenderEvidence";

test("shader evidence waits until every active overlay has rendered", () => {
  equal(
    hasCompleteR3FEffectRenderEvidence({
      conquestPulseMeshCount: 0,
      conquestPulseRenderedMeshCount: 0,
      orderRevealMeshCount: 0,
      orderRevealRenderedMeshCount: 0,
    }),
    false,
  );
  equal(
    hasCompleteR3FEffectRenderEvidence({
      conquestPulseMeshCount: 1,
      conquestPulseRenderedMeshCount: 0,
      orderRevealMeshCount: 1,
      orderRevealRenderedMeshCount: 1,
    }),
    false,
  );
  equal(
    hasCompleteR3FEffectRenderEvidence({
      conquestPulseMeshCount: 1,
      conquestPulseRenderedMeshCount: 1,
      orderRevealMeshCount: 1,
      orderRevealRenderedMeshCount: 1,
    }),
    true,
  );
  equal(
    hasCompleteR3FEffectRenderEvidence({
      conquestPulseMeshCount: 1,
      conquestPulseRenderedMeshCount: 1,
      orderRevealMeshCount: 0,
      orderRevealRenderedMeshCount: 0,
    }),
    true,
  );
});

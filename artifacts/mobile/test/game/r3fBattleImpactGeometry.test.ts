import { equal, ok } from "node:assert/strict";
import { test } from "node:test";

import {
  BATTLE_IMPACT_HEIGHT,
  BATTLE_IMPACT_INSTANCE_COUNT,
  BATTLE_IMPACT_RADIUS,
  battleImpactColor,
  battleImpactInstanceOffset,
  battleImpactInstanceOffsets,
} from "../../game/r3fBattleImpactGeometry";

function closeTo(actual: number, expected: number, epsilon = 0.000001): void {
  ok(
    Math.abs(actual - expected) <= epsilon,
    `${actual} was not within ${epsilon} of ${expected}`,
  );
}

test("battle impact offsets describe eight deterministic radial instances", () => {
  const offsets = battleImpactInstanceOffsets();

  equal(offsets.length, BATTLE_IMPACT_INSTANCE_COUNT);
  closeTo(offsets[0].x, BATTLE_IMPACT_RADIUS);
  closeTo(offsets[0].y, BATTLE_IMPACT_HEIGHT);
  closeTo(offsets[0].z, 0);
  closeTo(offsets[2].x, 0);
  closeTo(offsets[2].z, BATTLE_IMPACT_RADIUS);
  closeTo(offsets[4].x, -BATTLE_IMPACT_RADIUS);
  closeTo(offsets[4].z, 0);
  closeTo(offsets[6].x, 0);
  closeTo(offsets[6].z, -BATTLE_IMPACT_RADIUS);
});

test("battle impact offsets wrap invalid or out-of-range indexes safely", () => {
  const first = battleImpactInstanceOffset(0);
  const wrapped = battleImpactInstanceOffset(BATTLE_IMPACT_INSTANCE_COUNT);
  const negative = battleImpactInstanceOffset(-BATTLE_IMPACT_INSTANCE_COUNT);
  const invalidCount = battleImpactInstanceOffset(7, Number.NaN);

  closeTo(wrapped.x, first.x);
  closeTo(wrapped.y, first.y);
  closeTo(wrapped.z, first.z);
  closeTo(negative.x, first.x);
  closeTo(negative.y, first.y);
  closeTo(negative.z, first.z);
  closeTo(invalidCount.x, BATTLE_IMPACT_RADIUS);
  closeTo(invalidCount.y, BATTLE_IMPACT_HEIGHT);
  closeTo(invalidCount.z, 0);
});

test("battle impact color follows the canonical conquest result", () => {
  equal(battleImpactColor("#aa0000", "#0033aa", true), "#aa0000");
  equal(battleImpactColor("#aa0000", "#0033aa", false), "#0033aa");
});

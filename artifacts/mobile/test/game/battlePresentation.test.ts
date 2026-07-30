import { equal } from "node:assert/strict";
import { test } from "node:test";

import { battlePresentationSummary } from "../../game/battlePresentation";
import type { BattleReport } from "../../game/types";

function report(overrides: Partial<BattleReport> = {}): BattleReport {
  return {
    from: "alaska",
    to: "northwestTerritory",
    attacker: 0,
    defender: 1,
    attackerRolls: [6, 5, 4],
    defenderRolls: [3, 2],
    attackerLosses: 0,
    defenderLosses: 1,
    rounds: 1,
    conquered: true,
    attackerTier: "classicAttack",
    defenderTier: "classicDefend",
    attackerArmiesBefore: 5,
    defenderArmiesBefore: 1,
    ...overrides,
  };
}

test("battle presentation summary returns null for older reports without force counts", () => {
  const summary = battlePresentationSummary(
    report({ attackerArmiesBefore: undefined, defenderArmiesBefore: undefined }),
  );

  equal(summary, null);
});

test("battle presentation summary labels attacker pressure without changing battle outcome", () => {
  const summary = battlePresentationSummary(report());

  equal(summary?.attackerStart, 5);
  equal(summary?.defenderStart, 1);
  equal(summary?.attackerRemaining, 5);
  equal(summary?.defenderRemaining, 0);
  equal(summary?.attackerPressurePct, 79);
  equal(summary?.defenderPressurePct, 21);
  equal(summary?.outlook, "attacker");
  equal(summary?.outlookLabel, "Attacker edge");
});

test("battle presentation summary detects defender and even-field outlooks", () => {
  const defenderEdge = battlePresentationSummary(
    report({
      attackerTier: "white",
      defenderTier: "black",
      attackerArmiesBefore: 4,
      defenderArmiesBefore: 9,
      attackerLosses: 2,
      defenderLosses: 1,
    }),
  );

  equal(defenderEdge?.attackerPressurePct, 22);
  equal(defenderEdge?.outlook, "defender");
  equal(defenderEdge?.outlookLabel, "Defender edge");
  equal(defenderEdge?.attackerRemaining, 2);
  equal(defenderEdge?.defenderRemaining, 8);

  const evenField = battlePresentationSummary(
    report({
      attackerArmiesBefore: 5,
      defenderArmiesBefore: 4,
      attackerLosses: 1,
      defenderLosses: 1,
    }),
  );

  equal(evenField?.attackerPressurePct, 48);
  equal(evenField?.outlook, "even");
  equal(evenField?.outlookLabel, "Even field");
});

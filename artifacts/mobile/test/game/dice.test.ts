import { deepEqual, equal } from "node:assert/strict";
import { test } from "node:test";

import { rankOf, tieredCasualtyCount, tierForAttacker, tierForDefender } from "../../game/dice";
import type { DiceTier } from "../../game/types";

test("attacker army thresholds match restored Same Time dice tiers", () => {
  const cases: Array<[armies: number, expected: DiceTier]> = [
    [1, "white"],
    [3, "white"],
    [4, "yellow"],
    [7, "yellow"],
    [8, "orange"],
    [12, "orange"],
    [13, "red"],
    [18, "red"],
    [19, "black"],
    [30, "black"],
  ];

  for (const [armies, expected] of cases) {
    equal(tierForAttacker(armies), expected, `attacker armies ${armies}`);
  }
});

test("defender army thresholds match restored Same Time dice tiers", () => {
  const cases: Array<[armies: number, expected: DiceTier]> = [
    [1, "white"],
    [6, "white"],
    [7, "yellow"],
    [12, "yellow"],
    [13, "orange"],
    [20, "orange"],
    [21, "red"],
    [40, "red"],
  ];

  for (const [armies, expected] of cases) {
    equal(tierForDefender(armies), expected, `defender armies ${armies}`);
  }
});

test("tier ranks increase in manual dice order", () => {
  deepEqual(
    (["white", "yellow", "orange", "red", "black"] as DiceTier[]).map((tier) => rankOf(tier)),
    [1, 2, 3, 4, 5],
  );
});

test("Same Time casualties scale with the lower dice tier rank", () => {
  const cases: Array<[attackerArmies: number, defenderArmies: number, expectedLosses: number]> = [
    [3, 6, 1],
    [4, 6, 1],
    [8, 7, 2],
    [13, 13, 3],
    [19, 21, 4],
  ];

  for (const [attackerArmies, defenderArmies, expectedLosses] of cases) {
    const attackerTier = tierForAttacker(attackerArmies);
    const defenderTier = tierForDefender(defenderArmies);

    equal(
      tieredCasualtyCount(attackerTier, defenderTier),
      expectedLosses,
      `${attackerArmies} attackers (${attackerTier}) vs ${defenderArmies} defenders (${defenderTier})`,
    );
  }
});

import { deepEqual, equal, ok } from "node:assert/strict";
import { test } from "node:test";

import { resolveSameTimeRound } from "../../game/sameTime";
import {
  attackOrder,
  HIGH_RANDOM,
  LOW_RANDOM,
  makeTerritories,
  randomSequence,
  repeatRandom,
} from "../helpers/gameState";

test("border clashes subtract original commitments and return survivors home", () => {
  const result = resolveSameTimeRound(
    makeTerritories({
      alaska: { owner: 0, armies: 6 },
      northwestTerritory: { owner: 1, armies: 6 },
    }),
    [
      attackOrder("a", 0, "alaska", "northwestTerritory", 3),
      attackOrder("b", 1, "northwestTerritory", "alaska", 3),
    ],
    { random: randomSequence(repeatRandom([HIGH_RANDOM, LOW_RANDOM], 3)) },
  );

  const report = result.reports[0];

  ok(report);
  equal(result.reports.length, 1);
  equal(report.conquered, false);
  equal(report.rounds, 3);
  equal(report.attackerLosses, 0);
  equal(report.defenderLosses, 3);
  equal(result.territories.alaska.owner, 0);
  equal(result.territories.alaska.armies, 6);
  equal(result.territories.northwestTerritory.owner, 1);
  equal(result.territories.northwestTerritory.armies, 3);
  deepEqual([...result.conquerors], []);
});

test("border-clash ties are bounded and do not remove armies", () => {
  const result = resolveSameTimeRound(
    makeTerritories({
      alaska: { owner: 0, armies: 250 },
      northwestTerritory: { owner: 1, armies: 250 },
    }),
    [
      attackOrder("a", 0, "alaska", "northwestTerritory", 200),
      attackOrder("b", 1, "northwestTerritory", "alaska", 200),
    ],
    { random: randomSequence([0.5]) },
  );

  const report = result.reports[0];

  ok(report);
  equal(report.rounds, 200);
  equal(report.attackerLosses, 0);
  equal(report.defenderLosses, 0);
  equal(result.territories.alaska.armies, 250);
  equal(result.territories.northwestTerritory.armies, 250);
});

test("defended battle ties favor the defender and keep the target unconquered", () => {
  const result = resolveSameTimeRound(
    makeTerritories({
      alaska: { owner: 0, armies: 4 },
      northwestTerritory: { owner: 1, armies: 1 },
    }),
    [attackOrder("tie-attack", 0, "alaska", "northwestTerritory", 3)],
    { random: randomSequence([0.5]) },
  );

  const report = result.reports[0];

  ok(report);
  equal(report.rounds, 3);
  equal(report.conquered, false);
  equal(report.attackerLosses, 3);
  equal(report.defenderLosses, 0);
  equal(result.territories.alaska.owner, 0);
  equal(result.territories.alaska.armies, 1);
  equal(result.territories.northwestTerritory.owner, 1);
  equal(result.territories.northwestTerritory.armies, 1);
  deepEqual([...result.conquerors], []);
});

test("third-party invasions see origins after committed armies leave", () => {
  const result = resolveSameTimeRound(
    makeTerritories({
      alaska: { owner: 0, armies: 10 },
      northwestTerritory: { owner: 1, armies: 5 },
      greenland: { owner: 2, armies: 4 },
    }),
    [
      attackOrder("main", 0, "alaska", "northwestTerritory", 9),
      attackOrder("third", 2, "greenland", "alaska", 3),
    ],
    { random: randomSequence(repeatRandom([HIGH_RANDOM, LOW_RANDOM], 6)) },
  );

  equal(result.territories.northwestTerritory.owner, 0);
  equal(result.territories.northwestTerritory.armies, 9);
  equal(result.territories.alaska.owner, 2);
  equal(result.territories.alaska.armies, 3);
  equal(result.territories.greenland.owner, 2);
  equal(result.territories.greenland.armies, 1);
  deepEqual([...result.conquerors].sort(), [0, 2]);
});

test("mass invasions resolve later columns as spoils against the fresh conqueror", () => {
  const result = resolveSameTimeRound(
    makeTerritories({
      alaska: { owner: 0, armies: 6 },
      greenland: { owner: 2, armies: 5 },
      northwestTerritory: { owner: 1, armies: 1 },
    }),
    [
      attackOrder("first", 0, "alaska", "northwestTerritory", 5),
      attackOrder("second", 2, "greenland", "northwestTerritory", 4),
    ],
    { random: randomSequence([HIGH_RANDOM, HIGH_RANDOM, LOW_RANDOM, ...repeatRandom([LOW_RANDOM, HIGH_RANDOM], 4)]) },
  );

  const firstReport = result.reports[0];
  const secondReport = result.reports[1];

  ok(firstReport);
  ok(secondReport);
  equal(firstReport.attacker, 0);
  equal(firstReport.defender, 1);
  equal(firstReport.conquered, true);
  equal(secondReport.attacker, 2);
  equal(secondReport.defender, 0);
  equal(secondReport.conquered, false);
  equal(result.territories.northwestTerritory.owner, 0);
  equal(result.territories.northwestTerritory.armies, 5);
  equal(result.territories.alaska.armies, 1);
  equal(result.territories.greenland.armies, 1);
  deepEqual([...result.conquerors], [0]);
});

test("declared surges leave one army behind and chain into the follow-on target", () => {
  const result = resolveSameTimeRound(
    makeTerritories({
      alaska: { owner: 0, armies: 7 },
      northwestTerritory: { owner: 1, armies: 1 },
      ontario: { owner: 1, armies: 1 },
    }),
    [attackOrder("surge", 0, "alaska", "northwestTerritory", 6, "ontario")],
    { random: randomSequence(repeatRandom([HIGH_RANDOM, LOW_RANDOM], 2)) },
  );

  equal(result.reports.length, 2);
  equal(result.reports[0]?.to, "northwestTerritory");
  equal(result.reports[0]?.conquered, true);
  equal(result.reports[1]?.to, "ontario");
  equal(result.reports[1]?.from, "northwestTerritory");
  equal(result.reports[1]?.conquered, true);
  equal(result.territories.alaska.armies, 1);
  equal(result.territories.northwestTerritory.owner, 0);
  equal(result.territories.northwestTerritory.armies, 1);
  equal(result.territories.ontario.owner, 0);
  equal(result.territories.ontario.armies, 5);
  deepEqual([...result.conquerors], [0]);
});

test("declared surges stop after the follow-on target instead of cascading indefinitely", () => {
  const result = resolveSameTimeRound(
    makeTerritories({
      alaska: { owner: 0, armies: 9 },
      northwestTerritory: { owner: 1, armies: 1 },
      ontario: { owner: 1, armies: 1 },
      quebec: { owner: 1, armies: 1 },
    }),
    [attackOrder("bounded-surge", 0, "alaska", "northwestTerritory", 8, "ontario")],
    { random: randomSequence(repeatRandom([HIGH_RANDOM, LOW_RANDOM], 2)) },
  );

  equal(result.reports.length, 2);
  deepEqual(result.reports.map((report) => report.to), ["northwestTerritory", "ontario"]);
  equal(result.territories.alaska.armies, 1);
  equal(result.territories.northwestTerritory.owner, 0);
  equal(result.territories.northwestTerritory.armies, 1);
  equal(result.territories.ontario.owner, 0);
  equal(result.territories.ontario.armies, 7);
  equal(result.territories.quebec.owner, 1);
  equal(result.territories.quebec.armies, 1);
  deepEqual([...result.conquerors], [0]);
});

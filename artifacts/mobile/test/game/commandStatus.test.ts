import { equal, ok } from "node:assert/strict";
import { test } from "node:test";

import { buildCommandStatus } from "../../game/commandStatus";
import { attackOrder, createClassicState, createSameTimeState, riskCard } from "../helpers/gameState";

test("classic attack status exposes targets and selected dice", () => {
  const state = createClassicState();
  state.phase = "attack";
  state.currentPlayer = 0;

  const status = buildCommandStatus({
    game: state,
    playerId: 0,
    selected: "alaska",
    targetsCount: 2,
    stagedMove: null,
    diceCount: 3,
  });

  equal(status?.headline, "Enemy borders exposed");
  equal(status?.tone, "danger");
  equal(status?.chips.find((chip) => chip.label === "Targets")?.value, "2");
  equal(status?.chips.find((chip) => chip.label === "Dice")?.value, "3");
});

test("Same Time reinforcement status reports card-trade blockers", () => {
  const state = createSameTimeState();
  state.players[0].cards = [
    riskCard("c1", "infantry"),
    riskCard("c2", "cavalry"),
    riskCard("c3", "artillery"),
    riskCard("c4", "infantry"),
    riskCard("c5", "wild"),
  ];
  state.sameTime!.reinforcementsRemaining = [4, 0];

  const status = buildCommandStatus({
    game: state,
    playerId: 0,
    selected: null,
    targetsCount: 0,
    stagedMove: null,
    diceCount: 1,
  });

  equal(status?.tone, "blocked");
  ok(status?.headline.includes("Card trade blocks"));
  equal(status?.chips.find((chip) => chip.label === "Cards")?.value, "5");
});

test("Same Time battle status reports queued and committed attack orders", () => {
  const state = createSameTimeState(3);
  state.phase = "sameTimeBattle";
  state.sameTime!.orders = [
    attackOrder("o1", 0, "alaska", "northwestTerritory", 3),
    attackOrder("o2", 0, "alberta", "ontario", 2),
    attackOrder("o3", 1, "greenland", "quebec", 1),
  ];
  state.sameTime!.readyBattle = [false, true, false];

  const status = buildCommandStatus({
    game: state,
    playerId: 0,
    selected: null,
    targetsCount: 0,
    stagedMove: null,
    diceCount: 1,
  });

  equal(status?.headline, "Attack orders queued; seal when satisfied");
  equal(status?.tone, "danger");
  equal(status?.chips.find((chip) => chip.label === "Queued")?.value, "2");
  equal(status?.chips.find((chip) => chip.label === "Committed")?.value, "5");
  equal(status?.chips.find((chip) => chip.label === "Ready")?.value, "1/3");
});

test("Same Time sealed orders report waiting commanders", () => {
  const state = createSameTimeState(3);
  state.phase = "sameTimeMove";
  state.sameTime!.readyMove = [true, false, true];

  const status = buildCommandStatus({
    game: state,
    playerId: 0,
    selected: null,
    targetsCount: 0,
    stagedMove: null,
    diceCount: 1,
  });

  equal(status?.tone, "sealed");
  ok(status?.headline.includes("waiting for 1 commander"));
  equal(status?.chips.find((chip) => chip.label === "Ready")?.value, "2/3");
});

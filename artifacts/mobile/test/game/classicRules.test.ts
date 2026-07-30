import { deepEqual, equal, notEqual, ok } from "node:assert/strict";
import { test } from "node:test";

import { gameReducer, reinforcementsFor } from "../../game/engine";
import {
  assignAll,
  assignOwners,
  createClassicState,
  HIGH_RANDOM,
  LOW_RANDOM,
  riskCard,
  setTerritories,
  withMockedRandom,
} from "../helpers/gameState";

test("random allocation deals every standard territory and preserves starting army totals", () => {
  const state = createClassicState(3);

  equal(state.phase, "reinforcement");
  equal(state.activeIds.length, 42);

  for (const player of state.players) {
    const owned = state.activeIds.filter((id) => state.territories[id].owner === player.id);
    const troops = owned.reduce((sum, id) => sum + state.territories[id].armies, 0);

    equal(owned.length, 14, `${player.name} territory count`);
    equal(troops, 35, `${player.name} starting troops`);
  }
});

test("territory grab claims each territory at most once", () => {
  const state = createClassicState(2, "grab");

  equal(state.phase, "territoryGrab");
  ok(state.activeIds.every((id) => state.territories[id].owner === -1));

  const firstClaim = gameReducer(state, { type: "CLAIM_TERRITORY", territory: "alaska" });
  equal(firstClaim.territories.alaska.owner, 0);
  equal(firstClaim.currentPlayer, 1);

  const duplicateClaim = gameReducer(firstClaim, { type: "CLAIM_TERRITORY", territory: "alaska" });
  equal(duplicateClaim, firstClaim);

  const secondClaim = gameReducer(firstClaim, { type: "CLAIM_TERRITORY", territory: "northwestTerritory" });
  equal(secondClaim.territories.northwestTerritory.owner, 1);
});

test("classic reinforcements use the minimum, territory count, and continent bonuses", () => {
  const state = createClassicState(2);

  assignAll(state, 1);
  setTerritories(state, { alaska: { owner: 0, armies: 1 } });
  equal(reinforcementsFor(state, 0), 3);

  assignAll(state, 1);
  setTerritories(state, {
    alaska: { owner: 0, armies: 1 },
    northwestTerritory: { owner: 0, armies: 1 },
    alberta: { owner: 0, armies: 1 },
    ontario: { owner: 0, armies: 1 },
    quebec: { owner: 0, armies: 1 },
    indonesia: { owner: 0, armies: 1 },
    newGuinea: { owner: 0, armies: 1 },
    westernAustralia: { owner: 0, armies: 1 },
    easternAustralia: { owner: 0, armies: 1 },
  });
  equal(reinforcementsFor(state, 0), 5);
});

test("classic battle conquest transfers ownership and enforces occupy bounds", () => {
  const state = createClassicState(2);
  state.phase = "attack";
  state.currentPlayer = 0;
  setTerritories(state, {
    alaska: { owner: 0, armies: 5 },
    northwestTerritory: { owner: 1, armies: 1 },
  });

  const conquered = withMockedRandom([HIGH_RANDOM, HIGH_RANDOM, HIGH_RANDOM, LOW_RANDOM], () =>
    gameReducer(state, { type: "ATTACK", from: "alaska", to: "northwestTerritory", dice: 3 }),
  );

  notEqual(conquered, state);
  equal(conquered.territories.northwestTerritory.owner, 0);
  equal(conquered.territories.northwestTerritory.armies, 0);
  equal(conquered.pendingOccupy?.min, 3);
  equal(conquered.pendingOccupy?.max, 4);
  equal(conquered.players[0].conqueredThisTurn, true);

  const occupied = gameReducer(conquered, { type: "OCCUPY", count: 99 });
  equal(occupied.pendingOccupy, null);
  equal(occupied.territories.alaska.armies, 1);
  equal(occupied.territories.northwestTerritory.armies, 4);
});

test("classic mandatory trade blocks deployment and only clears below five cards", () => {
  const state = createClassicState(2);
  state.phase = "reinforcement";
  state.currentPlayer = 0;
  state.reinforcementsRemaining = 3;
  state.mustTrade = true;
  setTerritories(state, { alaska: { owner: 0, armies: 1 } });
  state.players[0].cards = [
    riskCard("i1", "infantry", "alaska"),
    riskCard("i2", "infantry"),
    riskCard("i3", "infantry"),
    riskCard("c1", "cavalry"),
    riskCard("a1", "artillery"),
  ];

  equal(gameReducer(state, { type: "DEPLOY", territory: "alaska", count: 1 }), state);

  const tradedBelowFive = gameReducer(state, { type: "TRADE_CARDS", cardIds: ["i1", "i2", "i3"] });
  equal(tradedBelowFive.mustTrade, false);
  equal(tradedBelowFive.reinforcementsRemaining, 7);
  equal(tradedBelowFive.territories.alaska.armies, 3);
  deepEqual(tradedBelowFive.players[0].cards.map((c) => c.id), ["c1", "a1"]);

  const stillMandatory = createClassicState(2);
  stillMandatory.phase = "reinforcement";
  stillMandatory.currentPlayer = 0;
  stillMandatory.reinforcementsRemaining = 3;
  stillMandatory.mustTrade = true;
  stillMandatory.players[0].cards = [
    riskCard("s1", "infantry"),
    riskCard("s2", "infantry"),
    riskCard("s3", "infantry"),
    riskCard("keep1", "cavalry"),
    riskCard("keep2", "cavalry"),
    riskCard("keep3", "artillery"),
    riskCard("keep4", "artillery"),
    riskCard("keep5", "wild"),
  ];

  const tradedToFive = gameReducer(stillMandatory, { type: "TRADE_CARDS", cardIds: ["s1", "s2", "s3"] });
  equal(tradedToFive.players[0].cards.length, 5);
  equal(tradedToFive.mustTrade, true);
});

test("classic objective checks declare domination and mission victories on turn advance", () => {
  const domination = createClassicState(3, "random", "domination60");
  assignOwners(domination, 1, domination.activeIds.slice(0, 25));
  assignOwners(domination, 0, domination.activeIds.slice(25, 34));
  assignOwners(domination, 2, domination.activeIds.slice(34));
  domination.currentPlayer = 0;
  domination.phase = "fortify";

  const afterDomination = gameReducer(domination, { type: "END_TURN" });
  equal(afterDomination.phase, "gameOver");
  equal(afterDomination.winner, 1);
  equal(afterDomination.winReason, "60% Domination — 25 of 42 territories held");

  const mission = createClassicState(3, "random", "mission");
  assignOwners(mission, 1, mission.activeIds.slice(0, 3));
  assignOwners(mission, 0, mission.activeIds.slice(3, 10));
  assignOwners(mission, 2, mission.activeIds.slice(10));
  mission.players[1].mission = { kind: "occupyTerritoryCount", count: 3 };
  mission.currentPlayer = 0;
  mission.phase = "attack";

  const afterMission = gameReducer(mission, { type: "END_TURN" });
  equal(afterMission.phase, "gameOver");
  equal(afterMission.winner, 1);
  equal(afterMission.winReason, "their secret mission");
});

test("classic capital victory requires holding your capital and the required enemy capitals", () => {
  const state = createClassicState(3, "random", "capital");
  assignAll(state, 2);
  assignOwners(state, 1, ["alaska", "alberta", "ontario"]);
  assignOwners(state, 0, ["quebec"]);

  state.players[0].capital = "alberta";
  state.players[1].capital = "alaska";
  state.players[2].capital = "ontario";
  state.capitalsRevealed = true;
  state.currentPlayer = 0;
  state.phase = "fortify";

  const afterTurn = gameReducer(state, { type: "END_TURN" });
  equal(afterTurn.phase, "gameOver");
  equal(afterTurn.winner, 1);
  equal(afterTurn.winReason, "Capital RISK — 2 enemy capitals seized while holding their own");
});

test("classic tactical move is one neighboring transfer per turn", () => {
  const state = createClassicState(2);
  state.phase = "fortify";
  state.currentPlayer = 0;
  assignAll(state, 1);
  setTerritories(state, {
    alaska: { owner: 0, armies: 5 },
    alberta: { owner: 0, armies: 1 },
    easternUS: { owner: 0, armies: 1 },
  });

  const rejectedNonNeighbor = gameReducer(state, { type: "FORTIFY", from: "alaska", to: "easternUS", count: 1 });
  equal(rejectedNonNeighbor, state);

  const moved = gameReducer(state, { type: "FORTIFY", from: "alaska", to: "alberta", count: 99 });
  notEqual(moved, state);
  equal(moved.territories.alaska.armies, 1);
  equal(moved.territories.alberta.armies, 5);
  equal(moved.fortifyUsed, true);

  const rejectedSecondMove = gameReducer(moved, { type: "FORTIFY", from: "alberta", to: "alaska", count: 1 });
  equal(rejectedSecondMove, moved);
});

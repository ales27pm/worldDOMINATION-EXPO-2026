import { deepEqual, equal, notEqual, ok } from "node:assert/strict";
import { test } from "node:test";

import { gameReducer } from "../../game/engine";
import { sameTimeReinforcementsFor } from "../../game/sameTime";
import type { GameState } from "../../game/types";
import { assignAll, createSameTimeState, riskCard, setTerritories, withMockedRandom } from "../helpers/gameState";

test("Same Time reinforcements use owned territories, largest empire, continent bonus, and minimum one", () => {
  const australia = createSameTimeState(2);
  assignAll(australia, 1);
  setTerritories(australia, {
    indonesia: { owner: 0, armies: 1 },
    newGuinea: { owner: 0, armies: 1 },
    westernAustralia: { owner: 0, armies: 1 },
    easternAustralia: { owner: 0, armies: 1 },
  });

  // floor((4 owned + 4 connected empire) / 3) + 4 Same Time Australia bonus.
  equal(sameTimeReinforcementsFor(australia, 0), 6);

  const foothold = createSameTimeState(2);
  assignAll(foothold, 1);
  setTerritories(foothold, { alaska: { owner: 0, armies: 1 } });

  equal(sameTimeReinforcementsFor(foothold, 0), 1);
});

test("Same Time reinforcement readiness advances each commander into battle planning", () => {
  const state = createSameTimeState(2);
  ok(state.sameTime);
  equal(state.phase, "sameTimeReinforce");
  state.sameTime.reinforcementsRemaining = [0, 0];

  const afterFirstReady = gameReducer(state, { type: "ST_READY_REINFORCE" });
  equal(afterFirstReady.phase, "sameTimeReinforce");
  equal(afterFirstReady.currentPlayer, 1);
  deepEqual(afterFirstReady.sameTime?.readyReinforce, [true, false]);

  const afterSecondReady = gameReducer(afterFirstReady, { type: "ST_READY_REINFORCE" });
  equal(afterSecondReady.phase, "sameTimeBattle");
  equal(afterSecondReady.currentPlayer, 0);
  deepEqual(afterSecondReady.sameTime?.readyBattle, [false, false]);
  deepEqual(afterSecondReady.sameTime?.orders, []);
});

test("mandatory card trading blocks Same Time deployment and readiness", () => {
  const state = createSameTimeState(2);
  ok(state.sameTime);
  state.currentPlayer = 0;
  state.players[0].cards = [
    riskCard("i1", "infantry"),
    riskCard("i2", "infantry"),
    riskCard("i3", "infantry"),
    riskCard("c1", "cavalry"),
    riskCard("a1", "artillery"),
  ];
  state.sameTime.reinforcementsRemaining = [1, 0];
  setTerritories(state, { alaska: { owner: 0, armies: 1 } });

  equal(gameReducer(state, { type: "DEPLOY", territory: "alaska", count: 1 }), state);

  state.sameTime.reinforcementsRemaining = [0, 0];
  equal(gameReducer(state, { type: "ST_READY_REINFORCE" }), state);
});

test("restricted Same Time reinforcements cap per-territory placement and undo restores the cap", () => {
  const state = createSameTimeState(2);
  ok(state.sameTime);
  state.setup.restrictedReinforcement = true;
  state.currentPlayer = 0;
  state.sameTime.reinforcementsRemaining = [5, 0];
  state.sameTime.deployLog = [[], []];
  setTerritories(state, {
    alaska: { owner: 0, armies: 1 },
    northwestTerritory: { owner: 0, armies: 1 },
    alberta: { owner: 1, armies: 1 },
    kamchatka: { owner: 1, armies: 1 },
  });

  const capped = gameReducer(state, { type: "DEPLOY", territory: "alaska", count: 5 });
  notEqual(capped, state);
  equal(capped.territories.alaska.armies, 3);
  equal(capped.sameTime?.reinforcementsRemaining[0], 3);
  deepEqual(capped.sameTime?.deployLog[0], [{ territory: "alaska", count: 2 }]);

  const rejectedAtCap = gameReducer(capped, { type: "DEPLOY", territory: "alaska", count: 1 });
  equal(rejectedAtCap, capped);

  const undone = gameReducer(capped, { type: "UNDO_DEPLOY" });
  equal(undone.territories.alaska.armies, 1);
  equal(undone.sameTime?.reinforcementsRemaining[0], 5);
  deepEqual(undone.sameTime?.deployLog[0], []);
});

test("Same Time attack orders clamp by available armies and can be canceled before sealing", () => {
  const state = createSameTimeState(2);
  ok(state.sameTime);
  state.phase = "sameTimeBattle";
  state.currentPlayer = 0;
  state.sameTime.readyBattle = [false, false];
  setTerritories(state, {
    alaska: { owner: 0, armies: 5 },
    northwestTerritory: { owner: 1, armies: 3 },
  });

  const queued = gameReducer(state, {
    type: "ST_QUEUE_ATTACK",
    from: "alaska",
    to: "northwestTerritory",
    count: 99,
    surgeTo: null,
  });
  const order = queued.sameTime?.orders[0];

  notEqual(queued, state);
  ok(order);
  equal(order.count, 4);
  equal(order.player, 0);

  const canceled = gameReducer(queued, { type: "ST_CANCEL_ATTACK", orderId: order.id });
  deepEqual(canceled.sameTime?.orders, []);
});

test("Same Time battle readiness without orders advances directly to tactical moves", () => {
  const state = createSameTimeState(2);
  ok(state.sameTime);
  state.phase = "sameTimeBattle";
  state.currentPlayer = 0;
  state.sameTime.readyBattle = [false, false];
  state.sameTime.orders = [];

  const afterFirstReady = gameReducer(state, { type: "ST_READY_BATTLE" });
  equal(afterFirstReady.phase, "sameTimeBattle");
  equal(afterFirstReady.currentPlayer, 1);

  const afterSecondReady = gameReducer(afterFirstReady, { type: "ST_READY_BATTLE" });
  equal(afterSecondReady.phase, "sameTimeMove");
  deepEqual(afterSecondReady.sameTime?.playback, []);
  deepEqual(afterSecondReady.sameTime?.readyMove, [false, false]);
});

test("Same Time attack orders resolve only after every active commander seals", () => {
  const state = createSameTimeState(2);
  ok(state.sameTime);
  state.phase = "sameTimeBattle";
  state.currentPlayer = 0;
  state.sameTime.readyBattle = [false, false];
  setTerritories(state, {
    alaska: { owner: 0, armies: 5 },
    northwestTerritory: { owner: 1, armies: 1 },
  });

  const queued = gameReducer(state, {
    type: "ST_QUEUE_ATTACK",
    from: "alaska",
    to: "northwestTerritory",
    count: 4,
    surgeTo: null,
  });
  equal(queued.sameTime?.orders.length, 1);

  const afterFirstSeal = gameReducer(queued, { type: "ST_READY_BATTLE" });
  equal(afterFirstSeal.phase, "sameTimeBattle");
  equal(afterFirstSeal.currentPlayer, 1);
  deepEqual(afterFirstSeal.sameTime?.readyBattle, [true, false]);
  equal(afterFirstSeal.sameTime?.orders.length, 1);
  equal(afterFirstSeal.territories.alaska.armies, 5);
  equal(afterFirstSeal.territories.northwestTerritory.owner, 1);

  const resolved = withMockedRandom([0.99, 0], () => gameReducer(afterFirstSeal, { type: "ST_READY_BATTLE" }));
  equal(resolved.phase, "sameTimeBattle");
  equal(resolved.territories.alaska.armies, 1);
  equal(resolved.territories.northwestTerritory.owner, 0);
  equal(resolved.sameTime?.orders.length, 0);
  equal(resolved.sameTime?.playback.length, 1);
});

test("Same Time battle playback gates tactical movement until acknowledged", () => {
  const state = createSameTimeState(2);
  ok(state.sameTime);
  state.phase = "sameTimeBattle";
  state.currentPlayer = 1;
  state.sameTime.readyBattle = [true, false];
  state.sameTime.orders = [
    { id: "p0-takes-nw", player: 0, from: "alaska", to: "northwestTerritory", count: 4, surgeTo: null },
  ];
  setTerritories(state, {
    alaska: { owner: 0, armies: 5 },
    northwestTerritory: { owner: 1, armies: 1 },
  });

  const withPlayback = withMockedRandom([0.99, 0], () => gameReducer(state, { type: "ST_READY_BATTLE" }));

  equal(withPlayback.phase, "sameTimeBattle");
  equal(withPlayback.territories.northwestTerritory.owner, 0);
  equal(withPlayback.sameTime?.playback.length, 1);

  const rejectedMoveDuringPlayback = gameReducer(withPlayback, {
    type: "ST_QUEUE_MOVE",
    from: "northwestTerritory",
    to: "alaska",
    count: 1,
  });
  equal(rejectedMoveDuringPlayback, withPlayback);

  const movementOpen = gameReducer(withPlayback, { type: "ST_ACK_PLAYBACK" });
  equal(movementOpen.phase, "sameTimeMove");
  deepEqual(movementOpen.sameTime?.playback, []);
  deepEqual(movementOpen.sameTime?.readyMove, [false, false]);
});

test("Same Time tactical moves apply after all commanders ready, then open the next round", () => {
  const state = createSameTimeState(2);
  ok(state.sameTime);
  state.phase = "sameTimeMove";
  state.currentPlayer = 0;
  state.turn = 1;
  state.sameTime.readyMove = [false, true];
  state.sameTime.moves = [];
  state.players[0].conqueredThisTurn = true;
  state.deck = [riskCard("reward", "infantry", "alaska")];
  state.alliances = [{ a: 0, b: 1, level: 1, expiresAfterPlayerId: 1, expiresAfterRound: 1 }];
  setTerritories(state, {
    alaska: { owner: 0, armies: 5 },
    northwestTerritory: { owner: 0, armies: 1 },
  });

  const queued = gameReducer(state, {
    type: "ST_QUEUE_MOVE",
    from: "alaska",
    to: "northwestTerritory",
    count: 99,
  });
  equal(queued.sameTime?.moves[0]?.count, 4);

  const nextRound = gameReducer(queued, { type: "ST_READY_MOVE" });
  equal(nextRound.phase, "sameTimeReinforce");
  equal(nextRound.turn, 2);
  equal(nextRound.territories.alaska.armies, 1);
  equal(nextRound.territories.northwestTerritory.armies, 5);
  equal(nextRound.players[0].cards.length, 1);
  equal(nextRound.players[0].conqueredThisTurn, false);
  deepEqual(nextRound.alliances, []);
});

test("Same Time alliances lapse when the simultaneous round ends", () => {
  const state = createSameTimeState(3);
  ok(state.sameTime);
  state.phase = "sameTimeMove";
  state.currentPlayer = 2;
  state.turn = 4;
  state.sameTime.readyMove = [true, true, false];
  state.sameTime.moves = [];
  state.alliances = [
    { a: 0, b: 1, level: 1, expiresAfterPlayerId: 1, expiresAfterRound: 99 },
    { a: 1, b: 2, level: 2, expiresAfterPlayerId: 2, expiresAfterRound: 99 },
  ];

  const nextRound = gameReducer(state, { type: "ST_READY_MOVE" });

  equal(nextRound.phase, "sameTimeReinforce");
  equal(nextRound.turn, 5);
  deepEqual(nextRound.alliances, []);
  equal(nextRound.log.filter((entry) => entry.text.includes("has lapsed")).length, 2);
  ok(nextRound.log.some((entry) => entry.text.includes("P1 and P2")));
  ok(nextRound.log.some((entry) => entry.text.includes("P2 and P3")));
});

test("Same Time simultaneous eliminations pass cards to a surviving final recipient", () => {
  const state = createSameTimeState(3);
  ok(state.sameTime);
  state.phase = "sameTimeBattle";
  state.currentPlayer = 2;
  state.sameTime.readyBattle = [true, true, false];
  state.sameTime.orders = [
    { id: "p1-kills-p2", player: 1, from: "northwestTerritory", to: "greenland", count: 2, surgeTo: null },
    { id: "p0-surges-p1", player: 0, from: "alaska", to: "northwestTerritory", count: 9, surgeTo: "greenland" },
  ];
  state.players[1].cards = [riskCard("p1-card", "infantry")];
  state.players[2].cards = [riskCard("p2-card", "cavalry")];
  state.territories = {
    ...Object.fromEntries(state.activeIds.map((id) => [id, { owner: 0, armies: 1 }])),
    alaska: { owner: 0, armies: 10 },
    northwestTerritory: { owner: 1, armies: 3 },
    greenland: { owner: 2, armies: 1 },
  } as GameState["territories"];

  const resolved = withMockedRandom(
    [0.99, 0, 0.99, 0, 0.99, 0, 0.99, 0],
    () => gameReducer(state, { type: "ST_READY_BATTLE" }),
  );

  equal(resolved.phase, "sameTimeBattle");
  equal(resolved.territories.greenland.owner, 0);
  equal(resolved.players[1].alive, false);
  equal(resolved.players[1].killedBy, 0);
  deepEqual(resolved.players[1].cards, []);
  equal(resolved.players[2].alive, false);
  equal(resolved.players[2].killedBy, 1);
  deepEqual(resolved.players[2].cards, []);
  deepEqual(
    resolved.players[0].cards.map((ownedCard) => ownedCard.id).sort(),
    ["p1-card", "p2-card"],
  );
});

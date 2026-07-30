import { equal } from "node:assert/strict";
import { test } from "node:test";

import { createGame, gameReducer } from "../../game/engine";
import { continentTerritories } from "../../game/mapData";
import { missionAchieved } from "../../game/missions";
import type { GameSetup, GameState, Mission, PlayerSetup, TerritoryId } from "../../game/types";

function players(count: number): PlayerSetup[] {
  return Array.from({ length: count }, (_, index) => ({
    name: `P${index + 1}`,
    colorIdx: index,
    isHuman: index === 0,
    generalId: null,
  }));
}

function withMockedRandom<T>(value: number, run: () => T): T {
  const originalRandom = Math.random;
  Math.random = () => value;
  try {
    return run();
  } finally {
    Math.random = originalRandom;
  }
}

function createMissionState(turnStyle: GameSetup["turnStyle"] = "classic"): GameState {
  return withMockedRandom(0, () =>
    createGame({
      players: players(3),
      objective: "mission",
      useExtraTerritories: false,
      allocation: "random",
      cardRule: "ascending",
      turnStyle,
      restrictedReinforcement: false,
    }),
  );
}

function assignOwners(state: GameState, owner: number, ids: TerritoryId[]): void {
  state.territories = {
    ...state.territories,
    ...Object.fromEntries(ids.map((id) => [id, { owner, armies: 1 }])),
  };
}

test("destroy-player missions require the named kill or the fallback territory count", () => {
  const mission: Mission = { kind: "destroyPlayer", targetPlayerId: 1, fallbackCount: 24 };
  const state = createMissionState();

  state.players[0].mission = mission;
  state.players[1].alive = false;
  state.players[1].killedBy = 0;
  equal(missionAchieved(mission, state, 0), true);

  state.players[1].killedBy = 2;
  assignOwners(state, 0, state.activeIds.slice(0, 23));
  assignOwners(state, 2, state.activeIds.slice(23));
  equal(missionAchieved(mission, state, 0), false);

  assignOwners(state, 0, state.activeIds.slice(0, 24));
  equal(missionAchieved(mission, state, 0), true);
});

test("Same Time mission victory is gated until round three", () => {
  const state = createMissionState("sameTime");

  state.turn = 2;
  state.phase = "sameTimeMove";
  state.currentPlayer = 0;
  state.players[0].mission = { kind: "occupyTerritoryCount", count: 1 };
  state.players[1].mission = { kind: "occupyTerritoryCount", count: 999 };
  state.players[2].mission = { kind: "occupyTerritoryCount", count: 999 };
  state.sameTime = {
    reinforcementsRemaining: [0, 0, 0],
    deployLog: [[], [], []],
    readyReinforce: [true, true, true],
    orders: [],
    readyBattle: [true, true, true],
    playback: [],
    moves: [],
    readyMove: [false, true, true],
  };

  const beforeGate = gameReducer(state, { type: "ST_READY_MOVE" });
  equal(beforeGate.phase, "sameTimeReinforce");
  equal(beforeGate.turn, 3);
  equal(beforeGate.winner, null);

  beforeGate.phase = "sameTimeMove";
  beforeGate.currentPlayer = 0;
  beforeGate.sameTime = {
    ...beforeGate.sameTime!,
    moves: [],
    readyMove: [false, true, true],
  };

  const afterGate = gameReducer(beforeGate, { type: "ST_READY_MOVE" });
  equal(afterGate.phase, "gameOver");
  equal(afterGate.winner, 0);
  equal(afterGate.winReason, "their secret mission");
});

test("Same Time continent-plus-presence missions require the held continent and every other continent", () => {
  const mission: Mission = { kind: "continentPlusPresence", continent: "asia" };
  const state = createMissionState("sameTime");
  const groups = continentTerritories(false);

  assignOwners(state, 1, state.activeIds);
  assignOwners(state, 0, groups.asia);
  assignOwners(state, 0, [
    groups.northAmerica[0],
    groups.southAmerica[0],
    groups.europe[0],
    groups.africa[0],
    groups.australia[0],
  ] as TerritoryId[]);

  equal(missionAchieved(mission, state, 0), true);

  assignOwners(state, 1, [groups.australia[0]] as TerritoryId[]);
  equal(missionAchieved(mission, state, 0), false);
});

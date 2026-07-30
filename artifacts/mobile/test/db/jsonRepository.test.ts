import { deepEqual, equal, ok } from "node:assert/strict";
import { test } from "node:test";

import { createJsonRepository, type JsonStorage } from "../../db/jsonRepository";
import { SEED_HIGH_SCORES } from "../../db/types";
import { createGame } from "../../game/engine";
import type { GameSetup, GameState, PlayerSetup } from "../../game/types";

function makeStorage(): JsonStorage {
  const values = new Map<string, string>();
  return {
    async getItem(key) {
      return values.get(key) ?? null;
    },
    async setItem(key, value) {
      values.set(key, value);
    },
    async removeItem(key) {
      values.delete(key);
    },
  };
}

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

function createState(): GameState {
  const setup: GameSetup = {
    players: players(3),
    objective: "domination80",
    useExtraTerritories: false,
    allocation: "random",
    cardRule: "ascending",
    turnStyle: "classic",
    restrictedReinforcement: false,
  };

  return withMockedRandom(0, () => createGame(setup));
}

test("JSON repository saves summaries, restores normalized state, and deletes autosaves", async () => {
  const repository = createJsonRepository(makeStorage());
  const state = createState();
  delete (state as Partial<GameState>).sameTime;

  const summary = await repository.saveCampaignState(state);
  equal(summary.turn, state.turn);
  equal(summary.objective, "domination80");
  deepEqual(summary.playerNames, ["P1", "P2", "P3"]);

  const loadedSummary = await repository.loadSaveSummary();
  equal(loadedSummary?.turn, state.turn);
  equal(loadedSummary?.objective, "domination80");
  deepEqual(loadedSummary?.playerNames, ["P1", "P2", "P3"]);

  const loadedState = await repository.loadSavedState();
  ok(loadedState);
  equal(loadedState.setup.objective, "domination80");
  equal(loadedState.sameTime, null);

  await repository.deleteSave();
  equal(await repository.loadSaveSummary(), null);
  equal(await repository.loadSavedState(), null);
});

test("completed campaign archive deletes autosave and updates commander stats", async () => {
  const repository = createJsonRepository(makeStorage());
  const state = createState();

  state.winner = 0;
  state.winReason = "World Domination";
  state.turn = 12;
  state.battlesFought = 7;

  await repository.saveCampaignState(state);
  await repository.recordCompletedCampaign(state);

  equal(await repository.loadSavedState(), null);

  await repository.recordCompletedCampaign(state);

  const campaigns = await repository.listCampaigns();
  equal(campaigns.length, 1);
  equal(campaigns[0]?.winnerName, "P1");
  equal(campaigns[0]?.winnerIsHuman, true);
  equal(campaigns[0]?.turns, 12);
  equal(campaigns[0]?.battles, 7);

  const commanders = await repository.listCommanderStats();
  deepEqual(
    commanders.map((c) => [c.name, c.games, c.wins]),
    [
      ["P1", 1, 1],
      ["P2", 1, 0],
      ["P3", 1, 0],
    ],
  );
});

test("tournament progress round-trips and normalizes optional fields", async () => {
  const repository = createJsonRepository(makeStorage());

  await repository.saveTournamentProgress({
    humanName: "Ada",
    currentGame: 3,
    totalPoints: 240,
    records: [{ gameIndex: 2, result: { eliminated: false, won: true, kills: 2, mostTroops: true, points: 220, progressed: true } }],
  });

  const progress = await repository.getTournamentProgress();
  equal(progress?.humanName, "Ada");
  equal(progress?.currentGame, 3);
  equal(progress?.totalPoints, 240);
  equal(progress?.scoreSubmitted, false);
  equal(progress?.records[0]?.result.points, 220);

  await repository.clearTournamentProgress();
  equal(await repository.getTournamentProgress(), null);
});

test("high scores seed the board, keep top twelve, and use insertion order as tie-break", async () => {
  const repository = createJsonRepository(makeStorage());

  const seeded = await repository.listHighScores();
  equal(seeded.length, 12);
  equal(seeded[0]?.name, SEED_HIGH_SCORES[0]?.[0]);

  await repository.submitHighScore("Human One", 1400, 16);
  await repository.submitHighScore("Human Two", 1310, 15);

  const scores = await repository.listHighScores();
  equal(scores.length, 12);
  equal(scores[0]?.name, "Human One");
  equal(scores[1]?.name, "Wellington");
  equal(scores[2]?.name, "Human Two");
  equal(scores.some((s) => s.name === "D'Erlon"), false);
});

test("legacy records import in chronological archive order and aggregate commander stats", async () => {
  const repository = createJsonRepository(makeStorage());

  await repository.importLegacyRecords([
    {
      id: "newer",
      date: "2026-02-01T00:00:00.000Z",
      playerName: "Ada",
      won: true,
      turns: 10,
      territories: 42,
      totalPlayers: 3,
      objective: "domination60",
    },
    {
      id: "older",
      date: "2026-01-01T00:00:00.000Z",
      playerName: "Ada",
      won: false,
      turns: 14,
      territories: 48,
      totalPlayers: 4,
      objective: "mission",
    },
  ]);
  await repository.importLegacyRecords([
    {
      id: "newer",
      date: "2026-02-01T00:00:00.000Z",
      playerName: "Ada",
      won: true,
      turns: 10,
      territories: 42,
      totalPlayers: 3,
      objective: "domination60",
    },
  ]);

  const campaigns = await repository.listCampaigns();
  deepEqual(campaigns.map((c) => c.winnerName), ["Ada", "Enemy Command"]);
  deepEqual(campaigns.map((c) => c.territoryCount), [42, 48]);

  const commanders = await repository.listCommanderStats();
  deepEqual(commanders.map((c) => [c.name, c.games, c.wins]), [["Ada", 2, 1]]);
});

import { deepEqual, equal, ok } from "node:assert/strict";
import { test } from "node:test";

import { createGame, normalizeState } from "../../game/engine";
import { looksLikeGameState } from "../../db/types";
import type { GameSetup, GameState, PlayerSetup } from "../../game/types";

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
    players: players(2),
    objective: "domination60",
    useExtraTerritories: false,
    allocation: "random",
    cardRule: "ascending",
    turnStyle: "classic",
    restrictedReinforcement: false,
  };

  return withMockedRandom(0, () => createGame(setup));
}

test("saved-state shape guard accepts campaign states and rejects unrelated JSON", () => {
  const state = createState();

  equal(looksLikeGameState(state), true);
  equal(looksLikeGameState(null), false);
  equal(looksLikeGameState({ turn: 1, phase: "attack", players: [] }), false);
});

test("normalization restores fields omitted by older save versions", () => {
  const raw = createState() as Partial<GameState> as GameState;
  delete (raw as Partial<GameState>).alliances;
  delete (raw as Partial<GameState>).pendingProposal;
  delete (raw as Partial<GameState>).proposalsMade;
  delete (raw as Partial<GameState>).history;
  delete (raw as Partial<GameState>).sameTime;
  delete (raw as Partial<GameState>).coWinners;
  delete (raw as Partial<GameState>).capitalsRevealed;
  delete (raw.players[0] as Partial<GameState["players"][number]>).grudges;

  const normalized = normalizeState(raw);

  deepEqual(normalized.alliances, []);
  equal(normalized.pendingProposal, null);
  deepEqual(normalized.proposalsMade, []);
  deepEqual(normalized.history, []);
  equal(normalized.sameTime, null);
  equal(normalized.coWinners, null);
  equal(normalized.capitalsRevealed, false);
  deepEqual(normalized.players[0].grudges, {});
  ok(looksLikeGameState(normalized));
});

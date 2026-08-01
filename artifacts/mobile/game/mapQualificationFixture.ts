import type { GameState, TerritoryState } from "./types";

/**
 * Replaces random setup output with a stable native performance fixture.
 * Qualification effects are presentation-only, so gameplay rules remain idle.
 */
export function prepareMapQualificationFixture(state: GameState): GameState {
  const playerCount = Math.max(1, state.players.length);
  const fixtureTerritories = Object.fromEntries(
    state.activeIds.map((id, index) => [
      id,
      {
        owner: index % playerCount,
        armies: 1 + (index % 4),
      } satisfies TerritoryState,
    ]),
  );

  return {
    ...state,
    territories: {
      ...state.territories,
      ...fixtureTerritories,
    },
    currentPlayer: 0,
    phase: state.sameTime ? "sameTimeReinforce" : "reinforcement",
    turn: 1,
    reinforcementsRemaining: 0,
    mustTrade: false,
    pendingOccupy: null,
    lastBattle: null,
    winner: null,
    winReason: null,
    battlesFought: 0,
    awaitingHandoff: false,
    pendingProposal: null,
    proposalsMade: [],
    fortifyUsed: false,
    deployLog: [],
  };
}

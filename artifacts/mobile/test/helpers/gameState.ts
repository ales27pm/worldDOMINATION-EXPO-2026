import { createGame } from "../../game/engine";
import { ALL_TERRITORIES } from "../../game/mapData";
import type {
  AttackOrder,
  GameSetup,
  GameState,
  PlayerSetup,
  RiskCard,
  TerritoryId,
  TerritoryState,
} from "../../game/types";

export const LOW_RANDOM = 0;
export const HIGH_RANDOM = 0.99;

export function players(count: number): PlayerSetup[] {
  return Array.from({ length: count }, (_, index) => ({
    name: `P${index + 1}`,
    colorIdx: index,
    isHuman: index === 0,
    generalId: null,
  }));
}

export function riskCard(id: string, type: RiskCard["type"], territory: RiskCard["territory"] = null): RiskCard {
  return { id, type, territory };
}

export function repeatRandom(values: number[], times: number): number[] {
  return Array.from({ length: times }).flatMap(() => values);
}

export function randomSequence(values: number[]): () => number {
  let index = 0;
  const fallback = values.length > 0 ? values[values.length - 1] : 0;

  return () => {
    const value = values[index];
    index += 1;
    return value ?? fallback;
  };
}

export function withMockedRandom<T>(values: number | number[], run: () => T): T {
  const sequence = Array.isArray(values) ? values : [values];
  const originalRandom = Math.random;
  const random = randomSequence(sequence);

  Math.random = random;
  try {
    return run();
  } finally {
    Math.random = originalRandom;
  }
}

export function createClassicState(
  playerCount = 2,
  allocation: GameSetup["allocation"] = "random",
  objective: GameSetup["objective"] = "domination100",
): GameState {
  const setup: GameSetup = {
    players: players(playerCount),
    objective,
    useExtraTerritories: false,
    allocation,
    cardRule: "ascending",
    turnStyle: "classic",
    restrictedReinforcement: false,
  };

  return withMockedRandom(LOW_RANDOM, () => createGame(setup));
}

export function createSameTimeState(playerCount = 2): GameState {
  const setup: GameSetup = {
    players: players(playerCount),
    objective: "domination100",
    useExtraTerritories: false,
    allocation: "random",
    cardRule: "ascending",
    turnStyle: "sameTime",
    restrictedReinforcement: false,
  };

  return withMockedRandom(LOW_RANDOM, () => createGame(setup));
}

export function assignAll(state: GameState, owner: number, armies = 1): void {
  state.territories = {
    ...state.territories,
    ...Object.fromEntries(state.activeIds.map((id) => [id, { owner, armies }])),
  };
}

export function assignOwners(state: GameState, owner: number, ids: TerritoryId[], armies = 1): void {
  state.territories = {
    ...state.territories,
    ...Object.fromEntries(ids.map((id) => [id, { owner, armies }])),
  };
}

export function setTerritories(
  state: GameState,
  territories: Partial<Record<TerritoryId, TerritoryState>>,
): void {
  state.territories = { ...state.territories, ...territories };
}

export function makeTerritories(
  overrides: Partial<Record<TerritoryId, TerritoryState>>,
): Record<TerritoryId, TerritoryState> {
  const base = Object.fromEntries(
    ALL_TERRITORIES.map((territory) => [territory.id, { owner: 9, armies: 1 }]),
  ) as Record<TerritoryId, TerritoryState>;

  return { ...base, ...overrides };
}

export function attackOrder(
  id: string,
  player: number,
  from: TerritoryId,
  to: TerritoryId,
  count: number,
  surgeTo: TerritoryId | null = null,
): AttackOrder {
  return { id, player, from, to, count, surgeTo };
}

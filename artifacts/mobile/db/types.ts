/**
 * Shared record shapes for the on-device database — mirrors web/src/db/repository.ts.
 */
import type { TournamentResult } from '@/game/tournament';
import type { GameState, Objective } from '@/game/types';

export const SAVE_VERSION = 1;

export interface SaveSummary {
  turn: number;
  objective: Objective;
  playerNames: string[];
  updatedAt: string;
}

export interface CampaignRecord {
  id: number;
  completionKey: string | null;
  winnerName: string;
  winnerColor: string;
  winnerIsHuman: boolean;
  objective: Objective;
  winReason: string | null;
  turns: number;
  playerCount: number;
  territoryCount: number;
  battles: number;
  completedAt: string;
}

export interface CommanderRecord {
  name: string;
  isHuman: boolean;
  games: number;
  wins: number;
}

export interface HighScoreRecord {
  name: string;
  isHuman: boolean;
  score: number;
  gamesCompleted: number;
}

export interface TournamentGameRecord {
  gameIndex: number; // 0-based
  result: TournamentResult;
}

export interface TournamentSession {
  humanName: string;
  /** 0-based index of the game the player should play next (= records.length). */
  currentGame: number;
  totalPoints: number;
  records: TournamentGameRecord[];
  /** True once this run's score has been engraved in the high-score ledger. */
  scoreSubmitted?: boolean;
}

/** The pre-SQLite AsyncStorage campaign record ("worlddomination.records"). */
export interface LegacyGameRecord {
  id: string;
  date: string;
  playerName: string;
  won: boolean;
  turns: number;
  territories: number;
  totalPlayers: number;
  objective: string;
}

/** The 12 seeded AI slots the player must fight their way onto (manual, Chapter 9). */
export const SEED_HIGH_SCORES: readonly (readonly [string, number, number])[] = [
  ['Wellington', 1310, 16],
  ['Bonaparte', 1255, 16],
  ['Baird', 1140, 14],
  ['Vauban', 1010, 13],
  ['Taupin', 905, 12],
  ['Marmont', 830, 11],
  ['Mackenzie', 720, 10],
  ['Barbacena', 640, 9],
  ['Campbell', 545, 8],
  ['Sherbrooke', 450, 7],
  ['Spencer', 355, 6],
  ["D'Erlon", 260, 5],
];

export function looksLikeGameState(value: unknown): value is GameState {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.turn === 'number' &&
    typeof v.phase === 'string' &&
    Array.isArray(v.players) &&
    Array.isArray(v.activeIds) &&
    typeof v.territories === 'object' &&
    v.territories !== null
  );
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export function completionKeyForState(state: GameState): string {
  const territoryState = Object.fromEntries(
    [...state.activeIds]
      .sort()
      .map((id) => [id, state.territories[id]]),
  );
  return fnv1a(
    stableStringify({
      setup: state.setup,
      players: state.players.map((player) => ({
        name: player.name,
        color: player.color,
        isHuman: player.isHuman,
        generalId: player.generalId,
      })),
      winner: state.winner,
      winReason: state.winReason,
      turn: state.turn,
      battlesFought: state.battlesFought,
      activeIds: state.activeIds,
      territories: territoryState,
    }),
  );
}

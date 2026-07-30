import { totalTroops } from "./analysis";
import { GENERALS } from "./generals";
import {
  ALLOCATION_INFO,
  OBJECTIVE_INFO,
  type Allocation,
  type CardRule,
  type GameSetup,
  type GameState,
  type GeneralId,
  type Objective,
  type PlayerSetup,
} from "./types";

/**
 * The RISK II Tournament (manual, Chapter 9): 16 campaigns played in
 * sequence, escalating in opponent count, general quality and rule
 * variations. Early games are of a classic flavour; later games introduce
 * elections, capitals, the extended map and the top-drawer generals.
 */
export interface TournamentGameDef {
  index: number;
  title: string;
  objective: Objective;
  cardRule: CardRule;
  allocation: Allocation;
  useExtraTerritories: boolean;
  opponents: GeneralId[];
}

export const TOURNAMENT_GAMES: TournamentGameDef[] = [
  { index: 1, title: "First Command", objective: "domination60", cardRule: "ascending", allocation: "random", useExtraTerritories: false, opponents: ["solignac", "freire"] },
  { index: 2, title: "The Low Countries", objective: "domination60", cardRule: "ascending", allocation: "random", useExtraTerritories: false, opponents: ["dErlon", "maransin", "solignac"] },
  { index: 3, title: "Peninsular Skirmish", objective: "mission", cardRule: "ascending", allocation: "random", useExtraTerritories: false, opponents: ["campbell", "freire", "aubert"] },
  { index: 4, title: "The Danube Line", objective: "domination80", cardRule: "ascending", allocation: "grab", useExtraTerritories: false, opponents: ["mackenzie", "spencer", "maransin"] },
  { index: 5, title: "Egyptian Expedition", objective: "capital", cardRule: "setValue", allocation: "random", useExtraTerritories: false, opponents: ["barbacena", "sherbrooke", "aubert"] },
  { index: 6, title: "The Grand Election", objective: "domination80", cardRule: "ascending", allocation: "election", useExtraTerritories: false, opponents: ["campbell", "spencer", "dErlon"] },
  { index: 7, title: "Baltic Gambit", objective: "mission", cardRule: "ascendingByOne", allocation: "grab", useExtraTerritories: false, opponents: ["mackenzie", "taupin", "freire", "solignac"] },
  { index: 8, title: "The Extended Atlas", objective: "domination60", cardRule: "ascending", allocation: "random", useExtraTerritories: true, opponents: ["vauban", "barbacena", "spencer"] },
  { index: 9, title: "Iberian Cauldron", objective: "capital", cardRule: "setValue", allocation: "grab", useExtraTerritories: true, opponents: ["marmont", "sherbrooke", "aubert", "maransin"] },
  { index: 10, title: "The Tsar's Winter", objective: "domination80", cardRule: "ascendingByOne", allocation: "election", useExtraTerritories: true, opponents: ["taupin", "mackenzie", "campbell", "dErlon"] },
  { index: 11, title: "Confederation of the Rhine", objective: "mission", cardRule: "ascending", allocation: "random", useExtraTerritories: true, opponents: ["wellington", "spencer", "barbacena", "freire"] },
  { index: 12, title: "The Hundred Days", objective: "domination100", cardRule: "ascending", allocation: "grab", useExtraTerritories: false, opponents: ["bonaparte", "vauban", "taupin"] },
  { index: 13, title: "Continental Blockade", objective: "capital", cardRule: "ascendingByOne", allocation: "election", useExtraTerritories: true, opponents: ["baird", "marmont", "mackenzie", "sherbrooke", "aubert"] },
  { index: 14, title: "March on the Capitals", objective: "capital", cardRule: "setValue", allocation: "grab", useExtraTerritories: true, opponents: ["wellington", "bonaparte", "vauban", "taupin"] },
  { index: 15, title: "The World in Flames", objective: "domination100", cardRule: "ascendingByOne", allocation: "random", useExtraTerritories: true, opponents: ["baird", "wellington", "marmont", "barbacena", "maransin", "spencer"] },
  { index: 16, title: "Empire Eternal", objective: "domination100", cardRule: "ascending", allocation: "election", useExtraTerritories: true, opponents: ["wellington", "bonaparte", "baird", "vauban", "taupin", "marmont", "mackenzie"] },
];

export const TOURNAMENT_LENGTH = TOURNAMENT_GAMES.length;

/** Points for a win + a kill per opponent + most troops (manual points system). */
export function tournamentMaxPoints(def: TournamentGameDef): number {
  return 150 + def.opponents.length * 20 + 30;
}

export interface TournamentCampaignSummary {
  objectiveName: string;
  allocationName: string;
  opponentCount: number;
  territoryCount: number;
  difficulty: number;
  difficultyMarks: string;
  maxPoints: number;
}

/** Compact, UI-safe metadata for the 16-game tournament ledger. */
export function tournamentCampaignSummary(def: TournamentGameDef): TournamentCampaignSummary {
  const averageDifficulty =
    def.opponents.reduce((sum, generalId) => sum + GENERALS[generalId].difficulty, 0) /
    def.opponents.length;
  const difficulty = Math.round(averageDifficulty);

  return {
    objectiveName: OBJECTIVE_INFO[def.objective].name,
    allocationName: ALLOCATION_INFO[def.allocation].name,
    opponentCount: def.opponents.length,
    territoryCount: def.useExtraTerritories ? 48 : 42,
    difficulty,
    difficultyMarks: "★".repeat(difficulty),
    maxPoints: tournamentMaxPoints(def),
  };
}

/** Build a full GameSetup for a tournament battle. */
export function buildTournamentSetup(def: TournamentGameDef, humanName: string): GameSetup {
  const players: PlayerSetup[] = [
    { name: humanName.trim() === "" ? "You" : humanName.trim(), colorIdx: 0, isHuman: true, generalId: null },
    ...def.opponents.map((generalId, i): PlayerSetup => ({
      name: GENERALS[generalId].name,
      colorIdx: i + 1,
      isHuman: false,
      generalId,
    })),
  ];
  return {
    players,
    objective: def.objective,
    useExtraTerritories: def.useExtraTerritories,
    cardRule: def.cardRule,
    allocation: def.allocation,
    tournamentGame: def.index,
  };
}

/** Outcome of a tournament battle, scored per the manual's points system. */
export interface TournamentResult {
  /** The human was destroyed — 0 points and the tournament ends. */
  eliminated: boolean;
  won: boolean;
  kills: number;
  mostTroops: boolean;
  points: number;
  /** Win, or defeat one+ opponents and survive to the end, to progress. */
  progressed: boolean;
}

export function tournamentResult(state: GameState): TournamentResult {
  const human = state.players.find((p) => p.isHuman);
  if (!human || !human.alive) {
    return { eliminated: true, won: false, kills: 0, mostTroops: false, points: 0, progressed: false };
  }
  const kills = state.players.filter((p) => p.killedBy === human.id).length;
  const won = state.winner === human.id;
  // Same Time RISK can end in a shared draw-win — worth less than an outright win (manual, Chapter 9).
  const sharedWin = !won && (state.coWinners?.includes(human.id) ?? false);
  const humanTroops = totalTroops(state, human.id);
  const rivalBest = Math.max(
    0,
    ...state.players.filter((p) => p.alive && p.id !== human.id).map((p) => totalTroops(state, p.id)),
  );
  const mostTroops = humanTroops >= rivalBest;
  const points = (won ? 150 : sharedWin ? 100 : 0) + kills * 20 + (mostTroops ? 30 : 0);
  return { eliminated: false, won: won || sharedWin, kills, mostTroops, points, progressed: won || sharedWin || kills >= 1 };
}

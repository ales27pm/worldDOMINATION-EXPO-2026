import { normalizeState } from "../game/engine";
import type { GameState, Objective } from "../game/types";

import { SAVE_VERSION, SEED_HIGH_SCORES, completionKeyForState, looksLikeGameState } from "./types";
import type {
  CampaignRecord,
  CommanderRecord,
  HighScoreRecord,
  LegacyGameRecord,
  SaveSummary,
  TournamentSession,
} from "./types";

export interface JsonStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export const JSON_REPOSITORY_KEYS = {
  save: "worlddomination.db.saveSlot",
  campaigns: "worlddomination.db.campaigns",
  commanders: "worlddomination.db.commanderStats",
  tournament: "worlddomination.db.tournament",
  highScores: "worlddomination.db.highScores",
} as const;

interface StoredSave {
  version: number;
  state: GameState;
  turn: number;
  objective: Objective;
  playerNames: string[];
  updatedAt: string;
}

interface StoredScore extends HighScoreRecord {
  recordedAt: string;
  /** Insertion order, used as the tie-break (mirrors the SQLite rowid). */
  seq: number;
}

export function createJsonRepository(storage: JsonStorage) {
  async function readJson<T>(key: string): Promise<T | null> {
    try {
      const raw = await storage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }

  async function writeJson(key: string, value: unknown): Promise<void> {
    await storage.setItem(key, JSON.stringify(value));
  }

  async function saveCampaignState(state: GameState): Promise<SaveSummary> {
    const updatedAt = new Date().toISOString();
    const playerNames = state.players.filter((p) => p.alive).map((p) => p.name);
    const stored: StoredSave = {
      version: SAVE_VERSION,
      state,
      turn: state.turn,
      objective: state.setup.objective,
      playerNames,
      updatedAt,
    };
    await writeJson(JSON_REPOSITORY_KEYS.save, stored);
    return { turn: state.turn, objective: state.setup.objective, playerNames, updatedAt };
  }

  async function loadSaveSummary(): Promise<SaveSummary | null> {
    const stored = await readJson<StoredSave>(JSON_REPOSITORY_KEYS.save);
    if (!stored) return null;
    return {
      turn: stored.turn,
      objective: stored.objective,
      playerNames: stored.playerNames ?? [],
      updatedAt: stored.updatedAt ?? "",
    };
  }

  async function loadSavedState(): Promise<GameState | null> {
    const stored = await readJson<StoredSave>(JSON_REPOSITORY_KEYS.save);
    if (!stored || stored.version !== SAVE_VERSION || !looksLikeGameState(stored.state)) return null;
    return normalizeState(stored.state);
  }

  async function deleteSave(): Promise<void> {
    await storage.removeItem(JSON_REPOSITORY_KEYS.save);
  }

  async function upsertCommander(
    commanders: CommanderRecord[],
    name: string,
    isHuman: boolean,
    won: boolean,
  ): Promise<CommanderRecord[]> {
    const existing = commanders.find((c) => c.name === name);
    if (existing) {
      existing.games += 1;
      existing.wins += won ? 1 : 0;
      existing.isHuman = isHuman;
      return commanders;
    }
    return [...commanders, { name, isHuman, games: 1, wins: won ? 1 : 0 }];
  }

  async function appendCampaign(row: Omit<CampaignRecord, "id">): Promise<boolean> {
    const campaigns = (await readJson<CampaignRecord[]>(JSON_REPOSITORY_KEYS.campaigns)) ?? [];
    if (row.completionKey && campaigns.some((campaign) => campaign.completionKey === row.completionKey)) {
      return false;
    }
    const nextId = campaigns.reduce((max, c) => Math.max(max, c.id), 0) + 1;
    campaigns.push({ ...row, id: nextId });
    await writeJson(JSON_REPOSITORY_KEYS.campaigns, campaigns.slice(-100));
    return true;
  }

  async function recordCompletedCampaign(state: GameState): Promise<void> {
    if (state.winner === null) return;
    const winner = state.players[state.winner];
    if (!winner) return;
    const completionKey = completionKeyForState(state);
    const campaigns = (await readJson<CampaignRecord[]>(JSON_REPOSITORY_KEYS.campaigns)) ?? [];
    if (campaigns.some((campaign) => campaign.completionKey === completionKey)) {
      await deleteSave();
      return;
    }
    await appendCampaign({
      completionKey,
      winnerName: winner.name,
      winnerColor: winner.color,
      winnerIsHuman: winner.isHuman,
      objective: state.setup.objective,
      winReason: state.winReason ?? null,
      turns: state.turn,
      playerCount: state.players.length,
      territoryCount: state.activeIds.length,
      battles: state.battlesFought,
      completedAt: new Date().toISOString(),
    });
    let commanders = (await readJson<CommanderRecord[]>(JSON_REPOSITORY_KEYS.commanders)) ?? [];
    for (const player of state.players) {
      commanders = await upsertCommander(commanders, player.name, player.isHuman, player.id === state.winner);
    }
    await writeJson(JSON_REPOSITORY_KEYS.commanders, commanders);
    await deleteSave();
  }

  async function listCampaigns(): Promise<CampaignRecord[]> {
    const campaigns = (await readJson<CampaignRecord[]>(JSON_REPOSITORY_KEYS.campaigns)) ?? [];
    return [...campaigns]
      .map((campaign) => ({ ...campaign, completionKey: campaign.completionKey ?? null }))
      .sort((a, b) => b.id - a.id)
      .slice(0, 100);
  }

  async function listCommanderStats(): Promise<CommanderRecord[]> {
    const commanders = (await readJson<CommanderRecord[]>(JSON_REPOSITORY_KEYS.commanders)) ?? [];
    return [...commanders].sort(
      (a, b) => b.wins - a.wins || b.games - a.games || a.name.localeCompare(b.name),
    );
  }

  async function getTournamentProgress(): Promise<TournamentSession | null> {
    const session = await readJson<TournamentSession>(JSON_REPOSITORY_KEYS.tournament);
    if (!session || typeof session.humanName !== "string") return null;
    return {
      humanName: session.humanName,
      currentGame: Number(session.currentGame ?? 0),
      totalPoints: Number(session.totalPoints ?? 0),
      records: Array.isArray(session.records) ? session.records : [],
      scoreSubmitted: session.scoreSubmitted === true,
    };
  }

  async function saveTournamentProgress(session: TournamentSession): Promise<void> {
    await writeJson(JSON_REPOSITORY_KEYS.tournament, session);
  }

  async function clearTournamentProgress(): Promise<void> {
    await storage.removeItem(JSON_REPOSITORY_KEYS.tournament);
  }

  async function loadScoresSeeded(): Promise<StoredScore[]> {
    const scores = (await readJson<StoredScore[]>(JSON_REPOSITORY_KEYS.highScores)) ?? [];
    if (scores.length > 0) return scores;
    const now = new Date().toISOString();
    const seeded: StoredScore[] = SEED_HIGH_SCORES.map(([name, score, games], i) => ({
      name,
      isHuman: false,
      score,
      gamesCompleted: games,
      recordedAt: now,
      seq: i + 1,
    }));
    await writeJson(JSON_REPOSITORY_KEYS.highScores, seeded);
    return seeded;
  }

  function topTwelve(scores: StoredScore[]): StoredScore[] {
    return [...scores].sort((a, b) => b.score - a.score || a.seq - b.seq).slice(0, 12);
  }

  async function submitHighScore(name: string, score: number, gamesCompleted: number): Promise<void> {
    const scores = await loadScoresSeeded();
    const nextSeq = scores.reduce((max, s) => Math.max(max, s.seq), 0) + 1;
    scores.push({
      name,
      isHuman: true,
      score,
      gamesCompleted,
      recordedAt: new Date().toISOString(),
      seq: nextSeq,
    });
    await writeJson(JSON_REPOSITORY_KEYS.highScores, topTwelve(scores));
  }

  async function listHighScores(): Promise<HighScoreRecord[]> {
    const scores = await loadScoresSeeded();
    return topTwelve(scores).map(({ name, isHuman, score, gamesCompleted }) => ({
      name,
      isHuman,
      score,
      gamesCompleted,
    }));
  }

  async function importLegacyRecords(records: LegacyGameRecord[]): Promise<void> {
    let commanders = (await readJson<CommanderRecord[]>(JSON_REPOSITORY_KEYS.commanders)) ?? [];
    for (const r of [...records].reverse()) {
      const date = new Date(r.date);
      const completedAt = Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
      const inserted = await appendCampaign({
        completionKey: `legacy:${r.id}`,
        winnerName: r.won ? r.playerName : "Enemy Command",
        winnerColor: r.won ? "#debe73" : "#8a2f2b",
        winnerIsHuman: r.won,
        objective: r.objective as Objective,
        winReason: null,
        turns: r.turns,
        playerCount: r.totalPlayers,
        territoryCount: r.territories > 42 ? 48 : 42,
        battles: 0,
        completedAt,
      });
      if (inserted) {
        commanders = await upsertCommander(commanders, r.playerName, true, r.won);
      }
    }
    await writeJson(JSON_REPOSITORY_KEYS.commanders, commanders);
  }

  return {
    saveCampaignState,
    loadSaveSummary,
    loadSavedState,
    deleteSave,
    recordCompletedCampaign,
    listCampaigns,
    listCommanderStats,
    getTournamentProgress,
    saveTournamentProgress,
    clearTournamentProgress,
    submitHighScore,
    listHighScores,
    importLegacyRecords,
  };
}

export type JsonRepository = ReturnType<typeof createJsonRepository>;

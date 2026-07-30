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

export interface SqliteDatabase {
  execAsync(sql: string): Promise<unknown>;
  runAsync(sql: string, params?: readonly unknown[]): Promise<unknown>;
  getFirstAsync<T extends SqliteRow = SqliteRow>(sql: string, params?: readonly unknown[]): Promise<T | null>;
  getAllAsync<T extends SqliteRow = SqliteRow>(sql: string, params?: readonly unknown[]): Promise<T[]>;
}

export type SqliteRow = Record<string, unknown>;
export type SqliteDatabaseProvider = () => Promise<SqliteDatabase>;

export const SQLITE_REPOSITORY_SCHEMA = `
CREATE TABLE IF NOT EXISTS save_slot (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  state_json TEXT NOT NULL,
  turn INTEGER NOT NULL,
  objective TEXT NOT NULL,
  player_names TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  completion_key TEXT,
  winner_name TEXT NOT NULL,
  winner_color TEXT NOT NULL,
  winner_is_human INTEGER NOT NULL,
  objective TEXT NOT NULL,
  win_reason TEXT,
  turns INTEGER NOT NULL,
  player_count INTEGER NOT NULL,
  territory_count INTEGER NOT NULL,
  battles INTEGER NOT NULL,
  completed_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS campaigns_completion_key_idx
  ON campaigns(completion_key)
  WHERE completion_key IS NOT NULL;
CREATE TABLE IF NOT EXISTS commander_stats (
  name TEXT PRIMARY KEY,
  is_human INTEGER NOT NULL,
  games INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS tournament (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  campaign_name TEXT NOT NULL,
  current_game INTEGER NOT NULL,
  total_points INTEGER NOT NULL,
  records_json TEXT NOT NULL DEFAULT '[]',
  score_submitted INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS high_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  is_human INTEGER NOT NULL,
  score INTEGER NOT NULL,
  games_completed INTEGER NOT NULL,
  recorded_at TEXT NOT NULL
);
`;

function parseNames(raw: unknown): string[] {
  try {
    const parsed: unknown = JSON.parse(String(raw ?? "[]"));
    return Array.isArray(parsed) ? parsed.map((name) => String(name)) : [];
  } catch {
    return [];
  }
}

export function createSqliteRepository(getDb: SqliteDatabaseProvider) {
  let campaignSchemaReady = false;

  async function ensureCampaignCompletionSchema(db: SqliteDatabase): Promise<void> {
    if (campaignSchemaReady) return;
    const columns = await db.getAllAsync<{ name?: unknown }>(`PRAGMA table_info(campaigns)`);
    if (!columns.some((column) => column.name === "completion_key")) {
      await db.runAsync(`ALTER TABLE campaigns ADD COLUMN completion_key TEXT`);
    }
    await db.runAsync(
      `CREATE UNIQUE INDEX IF NOT EXISTS campaigns_completion_key_idx
       ON campaigns(completion_key)
       WHERE completion_key IS NOT NULL`,
    );
    campaignSchemaReady = true;
  }

  async function saveCampaignState(state: GameState): Promise<SaveSummary> {
    const db = await getDb();
    const updatedAt = new Date().toISOString();
    const playerNames = state.players.filter((player) => player.alive).map((player) => player.name);
    await db.runAsync(
      `INSERT INTO save_slot (id, state_json, turn, objective, player_names, updated_at)
       VALUES (1, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         state_json = excluded.state_json,
         turn = excluded.turn,
         objective = excluded.objective,
         player_names = excluded.player_names,
         updated_at = excluded.updated_at`,
      [
        JSON.stringify({ version: SAVE_VERSION, state }),
        state.turn,
        state.setup.objective,
        JSON.stringify(playerNames),
        updatedAt,
      ],
    );
    return { turn: state.turn, objective: state.setup.objective, playerNames, updatedAt };
  }

  async function loadSaveSummary(): Promise<SaveSummary | null> {
    const db = await getDb();
    const row = await db.getFirstAsync(
      `SELECT turn, objective, player_names, updated_at FROM save_slot WHERE id = 1`,
    );
    if (!row) return null;
    return {
      turn: Number(row.turn ?? 1),
      objective: String(row.objective ?? "domination100") as Objective,
      playerNames: parseNames(row.player_names),
      updatedAt: String(row.updated_at ?? ""),
    };
  }

  async function loadSavedState(): Promise<GameState | null> {
    const db = await getDb();
    const row = await db.getFirstAsync(`SELECT state_json FROM save_slot WHERE id = 1`);
    if (!row) return null;
    try {
      const parsed: unknown = JSON.parse(String(row.state_json ?? ""));
      if (typeof parsed !== "object" || parsed === null) return null;
      const wrapper = parsed as { version?: unknown; state?: unknown };
      if (wrapper.version !== SAVE_VERSION || !looksLikeGameState(wrapper.state)) return null;
      return normalizeState(wrapper.state);
    } catch {
      return null;
    }
  }

  async function deleteSave(): Promise<void> {
    const db = await getDb();
    await db.runAsync(`DELETE FROM save_slot WHERE id = 1`);
  }

  async function recordCompletedCampaign(state: GameState): Promise<void> {
    if (state.winner === null) return;
    const winner = state.players[state.winner];
    if (!winner) return;
    const db = await getDb();
    await ensureCampaignCompletionSchema(db);
    const completionKey = completionKeyForState(state);
    const existing = await db.getFirstAsync(
      `SELECT id FROM campaigns WHERE completion_key = ? LIMIT 1`,
      [completionKey],
    );
    if (existing) {
      await db.runAsync(`DELETE FROM save_slot WHERE id = 1`);
      return;
    }
    await db.runAsync(
      `INSERT INTO campaigns
         (completion_key, winner_name, winner_color, winner_is_human, objective, win_reason, turns, player_count, territory_count, battles, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        completionKey,
        winner.name,
        winner.color,
        winner.isHuman ? 1 : 0,
        state.setup.objective,
        state.winReason ?? null,
        state.turn,
        state.players.length,
        state.activeIds.length,
        state.battlesFought,
        new Date().toISOString(),
      ],
    );
    for (const player of state.players) {
      await db.runAsync(
        `INSERT INTO commander_stats (name, is_human, games, wins)
         VALUES (?, ?, 1, ?)
         ON CONFLICT(name) DO UPDATE SET
           games = games + 1,
           wins = wins + excluded.wins,
           is_human = excluded.is_human`,
        [player.name, player.isHuman ? 1 : 0, player.id === state.winner ? 1 : 0],
      );
    }
    await db.runAsync(`DELETE FROM save_slot WHERE id = 1`);
  }

  async function listCampaigns(): Promise<CampaignRecord[]> {
    const db = await getDb();
    await ensureCampaignCompletionSchema(db);
    const rows = await db.getAllAsync(
      `SELECT id, completion_key, winner_name, winner_color, winner_is_human, objective, win_reason, turns, player_count, territory_count, battles, completed_at
       FROM campaigns ORDER BY id DESC LIMIT 100`,
    );
    return rows.map((row) => ({
      id: Number(row.id ?? 0),
      completionKey: row.completion_key === null || row.completion_key === undefined ? null : String(row.completion_key),
      winnerName: String(row.winner_name ?? "Unknown"),
      winnerColor: String(row.winner_color ?? "#e63333"),
      winnerIsHuman: Number(row.winner_is_human ?? 0) === 1,
      objective: String(row.objective ?? "domination100") as Objective,
      winReason: row.win_reason === null || row.win_reason === undefined ? null : String(row.win_reason),
      turns: Number(row.turns ?? 0),
      playerCount: Number(row.player_count ?? 0),
      territoryCount: Number(row.territory_count ?? 0),
      battles: Number(row.battles ?? 0),
      completedAt: String(row.completed_at ?? ""),
    }));
  }

  async function listCommanderStats(): Promise<CommanderRecord[]> {
    const db = await getDb();
    const rows = await db.getAllAsync(
      `SELECT name, is_human, games, wins FROM commander_stats ORDER BY wins DESC, games DESC, name ASC`,
    );
    return rows.map((row) => ({
      name: String(row.name ?? "Unknown"),
      isHuman: Number(row.is_human ?? 0) === 1,
      games: Number(row.games ?? 0),
      wins: Number(row.wins ?? 0),
    }));
  }

  async function getTournamentProgress(): Promise<TournamentSession | null> {
    const db = await getDb();
    const row = await db.getFirstAsync(
      `SELECT campaign_name, current_game, total_points, records_json, score_submitted FROM tournament WHERE id = 1`,
    );
    if (!row) return null;
    let records: TournamentSession["records"] = [];
    try {
      const parsed: unknown = JSON.parse(String(row.records_json ?? "[]"));
      if (Array.isArray(parsed)) records = parsed as TournamentSession["records"];
    } catch {
      records = [];
    }
    return {
      humanName: String(row.campaign_name ?? "Commander"),
      currentGame: Number(row.current_game ?? 0),
      totalPoints: Number(row.total_points ?? 0),
      records,
      scoreSubmitted: Number(row.score_submitted ?? 0) === 1,
    };
  }

  async function saveTournamentProgress(session: TournamentSession): Promise<void> {
    const db = await getDb();
    await db.runAsync(
      `INSERT INTO tournament (id, campaign_name, current_game, total_points, records_json, score_submitted, updated_at)
       VALUES (1, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         campaign_name = excluded.campaign_name,
         current_game = excluded.current_game,
         total_points = excluded.total_points,
         records_json = excluded.records_json,
         score_submitted = excluded.score_submitted,
         updated_at = excluded.updated_at`,
      [
        session.humanName,
        session.currentGame,
        session.totalPoints,
        JSON.stringify(session.records),
        session.scoreSubmitted ? 1 : 0,
        new Date().toISOString(),
      ],
    );
  }

  async function clearTournamentProgress(): Promise<void> {
    const db = await getDb();
    await db.runAsync(`DELETE FROM tournament WHERE id = 1`);
  }

  async function seedHighScoresIfEmpty(db: SqliteDatabase): Promise<void> {
    const row = await db.getFirstAsync(`SELECT COUNT(*) AS n FROM high_scores`);
    if (Number(row?.n ?? 0) > 0) return;
    const now = new Date().toISOString();
    for (const [name, score, games] of SEED_HIGH_SCORES) {
      await db.runAsync(
        `INSERT INTO high_scores (name, is_human, score, games_completed, recorded_at) VALUES (?, 0, ?, ?, ?)`,
        [name, score, games, now],
      );
    }
  }

  async function submitHighScore(name: string, score: number, gamesCompleted: number): Promise<void> {
    const db = await getDb();
    await seedHighScoresIfEmpty(db);
    await db.runAsync(
      `INSERT INTO high_scores (name, is_human, score, games_completed, recorded_at) VALUES (?, 1, ?, ?, ?)`,
      [name, score, gamesCompleted, new Date().toISOString()],
    );
    await db.runAsync(
      `DELETE FROM high_scores WHERE id NOT IN (SELECT id FROM high_scores ORDER BY score DESC, id ASC LIMIT 12)`,
    );
  }

  async function listHighScores(): Promise<HighScoreRecord[]> {
    const db = await getDb();
    await seedHighScoresIfEmpty(db);
    const rows = await db.getAllAsync(
      `SELECT name, is_human, score, games_completed FROM high_scores ORDER BY score DESC, id ASC LIMIT 12`,
    );
    return rows.map((row) => ({
      name: String(row.name ?? "Unknown"),
      isHuman: Number(row.is_human ?? 0) === 1,
      score: Number(row.score ?? 0),
      gamesCompleted: Number(row.games_completed ?? 0),
    }));
  }

  async function importLegacyRecords(records: LegacyGameRecord[]): Promise<void> {
    const db = await getDb();
    await ensureCampaignCompletionSchema(db);
    for (const record of [...records].reverse()) {
      const date = new Date(record.date);
      const completedAt = Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
      const completionKey = `legacy:${record.id}`;
      const existing = await db.getFirstAsync(
        `SELECT id FROM campaigns WHERE completion_key = ? LIMIT 1`,
        [completionKey],
      );
      if (existing) continue;
      await db.runAsync(
        `INSERT INTO campaigns
           (completion_key, winner_name, winner_color, winner_is_human, objective, win_reason, turns, player_count, territory_count, battles, completed_at)
         VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, 0, ?)
        `,
        [
          completionKey,
          record.won ? record.playerName : "Enemy Command",
          record.won ? "#debe73" : "#8a2f2b",
          record.won ? 1 : 0,
          record.objective,
          record.turns,
          record.totalPlayers,
          record.territories > 42 ? 48 : 42,
          completedAt,
        ],
      );
      await db.runAsync(
        `INSERT INTO commander_stats (name, is_human, games, wins)
         VALUES (?, 1, 1, ?)
         ON CONFLICT(name) DO UPDATE SET
           games = games + 1,
           wins = wins + excluded.wins,
           is_human = 1`,
        [record.playerName, record.won ? 1 : 0],
      );
    }
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

export type SqliteRepository = ReturnType<typeof createSqliteRepository>;

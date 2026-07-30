/**
 * On-device SQLite repository (iOS / Android).
 *
 * Metro resolves this file on native; `repository.ts` is the Expo-web
 * AsyncStorage fallback with the same API.
 */
import * as SQLite from "expo-sqlite";

import {
  createSqliteRepository,
  SQLITE_REPOSITORY_SCHEMA,
  type SqliteDatabase,
} from "./sqliteRepository";

export * from "./types";

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function openDatabase(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync("worlddomination.db");
  await db.execAsync("PRAGMA journal_mode = WAL;");
  await db.execAsync(SQLITE_REPOSITORY_SCHEMA);
  return db;
}

async function getDb(): Promise<SqliteDatabase> {
  dbPromise = dbPromise ?? openDatabase();
  return (await dbPromise) as unknown as SqliteDatabase;
}

const repository = createSqliteRepository(getDb);

export const {
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
} = repository;

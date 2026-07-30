/**
 * Expo-web fallback repository — an AsyncStorage(localStorage) JSON store
 * with exactly the same API and semantics as `repository.native.ts` (SQLite).
 *
 * Metro resolves `repository.native.ts` on iOS/Android; this file is used by
 * the browser preview, where expo-sqlite's OPFS backend is unavailable behind
 * the proxied iframe. Keep both files' exports in lockstep.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

import { createJsonRepository } from "./jsonRepository";

export * from "./types";

const repository = createJsonRepository(AsyncStorage);

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

import {
  isCompleteMapPerformanceEvidence,
  parseMapPerformanceEvidence,
  serializeMapPerformanceEvidence,
  type MapPerformanceEvidence,
} from "../game/mapPerformanceEvidence";

export const MAP_PERFORMANCE_EVIDENCE_KEY =
  "worlddomination.mapPerformanceEvidence.v1";

export interface MapPerformanceEvidenceStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export async function loadMapPerformanceEvidence(
  storage: MapPerformanceEvidenceStorage,
): Promise<MapPerformanceEvidence | null> {
  const raw = await storage.getItem(MAP_PERFORMANCE_EVIDENCE_KEY);
  return raw ? parseMapPerformanceEvidence(raw) : null;
}

export async function saveMapPerformanceEvidence(
  storage: MapPerformanceEvidenceStorage,
  evidence: MapPerformanceEvidence,
): Promise<void> {
  if (!isCompleteMapPerformanceEvidence(evidence)) {
    throw new Error("Cannot persist an incomplete map performance run.");
  }
  await storage.setItem(
    MAP_PERFORMANCE_EVIDENCE_KEY,
    serializeMapPerformanceEvidence(evidence),
  );
}

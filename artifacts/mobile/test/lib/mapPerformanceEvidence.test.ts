import { deepEqual, equal, rejects } from "node:assert/strict";
import { test } from "node:test";

import {
  createMapPerformanceEvidence,
  parseMapPerformanceEvidence,
  serializeMapPerformanceEvidence,
  type MapPerformanceEvidence,
} from "../../game/mapPerformanceEvidence";
import {
  loadMapPerformanceEvidence,
  MAP_PERFORMANCE_EVIDENCE_KEY,
  saveMapPerformanceEvidence,
  type MapPerformanceEvidenceStorage,
} from "../../lib/mapPerformanceEvidence";
import { qualifyMapRendererPerformance } from "../../game/mapFrameQualification";
import type {
  MapFrameProfileKind,
  MapFrameProfileReport,
} from "../../game/mapFrameProfile";
import {
  createMapRendererBattleStability,
  recordMapRendererBattleSample,
  summarizeMapRendererBattleStability,
  type MapRendererInfoSample,
} from "../../game/mapFrameProfile";

class MemoryStorage implements MapPerformanceEvidenceStorage {
  readonly data = new Map<string, string>();

  async getItem(key: string): Promise<string | null> {
    return this.data.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.data.set(key, value);
  }
}

const RENDERER_SAMPLE: MapRendererInfoSample = {
  calls: 24,
  triangles: 1200,
  points: 0,
  lines: 48,
  programs: 6,
  geometries: 54,
  textures: 8,
  memoryBytes: null,
};

function passingReport(kind: MapFrameProfileKind): MapFrameProfileReport {
  return {
    contractVersion: 1,
    kind,
    targetFps: 60,
    sampleCount: 120,
    durationMs: 2000,
    averageFps: 60,
    p50FrameMs: 16.667,
    p95FrameMs: 17,
    p99FrameMs: 20,
    maxFrameMs: 24,
    slowFrameCount: 2,
    estimatedDroppedFrames: 0,
    withinBudgetRatio: 0.983,
    renderer: {
      contractVersion: 1,
      sampleCount: 120,
      first: RENDERER_SAMPLE,
      last: RENDERER_SAMPLE,
      peak: RENDERER_SAMPLE,
    },
  };
}

function completeEvidence(): MapPerformanceEvidence {
  const stability = createMapRendererBattleStability();
  for (let index = 0; index < 50; index += 1) {
    recordMapRendererBattleSample(stability, RENDERER_SAMPLE);
  }
  return createMapPerformanceEvidence({
    capturedAt: "2026-07-30T12:00:00.000Z",
    platform: "ios",
    application: {
      version: "1.0.0",
      nativeBuildVersion: "12",
      sourceRevision: "7c02638",
      sessionId: "qualification-session",
    },
    device: {
      modelName: "iPhone 16",
      modelId: "iPhone17,3",
      osName: "iOS",
      osVersion: "26.3",
      deviceYearClass: 2024,
    },
    scene: {
      contractVersion: 1,
      variant: "classic",
      viewMode: "board",
      revision: "scene-revision",
      territoryCount: 42,
    },
    qualification: qualifyMapRendererPerformance(
      {
        camera: passingReport("camera"),
        battle: passingReport("battle"),
        "battle-cold": passingReport("battle-cold"),
        "battle-warm": passingReport("battle-warm"),
        "conquest-pulse": passingReport("conquest-pulse"),
      },
      "physical",
    ),
    r3f: {
      featureFlags: {
        battleInstancing: true,
        conquestPulse: true,
        orderReveal: true,
        stylizedWater: false,
        qualification: true,
      },
      shaderCompilation: {
        conquestPulse: true,
        orderReveal: true,
      },
      rendererStability: summarizeMapRendererBattleStability(stability),
    },
  });
}

test("map performance evidence serializes and parses without losing metrics", () => {
  const evidence = completeEvidence();

  deepEqual(
    parseMapPerformanceEvidence(serializeMapPerformanceEvidence(evidence)),
    evidence,
  );
});

test("map performance evidence rejects malformed and platform-mismatched data", () => {
  equal(parseMapPerformanceEvidence("not json"), null);
  equal(
    parseMapPerformanceEvidence(
      JSON.stringify({
        ...completeEvidence(),
        platform: "web",
      }),
    ),
    null,
  );
  equal(
    parseMapPerformanceEvidence(
      JSON.stringify({
        ...completeEvidence(),
        scene: {
          ...completeEvidence().scene,
          viewMode: "unknown",
        },
      }),
    ),
    null,
  );
  const alteredMetrics = structuredClone(completeEvidence());
  alteredMetrics.qualification.profiles.camera!.report.sampleCount = 1;
  equal(parseMapPerformanceEvidence(JSON.stringify(alteredMetrics)), null);
  const alteredAssessment = structuredClone(completeEvidence());
  alteredAssessment.qualification.profiles.battle!.assessment.status = "fail";
  equal(parseMapPerformanceEvidence(JSON.stringify(alteredAssessment)), null);
  const alteredStability = structuredClone(completeEvidence());
  alteredStability.r3f!.rendererStability.observedBattleCount = -1;
  equal(parseMapPerformanceEvidence(JSON.stringify(alteredStability)), null);
});

test("completed map performance evidence persists under the versioned key", async () => {
  const storage = new MemoryStorage();
  const evidence = completeEvidence();

  await saveMapPerformanceEvidence(storage, evidence);

  equal(storage.data.has(MAP_PERFORMANCE_EVIDENCE_KEY), true);
  deepEqual(await loadMapPerformanceEvidence(storage), evidence);
});

test("incomplete performance evidence cannot replace a completed artifact", async () => {
  const storage = new MemoryStorage();
  const incomplete = createMapPerformanceEvidence({
    ...completeEvidence(),
    qualification: qualifyMapRendererPerformance({}, "physical"),
  });

  await rejects(
    saveMapPerformanceEvidence(storage, incomplete),
    /Cannot persist an incomplete map performance run/,
  );
  equal(await loadMapPerformanceEvidence(storage), null);
});

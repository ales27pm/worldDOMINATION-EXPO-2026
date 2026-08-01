import { equal, ok } from "node:assert/strict";
import { test } from "node:test";

import {
  createMapFrameProfile,
  createMapRendererBattleStability,
  recordMapFrameSample,
  recordMapRendererBattleSample,
  summarizeMapFrameProfile,
  summarizeMapRendererBattleStability,
  type MapRendererInfoSample,
} from "../../game/mapFrameProfile";

function rendererSample(
  overrides: Partial<MapRendererInfoSample> = {},
): MapRendererInfoSample {
  return {
    calls: 24,
    triangles: 1200,
    points: 0,
    lines: 48,
    programs: 6,
    geometries: 54,
    textures: 8,
    memoryBytes: null,
    ...overrides,
  };
}

test("frame profile rejects invalid samples and requires an active frame", () => {
  const profile = createMapFrameProfile("camera");

  recordMapFrameSample(profile, 0);
  recordMapFrameSample(profile, -1);
  recordMapFrameSample(profile, Number.NaN);
  recordMapFrameSample(profile, Number.POSITIVE_INFINITY);

  equal(summarizeMapFrameProfile(profile), null);
});

test("frame profile reports deterministic 60 Hz budget metrics", () => {
  const profile = createMapFrameProfile("battle");
  recordMapFrameSample(profile, 1 / 60);
  recordMapFrameSample(profile, 1 / 30);
  recordMapFrameSample(profile, 1 / 20);

  const report = summarizeMapFrameProfile(profile);
  ok(report);
  equal(report.contractVersion, 1);
  equal(report.kind, "battle");
  equal(report.targetFps, 60);
  equal(report.sampleCount, 3);
  equal(report.durationMs, 100);
  equal(report.averageFps, 30);
  equal(report.p50FrameMs, 33.333);
  equal(report.p95FrameMs, 50);
  equal(report.p99FrameMs, 50);
  equal(report.maxFrameMs, 50);
  equal(report.slowFrameCount, 2);
  equal(report.estimatedDroppedFrames, 3);
  equal(report.withinBudgetRatio, 0.333);
});

test("frame profile normalizes an invalid target refresh rate", () => {
  const profile = createMapFrameProfile("camera", Number.NaN);
  recordMapFrameSample(profile, 1 / 60);

  const report = summarizeMapFrameProfile(profile);
  ok(report);
  equal(report.targetFps, 60);
  equal(report.averageFps, 60);
  equal(report.slowFrameCount, 0);
  equal(report.estimatedDroppedFrames, 0);
  equal(report.withinBudgetRatio, 1);
});

test("frame profile captures renderer counters for cold and warm phases", () => {
  const profile = createMapFrameProfile("battle-cold");
  recordMapFrameSample(profile, 1 / 60, rendererSample());
  recordMapFrameSample(
    profile,
    1 / 60,
    rendererSample({ calls: 25, triangles: 1300, memoryBytes: 2048 }),
  );

  const report = summarizeMapFrameProfile(profile);
  ok(report?.renderer);
  equal(report.kind, "battle-cold");
  equal(report.renderer.sampleCount, 2);
  equal(report.renderer.first.calls, 24);
  equal(report.renderer.last.calls, 25);
  equal(report.renderer.peak.triangles, 1300);
  equal(report.renderer.peak.memoryBytes, 2048);
});

test("renderer stability requires 50 battles and rejects sustained growth", () => {
  const stable = createMapRendererBattleStability();
  for (let index = 0; index < 50; index += 1) {
    recordMapRendererBattleSample(stable, rendererSample());
  }
  const stableReport = summarizeMapRendererBattleStability(stable);
  equal(stableReport.complete, true);
  equal(stableReport.stable, true);
  equal(stableReport.observedBattleCount, 50);
  equal(stableReport.sustainedGrowthFields.length, 0);

  const growing = createMapRendererBattleStability();
  for (let index = 0; index < 50; index += 1) {
    const growth = Math.max(0, index - 39);
    recordMapRendererBattleSample(
      growing,
      rendererSample({ programs: 6 + growth, geometries: 54 + growth }),
    );
  }
  const growingReport = summarizeMapRendererBattleStability(growing);
  equal(growingReport.complete, true);
  equal(growingReport.stable, false);
  ok(growingReport.sustainedGrowthFields.includes("programs"));
  ok(growingReport.sustainedGrowthFields.includes("geometries"));

  const earlyGrowth = createMapRendererBattleStability();
  for (let index = 0; index < 50; index += 1) {
    const growth = Math.min(10, Math.max(0, index - 5));
    recordMapRendererBattleSample(
      earlyGrowth,
      rendererSample({ textures: 8 + growth }),
    );
  }
  const earlyGrowthReport = summarizeMapRendererBattleStability(earlyGrowth);
  equal(earlyGrowthReport.stable, false);
  ok(earlyGrowthReport.sustainedGrowthFields.includes("textures"));
});

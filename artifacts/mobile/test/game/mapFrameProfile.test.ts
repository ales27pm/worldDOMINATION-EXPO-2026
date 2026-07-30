import { equal, ok } from "node:assert/strict";
import { test } from "node:test";

import {
  createMapFrameProfile,
  recordMapFrameSample,
  summarizeMapFrameProfile,
} from "../../game/mapFrameProfile";

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

import { deepEqual, equal } from "node:assert/strict";
import { test } from "node:test";

import {
  assessMapFrameProfile,
  mapFrameQualificationThresholds,
  qualifyMapRendererPerformance,
} from "../../game/mapFrameQualification";
import type {
  MapFrameProfileKind,
  MapFrameProfileReport,
} from "../../game/mapFrameProfile";

function passingReport(
  kind: MapFrameProfileKind,
  overrides: Partial<MapFrameProfileReport> = {},
): MapFrameProfileReport {
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
    ...overrides,
  };
}

test("60 Hz qualification thresholds are explicit and deterministic", () => {
  deepEqual(mapFrameQualificationThresholds(), {
    targetFps: 60,
    frameBudgetMs: 16.667,
    minimumSampleCount: 60,
    minimumDurationMs: 900,
    minimumAverageFps: 58.5,
    maximumP95FrameMs: 18.333,
    maximumP99FrameMs: 33.333,
    maximumDroppedFrameRatio: 0.01,
    minimumWithinBudgetRatio: 0.95,
  });
});

test("frame assessment passes a sustained 60 Hz profile", () => {
  const assessment = assessMapFrameProfile(passingReport("camera"));

  equal(assessment.status, "pass");
  equal(assessment.droppedFrameRatio, 0);
  deepEqual(assessment.failures, []);
});

test("frame assessment reports every violated acceptance condition", () => {
  const assessment = assessMapFrameProfile(
    passingReport("battle", {
      targetFps: 30,
      sampleCount: 30,
      durationMs: 500,
      averageFps: 55,
      p95FrameMs: 24,
      p99FrameMs: 40,
      estimatedDroppedFrames: 4,
      withinBudgetRatio: 0.8,
    }),
  );

  equal(assessment.status, "fail");
  deepEqual(assessment.failures, [
    "target-fps",
    "sample-count",
    "duration",
    "average-fps",
    "p95-frame-time",
    "p99-frame-time",
    "dropped-frame-ratio",
    "within-budget-ratio",
  ]);
});

test("renderer qualification remains pending until camera and battle complete", () => {
  const qualification = qualifyMapRendererPerformance(
    { camera: passingReport("camera") },
    "physical",
  );

  equal(qualification.status, "pending");
  equal(qualification.metricStatus, "pending");
  deepEqual(qualification.missingKinds, ["battle"]);
});

test("browser and simulator metrics are never eligible for the device gate", () => {
  const reports = {
    camera: passingReport("camera"),
    battle: passingReport("battle"),
  };
  const browser = qualifyMapRendererPerformance(reports, "browser");
  const simulator = qualifyMapRendererPerformance(reports, "simulator");

  equal(browser.metricStatus, "pass");
  equal(browser.status, "ineligible");
  equal(simulator.metricStatus, "pass");
  equal(simulator.status, "ineligible");
});

test("only complete passing physical profiles satisfy the performance gate", () => {
  const passing = qualifyMapRendererPerformance(
    {
      camera: passingReport("camera"),
      battle: passingReport("battle"),
    },
    "physical",
  );
  const failing = qualifyMapRendererPerformance(
    {
      camera: passingReport("camera"),
      battle: passingReport("battle", { p95FrameMs: 25 }),
    },
    "physical",
  );

  equal(passing.status, "pass");
  equal(passing.metricStatus, "pass");
  deepEqual(passing.missingKinds, []);
  equal(failing.status, "fail");
  equal(failing.profiles.battle?.assessment.status, "fail");
});

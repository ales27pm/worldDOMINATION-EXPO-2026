import { deepEqual, equal } from "node:assert/strict";
import { test } from "node:test";

import {
  qualifyMapPhysicalPair,
  type MapPhysicalQualificationFailureCode,
  type MapPhysicalPlatform,
} from "../../game/mapPhysicalQualification";
import {
  createMapPerformanceEvidence,
  type MapPerformanceEvidence,
} from "../../game/mapPerformanceEvidence";
import { qualifyMapRendererPerformance } from "../../game/mapFrameQualification";
import type {
  MapFrameProfileKind,
  MapFrameProfileReport,
} from "../../game/mapFrameProfile";

const SOURCE_REVISION = "a".repeat(40);
const NOW = Date.parse("2026-07-30T18:00:00.000Z");

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
  };
}

function physicalEvidence(
  platform: MapPhysicalPlatform,
  overrides: Partial<MapPerformanceEvidence> = {},
): MapPerformanceEvidence {
  const isAndroid = platform === "android";
  const evidence = createMapPerformanceEvidence({
    capturedAt: isAndroid
      ? "2026-07-30T16:00:00.000Z"
      : "2026-07-30T16:20:00.000Z",
    platform,
    application: {
      version: "1.0.0",
      nativeBuildVersion: isAndroid ? "12" : "13",
      sourceRevision: SOURCE_REVISION,
      sessionId: `${platform}-qualification-session`,
    },
    device: {
      modelName: isAndroid ? "Pixel 9" : "iPhone 16",
      modelId: isAndroid ? "tokay" : "iPhone17,3",
      osName: isAndroid ? "Android" : "iOS",
      osVersion: isAndroid ? "16" : "26.3",
      deviceYearClass: 2024,
    },
    scene: {
      contractVersion: 1,
      variant: "classic",
      viewMode: "board",
      revision: "canonical-attack-fixture",
      territoryCount: 42,
    },
    qualification: qualifyMapRendererPerformance(
      {
        camera: passingReport("camera"),
        battle: passingReport("battle"),
      },
      "physical",
    ),
  });
  return {
    ...evidence,
    ...overrides,
  };
}

function failureCodes(
  report: ReturnType<typeof qualifyMapPhysicalPair>,
): MapPhysicalQualificationFailureCode[] {
  return report.failures.map((failure) => failure.code);
}

test("physical qualification passes only for a matching Android and iOS pair", () => {
  const report = qualifyMapPhysicalPair(
    {
      android: physicalEvidence("android"),
      ios: physicalEvidence("ios"),
    },
    {
      expectedSourceRevision: SOURCE_REVISION,
      nowMs: NOW,
    },
  );

  equal(report.status, "pass");
  deepEqual(report.failures, []);
  deepEqual(Object.keys(report.platforms), ["android", "ios"]);
});

test("physical qualification fails closed when one platform is absent", () => {
  const report = qualifyMapPhysicalPair(
    { android: physicalEvidence("android") },
    {
      expectedSourceRevision: SOURCE_REVISION,
      nowMs: NOW,
    },
  );

  equal(report.status, "fail");
  deepEqual(failureCodes(report), ["missing-platform"]);
  equal(report.failures[0]?.platform, "ios");
});

test("simulator metrics remain ineligible even when their numbers pass", () => {
  const ios = physicalEvidence("ios");
  ios.qualification = qualifyMapRendererPerformance(
    {
      camera: passingReport("camera"),
      battle: passingReport("battle"),
    },
    "simulator",
  );
  ios.device.modelName = "Simulator iOS";
  ios.device.modelId = "x86_64";

  const report = qualifyMapPhysicalPair(
    { android: physicalEvidence("android"), ios },
    {
      expectedSourceRevision: SOURCE_REVISION,
      nowMs: NOW,
    },
  );

  const codes = failureCodes(report);
  equal(codes.includes("physical-environment"), true);
  equal(codes.includes("qualification-status"), true);
  equal(codes.includes("device-provenance"), true);
});

test("source and application provenance must identify the exact commit", () => {
  const android = physicalEvidence("android");
  android.application.sourceRevision = "b".repeat(40);
  android.application.nativeBuildVersion = null;

  const report = qualifyMapPhysicalPair(
    { android, ios: physicalEvidence("ios") },
    {
      expectedSourceRevision: SOURCE_REVISION,
      nowMs: NOW,
    },
  );

  const codes = failureCodes(report);
  equal(codes.includes("source-revision"), true);
  equal(codes.includes("application-provenance"), true);
});

test("both platforms must profile the same canonical fixture and app version", () => {
  const ios = physicalEvidence("ios");
  ios.application.version = "1.0.1";
  ios.scene = {
    ...ios.scene,
    variant: "expanded",
    revision: "different-fixture",
    territoryCount: 48,
  };

  const report = qualifyMapPhysicalPair(
    { android: physicalEvidence("android"), ios },
    {
      expectedSourceRevision: SOURCE_REVISION,
      nowMs: NOW,
    },
  );

  const codes = failureCodes(report);
  equal(codes.includes("application-version-pair"), true);
  equal(codes.includes("scene-fixture-pair"), true);
});

test("stale, future, and widely separated captures cannot form a pair", () => {
  const android = physicalEvidence("android", {
    capturedAt: "2026-07-20T16:00:00.000Z",
  });
  const ios = physicalEvidence("ios", {
    capturedAt: "2026-07-30T19:00:00.000Z",
  });

  const report = qualifyMapPhysicalPair(
    { android, ios },
    {
      expectedSourceRevision: SOURCE_REVISION,
      nowMs: NOW,
      maximumEvidenceAgeMs: 24 * 60 * 60 * 1000,
      maximumPairSkewMs: 60 * 60 * 1000,
    },
  );

  const codes = failureCodes(report);
  equal(codes.includes("evidence-expired"), true);
  equal(codes.includes("evidence-from-future"), true);
  equal(codes.includes("capture-window-pair"), true);
});

test("obvious virtual-device identities are rejected independently of flags", () => {
  const android = physicalEvidence("android");
  android.device.modelName = "Android SDK built for x86_64";
  android.device.modelId = "sdk_gphone64_x86_64";

  const report = qualifyMapPhysicalPair(
    { android, ios: physicalEvidence("ios") },
    {
      expectedSourceRevision: SOURCE_REVISION,
      nowMs: NOW,
    },
  );

  equal(failureCodes(report).includes("device-provenance"), true);
});

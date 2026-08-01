import { deepEqual, equal } from "node:assert/strict";
import { test } from "node:test";

import {
  qualifyMapReleasePair,
  type MapReleasePlatform,
  type MapReleaseQualificationFailureCode,
} from "../../game/mapReleaseQualification";
import {
  createMapPerformanceEvidence,
  type MapPerformanceEvidence,
} from "../../game/mapPerformanceEvidence";
import { qualifyMapRendererPerformance } from "../../game/mapFrameQualification";
import type {
  MapFrameProfileKind,
  MapFrameProfileReport,
  MapRendererInfoSample,
} from "../../game/mapFrameProfile";
import {
  createMapRendererBattleStability,
  recordMapRendererBattleSample,
  summarizeMapRendererBattleStability,
} from "../../game/mapFrameProfile";
import type { MapPerformanceEnvironment } from "../../game/mapFrameQualification";

const SOURCE_REVISION = "a".repeat(40);
const NOW = Date.parse("2026-07-30T18:00:00.000Z");

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
    renderer: {
      contractVersion: 1,
      sampleCount: 120,
      first: RENDERER_SAMPLE,
      last: RENDERER_SAMPLE,
      peak: RENDERER_SAMPLE,
    },
    ...overrides,
  };
}

function passingQualification(
  environment: MapPerformanceEnvironment,
  battleOverrides: Partial<MapFrameProfileReport> = {},
) {
  return qualifyMapRendererPerformance(
    {
      camera: passingReport("camera"),
      battle: passingReport("battle", battleOverrides),
      "battle-cold": passingReport("battle-cold"),
      "battle-warm": passingReport("battle-warm"),
      "conquest-pulse": passingReport("conquest-pulse"),
    },
    environment,
  );
}

function passingR3FEvidence(): NonNullable<MapPerformanceEvidence["r3f"]> {
  const stability = createMapRendererBattleStability();
  for (let index = 0; index < 50; index += 1) {
    recordMapRendererBattleSample(stability, RENDERER_SAMPLE);
  }
  return {
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
  };
}

function physicalEvidence(
  platform: MapReleasePlatform,
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
    qualification: passingQualification("physical"),
    r3f: passingR3FEvidence(),
  });
  return {
    ...evidence,
    ...overrides,
  };
}

function failureCodes(
  report: ReturnType<typeof qualifyMapReleasePair>,
): MapReleaseQualificationFailureCode[] {
  return report.failures.map((failure) => failure.code);
}

test("release qualification passes for a matching physical Android and iOS pair", () => {
  const report = qualifyMapReleasePair(
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

test("release qualification fails closed when one platform is absent", () => {
  const report = qualifyMapReleasePair(
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

test("Android simulator metrics can pair with physical iOS", () => {
  const android = physicalEvidence("android");
  android.qualification = passingQualification("simulator");
  android.device.modelName = "Android SDK built for x86_64";
  android.device.modelId = null;

  const report = qualifyMapReleasePair(
    { android, ios: physicalEvidence("ios") },
    {
      expectedSourceRevision: SOURCE_REVISION,
      nowMs: NOW,
    },
  );

  equal(report.status, "pass");
  deepEqual(report.failures, []);
  equal(report.platforms.android?.environment, "simulator");
  equal(report.platforms.android?.qualificationStatus, "ineligible");
  deepEqual(report.acceptedEnvironments.android, ["simulator", "physical"]);
  deepEqual(report.acceptedEnvironments.ios, ["physical"]);
});

test("Android simulator evidence still requires passing performance profiles", () => {
  const android = physicalEvidence("android");
  android.qualification = passingQualification("simulator", {
    p95FrameMs: 25,
  });
  android.device.modelName = "sdk_gphone64_x86_64";
  android.device.modelId = null;

  const report = qualifyMapReleasePair(
    { android, ios: physicalEvidence("ios") },
    {
      expectedSourceRevision: SOURCE_REVISION,
      nowMs: NOW,
    },
  );

  equal(report.status, "fail");
  equal(failureCodes(report).includes("metric-status"), true);
  equal(failureCodes(report).includes("profile-status"), true);
});

test("iOS simulator metrics remain ineligible for the release pair", () => {
  const ios = physicalEvidence("ios");
  ios.qualification = passingQualification("simulator");
  ios.device.modelName = "Simulator iOS";
  ios.device.modelId = "x86_64";

  const report = qualifyMapReleasePair(
    { android: physicalEvidence("android"), ios },
    {
      expectedSourceRevision: SOURCE_REVISION,
      nowMs: NOW,
    },
  );

  const codes = failureCodes(report);
  equal(codes.includes("qualification-environment"), true);
  equal(codes.includes("device-provenance"), true);
});

test("source and application provenance must identify the exact commit", () => {
  const android = physicalEvidence("android");
  android.application.sourceRevision = "b".repeat(40);
  android.application.nativeBuildVersion = null;

  const report = qualifyMapReleasePair(
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

  const report = qualifyMapReleasePair(
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

  const report = qualifyMapReleasePair(
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

test("virtual-device identities are rejected for physical evidence", () => {
  const android = physicalEvidence("android");
  android.device.modelName = "Android SDK built for x86_64";
  android.device.modelId = "sdk_gphone64_x86_64";

  const report = qualifyMapReleasePair(
    { android, ios: physicalEvidence("ios") },
    {
      expectedSourceRevision: SOURCE_REVISION,
      nowMs: NOW,
    },
  );

  equal(failureCodes(report).includes("device-provenance"), true);
});

test("release qualification requires qualified shaders and 50 stable battles", () => {
  const android = physicalEvidence("android");
  android.r3f = undefined;
  const ios = physicalEvidence("ios");
  ios.r3f!.shaderCompilation.orderReveal = false;
  ios.r3f!.rendererStability = {
    ...ios.r3f!.rendererStability,
    observedBattleCount: 49,
    complete: false,
    stable: false,
  };
  delete ios.qualification.profiles["battle-warm"];

  const report = qualifyMapReleasePair(
    { android, ios },
    {
      expectedSourceRevision: SOURCE_REVISION,
      nowMs: NOW,
    },
  );

  const codes = failureCodes(report);
  equal(codes.includes("r3f-evidence"), true);
  equal(codes.includes("shader-compilation"), true);
  equal(codes.includes("renderer-stability"), true);
  equal(codes.includes("missing-profile"), true);
});

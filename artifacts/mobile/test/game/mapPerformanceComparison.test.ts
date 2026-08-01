import { deepEqual, equal } from "node:assert/strict";
import { test } from "node:test";

import { qualifyMapAdaptationRelease } from "../../game/mapAdaptationReleaseQualification";
import {
  compareMapPerformanceEvidence,
  type MapPerformanceComparisonFailureCode,
} from "../../game/mapPerformanceComparison";
import {
  createMapPerformanceEvidence,
  type MapPerformanceEvidence,
} from "../../game/mapPerformanceEvidence";
import { qualifyMapRendererPerformance } from "../../game/mapFrameQualification";
import {
  createMapRendererBattleStability,
  recordMapRendererBattleSample,
  summarizeMapRendererBattleStability,
  type MapFrameProfileKind,
  type MapFrameProfileReport,
  type MapRendererInfoSample,
} from "../../game/mapFrameProfile";
import type { R3FFeatureFlags } from "../../game/r3fFeatureFlags";

const SOURCE_REVISION = "a".repeat(40);

const RENDERER_SAMPLE: MapRendererInfoSample = {
  calls: 32,
  triangles: 1600,
  points: 0,
  lines: 48,
  programs: 7,
  geometries: 54,
  textures: 8,
  memoryBytes: 4096,
};

const BASELINE_FLAGS: R3FFeatureFlags = {
  battleInstancing: false,
  conquestPulse: false,
  orderReveal: false,
  stylizedWater: false,
  qualification: true,
};

const VARIANT_FLAGS: R3FFeatureFlags = {
  battleInstancing: true,
  conquestPulse: true,
  orderReveal: true,
  stylizedWater: false,
  qualification: true,
};

interface EvidenceOptions {
  platform?: "android" | "ios";
  sourceRevision?: string;
  capturedAt?: string;
  sessionId?: string;
  applicationVersion?: string;
  modelId?: string;
  modelName?: string;
  osName?: string;
  osVersion?: string;
  sceneRevision?: string;
  cold?: Partial<MapFrameProfileReport>;
  warm?: Partial<MapFrameProfileReport>;
  renderer?: Partial<MapRendererInfoSample>;
  battleCount?: number;
  featureFlags?: R3FFeatureFlags;
  shadersCompiled?: boolean;
}

function passingReport(
  kind: MapFrameProfileKind,
  overrides: Partial<MapFrameProfileReport> = {},
  rendererOverrides: Partial<MapRendererInfoSample> = {},
): MapFrameProfileReport {
  const rendererSample = { ...RENDERER_SAMPLE, ...rendererOverrides };
  return {
    contractVersion: 1,
    kind,
    targetFps: 60,
    sampleCount: 120,
    durationMs: 2000,
    averageFps: 60,
    p50FrameMs: 16,
    p95FrameMs: 16,
    p99FrameMs: 20,
    maxFrameMs: 24,
    slowFrameCount: 2,
    estimatedDroppedFrames: 0,
    withinBudgetRatio: 0.983,
    renderer: {
      contractVersion: 1,
      sampleCount: 120,
      first: rendererSample,
      last: rendererSample,
      peak: rendererSample,
    },
    ...overrides,
  };
}

function evidence(
  side: "baseline" | "variant",
  options: EvidenceOptions = {},
): MapPerformanceEvidence {
  const platform = options.platform ?? "ios";
  const renderer =
    side === "variant"
      ? {
          calls: 25,
          triangles: 1300,
          programs: 6,
          memoryBytes: 3072,
          ...options.renderer,
        }
      : options.renderer;
  const stability = createMapRendererBattleStability();
  for (let index = 0; index < (options.battleCount ?? 50); index += 1) {
    recordMapRendererBattleSample(stability, {
      ...RENDERER_SAMPLE,
      ...renderer,
    });
  }

  return createMapPerformanceEvidence({
    capturedAt:
      options.capturedAt ??
      (side === "baseline"
        ? "2026-07-30T12:00:00.000Z"
        : "2026-07-30T12:30:00.000Z"),
    platform,
    application: {
      version: options.applicationVersion ?? "1.0.0",
      nativeBuildVersion: side === "baseline" ? "20" : "21",
      sourceRevision: options.sourceRevision ?? SOURCE_REVISION,
      sessionId: options.sessionId ?? `${side}-session`,
    },
    device: {
      modelName:
        options.modelName ??
        (platform === "android" ? "Pixel 9 Pro" : "iPhone 16 Pro"),
      modelId:
        options.modelId ?? (platform === "android" ? "komodo" : "iPhone17,1"),
      osName: options.osName ?? (platform === "android" ? "Android" : "iOS"),
      osVersion: options.osVersion ?? (platform === "android" ? "16" : "26.3"),
      deviceYearClass: 2024,
    },
    scene: {
      contractVersion: 1,
      variant: "classic",
      viewMode: "board",
      revision: options.sceneRevision ?? "canonical-attack-fixture",
      territoryCount: 42,
    },
    qualification: qualifyMapRendererPerformance(
      {
        camera: passingReport("camera"),
        battle: passingReport("battle"),
        "battle-cold": passingReport("battle-cold", options.cold, renderer),
        "battle-warm": passingReport("battle-warm", options.warm, renderer),
        "conquest-pulse": passingReport("conquest-pulse", {}, renderer),
      },
      "physical",
    ),
    r3f: {
      featureFlags:
        options.featureFlags ??
        (side === "baseline" ? BASELINE_FLAGS : VARIANT_FLAGS),
      shaderCompilation: {
        conquestPulse: side === "variant" && options.shadersCompiled !== false,
        orderReveal: side === "variant" && options.shadersCompiled !== false,
      },
      rendererStability: summarizeMapRendererBattleStability(stability),
    },
  });
}

function failureCodes(
  report: ReturnType<typeof compareMapPerformanceEvidence>,
): MapPerformanceComparisonFailureCode[] {
  return report.failures.map((failure) => failure.code);
}

test("matching 50-battle evidence reports cold and warm adaptation deltas", () => {
  const baseline = evidence("baseline", {
    cold: { averageFps: 59 },
    warm: { averageFps: 59 },
  });
  const variant = evidence("variant", {
    cold: { averageFps: 59, p95FrameMs: 16.5, p99FrameMs: 20.5 },
    warm: { averageFps: 60, p95FrameMs: 16.4, p99FrameMs: 20.5 },
  });

  const report = compareMapPerformanceEvidence(baseline, variant, {
    expectedSourceRevision: SOURCE_REVISION,
  });

  equal(report.status, "pass");
  deepEqual(report.failures, []);
  equal(report.warmRegressionGate.status, "pass");
  equal(report.warmRegressionGate.p95RegressionPercent, 2.5);
  equal(report.warmRegressionGate.p99RegressionPercent, 2.5);
  equal(report.phases["battle-warm"]?.peakDrawCalls.baseline, 32);
  equal(report.phases["battle-warm"]?.peakDrawCalls.variant, 25);
  equal(report.phases["battle-warm"]?.peakDrawCalls.percentChange, -21.875);
  equal(report.phases["battle-cold"]?.peakTriangles.variant, 1300);
  equal(report.phases["battle-warm"]?.peakMemoryBytes.variant, 3072);
});

test("warm p95 and p99 allow exactly five percent and reject any excess", () => {
  const baseline = evidence("baseline");
  const atLimit = compareMapPerformanceEvidence(
    baseline,
    evidence("variant", {
      warm: { p95FrameMs: 16.8, p99FrameMs: 21 },
    }),
    { expectedSourceRevision: SOURCE_REVISION },
  );

  equal(atLimit.status, "pass");
  equal(atLimit.warmRegressionGate.p95RegressionPercent, 5);
  equal(atLimit.warmRegressionGate.p99RegressionPercent, 5);

  const overLimit = compareMapPerformanceEvidence(
    baseline,
    evidence("variant", {
      warm: { p95FrameMs: 16.801, p99FrameMs: 21.001 },
    }),
    { expectedSourceRevision: SOURCE_REVISION },
  );

  equal(overLimit.status, "fail");
  equal(failureCodes(overLimit).includes("warm-p95-regression"), true);
  equal(failureCodes(overLimit).includes("warm-p99-regression"), true);
});

test("comparison fails closed on mismatched provenance, flags, and battle count", () => {
  const baseline = evidence("baseline", {
    sourceRevision: "b".repeat(40),
    sessionId: "shared-session",
  });
  const variant = evidence("variant", {
    capturedAt: "2026-08-01T14:00:00.000Z",
    sessionId: "shared-session",
    applicationVersion: "1.0.1",
    modelId: "iPhone17,2",
    sceneRevision: "different-fixture",
    battleCount: 49,
    featureFlags: { ...VARIANT_FLAGS, stylizedWater: true },
  });

  const report = compareMapPerformanceEvidence(baseline, variant, {
    expectedSourceRevision: SOURCE_REVISION,
  });
  const codes = failureCodes(report);

  equal(report.status, "fail");
  for (const code of [
    "baseline-source-revision",
    "application-version-pair",
    "device-pair",
    "scene-fixture-pair",
    "session-pair",
    "capture-window-pair",
    "variant-feature-flags",
    "variant-renderer-stability",
  ] as const) {
    equal(codes.includes(code), true, `missing ${code}`);
  }
});

test("comparison requires both phase profiles, renderer counters, and shaders", () => {
  const baseline = evidence("baseline");
  const variant = evidence("variant", { shadersCompiled: false });
  delete baseline.qualification.profiles["battle-cold"];
  delete variant.qualification.profiles["battle-warm"]!.report.renderer;

  const report = compareMapPerformanceEvidence(baseline, variant, {
    expectedSourceRevision: SOURCE_REVISION,
  });
  const codes = failureCodes(report);

  equal(report.status, "fail");
  equal(codes.includes("baseline-profile"), true);
  equal(codes.includes("variant-renderer-counters"), true);
  equal(codes.includes("variant-shader-compilation"), true);
  equal(report.warmRegressionGate.status, "pass");
});

test("adaptation release requires passing Android and physical iOS comparisons", () => {
  const capturedAt = "2026-07-30T12:00:00.000Z";
  const androidBaseline = evidence("baseline", {
    platform: "android",
    capturedAt,
    sessionId: "android-baseline",
  });
  const androidVariant = evidence("variant", {
    platform: "android",
    capturedAt: "2026-07-30T12:20:00.000Z",
    sessionId: "android-variant",
  });
  const iosBaseline = evidence("baseline", {
    capturedAt: "2026-07-30T12:40:00.000Z",
    sessionId: "ios-baseline",
  });
  const iosVariant = evidence("variant", {
    capturedAt: "2026-07-30T13:00:00.000Z",
    sessionId: "ios-variant",
  });

  const passing = qualifyMapAdaptationRelease(
    {
      android: { baseline: androidBaseline, variant: androidVariant },
      ios: { baseline: iosBaseline, variant: iosVariant },
    },
    {
      expectedSourceRevision: SOURCE_REVISION,
      nowMs: Date.parse("2026-07-30T14:00:00.000Z"),
    },
  );

  equal(passing.status, "pass");
  equal(passing.release.status, "pass");
  equal(passing.comparisons.android.status, "pass");
  equal(passing.comparisons.ios.status, "pass");

  const regressedIosVariant = evidence("variant", {
    capturedAt: "2026-07-30T13:00:00.000Z",
    sessionId: "ios-regressed-variant",
    warm: { p95FrameMs: 17, p99FrameMs: 21.1 },
  });
  const rejected = qualifyMapAdaptationRelease(
    {
      android: { baseline: androidBaseline, variant: androidVariant },
      ios: { baseline: iosBaseline, variant: regressedIosVariant },
    },
    {
      expectedSourceRevision: SOURCE_REVISION,
      nowMs: Date.parse("2026-07-30T14:00:00.000Z"),
    },
  );

  equal(rejected.status, "fail");
  equal(rejected.release.status, "pass");
  equal(rejected.comparisons.ios.status, "fail");
});

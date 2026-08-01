import type { MapPerformanceEvidence } from "./mapPerformanceEvidence";
import type {
  MapFrameProfileKind,
  MapFrameProfileReport,
} from "./mapFrameProfile";
import type { R3FFeatureFlags } from "./r3fFeatureFlags";

export const MAP_PERFORMANCE_COMPARISON_PHASES = [
  "battle-cold",
  "battle-warm",
] as const satisfies readonly MapFrameProfileKind[];

export type MapPerformanceComparisonPhase =
  (typeof MAP_PERFORMANCE_COMPARISON_PHASES)[number];

export type MapPerformanceComparisonFailureCode =
  | "expected-source-revision"
  | "baseline-source-revision"
  | "variant-source-revision"
  | "platform-pair"
  | "environment-pair"
  | "application-version-pair"
  | "device-pair"
  | "scene-fixture-pair"
  | "session-pair"
  | "capture-window-pair"
  | "baseline-r3f-evidence"
  | "variant-r3f-evidence"
  | "baseline-feature-flags"
  | "variant-feature-flags"
  | "variant-shader-compilation"
  | "baseline-renderer-stability"
  | "variant-renderer-stability"
  | "baseline-profile"
  | "variant-profile"
  | "baseline-profile-status"
  | "variant-profile-status"
  | "baseline-renderer-counters"
  | "variant-renderer-counters"
  | "warm-p95-regression"
  | "warm-p99-regression";

export interface MapPerformanceComparisonFailure {
  code: MapPerformanceComparisonFailureCode;
  phase?: MapPerformanceComparisonPhase;
  detail: string;
}

export interface MapPerformanceMetricComparison {
  baseline: number | null;
  variant: number | null;
  delta: number | null;
  percentChange: number | null;
}

export interface MapPerformancePhaseComparison {
  phase: MapPerformanceComparisonPhase;
  averageFps: MapPerformanceMetricComparison;
  p95FrameMs: MapPerformanceMetricComparison;
  p99FrameMs: MapPerformanceMetricComparison;
  peakDrawCalls: MapPerformanceMetricComparison;
  peakTriangles: MapPerformanceMetricComparison;
  peakPrograms: MapPerformanceMetricComparison;
  peakMemoryBytes: MapPerformanceMetricComparison;
}

export interface MapPerformanceComparisonEvidenceSummary {
  capturedAt: string;
  platform: MapPerformanceEvidence["platform"];
  environment: MapPerformanceEvidence["qualification"]["environment"];
  applicationVersion: string | null;
  nativeBuildVersion: string | null;
  sourceRevision: string | null;
  sessionId: string;
  device: MapPerformanceEvidence["device"];
  scene: MapPerformanceEvidence["scene"];
  featureFlags: R3FFeatureFlags | null;
  rendererStability: {
    requiredBattleCount: number;
    observedBattleCount: number;
    complete: boolean;
    stable: boolean;
  } | null;
}

export interface MapPerformanceWarmRegressionGate {
  status: "pass" | "fail" | "unavailable";
  maximumRegressionPercent: number;
  p95RegressionPercent: number | null;
  p99RegressionPercent: number | null;
}

export interface MapPerformanceComparisonReport {
  contractVersion: 1;
  status: "pass" | "fail";
  expectedSourceRevision: string;
  maximumCaptureSkewMs: number;
  baseline: MapPerformanceComparisonEvidenceSummary;
  variant: MapPerformanceComparisonEvidenceSummary;
  phases: Record<
    MapPerformanceComparisonPhase,
    MapPerformancePhaseComparison | null
  >;
  warmRegressionGate: MapPerformanceWarmRegressionGate;
  failures: MapPerformanceComparisonFailure[];
}

export interface MapPerformanceComparisonOptions {
  expectedSourceRevision: string;
  maximumWarmRegressionPercent?: number;
  maximumCaptureSkewMs?: number;
}

const FULL_GIT_REVISION = /^[0-9a-f]{40}$/i;
const DEFAULT_MAXIMUM_WARM_REGRESSION_PERCENT = 5;
const DEFAULT_MAXIMUM_CAPTURE_SKEW_MS = 24 * 60 * 60 * 1000;
const MINIMUM_BATTLE_COUNT = 50;
const FLOAT_COMPARISON_EPSILON = 1e-9;

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
  stylizedWater: true,
  qualification: true,
};

function rounded(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function normalizedPositive(value: number | undefined, fallback: number) {
  return Number.isFinite(value) && (value ?? 0) > 0
    ? (value as number)
    : fallback;
}

function metricComparison(
  baseline: number | null,
  variant: number | null,
): MapPerformanceMetricComparison {
  if (baseline === null || variant === null) {
    return { baseline, variant, delta: null, percentChange: null };
  }
  const delta = variant - baseline;
  return {
    baseline,
    variant,
    delta: rounded(delta),
    percentChange: baseline === 0 ? null : rounded((delta / baseline) * 100),
  };
}

function evidenceSummary(
  evidence: MapPerformanceEvidence,
): MapPerformanceComparisonEvidenceSummary {
  const stability = evidence.r3f?.rendererStability;
  return {
    capturedAt: evidence.capturedAt,
    platform: evidence.platform,
    environment: evidence.qualification.environment,
    applicationVersion: evidence.application.version,
    nativeBuildVersion: evidence.application.nativeBuildVersion,
    sourceRevision: evidence.application.sourceRevision,
    sessionId: evidence.application.sessionId,
    device: { ...evidence.device },
    scene: { ...evidence.scene },
    featureFlags: evidence.r3f ? { ...evidence.r3f.featureFlags } : null,
    rendererStability: stability
      ? {
          requiredBattleCount: stability.requiredBattleCount,
          observedBattleCount: stability.observedBattleCount,
          complete: stability.complete,
          stable: stability.stable,
        }
      : null,
  };
}

function sameDevice(
  baseline: MapPerformanceEvidence,
  variant: MapPerformanceEvidence,
): boolean {
  return (
    baseline.device.modelName === variant.device.modelName &&
    baseline.device.modelId === variant.device.modelId &&
    baseline.device.osName === variant.device.osName &&
    baseline.device.osVersion === variant.device.osVersion &&
    baseline.device.deviceYearClass === variant.device.deviceYearClass
  );
}

function sameScene(
  baseline: MapPerformanceEvidence,
  variant: MapPerformanceEvidence,
): boolean {
  return (
    baseline.scene.contractVersion === variant.scene.contractVersion &&
    baseline.scene.variant === variant.scene.variant &&
    baseline.scene.viewMode === variant.scene.viewMode &&
    baseline.scene.revision === variant.scene.revision &&
    baseline.scene.territoryCount === variant.scene.territoryCount
  );
}

function sameFlags(
  actual: R3FFeatureFlags,
  expected: R3FFeatureFlags,
): boolean {
  return (Object.keys(expected) as Array<keyof R3FFeatureFlags>).every(
    (key) => actual[key] === expected[key],
  );
}

function stableBattleRun(evidence: MapPerformanceEvidence): boolean {
  const stability = evidence.r3f?.rendererStability;
  return Boolean(
    stability &&
    stability.requiredBattleCount >= MINIMUM_BATTLE_COUNT &&
    stability.observedBattleCount >= stability.requiredBattleCount &&
    stability.complete &&
    stability.stable,
  );
}

function phaseReport(
  evidence: MapPerformanceEvidence,
  phase: MapPerformanceComparisonPhase,
): MapFrameProfileReport | null {
  return evidence.qualification.profiles[phase]?.report ?? null;
}

function comparePhase(
  phase: MapPerformanceComparisonPhase,
  baseline: MapFrameProfileReport | null,
  variant: MapFrameProfileReport | null,
): MapPerformancePhaseComparison | null {
  if (!baseline || !variant) return null;
  return {
    phase,
    averageFps: metricComparison(baseline.averageFps, variant.averageFps),
    p95FrameMs: metricComparison(baseline.p95FrameMs, variant.p95FrameMs),
    p99FrameMs: metricComparison(baseline.p99FrameMs, variant.p99FrameMs),
    peakDrawCalls: metricComparison(
      baseline.renderer?.peak.calls ?? null,
      variant.renderer?.peak.calls ?? null,
    ),
    peakTriangles: metricComparison(
      baseline.renderer?.peak.triangles ?? null,
      variant.renderer?.peak.triangles ?? null,
    ),
    peakPrograms: metricComparison(
      baseline.renderer?.peak.programs ?? null,
      variant.renderer?.peak.programs ?? null,
    ),
    peakMemoryBytes: metricComparison(
      baseline.renderer?.peak.memoryBytes ?? null,
      variant.renderer?.peak.memoryBytes ?? null,
    ),
  };
}

function pushFailure(
  failures: MapPerformanceComparisonFailure[],
  code: MapPerformanceComparisonFailureCode,
  detail: string,
  phase?: MapPerformanceComparisonPhase,
): void {
  failures.push({ code, detail, ...(phase ? { phase } : {}) });
}

function validateProfiles(
  evidence: MapPerformanceEvidence,
  side: "baseline" | "variant",
  failures: MapPerformanceComparisonFailure[],
): void {
  for (const phase of MAP_PERFORMANCE_COMPARISON_PHASES) {
    const profile = evidence.qualification.profiles[phase];
    if (!profile) {
      pushFailure(
        failures,
        `${side}-profile`,
        `${side} evidence is missing its ${phase} profile.`,
        phase,
      );
      continue;
    }
    if (profile.assessment.status !== "pass") {
      pushFailure(
        failures,
        `${side}-profile-status`,
        `${side} ${phase} profile did not pass its absolute thresholds.`,
        phase,
      );
    }
    if (!profile.report.renderer) {
      pushFailure(
        failures,
        `${side}-renderer-counters`,
        `${side} ${phase} profile has no renderer counters.`,
        phase,
      );
    }
  }
}

export function compareMapPerformanceEvidence(
  baseline: MapPerformanceEvidence,
  variant: MapPerformanceEvidence,
  options: MapPerformanceComparisonOptions,
): MapPerformanceComparisonReport {
  const failures: MapPerformanceComparisonFailure[] = [];
  const expectedSourceRevision = options.expectedSourceRevision
    .trim()
    .toLowerCase();
  const maximumWarmRegressionPercent = normalizedPositive(
    options.maximumWarmRegressionPercent,
    DEFAULT_MAXIMUM_WARM_REGRESSION_PERCENT,
  );
  const maximumCaptureSkewMs = normalizedPositive(
    options.maximumCaptureSkewMs,
    DEFAULT_MAXIMUM_CAPTURE_SKEW_MS,
  );

  if (!FULL_GIT_REVISION.test(expectedSourceRevision)) {
    pushFailure(
      failures,
      "expected-source-revision",
      "The expected source revision must be a full 40-character Git SHA.",
    );
  }
  for (const [side, evidence] of [
    ["baseline", baseline],
    ["variant", variant],
  ] as const) {
    if (
      !FULL_GIT_REVISION.test(evidence.application.sourceRevision ?? "") ||
      evidence.application.sourceRevision?.toLowerCase() !==
        expectedSourceRevision
    ) {
      pushFailure(
        failures,
        `${side}-source-revision`,
        `${side} source revision does not match ${expectedSourceRevision}.`,
      );
    }
  }

  if (baseline.platform !== variant.platform) {
    pushFailure(
      failures,
      "platform-pair",
      `Baseline platform ${baseline.platform} does not match variant platform ${variant.platform}.`,
    );
  }
  if (
    baseline.qualification.environment !== variant.qualification.environment
  ) {
    pushFailure(
      failures,
      "environment-pair",
      `Baseline environment ${baseline.qualification.environment} does not match variant environment ${variant.qualification.environment}.`,
    );
  }
  if (
    !baseline.application.version ||
    baseline.application.version !== variant.application.version
  ) {
    pushFailure(
      failures,
      "application-version-pair",
      "Baseline and variant must identify the same non-empty application version.",
    );
  }
  if (!sameDevice(baseline, variant)) {
    pushFailure(
      failures,
      "device-pair",
      "Baseline and variant must come from the same device and OS version.",
    );
  }
  if (!sameScene(baseline, variant)) {
    pushFailure(
      failures,
      "scene-fixture-pair",
      "Baseline and variant must use the same map scene fixture.",
    );
  }
  if (baseline.application.sessionId === variant.application.sessionId) {
    pushFailure(
      failures,
      "session-pair",
      "Baseline and variant must be captured in separate sessions.",
    );
  }
  if (
    Math.abs(Date.parse(baseline.capturedAt) - Date.parse(variant.capturedAt)) >
    maximumCaptureSkewMs
  ) {
    pushFailure(
      failures,
      "capture-window-pair",
      `Baseline and variant captures exceed the ${maximumCaptureSkewMs} ms comparison window.`,
    );
  }

  if (!baseline.r3f) {
    pushFailure(
      failures,
      "baseline-r3f-evidence",
      "Baseline evidence is missing its R3F qualification payload.",
    );
  } else {
    if (!sameFlags(baseline.r3f.featureFlags, BASELINE_FLAGS)) {
      pushFailure(
        failures,
        "baseline-feature-flags",
        "Baseline must disable instancing, pulse, reveal, and water while retaining qualification mode.",
      );
    }
    if (!stableBattleRun(baseline)) {
      pushFailure(
        failures,
        "baseline-renderer-stability",
        "Baseline must complete at least 50 battles without sustained renderer-resource growth.",
      );
    }
  }

  if (!variant.r3f) {
    pushFailure(
      failures,
      "variant-r3f-evidence",
      "Variant evidence is missing its R3F qualification payload.",
    );
  } else {
    if (!sameFlags(variant.r3f.featureFlags, VARIANT_FLAGS)) {
      pushFailure(
        failures,
        "variant-feature-flags",
        "Variant must enable instancing, pulse, and reveal while keeping water disabled.",
      );
    }
    if (
      !variant.r3f.shaderCompilation.conquestPulse ||
      !variant.r3f.shaderCompilation.orderReveal
    ) {
      pushFailure(
        failures,
        "variant-shader-compilation",
        "Variant evidence must prove both adaptation shaders compiled and rendered.",
      );
    }
    if (!stableBattleRun(variant)) {
      pushFailure(
        failures,
        "variant-renderer-stability",
        "Variant must complete at least 50 battles without sustained renderer-resource growth.",
      );
    }
  }

  validateProfiles(baseline, "baseline", failures);
  validateProfiles(variant, "variant", failures);

  const phases = Object.fromEntries(
    MAP_PERFORMANCE_COMPARISON_PHASES.map((phase) => [
      phase,
      comparePhase(
        phase,
        phaseReport(baseline, phase),
        phaseReport(variant, phase),
      ),
    ]),
  ) as MapPerformanceComparisonReport["phases"];
  const warm = phases["battle-warm"];
  const p95RegressionPercent = warm?.p95FrameMs.percentChange ?? null;
  const p99RegressionPercent = warm?.p99FrameMs.percentChange ?? null;

  if (
    p95RegressionPercent !== null &&
    p95RegressionPercent - maximumWarmRegressionPercent >
      FLOAT_COMPARISON_EPSILON
  ) {
    pushFailure(
      failures,
      "warm-p95-regression",
      `Warm p95 regressed ${p95RegressionPercent}%, above the ${maximumWarmRegressionPercent}% limit.`,
      "battle-warm",
    );
  }
  if (
    p99RegressionPercent !== null &&
    p99RegressionPercent - maximumWarmRegressionPercent >
      FLOAT_COMPARISON_EPSILON
  ) {
    pushFailure(
      failures,
      "warm-p99-regression",
      `Warm p99 regressed ${p99RegressionPercent}%, above the ${maximumWarmRegressionPercent}% limit.`,
      "battle-warm",
    );
  }

  const warmGateStatus =
    p95RegressionPercent === null || p99RegressionPercent === null
      ? "unavailable"
      : p95RegressionPercent - maximumWarmRegressionPercent >
            FLOAT_COMPARISON_EPSILON ||
          p99RegressionPercent - maximumWarmRegressionPercent >
            FLOAT_COMPARISON_EPSILON
        ? "fail"
        : "pass";

  return {
    contractVersion: 1,
    status: failures.length === 0 ? "pass" : "fail",
    expectedSourceRevision,
    maximumCaptureSkewMs,
    baseline: evidenceSummary(baseline),
    variant: evidenceSummary(variant),
    phases,
    warmRegressionGate: {
      status: warmGateStatus,
      maximumRegressionPercent: maximumWarmRegressionPercent,
      p95RegressionPercent,
      p99RegressionPercent,
    },
    failures,
  };
}

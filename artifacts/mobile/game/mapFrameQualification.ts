import type {
  MapFrameProfileKind,
  MapFrameProfileReport,
} from "./mapFrameProfile";

export const REQUIRED_MAP_FRAME_PROFILE_KINDS = [
  "camera",
  "battle",
] as const satisfies readonly MapFrameProfileKind[];

export type MapPerformanceEnvironment =
  | "browser"
  | "simulator"
  | "physical";

export interface MapFrameQualificationThresholds {
  targetFps: number;
  frameBudgetMs: number;
  minimumSampleCount: number;
  minimumDurationMs: number;
  minimumAverageFps: number;
  maximumP95FrameMs: number;
  maximumP99FrameMs: number;
  maximumDroppedFrameRatio: number;
  minimumWithinBudgetRatio: number;
}

export type MapFrameQualificationFailure =
  | "invalid-metric"
  | "target-fps"
  | "sample-count"
  | "duration"
  | "average-fps"
  | "p95-frame-time"
  | "p99-frame-time"
  | "dropped-frame-ratio"
  | "within-budget-ratio";

export interface MapFrameProfileAssessment {
  contractVersion: 1;
  kind: MapFrameProfileKind;
  status: "pass" | "fail";
  thresholds: MapFrameQualificationThresholds;
  droppedFrameRatio: number;
  failures: MapFrameQualificationFailure[];
}

export interface QualifiedMapFrameProfile {
  report: MapFrameProfileReport;
  assessment: MapFrameProfileAssessment;
}

export interface MapRendererPerformanceQualification {
  contractVersion: 1;
  environment: MapPerformanceEnvironment;
  status: "pending" | "ineligible" | "pass" | "fail";
  metricStatus: "pending" | "pass" | "fail";
  targetFps: number;
  requiredKinds: readonly MapFrameProfileKind[];
  missingKinds: MapFrameProfileKind[];
  profiles: Partial<Record<MapFrameProfileKind, QualifiedMapFrameProfile>>;
}

const DEFAULT_TARGET_FPS = 60;
const MINIMUM_SAMPLE_COUNT = 60;
const MINIMUM_DURATION_MS = 900;

function rounded(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function mapFrameQualificationThresholds(
  targetFps = DEFAULT_TARGET_FPS,
): MapFrameQualificationThresholds {
  const normalizedTarget =
    Number.isFinite(targetFps) && targetFps > 0
      ? targetFps
      : DEFAULT_TARGET_FPS;
  const frameBudgetMs = 1000 / normalizedTarget;
  return {
    targetFps: normalizedTarget,
    frameBudgetMs: rounded(frameBudgetMs),
    minimumSampleCount: MINIMUM_SAMPLE_COUNT,
    minimumDurationMs: MINIMUM_DURATION_MS,
    minimumAverageFps: rounded(normalizedTarget * 0.975),
    maximumP95FrameMs: rounded(frameBudgetMs * 1.1),
    maximumP99FrameMs: rounded(frameBudgetMs * 2),
    maximumDroppedFrameRatio: 0.01,
    minimumWithinBudgetRatio: 0.95,
  };
}

export function assessMapFrameProfile(
  report: MapFrameProfileReport,
  targetFps = DEFAULT_TARGET_FPS,
): MapFrameProfileAssessment {
  const thresholds = mapFrameQualificationThresholds(targetFps);
  const failures: MapFrameQualificationFailure[] = [];
  const numericMetrics = [
    report.targetFps,
    report.sampleCount,
    report.durationMs,
    report.averageFps,
    report.p50FrameMs,
    report.p95FrameMs,
    report.p99FrameMs,
    report.maxFrameMs,
    report.slowFrameCount,
    report.estimatedDroppedFrames,
    report.withinBudgetRatio,
  ];
  if (
    numericMetrics.some((metric) => !Number.isFinite(metric) || metric < 0)
  ) {
    failures.push("invalid-metric");
  }
  if (report.targetFps !== thresholds.targetFps) {
    failures.push("target-fps");
  }
  if (
    !Number.isInteger(report.sampleCount) ||
    report.sampleCount < thresholds.minimumSampleCount
  ) {
    failures.push("sample-count");
  }
  if (report.durationMs < thresholds.minimumDurationMs) {
    failures.push("duration");
  }
  if (report.averageFps < thresholds.minimumAverageFps) {
    failures.push("average-fps");
  }
  if (report.p95FrameMs > thresholds.maximumP95FrameMs) {
    failures.push("p95-frame-time");
  }
  if (report.p99FrameMs > thresholds.maximumP99FrameMs) {
    failures.push("p99-frame-time");
  }
  const droppedFrameRatio =
    report.sampleCount > 0
      ? report.estimatedDroppedFrames / report.sampleCount
      : Number.POSITIVE_INFINITY;
  if (
    !Number.isFinite(droppedFrameRatio) ||
    droppedFrameRatio > thresholds.maximumDroppedFrameRatio
  ) {
    failures.push("dropped-frame-ratio");
  }
  if (report.withinBudgetRatio < thresholds.minimumWithinBudgetRatio) {
    failures.push("within-budget-ratio");
  }

  return {
    contractVersion: 1,
    kind: report.kind,
    status: failures.length === 0 ? "pass" : "fail",
    thresholds,
    droppedFrameRatio: rounded(droppedFrameRatio),
    failures,
  };
}

export function qualifyMapRendererPerformance(
  reports: Partial<Record<MapFrameProfileKind, MapFrameProfileReport>>,
  environment: MapPerformanceEnvironment,
  targetFps = DEFAULT_TARGET_FPS,
): MapRendererPerformanceQualification {
  const profiles: MapRendererPerformanceQualification["profiles"] = {};
  const missingKinds: MapFrameProfileKind[] = [];

  for (const kind of REQUIRED_MAP_FRAME_PROFILE_KINDS) {
    const report = reports[kind];
    if (!report) {
      missingKinds.push(kind);
      continue;
    }
    profiles[kind] = {
      report,
      assessment: assessMapFrameProfile(report, targetFps),
    };
  }

  const metricStatus =
    missingKinds.length > 0
      ? "pending"
      : REQUIRED_MAP_FRAME_PROFILE_KINDS.every(
            (kind) => profiles[kind]?.assessment.status === "pass",
          )
        ? "pass"
        : "fail";
  const status =
    metricStatus === "pending"
      ? "pending"
      : environment !== "physical"
        ? "ineligible"
        : metricStatus;

  return {
    contractVersion: 1,
    environment,
    status,
    metricStatus,
    targetFps: mapFrameQualificationThresholds(targetFps).targetFps,
    requiredKinds: REQUIRED_MAP_FRAME_PROFILE_KINDS,
    missingKinds,
    profiles,
  };
}

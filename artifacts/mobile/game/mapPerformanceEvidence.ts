import type { MapVariant } from "./mapSceneGeometry";
import { MAP_VIEW_MODES, type MapViewMode } from "./mapSceneModel";
import {
  assessMapFrameProfile,
  qualifyMapRendererPerformance,
  REQUIRED_MAP_FRAME_PROFILE_KINDS,
  type MapRendererPerformanceQualification,
  type QualifiedMapFrameProfile,
} from "./mapFrameQualification";
import type {
  MapFrameProfileKind,
  MapFrameProfileReport,
} from "./mapFrameProfile";

export type MapPerformancePlatform = "android" | "ios" | "web";

export interface MapPerformanceDeviceEvidence {
  modelName: string | null;
  modelId: string | null;
  osName: string | null;
  osVersion: string | null;
  deviceYearClass: number | null;
}

export interface MapPerformanceApplicationEvidence {
  version: string | null;
  nativeBuildVersion: string | null;
  sourceRevision: string | null;
  sessionId: string;
}

export interface MapPerformanceSceneEvidence {
  contractVersion: 1;
  variant: MapVariant;
  viewMode: MapViewMode;
  revision: string;
  territoryCount: number;
}

export interface MapPerformanceEvidence {
  evidenceVersion: 1;
  capturedAt: string;
  platform: MapPerformancePlatform;
  application: MapPerformanceApplicationEvidence;
  device: MapPerformanceDeviceEvidence;
  scene: MapPerformanceSceneEvidence;
  qualification: MapRendererPerformanceQualification;
}

export function createMapPerformanceEvidence(
  evidence: Omit<MapPerformanceEvidence, "evidenceVersion" | "capturedAt"> & {
    capturedAt?: string;
  },
): MapPerformanceEvidence {
  return {
    evidenceVersion: 1,
    capturedAt: evidence.capturedAt ?? new Date().toISOString(),
    platform: evidence.platform,
    application: evidence.application,
    device: evidence.device,
    scene: evidence.scene,
    qualification: evidence.qualification,
  };
}

export function isCompleteMapPerformanceEvidence(
  evidence: MapPerformanceEvidence,
): boolean {
  return (
    evidence.qualification.status !== "pending" &&
    evidence.qualification.metricStatus !== "pending" &&
    evidence.qualification.missingKinds.length === 0
  );
}

export function serializeMapPerformanceEvidence(
  evidence: MapPerformanceEvidence,
): string {
  return JSON.stringify(evidence, null, 2);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isPlatform(value: unknown): value is MapPerformancePlatform {
  return value === "android" || value === "ios" || value === "web";
}

function isFiniteNumber(value: unknown, minimum = 0): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= minimum
  );
}

function isFrameProfileReport(
  value: unknown,
  kind: MapFrameProfileKind,
): value is MapFrameProfileReport {
  if (!isRecord(value)) return false;
  const orderedFrameTimes =
    isFiniteNumber(value.p50FrameMs) &&
    isFiniteNumber(value.p95FrameMs) &&
    isFiniteNumber(value.p99FrameMs) &&
    isFiniteNumber(value.maxFrameMs) &&
    value.p50FrameMs <= value.p95FrameMs &&
    value.p95FrameMs <= value.p99FrameMs &&
    value.p99FrameMs <= value.maxFrameMs;
  return (
    value.contractVersion === 1 &&
    value.kind === kind &&
    isFiniteNumber(value.targetFps, Number.EPSILON) &&
    isFiniteNumber(value.sampleCount, 1) &&
    Number.isInteger(value.sampleCount) &&
    isFiniteNumber(value.durationMs, Number.EPSILON) &&
    isFiniteNumber(value.averageFps, Number.EPSILON) &&
    orderedFrameTimes &&
    isFiniteNumber(value.slowFrameCount) &&
    Number.isInteger(value.slowFrameCount) &&
    value.slowFrameCount <= value.sampleCount &&
    isFiniteNumber(value.estimatedDroppedFrames) &&
    Number.isInteger(value.estimatedDroppedFrames) &&
    isFiniteNumber(value.withinBudgetRatio) &&
    value.withinBudgetRatio <= 1
  );
}

function arraysEqual<T>(
  left: readonly T[],
  right: readonly T[],
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function isQualifiedFrameProfile(
  value: unknown,
  kind: MapFrameProfileKind,
  targetFps: number,
): value is QualifiedMapFrameProfile {
  if (!isRecord(value) || !isFrameProfileReport(value.report, kind)) {
    return false;
  }
  if (!isRecord(value.assessment)) return false;
  const expected = assessMapFrameProfile(value.report, targetFps);
  const thresholds = value.assessment.thresholds;
  return (
    value.assessment.contractVersion === expected.contractVersion &&
    value.assessment.kind === expected.kind &&
    value.assessment.status === expected.status &&
    value.assessment.droppedFrameRatio === expected.droppedFrameRatio &&
    Array.isArray(value.assessment.failures) &&
    arraysEqual(value.assessment.failures, expected.failures) &&
    isRecord(thresholds) &&
    Object.entries(expected.thresholds).every(
      ([key, expectedValue]) => thresholds[key] === expectedValue,
    )
  );
}

export function parseMapPerformanceEvidence(
  raw: string,
): MapPerformanceEvidence | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(value)) return null;

  const application = value.application;
  const device = value.device;
  const scene = value.scene;
  const qualification = value.qualification;
  if (
    value.evidenceVersion !== 1 ||
    typeof value.capturedAt !== "string" ||
    !Number.isFinite(Date.parse(value.capturedAt)) ||
    !isPlatform(value.platform) ||
    !isRecord(application) ||
    !isRecord(device) ||
    !isRecord(scene) ||
    !isRecord(qualification)
  ) {
    return null;
  }

  if (
    !isNullableString(application.version) ||
    !isNullableString(application.nativeBuildVersion) ||
    !isNullableString(application.sourceRevision) ||
    typeof application.sessionId !== "string" ||
    !application.sessionId
  ) {
    return null;
  }
  if (
    !isNullableString(device.modelName) ||
    !isNullableString(device.modelId) ||
    !isNullableString(device.osName) ||
    !isNullableString(device.osVersion) ||
    !(
      device.deviceYearClass === null ||
      (typeof device.deviceYearClass === "number" &&
        Number.isInteger(device.deviceYearClass) &&
        device.deviceYearClass > 0)
    )
  ) {
    return null;
  }
  if (
    scene.contractVersion !== 1 ||
    (scene.variant !== "classic" && scene.variant !== "expanded") ||
    !MAP_VIEW_MODES.includes(scene.viewMode as MapViewMode) ||
    typeof scene.revision !== "string" ||
    !scene.revision ||
    typeof scene.territoryCount !== "number" ||
    !Number.isInteger(scene.territoryCount) ||
    scene.territoryCount <= 0
  ) {
    return null;
  }

  const requiredKinds = qualification.requiredKinds;
  const missingKinds = qualification.missingKinds;
  const targetFps = qualification.targetFps;
  if (
    qualification.contractVersion !== 1 ||
    !(
      qualification.environment === "browser" ||
      qualification.environment === "simulator" ||
      qualification.environment === "physical"
    ) ||
    !(
      qualification.status === "pending" ||
      qualification.status === "ineligible" ||
      qualification.status === "pass" ||
      qualification.status === "fail"
    ) ||
    !(
      qualification.metricStatus === "pending" ||
      qualification.metricStatus === "pass" ||
      qualification.metricStatus === "fail"
    ) ||
    !isFiniteNumber(targetFps, Number.EPSILON) ||
    !Array.isArray(requiredKinds) ||
    !Array.isArray(missingKinds) ||
    !arraysEqual(requiredKinds, REQUIRED_MAP_FRAME_PROFILE_KINDS) ||
    !missingKinds.every((kind) => kind === "camera" || kind === "battle") ||
    !isRecord(qualification.profiles) ||
    !Object.keys(qualification.profiles).every(
      (kind) => kind === "camera" || kind === "battle",
    )
  ) {
    return null;
  }

  if (
    (value.platform === "web" &&
      qualification.environment !== "browser") ||
    (value.platform !== "web" &&
      qualification.environment === "browser")
  ) {
    return null;
  }

  const reports: Partial<Record<MapFrameProfileKind, MapFrameProfileReport>> =
    {};
  for (const kind of REQUIRED_MAP_FRAME_PROFILE_KINDS) {
    const profile = qualification.profiles[kind];
    if (profile === undefined) continue;
    if (!isQualifiedFrameProfile(profile, kind, targetFps)) return null;
    reports[kind] = profile.report;
  }
  const expectedQualification = qualifyMapRendererPerformance(
    reports,
    qualification.environment,
    targetFps,
  );
  if (
    qualification.status !== expectedQualification.status ||
    qualification.metricStatus !== expectedQualification.metricStatus ||
    !arraysEqual(missingKinds, expectedQualification.missingKinds)
  ) {
    return null;
  }

  return value as unknown as MapPerformanceEvidence;
}

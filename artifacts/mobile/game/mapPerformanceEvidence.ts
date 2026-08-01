import type { MapVariant } from "./mapSceneGeometry";
import { MAP_VIEW_MODES, type MapViewMode } from "./mapSceneModel";
import {
  assessMapFrameProfile,
  qualifyMapRendererPerformance,
  REQUIRED_MAP_FRAME_PROFILE_KINDS,
  type MapRendererPerformanceQualification,
  type QualifiedMapFrameProfile,
} from "./mapFrameQualification";
import {
  MAP_FRAME_PROFILE_KINDS,
  type MapRendererBattleStabilityReport,
  MapFrameProfileKind,
  MapFrameProfileReport,
} from "./mapFrameProfile";
import type { R3FFeatureFlags } from "./r3fFeatureFlags";

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
  r3f?: {
    featureFlags: R3FFeatureFlags;
    shaderCompilation: {
      conquestPulse: boolean;
      orderReveal: boolean;
    };
    rendererStability: MapRendererBattleStabilityReport;
  };
}

export const REQUIRED_R3F_QUALIFICATION_PROFILE_KINDS = [
  "battle-cold",
  "battle-warm",
  "conquest-pulse",
] as const satisfies readonly MapFrameProfileKind[];

export function createMapPerformanceEvidence(
  evidence: Omit<MapPerformanceEvidence, "evidenceVersion" | "capturedAt"> & {
    capturedAt?: string;
  },
): MapPerformanceEvidence {
  const result: MapPerformanceEvidence = {
    evidenceVersion: 1,
    capturedAt: evidence.capturedAt ?? new Date().toISOString(),
    platform: evidence.platform,
    application: evidence.application,
    device: evidence.device,
    scene: evidence.scene,
    qualification: evidence.qualification,
  };
  if (evidence.r3f) result.r3f = evidence.r3f;
  return result;
}

export function isCompleteMapPerformanceEvidence(
  evidence: MapPerformanceEvidence,
): boolean {
  const mapProfilesComplete =
    evidence.qualification.status !== "pending" &&
    evidence.qualification.metricStatus !== "pending" &&
    evidence.qualification.missingKinds.length === 0;
  if (!mapProfilesComplete) return false;
  if (evidence.r3f?.featureFlags.qualification !== true) return true;
  return isCompleteR3FQualificationEvidence(evidence);
}

export function isCompleteR3FQualificationEvidence(
  evidence: MapPerformanceEvidence,
): boolean {
  const r3f = evidence.r3f;
  if (!r3f) return false;
  const stability = r3f.rendererStability;

  // Completeness describes whether the run can be diagnosed. Release policy
  // separately rejects failed profiles, shaders, feature flags, or stability.
  return (
    r3f.featureFlags.qualification &&
    stability.requiredBattleCount >= 50 &&
    stability.observedBattleCount >= stability.requiredBattleCount &&
    stability.complete &&
    REQUIRED_R3F_QUALIFICATION_PROFILE_KINDS.every((kind) => {
      const profile = evidence.qualification.profiles[kind];
      return Boolean(
        profile &&
        profile.report.renderer &&
        profile.report.renderer.sampleCount > 0,
      );
    })
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
    typeof value === "number" && Number.isFinite(value) && value >= minimum
  );
}

function isRendererInfoSample(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    [
      "calls",
      "triangles",
      "points",
      "lines",
      "programs",
      "geometries",
      "textures",
    ].every(
      (field) => isFiniteNumber(value[field]) && Number.isInteger(value[field]),
    ) &&
    (value.memoryBytes === null || isFiniteNumber(value.memoryBytes))
  );
}

function isRendererInfoSummary(value: unknown): boolean {
  return (
    isRecord(value) &&
    value.contractVersion === 1 &&
    isFiniteNumber(value.sampleCount, 1) &&
    Number.isInteger(value.sampleCount) &&
    isRendererInfoSample(value.first) &&
    isRendererInfoSample(value.last) &&
    isRendererInfoSample(value.peak)
  );
}

function isRendererStabilityReport(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const fields = value.sustainedGrowthFields;
  const structurallyValid =
    value.contractVersion === 1 &&
    isFiniteNumber(value.requiredBattleCount, 1) &&
    Number.isInteger(value.requiredBattleCount) &&
    isFiniteNumber(value.observedBattleCount) &&
    Number.isInteger(value.observedBattleCount) &&
    typeof value.complete === "boolean" &&
    typeof value.stable === "boolean" &&
    Array.isArray(fields) &&
    fields.every(
      (field) =>
        field === "programs" || field === "geometries" || field === "textures",
    ) &&
    (value.first === null || isRendererInfoSample(value.first)) &&
    (value.last === null || isRendererInfoSample(value.last)) &&
    (value.peak === null || isRendererInfoSample(value.peak));
  if (!structurallyValid) return false;
  const observedBattleCount = value.observedBattleCount as number;
  const requiredBattleCount = value.requiredBattleCount as number;
  const complete = observedBattleCount >= requiredBattleCount;
  const hasSamples = observedBattleCount > 0;
  return (
    value.complete === complete &&
    value.stable === (complete && fields.length === 0) &&
    (hasSamples
      ? value.first !== null && value.last !== null && value.peak !== null
      : value.first === null && value.last === null && value.peak === null)
  );
}

function isR3FFeatureFlags(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return [
    "battleInstancing",
    "conquestPulse",
    "orderReveal",
    "stylizedWater",
    "qualification",
  ].every((field) => typeof value[field] === "boolean");
}

function isR3FEvidence(value: unknown): boolean {
  const shaderCompilation = isRecord(value)
    ? value.shaderCompilation
    : undefined;
  return (
    isRecord(value) &&
    isR3FFeatureFlags(value.featureFlags) &&
    isRecord(shaderCompilation) &&
    typeof shaderCompilation.conquestPulse === "boolean" &&
    typeof shaderCompilation.orderReveal === "boolean" &&
    isRendererStabilityReport(value.rendererStability)
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
  const rendererValid =
    value.renderer === undefined || isRendererInfoSummary(value.renderer);
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
    value.withinBudgetRatio <= 1 &&
    rendererValid
  );
}

function arraysEqual<T>(left: readonly T[], right: readonly T[]): boolean {
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

  if (value.r3f !== undefined && !isR3FEvidence(value.r3f)) return null;

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
    !missingKinds.every((kind) =>
      REQUIRED_MAP_FRAME_PROFILE_KINDS.includes(
        kind as (typeof REQUIRED_MAP_FRAME_PROFILE_KINDS)[number],
      ),
    ) ||
    !isRecord(qualification.profiles) ||
    !Object.keys(qualification.profiles).every((kind) =>
      MAP_FRAME_PROFILE_KINDS.includes(kind as MapFrameProfileKind),
    )
  ) {
    return null;
  }

  if (
    (value.platform === "web" && qualification.environment !== "browser") ||
    (value.platform !== "web" && qualification.environment === "browser")
  ) {
    return null;
  }

  const reports: Partial<Record<MapFrameProfileKind, MapFrameProfileReport>> =
    {};
  for (const kind of MAP_FRAME_PROFILE_KINDS) {
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

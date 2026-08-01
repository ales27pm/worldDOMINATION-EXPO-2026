import {
  REQUIRED_MAP_FRAME_PROFILE_KINDS,
  type MapPerformanceEnvironment,
  type MapRendererPerformanceQualification,
} from "./mapFrameQualification";
import {
  REQUIRED_R3F_QUALIFICATION_PROFILE_KINDS,
  type MapPerformanceEvidence,
} from "./mapPerformanceEvidence";

export const REQUIRED_MAP_RELEASE_PLATFORMS = ["android", "ios"] as const;

export type MapReleasePlatform =
  (typeof REQUIRED_MAP_RELEASE_PLATFORMS)[number];

export const ACCEPTED_MAP_RELEASE_ENVIRONMENTS = {
  android: ["simulator", "physical"],
  ios: ["physical"],
} as const satisfies Record<
  MapReleasePlatform,
  readonly MapPerformanceEnvironment[]
>;

export type MapReleaseQualificationFailureCode =
  | "expected-source-revision"
  | "missing-platform"
  | "platform-mismatch"
  | "qualification-environment"
  | "qualification-status"
  | "metric-status"
  | "missing-profile"
  | "profile-status"
  | "renderer-counters"
  | "r3f-evidence"
  | "r3f-feature-flags"
  | "shader-compilation"
  | "renderer-stability"
  | "application-provenance"
  | "device-provenance"
  | "source-revision"
  | "territory-count"
  | "evidence-expired"
  | "evidence-from-future"
  | "application-version-pair"
  | "scene-fixture-pair"
  | "session-pair"
  | "capture-window-pair";

export interface MapReleaseQualificationFailure {
  code: MapReleaseQualificationFailureCode;
  platform?: MapReleasePlatform;
  detail: string;
}

export interface MapReleaseQualificationPlatformSummary {
  platform: MapReleasePlatform;
  capturedAt: string;
  applicationVersion: string | null;
  nativeBuildVersion: string | null;
  sourceRevision: string | null;
  sessionId: string;
  modelName: string | null;
  modelId: string | null;
  osName: string | null;
  osVersion: string | null;
  environment: MapPerformanceEnvironment;
  sceneRevisionFingerprint: string;
  variant: MapPerformanceEvidence["scene"]["variant"];
  viewMode: MapPerformanceEvidence["scene"]["viewMode"];
  territoryCount: number;
  qualificationStatus: MapRendererPerformanceQualification["status"];
  metricStatus: MapRendererPerformanceQualification["metricStatus"];
}

export interface MapReleaseQualificationReport {
  contractVersion: 2;
  status: "pass" | "fail";
  evaluatedAt: string;
  expectedSourceRevision: string;
  maximumEvidenceAgeMs: number;
  maximumPairSkewMs: number;
  requiredPlatforms: readonly MapReleasePlatform[];
  acceptedEnvironments: typeof ACCEPTED_MAP_RELEASE_ENVIRONMENTS;
  platforms: Partial<
    Record<MapReleasePlatform, MapReleaseQualificationPlatformSummary>
  >;
  failures: MapReleaseQualificationFailure[];
}

export interface MapReleaseQualificationOptions {
  expectedSourceRevision: string;
  nowMs?: number;
  maximumEvidenceAgeMs?: number;
  maximumPairSkewMs?: number;
}

export type MapReleaseQualificationEvidence = Partial<
  Record<MapReleasePlatform, MapPerformanceEvidence>
>;

const FULL_GIT_REVISION = /^[0-9a-f]{40}$/i;
const DEFAULT_MAXIMUM_EVIDENCE_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_MAXIMUM_PAIR_SKEW_MS = 24 * 60 * 60 * 1000;
const MAXIMUM_FUTURE_SKEW_MS = 5 * 60 * 1000;
const TERRITORY_COUNTS = {
  classic: 42,
  expanded: 48,
} as const;

function normalizedDuration(
  value: number | undefined,
  fallback: number,
): number {
  return Number.isFinite(value) && (value ?? 0) > 0
    ? (value as number)
    : fallback;
}

function nonBlank(value: string | null): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isObviousVirtualDevice(
  modelName: string | null,
  modelId: string | null,
): boolean {
  const identity = `${modelName ?? ""} ${modelId ?? ""}`.toLowerCase();
  return /(simulator|emulator|x86_64|sdk_gphone|generic_x86)/.test(identity);
}

function expectedOsName(
  platform: MapReleasePlatform,
  osName: string | null,
): boolean {
  if (!nonBlank(osName)) return false;
  return platform === "android"
    ? osName.toLowerCase().includes("android")
    : osName.toLowerCase().includes("ios");
}

function revisionFingerprint(revision: string): string {
  let hash = 2166136261;
  for (let index = 0; index < revision.length; index += 1) {
    hash ^= revision.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${revision.length}:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function platformSummary(
  platform: MapReleasePlatform,
  evidence: MapPerformanceEvidence,
): MapReleaseQualificationPlatformSummary {
  return {
    platform,
    capturedAt: evidence.capturedAt,
    applicationVersion: evidence.application.version,
    nativeBuildVersion: evidence.application.nativeBuildVersion,
    sourceRevision: evidence.application.sourceRevision,
    sessionId: evidence.application.sessionId,
    modelName: evidence.device.modelName,
    modelId: evidence.device.modelId,
    osName: evidence.device.osName,
    osVersion: evidence.device.osVersion,
    environment: evidence.qualification.environment,
    sceneRevisionFingerprint: revisionFingerprint(evidence.scene.revision),
    variant: evidence.scene.variant,
    viewMode: evidence.scene.viewMode,
    territoryCount: evidence.scene.territoryCount,
    qualificationStatus: evidence.qualification.status,
    metricStatus: evidence.qualification.metricStatus,
  };
}

function sameFixture(
  left: MapPerformanceEvidence,
  right: MapPerformanceEvidence,
): boolean {
  return (
    left.scene.contractVersion === right.scene.contractVersion &&
    left.scene.variant === right.scene.variant &&
    left.scene.viewMode === right.scene.viewMode &&
    left.scene.revision === right.scene.revision &&
    left.scene.territoryCount === right.scene.territoryCount
  );
}

function acceptsEnvironment(
  platform: MapReleasePlatform,
  environment: MapPerformanceEnvironment,
): boolean {
  const accepted: readonly MapPerformanceEnvironment[] =
    ACCEPTED_MAP_RELEASE_ENVIRONMENTS[platform];
  return accepted.includes(environment);
}

function expectedQualificationStatus(
  platform: MapReleasePlatform,
  environment: MapPerformanceEnvironment,
): MapRendererPerformanceQualification["status"] | null {
  if (environment === "physical") return "pass";
  if (platform === "android" && environment === "simulator") {
    return "ineligible";
  }
  return null;
}

function hasCredibleDeviceIdentity(
  platform: MapReleasePlatform,
  evidence: MapPerformanceEvidence,
): boolean {
  const { modelName, modelId, osName, osVersion } = evidence.device;
  if (!expectedOsName(platform, osName) || !nonBlank(osVersion)) {
    return false;
  }

  const isVirtual = isObviousVirtualDevice(modelName, modelId);
  if (evidence.qualification.environment === "simulator") {
    return (
      platform === "android" &&
      (nonBlank(modelName) || nonBlank(modelId)) &&
      isVirtual
    );
  }

  return (
    evidence.qualification.environment === "physical" &&
    nonBlank(modelName) &&
    nonBlank(modelId) &&
    !isVirtual
  );
}

export function qualifyMapReleasePair(
  evidenceByPlatform: MapReleaseQualificationEvidence,
  options: MapReleaseQualificationOptions,
): MapReleaseQualificationReport {
  const nowMs = Number.isFinite(options.nowMs)
    ? (options.nowMs as number)
    : Date.now();
  const maximumEvidenceAgeMs = normalizedDuration(
    options.maximumEvidenceAgeMs,
    DEFAULT_MAXIMUM_EVIDENCE_AGE_MS,
  );
  const maximumPairSkewMs = normalizedDuration(
    options.maximumPairSkewMs,
    DEFAULT_MAXIMUM_PAIR_SKEW_MS,
  );
  const expectedSourceRevision = options.expectedSourceRevision
    .trim()
    .toLowerCase();
  const failures: MapReleaseQualificationFailure[] = [];
  const platforms: MapReleaseQualificationReport["platforms"] = {};

  if (!FULL_GIT_REVISION.test(expectedSourceRevision)) {
    failures.push({
      code: "expected-source-revision",
      detail:
        "The expected source revision must be a full 40-character Git SHA.",
    });
  }

  for (const platform of REQUIRED_MAP_RELEASE_PLATFORMS) {
    const evidence = evidenceByPlatform[platform];
    if (!evidence) {
      failures.push({
        code: "missing-platform",
        platform,
        detail: `No ${platform} release qualification evidence was supplied.`,
      });
      continue;
    }

    platforms[platform] = platformSummary(platform, evidence);

    if (evidence.platform !== platform) {
      failures.push({
        code: "platform-mismatch",
        platform,
        detail: `The ${platform} slot contains ${evidence.platform} evidence.`,
      });
    }
    const environment = evidence.qualification.environment;
    if (!acceptsEnvironment(platform, environment)) {
      failures.push({
        code: "qualification-environment",
        platform,
        detail: `${platform} ${environment} evidence is not accepted by the release policy.`,
      });
    }
    const requiredQualificationStatus = expectedQualificationStatus(
      platform,
      environment,
    );
    if (
      requiredQualificationStatus !== null &&
      evidence.qualification.status !== requiredQualificationStatus
    ) {
      failures.push({
        code: "qualification-status",
        platform,
        detail: `${platform} qualification status is ${evidence.qualification.status}; expected ${requiredQualificationStatus} for ${environment}.`,
      });
    }
    if (evidence.qualification.metricStatus !== "pass") {
      failures.push({
        code: "metric-status",
        platform,
        detail: `${platform} metric status is ${evidence.qualification.metricStatus}.`,
      });
    }

    for (const kind of [
      ...REQUIRED_MAP_FRAME_PROFILE_KINDS,
      ...REQUIRED_R3F_QUALIFICATION_PROFILE_KINDS,
    ]) {
      const profile = evidence.qualification.profiles[kind];
      if (!profile) {
        failures.push({
          code: "missing-profile",
          platform,
          detail: `${platform} is missing its ${kind} frame profile.`,
        });
      } else if (profile.assessment.status !== "pass") {
        failures.push({
          code: "profile-status",
          platform,
          detail: `${platform} ${kind} frame profile did not pass.`,
        });
      } else if (
        REQUIRED_R3F_QUALIFICATION_PROFILE_KINDS.includes(
          kind as (typeof REQUIRED_R3F_QUALIFICATION_PROFILE_KINDS)[number],
        ) &&
        !profile.report.renderer
      ) {
        failures.push({
          code: "renderer-counters",
          platform,
          detail: `${platform} ${kind} frame profile is missing renderer counters.`,
        });
      }
    }

    const r3f = evidence.r3f;
    if (!r3f) {
      failures.push({
        code: "r3f-evidence",
        platform,
        detail: `${platform} evidence is missing the R3F adaptation qualification block.`,
      });
    } else {
      const flags = r3f.featureFlags;
      if (
        !flags.qualification ||
        !flags.battleInstancing ||
        !flags.conquestPulse ||
        !flags.orderReveal ||
        flags.stylizedWater
      ) {
        failures.push({
          code: "r3f-feature-flags",
          platform,
          detail: `${platform} did not qualify the required R3F effects with stylized water disabled.`,
        });
      }
      if (
        !r3f.shaderCompilation.conquestPulse ||
        !r3f.shaderCompilation.orderReveal
      ) {
        failures.push({
          code: "shader-compilation",
          platform,
          detail: `${platform} did not render both R3F overlay shaders.`,
        });
      }
      const stability = r3f.rendererStability;
      if (
        stability.requiredBattleCount < 50 ||
        stability.observedBattleCount < stability.requiredBattleCount ||
        !stability.complete ||
        !stability.stable ||
        stability.sustainedGrowthFields.length > 0
      ) {
        failures.push({
          code: "renderer-stability",
          platform,
          detail: `${platform} renderer stability requires at least 50 completed battles without sustained program, geometry, or texture growth.`,
        });
      }
    }

    const application = evidence.application;
    if (
      !nonBlank(application.version) ||
      !nonBlank(application.nativeBuildVersion) ||
      !nonBlank(application.sessionId)
    ) {
      failures.push({
        code: "application-provenance",
        platform,
        detail: `${platform} evidence is missing app version, native build, or session provenance.`,
      });
    }
    if (
      !nonBlank(application.sourceRevision) ||
      !FULL_GIT_REVISION.test(application.sourceRevision) ||
      application.sourceRevision.toLowerCase() !== expectedSourceRevision
    ) {
      failures.push({
        code: "source-revision",
        platform,
        detail: `${platform} evidence does not match the expected full Git revision.`,
      });
    }

    if (!hasCredibleDeviceIdentity(platform, evidence)) {
      failures.push({
        code: "device-provenance",
        platform,
        detail: `${platform} evidence lacks credible ${environment} device identity.`,
      });
    }

    if (
      evidence.scene.territoryCount !== TERRITORY_COUNTS[evidence.scene.variant]
    ) {
      failures.push({
        code: "territory-count",
        platform,
        detail: `${platform} scene territory count does not match its map variant.`,
      });
    }

    const capturedAtMs = Date.parse(evidence.capturedAt);
    if (
      Number.isFinite(capturedAtMs) &&
      capturedAtMs > nowMs + MAXIMUM_FUTURE_SKEW_MS
    ) {
      failures.push({
        code: "evidence-from-future",
        platform,
        detail: `${platform} evidence timestamp is implausibly in the future.`,
      });
    } else if (
      Number.isFinite(capturedAtMs) &&
      nowMs - capturedAtMs > maximumEvidenceAgeMs
    ) {
      failures.push({
        code: "evidence-expired",
        platform,
        detail: `${platform} evidence is older than the allowed qualification window.`,
      });
    }
  }

  const android = evidenceByPlatform.android;
  const ios = evidenceByPlatform.ios;
  if (android && ios) {
    if (android.application.version !== ios.application.version) {
      failures.push({
        code: "application-version-pair",
        detail:
          "Android and iOS evidence must use the same application version.",
      });
    }
    if (!sameFixture(android, ios)) {
      failures.push({
        code: "scene-fixture-pair",
        detail:
          "Android and iOS evidence must profile the same canonical scene fixture.",
      });
    }
    if (android.application.sessionId === ios.application.sessionId) {
      failures.push({
        code: "session-pair",
        detail:
          "Android and iOS evidence must come from distinct runtime sessions.",
      });
    }
    const captureSkewMs = Math.abs(
      Date.parse(android.capturedAt) - Date.parse(ios.capturedAt),
    );
    if (Number.isFinite(captureSkewMs) && captureSkewMs > maximumPairSkewMs) {
      failures.push({
        code: "capture-window-pair",
        detail:
          "Android and iOS captures are too far apart for one qualification run.",
      });
    }
  }

  return {
    contractVersion: 2,
    status: failures.length === 0 ? "pass" : "fail",
    evaluatedAt: new Date(nowMs).toISOString(),
    expectedSourceRevision,
    maximumEvidenceAgeMs,
    maximumPairSkewMs,
    requiredPlatforms: REQUIRED_MAP_RELEASE_PLATFORMS,
    acceptedEnvironments: ACCEPTED_MAP_RELEASE_ENVIRONMENTS,
    platforms,
    failures,
  };
}

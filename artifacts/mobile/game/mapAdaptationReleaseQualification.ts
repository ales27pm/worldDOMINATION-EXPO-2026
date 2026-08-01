import {
  compareMapPerformanceEvidence,
  type MapPerformanceComparisonReport,
} from "./mapPerformanceComparison";
import type { MapPerformanceEvidence } from "./mapPerformanceEvidence";
import {
  qualifyMapReleasePair,
  REQUIRED_MAP_RELEASE_PLATFORMS,
  type MapReleasePlatform,
  type MapReleaseQualificationOptions,
  type MapReleaseQualificationReport,
} from "./mapReleaseQualification";

export interface MapAdaptationPlatformEvidence {
  baseline: MapPerformanceEvidence;
  variant: MapPerformanceEvidence;
}

export type MapAdaptationReleaseEvidence = Record<
  MapReleasePlatform,
  MapAdaptationPlatformEvidence
>;

export interface MapAdaptationReleaseQualificationOptions extends MapReleaseQualificationOptions {
  maximumWarmRegressionPercent?: number;
  maximumComparisonSkewMs?: number;
}

export interface MapAdaptationReleaseQualificationReport {
  contractVersion: 1;
  status: "pass" | "fail";
  expectedSourceRevision: string;
  release: MapReleaseQualificationReport;
  comparisons: Record<MapReleasePlatform, MapPerformanceComparisonReport>;
}

export function qualifyMapAdaptationRelease(
  evidenceByPlatform: MapAdaptationReleaseEvidence,
  options: MapAdaptationReleaseQualificationOptions,
): MapAdaptationReleaseQualificationReport {
  const release = qualifyMapReleasePair(
    {
      android: evidenceByPlatform.android.variant,
      ios: evidenceByPlatform.ios.variant,
    },
    options,
  );
  const comparisons = Object.fromEntries(
    REQUIRED_MAP_RELEASE_PLATFORMS.map((platform) => {
      const evidence = evidenceByPlatform[platform];
      return [
        platform,
        compareMapPerformanceEvidence(evidence.baseline, evidence.variant, {
          expectedSourceRevision: options.expectedSourceRevision,
          maximumWarmRegressionPercent: options.maximumWarmRegressionPercent,
          maximumCaptureSkewMs: options.maximumComparisonSkewMs,
        }),
      ];
    }),
  ) as MapAdaptationReleaseQualificationReport["comparisons"];
  const comparisonsPassed = REQUIRED_MAP_RELEASE_PLATFORMS.every(
    (platform) => comparisons[platform].status === "pass",
  );

  return {
    contractVersion: 1,
    status: release.status === "pass" && comparisonsPassed ? "pass" : "fail",
    expectedSourceRevision: release.expectedSourceRevision,
    release,
    comparisons,
  };
}

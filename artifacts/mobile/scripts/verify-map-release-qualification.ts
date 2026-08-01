import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  qualifyMapAdaptationRelease,
  type MapAdaptationReleaseEvidence,
} from "../game/mapAdaptationReleaseQualification";
import { type MapReleasePlatform } from "../game/mapReleaseQualification";
import {
  parseMapPerformanceEvidence,
  type MapPerformanceEvidence,
} from "../game/mapPerformanceEvidence";

interface CliOptions {
  androidBaselinePath: string | null;
  androidVariantPath: string | null;
  iosBaselinePath: string | null;
  iosVariantPath: string | null;
  sourceRevision: string | null;
  maximumEvidenceAgeHours: number;
  maximumPairSkewHours: number;
  maximumComparisonSkewHours: number;
  maximumWarmRegressionPercent: number;
  help: boolean;
}

const DEFAULT_MAXIMUM_EVIDENCE_AGE_HOURS = 7 * 24;
const DEFAULT_MAXIMUM_PAIR_SKEW_HOURS = 24;
const DEFAULT_MAXIMUM_COMPARISON_SKEW_HOURS = 24;
const DEFAULT_MAXIMUM_WARM_REGRESSION_PERCENT = 5;

function usage(): string {
  return `Usage:
  pnpm run map:release:check -- \\
    --android-baseline <android-feature-off-evidence.json> \\
    --android-variant <android-adapted-evidence.json> \\
    --ios-baseline <ios-feature-off-evidence.json> \\
    --ios-variant <ios-adapted-evidence.json> \\
    [--source-revision <full-git-sha>] \\
    [--max-age-hours <hours>] \\
    [--max-pair-skew-hours <hours>] \\
    [--max-comparison-skew-hours <hours>] \\
    [--max-warm-regression-percent <percent>]

Accepted environments:
  Android emulator or physical hardware
  iOS physical hardware

Environment fallbacks:
  MAP_ANDROID_BASELINE_PERFORMANCE_EVIDENCE
  MAP_ANDROID_VARIANT_PERFORMANCE_EVIDENCE
  MAP_IOS_BASELINE_PERFORMANCE_EVIDENCE
  MAP_IOS_VARIANT_PERFORMANCE_EVIDENCE
  MAP_SOURCE_REVISION

Legacy --android/--ios flags and MAP_ANDROID_PERFORMANCE_EVIDENCE /
MAP_IOS_PERFORMANCE_EVIDENCE are accepted as variant aliases only.
`;
}

function positiveNumber(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${flag} requires a positive number.`);
  }
  return parsed;
}

function parseArgs(argv: readonly string[]): CliOptions {
  const options: CliOptions = {
    androidBaselinePath:
      process.env.MAP_ANDROID_BASELINE_PERFORMANCE_EVIDENCE?.trim() || null,
    androidVariantPath:
      process.env.MAP_ANDROID_VARIANT_PERFORMANCE_EVIDENCE?.trim() ||
      process.env.MAP_ANDROID_PERFORMANCE_EVIDENCE?.trim() ||
      null,
    iosBaselinePath:
      process.env.MAP_IOS_BASELINE_PERFORMANCE_EVIDENCE?.trim() || null,
    iosVariantPath:
      process.env.MAP_IOS_VARIANT_PERFORMANCE_EVIDENCE?.trim() ||
      process.env.MAP_IOS_PERFORMANCE_EVIDENCE?.trim() ||
      null,
    sourceRevision: process.env.MAP_SOURCE_REVISION?.trim() || null,
    maximumEvidenceAgeHours: DEFAULT_MAXIMUM_EVIDENCE_AGE_HOURS,
    maximumPairSkewHours: DEFAULT_MAXIMUM_PAIR_SKEW_HOURS,
    maximumComparisonSkewHours: DEFAULT_MAXIMUM_COMPARISON_SKEW_HOURS,
    maximumWarmRegressionPercent: DEFAULT_MAXIMUM_WARM_REGRESSION_PERCENT,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--") continue;
    if (flag === "--help" || flag === "-h") {
      options.help = true;
      continue;
    }
    const value = argv[index + 1];
    if (!value) throw new Error(`${flag} requires a value.`);
    index += 1;
    if (flag === "--android-baseline") options.androidBaselinePath = value;
    else if (flag === "--android-variant" || flag === "--android") {
      options.androidVariantPath = value;
    } else if (flag === "--ios-baseline") options.iosBaselinePath = value;
    else if (flag === "--ios-variant" || flag === "--ios") {
      options.iosVariantPath = value;
    } else if (flag === "--source-revision") options.sourceRevision = value;
    else if (flag === "--max-age-hours") {
      options.maximumEvidenceAgeHours = positiveNumber(value, flag);
    } else if (flag === "--max-pair-skew-hours") {
      options.maximumPairSkewHours = positiveNumber(value, flag);
    } else if (flag === "--max-comparison-skew-hours") {
      options.maximumComparisonSkewHours = positiveNumber(value, flag);
    } else if (flag === "--max-warm-regression-percent") {
      options.maximumWarmRegressionPercent = positiveNumber(value, flag);
    } else {
      throw new Error(`Unknown argument: ${flag}`);
    }
  }

  return options;
}

function currentGitRevision(): string {
  return execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: process.cwd(),
    encoding: "utf8",
  }).trim();
}

function loadEvidence(
  platform: MapReleasePlatform,
  side: "baseline" | "variant",
  filePath: string,
): MapPerformanceEvidence {
  const absolutePath = resolve(filePath);
  const parsed = parseMapPerformanceEvidence(
    readFileSync(absolutePath, "utf8"),
  );
  if (!parsed) {
    throw new Error(
      `${platform} ${side} evidence is malformed: ${absolutePath}`,
    );
  }
  return parsed;
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
    return;
  }
  if (
    !options.androidBaselinePath ||
    !options.androidVariantPath ||
    !options.iosBaselinePath ||
    !options.iosVariantPath
  ) {
    throw new Error(
      `Android and iOS baseline/variant evidence files are required.\n${usage()}`,
    );
  }

  const expectedSourceRevision = options.sourceRevision ?? currentGitRevision();
  const evidence: MapAdaptationReleaseEvidence = {
    android: {
      baseline: loadEvidence(
        "android",
        "baseline",
        options.androidBaselinePath,
      ),
      variant: loadEvidence("android", "variant", options.androidVariantPath),
    },
    ios: {
      baseline: loadEvidence("ios", "baseline", options.iosBaselinePath),
      variant: loadEvidence("ios", "variant", options.iosVariantPath),
    },
  };
  const report = qualifyMapAdaptationRelease(evidence, {
    expectedSourceRevision,
    maximumEvidenceAgeMs: options.maximumEvidenceAgeHours * 60 * 60 * 1000,
    maximumPairSkewMs: options.maximumPairSkewHours * 60 * 60 * 1000,
    maximumComparisonSkewMs:
      options.maximumComparisonSkewHours * 60 * 60 * 1000,
    maximumWarmRegressionPercent: options.maximumWarmRegressionPercent,
  });

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.status !== "pass") process.exitCode = 1;
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Map release qualification failed: ${message}\n`);
  process.exitCode = 1;
}

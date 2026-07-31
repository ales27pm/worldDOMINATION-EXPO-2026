import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  qualifyMapPhysicalPair,
  type MapPhysicalPlatform,
} from "../game/mapPhysicalQualification";
import {
  parseMapPerformanceEvidence,
  type MapPerformanceEvidence,
} from "../game/mapPerformanceEvidence";

interface CliOptions {
  androidPath: string | null;
  iosPath: string | null;
  sourceRevision: string | null;
  maximumEvidenceAgeHours: number;
  maximumPairSkewHours: number;
  help: boolean;
}

const DEFAULT_MAXIMUM_EVIDENCE_AGE_HOURS = 7 * 24;
const DEFAULT_MAXIMUM_PAIR_SKEW_HOURS = 24;

function usage(): string {
  return `Usage:
  pnpm run map:physical:check -- \\
    --android <android-evidence.json> \\
    --ios <ios-evidence.json> \\
    [--source-revision <full-git-sha>] \\
    [--max-age-hours <hours>] \\
    [--max-pair-skew-hours <hours>]

Environment fallbacks:
  MAP_ANDROID_PERFORMANCE_EVIDENCE
  MAP_IOS_PERFORMANCE_EVIDENCE
  MAP_SOURCE_REVISION
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
    androidPath:
      process.env.MAP_ANDROID_PERFORMANCE_EVIDENCE?.trim() || null,
    iosPath: process.env.MAP_IOS_PERFORMANCE_EVIDENCE?.trim() || null,
    sourceRevision: process.env.MAP_SOURCE_REVISION?.trim() || null,
    maximumEvidenceAgeHours: DEFAULT_MAXIMUM_EVIDENCE_AGE_HOURS,
    maximumPairSkewHours: DEFAULT_MAXIMUM_PAIR_SKEW_HOURS,
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
    if (flag === "--android") options.androidPath = value;
    else if (flag === "--ios") options.iosPath = value;
    else if (flag === "--source-revision") options.sourceRevision = value;
    else if (flag === "--max-age-hours") {
      options.maximumEvidenceAgeHours = positiveNumber(value, flag);
    } else if (flag === "--max-pair-skew-hours") {
      options.maximumPairSkewHours = positiveNumber(value, flag);
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
  platform: MapPhysicalPlatform,
  filePath: string,
): MapPerformanceEvidence {
  const absolutePath = resolve(filePath);
  const parsed = parseMapPerformanceEvidence(
    readFileSync(absolutePath, "utf8"),
  );
  if (!parsed) {
    throw new Error(`${platform} evidence is malformed: ${absolutePath}`);
  }
  return parsed;
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
    return;
  }
  if (!options.androidPath || !options.iosPath) {
    throw new Error(`Both physical evidence files are required.\n${usage()}`);
  }

  const report = qualifyMapPhysicalPair(
    {
      android: loadEvidence("android", options.androidPath),
      ios: loadEvidence("ios", options.iosPath),
    },
    {
      expectedSourceRevision:
        options.sourceRevision ?? currentGitRevision(),
      maximumEvidenceAgeMs:
        options.maximumEvidenceAgeHours * 60 * 60 * 1000,
      maximumPairSkewMs:
        options.maximumPairSkewHours * 60 * 60 * 1000,
    },
  );

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.status !== "pass") process.exitCode = 1;
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Map physical qualification failed: ${message}\n`);
  process.exitCode = 1;
}

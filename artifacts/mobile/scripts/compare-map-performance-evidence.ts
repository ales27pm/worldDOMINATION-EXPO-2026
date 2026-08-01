import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { compareMapPerformanceEvidence } from "../game/mapPerformanceComparison";
import {
  parseMapPerformanceEvidence,
  type MapPerformanceEvidence,
} from "../game/mapPerformanceEvidence";

interface CliOptions {
  baselinePath: string | null;
  variantPath: string | null;
  sourceRevision: string | null;
  maximumWarmRegressionPercent: number;
  maximumCaptureSkewHours: number;
  help: boolean;
}

const DEFAULT_MAXIMUM_WARM_REGRESSION_PERCENT = 5;
const DEFAULT_MAXIMUM_CAPTURE_SKEW_HOURS = 24;

function usage(): string {
  return `Usage:
  pnpm run map:performance:compare -- \\
    --baseline <feature-off-evidence.json> \\
    --variant <adapted-evidence.json> \\
    [--source-revision <full-git-sha>] \\
    [--max-warm-regression-percent <percent>] \\
    [--max-capture-skew-hours <hours>]

Environment fallbacks:
  MAP_BASELINE_PERFORMANCE_EVIDENCE
  MAP_VARIANT_PERFORMANCE_EVIDENCE
  MAP_SOURCE_REVISION
  MAP_MAX_WARM_REGRESSION_PERCENT
  MAP_MAX_COMPARISON_SKEW_HOURS
`;
}

function positiveNumber(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${flag} requires a positive number.`);
  }
  return parsed;
}

function environmentNumber(name: string, fallback: number): number {
  const value = process.env[name]?.trim();
  return value ? positiveNumber(value, name) : fallback;
}

function parseArgs(argv: readonly string[]): CliOptions {
  const options: CliOptions = {
    baselinePath: process.env.MAP_BASELINE_PERFORMANCE_EVIDENCE?.trim() || null,
    variantPath: process.env.MAP_VARIANT_PERFORMANCE_EVIDENCE?.trim() || null,
    sourceRevision: process.env.MAP_SOURCE_REVISION?.trim() || null,
    maximumWarmRegressionPercent: environmentNumber(
      "MAP_MAX_WARM_REGRESSION_PERCENT",
      DEFAULT_MAXIMUM_WARM_REGRESSION_PERCENT,
    ),
    maximumCaptureSkewHours: environmentNumber(
      "MAP_MAX_COMPARISON_SKEW_HOURS",
      DEFAULT_MAXIMUM_CAPTURE_SKEW_HOURS,
    ),
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
    if (flag === "--baseline") options.baselinePath = value;
    else if (flag === "--variant") options.variantPath = value;
    else if (flag === "--source-revision") options.sourceRevision = value;
    else if (flag === "--max-warm-regression-percent") {
      options.maximumWarmRegressionPercent = positiveNumber(value, flag);
    } else if (flag === "--max-capture-skew-hours") {
      options.maximumCaptureSkewHours = positiveNumber(value, flag);
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

function loadEvidence(label: string, filePath: string): MapPerformanceEvidence {
  const absolutePath = resolve(filePath);
  const parsed = parseMapPerformanceEvidence(
    readFileSync(absolutePath, "utf8"),
  );
  if (!parsed)
    throw new Error(`${label} evidence is malformed: ${absolutePath}`);
  return parsed;
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
    return;
  }
  if (!options.baselinePath || !options.variantPath) {
    throw new Error(
      `Baseline and variant evidence files are required.\n${usage()}`,
    );
  }

  const report = compareMapPerformanceEvidence(
    loadEvidence("Baseline", options.baselinePath),
    loadEvidence("Variant", options.variantPath),
    {
      expectedSourceRevision: options.sourceRevision ?? currentGitRevision(),
      maximumWarmRegressionPercent: options.maximumWarmRegressionPercent,
      maximumCaptureSkewMs: options.maximumCaptureSkewHours * 60 * 60 * 1000,
    },
  );

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.status !== "pass") process.exitCode = 1;
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Map performance comparison failed: ${message}\n`);
  process.exitCode = 1;
}

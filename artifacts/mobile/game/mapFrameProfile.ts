export const MAP_FRAME_PROFILE_KINDS = [
  "camera",
  "battle",
  "battle-cold",
  "battle-warm",
  "conquest-pulse",
] as const;

export type MapFrameProfileKind = (typeof MAP_FRAME_PROFILE_KINDS)[number];

export interface MapRendererInfoSample {
  calls: number;
  triangles: number;
  points: number;
  lines: number;
  programs: number;
  geometries: number;
  textures: number;
  memoryBytes: number | null;
}

export interface MapRendererInfoSummary {
  contractVersion: 1;
  sampleCount: number;
  first: MapRendererInfoSample;
  last: MapRendererInfoSample;
  peak: MapRendererInfoSample;
}

export interface MapFrameProfileAccumulator {
  kind: MapFrameProfileKind;
  targetFps: number;
  samplesMs: number[];
  rendererSamples: MapRendererInfoSample[];
}

export interface MapFrameProfileReport {
  contractVersion: 1;
  kind: MapFrameProfileKind;
  targetFps: number;
  sampleCount: number;
  durationMs: number;
  averageFps: number;
  p50FrameMs: number;
  p95FrameMs: number;
  p99FrameMs: number;
  maxFrameMs: number;
  slowFrameCount: number;
  estimatedDroppedFrames: number;
  withinBudgetRatio: number;
  renderer?: MapRendererInfoSummary;
}

export interface MapRendererBattleStabilityAccumulator {
  requiredBattleCount: number;
  samples: MapRendererInfoSample[];
}

export interface MapRendererBattleStabilityReport {
  contractVersion: 1;
  requiredBattleCount: number;
  observedBattleCount: number;
  complete: boolean;
  stable: boolean;
  sustainedGrowthFields: Array<"programs" | "geometries" | "textures">;
  first: MapRendererInfoSample | null;
  last: MapRendererInfoSample | null;
  peak: MapRendererInfoSample | null;
}

const DEFAULT_TARGET_FPS = 60;

function rounded(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function percentile(sorted: readonly number[], ratio: number): number {
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * ratio) - 1),
  );
  return sorted[index] ?? 0;
}

const RENDERER_NUMERIC_FIELDS = [
  "calls",
  "triangles",
  "points",
  "lines",
  "programs",
  "geometries",
  "textures",
] as const satisfies readonly (keyof MapRendererInfoSample)[];

function validRendererSample(sample: MapRendererInfoSample): boolean {
  return (
    RENDERER_NUMERIC_FIELDS.every(
      (field) =>
        Number.isFinite(sample[field]) &&
        sample[field] >= 0 &&
        Number.isInteger(sample[field]),
    ) &&
    (sample.memoryBytes === null ||
      (Number.isFinite(sample.memoryBytes) && sample.memoryBytes >= 0))
  );
}

function copyRendererSample(
  sample: MapRendererInfoSample,
): MapRendererInfoSample {
  return { ...sample };
}

function peakRendererSample(
  samples: readonly MapRendererInfoSample[],
): MapRendererInfoSample | null {
  const first = samples[0];
  if (!first) return null;
  const peak = copyRendererSample(first);
  for (const sample of samples.slice(1)) {
    for (const field of RENDERER_NUMERIC_FIELDS) {
      peak[field] = Math.max(peak[field], sample[field]);
    }
    if (sample.memoryBytes !== null) {
      peak.memoryBytes = Math.max(peak.memoryBytes ?? 0, sample.memoryBytes);
    }
  }
  return peak;
}

function summarizeRendererSamples(
  samples: readonly MapRendererInfoSample[],
): MapRendererInfoSummary | undefined {
  const first = samples[0];
  const last = samples[samples.length - 1];
  const peak = peakRendererSample(samples);
  if (!first || !last || !peak) return undefined;
  return {
    contractVersion: 1,
    sampleCount: samples.length,
    first: copyRendererSample(first),
    last: copyRendererSample(last),
    peak,
  };
}

export function createMapFrameProfile(
  kind: MapFrameProfileKind,
  targetFps = DEFAULT_TARGET_FPS,
): MapFrameProfileAccumulator {
  return {
    kind,
    targetFps:
      Number.isFinite(targetFps) && targetFps > 0
        ? targetFps
        : DEFAULT_TARGET_FPS,
    samplesMs: [],
    rendererSamples: [],
  };
}

export function recordMapFrameSample(
  profile: MapFrameProfileAccumulator,
  deltaSeconds: number,
  rendererSample?: MapRendererInfoSample,
): void {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
  profile.samplesMs.push(deltaSeconds * 1000);
  if (rendererSample && validRendererSample(rendererSample)) {
    profile.rendererSamples.push(copyRendererSample(rendererSample));
  }
}

export function summarizeMapFrameProfile(
  profile: MapFrameProfileAccumulator,
): MapFrameProfileReport | null {
  if (profile.samplesMs.length === 0) return null;

  const samples = [...profile.samplesMs].sort((left, right) => left - right);
  const durationMs = samples.reduce((total, sample) => total + sample, 0);
  const frameBudgetMs = 1000 / profile.targetFps;
  const slowFrameCount = samples.filter(
    (sample) => sample > frameBudgetMs * 1.1,
  ).length;
  const estimatedDroppedFrames = samples.reduce(
    (total, sample) =>
      total + Math.max(0, Math.round(sample / frameBudgetMs) - 1),
    0,
  );

  const report: MapFrameProfileReport = {
    contractVersion: 1,
    kind: profile.kind,
    targetFps: profile.targetFps,
    sampleCount: samples.length,
    durationMs: rounded(durationMs),
    averageFps: rounded((samples.length * 1000) / durationMs),
    p50FrameMs: rounded(percentile(samples, 0.5)),
    p95FrameMs: rounded(percentile(samples, 0.95)),
    p99FrameMs: rounded(percentile(samples, 0.99)),
    maxFrameMs: rounded(samples[samples.length - 1] ?? 0),
    slowFrameCount,
    estimatedDroppedFrames,
    withinBudgetRatio: rounded(
      (samples.length - slowFrameCount) / samples.length,
    ),
  };
  const renderer = summarizeRendererSamples(profile.rendererSamples);
  if (renderer) report.renderer = renderer;
  return report;
}

export function createMapRendererBattleStability(
  requiredBattleCount = 50,
): MapRendererBattleStabilityAccumulator {
  return {
    requiredBattleCount:
      Number.isInteger(requiredBattleCount) && requiredBattleCount > 0
        ? requiredBattleCount
        : 50,
    samples: [],
  };
}

export function recordMapRendererBattleSample(
  accumulator: MapRendererBattleStabilityAccumulator,
  sample: MapRendererInfoSample,
): void {
  if (!validRendererSample(sample)) return;
  accumulator.samples.push(copyRendererSample(sample));
}

function hasSustainedGrowth(
  samples: readonly MapRendererInfoSample[],
  field: "programs" | "geometries" | "textures",
): boolean {
  const postWarmup = samples.slice(Math.min(5, samples.length));
  for (let start = 0; start + 5 <= postWarmup.length; start += 1) {
    const window = postWarmup.slice(start, start + 10);
    let increases = 0;
    let monotonic = true;
    for (let index = 1; index < window.length; index += 1) {
      if (window[index][field] < window[index - 1][field]) {
        monotonic = false;
        break;
      }
      if (window[index][field] > window[index - 1][field]) increases += 1;
    }
    if (
      monotonic &&
      increases >= 3 &&
      window[window.length - 1][field] > window[0][field]
    ) {
      return true;
    }
  }
  return false;
}

export function summarizeMapRendererBattleStability(
  accumulator: MapRendererBattleStabilityAccumulator,
): MapRendererBattleStabilityReport {
  const complete =
    accumulator.samples.length >= accumulator.requiredBattleCount;
  const sustainedGrowthFields = (
    ["programs", "geometries", "textures"] as const
  ).filter((field) => hasSustainedGrowth(accumulator.samples, field));
  const first = accumulator.samples[0] ?? null;
  const last = accumulator.samples[accumulator.samples.length - 1] ?? null;
  return {
    contractVersion: 1,
    requiredBattleCount: accumulator.requiredBattleCount,
    observedBattleCount: accumulator.samples.length,
    complete,
    stable: complete && sustainedGrowthFields.length === 0,
    sustainedGrowthFields,
    first: first ? copyRendererSample(first) : null,
    last: last ? copyRendererSample(last) : null,
    peak: peakRendererSample(accumulator.samples),
  };
}

export type MapFrameProfileKind = "camera" | "battle";

export interface MapFrameProfileAccumulator {
  kind: MapFrameProfileKind;
  targetFps: number;
  samplesMs: number[];
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
  };
}

export function recordMapFrameSample(
  profile: MapFrameProfileAccumulator,
  deltaSeconds: number,
): void {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
  profile.samplesMs.push(deltaSeconds * 1000);
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

  return {
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
}

export interface R3FEffectTimelineState {
  elapsedSeconds: number;
  linearProgress: number;
  progress: number;
  completed: boolean;
}

export interface R3FEffectTimelineStep {
  state: R3FEffectTimelineState;
  completedNow: boolean;
  visible: boolean;
}

export interface R3FEffectTimelineOptions {
  durationSeconds: number;
  suspended?: boolean;
  reducedMotion?: boolean;
}

export function boundedR3FFrameDeltaSeconds(
  previousFrameAtMs: number,
  frameAtMs: number,
  maximumGapMs: number,
): number | null {
  if (
    !Number.isFinite(previousFrameAtMs) ||
    !Number.isFinite(frameAtMs) ||
    !Number.isFinite(maximumGapMs) ||
    maximumGapMs <= 0
  ) {
    return null;
  }
  const deltaMs = frameAtMs - previousFrameAtMs;
  if (deltaMs < 0) return null;
  return Math.min(deltaMs, maximumGapMs) / 1000;
}

export function clampR3FEffectProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function easeOutR3FEffectProgress(value: number): number {
  const progress = clampR3FEffectProgress(value);
  return 1 - Math.pow(1 - progress, 3);
}

export function createR3FEffectTimelineState(): R3FEffectTimelineState {
  return {
    elapsedSeconds: 0,
    linearProgress: 0,
    progress: 0,
    completed: false,
  };
}

export function isR3FEffectVisible(state: R3FEffectTimelineState): boolean {
  return !state.completed;
}

export function advanceR3FEffectTimeline(
  state: R3FEffectTimelineState,
  deltaSeconds: number,
  options: R3FEffectTimelineOptions,
): R3FEffectTimelineStep {
  if (state.completed) {
    return { state, completedNow: false, visible: false };
  }
  if (options.suspended) {
    return { state, completedNow: false, visible: true };
  }

  const durationSeconds =
    Number.isFinite(options.durationSeconds) && options.durationSeconds > 0
      ? options.durationSeconds
      : 1;
  const elapsedSeconds = options.reducedMotion
    ? durationSeconds
    : Math.min(
        durationSeconds,
        state.elapsedSeconds +
          (Number.isFinite(deltaSeconds) && deltaSeconds > 0
            ? deltaSeconds
            : 0),
      );
  const linearProgress = clampR3FEffectProgress(
    elapsedSeconds / durationSeconds,
  );
  const completed = linearProgress >= 1;
  const nextState: R3FEffectTimelineState = {
    elapsedSeconds,
    linearProgress,
    progress: easeOutR3FEffectProgress(linearProgress),
    completed,
  };

  return {
    state: nextState,
    completedNow: completed,
    visible: !completed,
  };
}

import { equal, ok } from "node:assert/strict";
import { test } from "node:test";

import {
  advanceR3FEffectTimeline,
  createR3FEffectTimelineState,
  easeOutR3FEffectProgress,
  isR3FEffectVisible,
} from "../../game/r3fEffectTimeline";

test("R3F effect timeline advances, eases, and completes exactly once", () => {
  let state = createR3FEffectTimelineState();

  let step = advanceR3FEffectTimeline(state, 0.25, {
    durationSeconds: 1,
  });
  state = step.state;
  equal(state.linearProgress, 0.25);
  equal(state.progress, easeOutR3FEffectProgress(0.25));
  ok(state.progress > state.linearProgress);
  equal(step.completedNow, false);
  equal(isR3FEffectVisible(state), true);

  step = advanceR3FEffectTimeline(state, 0.75, { durationSeconds: 1 });
  state = step.state;
  equal(state.linearProgress, 1);
  equal(state.progress, 1);
  equal(step.completedNow, true);
  equal(step.visible, false);

  step = advanceR3FEffectTimeline(state, 1, { durationSeconds: 1 });
  equal(step.state, state);
  equal(step.completedNow, false);
  equal(step.visible, false);
});

test("R3F effect timeline pauses without losing elapsed time and resumes", () => {
  let state = advanceR3FEffectTimeline(createR3FEffectTimelineState(), 0.4, {
    durationSeconds: 1,
  }).state;
  const paused = advanceR3FEffectTimeline(state, 10, {
    durationSeconds: 1,
    suspended: true,
  });
  equal(paused.state, state);
  equal(paused.completedNow, false);
  equal(paused.visible, true);

  state = advanceR3FEffectTimeline(paused.state, 0.6, {
    durationSeconds: 1,
  }).state;
  equal(state.completed, true);
});

test("R3F effect timeline honors reduced motion and rejects invalid deltas", () => {
  const initial = createR3FEffectTimelineState();
  equal(
    advanceR3FEffectTimeline(initial, Number.NaN, {
      durationSeconds: 1,
    }).state.elapsedSeconds,
    0,
  );
  const reduced = advanceR3FEffectTimeline(initial, 0, {
    durationSeconds: 2,
    reducedMotion: true,
  });
  equal(reduced.state.completed, true);
  equal(reduced.completedNow, true);
  equal(reduced.visible, false);
});

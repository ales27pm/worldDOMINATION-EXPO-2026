import { equal, ok } from 'node:assert/strict';
import { test } from 'node:test';

import {
  cameraZoomedAt,
  stepCriticalSpring,
  stepDecay,
} from '../../game/cameraMotion';

test('focal zoom keeps the chosen board point at the same viewport position', () => {
  const camera = { cx: 700, cy: 420, vw: 900 };
  const point = { x: 940, y: 510 };
  const zoomed = cameraZoomedAt(camera, point, 450);

  equal((point.x - camera.cx) / camera.vw, (point.x - zoomed.cx) / zoomed.vw);
  equal((point.y - camera.cy) / camera.vw, (point.y - zoomed.cy) / zoomed.vw);
});

test('critical spring converges consistently at 60 Hz and 120 Hz', () => {
  const integrate = (fps: number) => {
    let position = 0;
    let velocity = 0;
    for (let frame = 0; frame < fps; frame += 1) {
      ({ position, velocity } = stepCriticalSpring(
        position,
        100,
        velocity,
        1 / fps,
        11,
      ));
    }
    return { position, velocity };
  };

  const sixty = integrate(60);
  const oneTwenty = integrate(120);
  ok(Math.abs(sixty.position - 100) < 0.03);
  ok(Math.abs(sixty.velocity) < 0.3);
  ok(Math.abs(sixty.position - oneTwenty.position) < 1e-9);
  ok(Math.abs(sixty.velocity - oneTwenty.velocity) < 1e-9);
});

test('pan inertia is refresh-rate independent and loses velocity', () => {
  const integrate = (fps: number) => {
    let position = 0;
    let velocity = 600;
    for (let frame = 0; frame < fps; frame += 1) {
      ({ position, velocity } = stepDecay(position, velocity, 1 / fps, 7.5));
    }
    return { position, velocity };
  };

  const sixty = integrate(60);
  const oneTwenty = integrate(120);
  ok(sixty.position > 75 && sixty.position < 81);
  ok(sixty.velocity < 1);
  ok(Math.abs(sixty.position - oneTwenty.position) < 1e-9);
  ok(Math.abs(sixty.velocity - oneTwenty.velocity) < 1e-9);
});

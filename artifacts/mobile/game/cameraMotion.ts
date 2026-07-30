import type { Camera } from './camera';

export interface AxisMotion {
  position: number;
  velocity: number;
}

/**
 * Exact critically damped spring integration. Unlike frame-by-frame lerping,
 * this preserves velocity and produces the same motion at different refresh
 * rates.
 */
export function stepCriticalSpring(
  position: number,
  target: number,
  velocity: number,
  deltaSeconds: number,
  angularFrequency: number,
): AxisMotion {
  const dt = Math.min(Math.max(deltaSeconds, 0), 0.05);
  const omega = Math.max(0.001, angularFrequency);
  const displacement = position - target;
  const coefficient = velocity + omega * displacement;
  const decay = Math.exp(-omega * dt);

  return {
    position: target + (displacement + coefficient * dt) * decay,
    velocity: (velocity - omega * coefficient * dt) * decay,
  };
}

/** Exact exponential velocity decay used by bounded pan inertia. */
export function stepDecay(
  position: number,
  velocity: number,
  deltaSeconds: number,
  friction: number,
): AxisMotion {
  const dt = Math.min(Math.max(deltaSeconds, 0), 0.05);
  const safeFriction = Math.max(0.001, friction);
  const decay = Math.exp(-safeFriction * dt);

  return {
    position: position + (velocity / safeFriction) * (1 - decay),
    velocity: velocity * decay,
  };
}

/**
 * Recenter a zoom so the chosen board point retains the same normalized
 * viewport position before and after the zoom.
 */
export function cameraZoomedAt(
  camera: Camera,
  point: { x: number; y: number },
  nextViewWidth: number,
): Camera {
  const ratio = nextViewWidth / camera.vw;
  return {
    cx: point.x - (point.x - camera.cx) * ratio,
    cy: point.y - (point.y - camera.cy) * ratio,
    vw: nextViewWidth,
  };
}

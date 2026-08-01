import { Color, Vector2 } from "three";

export const RADIAL_OVERLAY_VERTEX_SHADER = `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const RADIAL_NOISE_GLSL = `
float radialHash(vec2 point) {
  return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453);
}

float radialNoise(vec2 uv, float seed) {
  vec2 cell = floor(uv * 48.0 + seed);
  return (radialHash(cell) - 0.5) * 0.05;
}
`;

export const CONQUEST_PULSE_FRAGMENT_SHADER = `
uniform float uProgress;
uniform vec3 uColor;
uniform float uOpacity;
uniform vec2 uOrigin;
uniform float uSeed;
varying vec2 vUv;

${RADIAL_NOISE_GLSL}

void main() {
  float distanceFromOrigin = length(vUv - uOrigin);
  float radius = mix(0.0, 1.08, clamp(uProgress, 0.0, 1.0));
  float distanceToFront = abs(distanceFromOrigin + radialNoise(vUv, uSeed) - radius);
  float ring = 1.0 - smoothstep(0.018, 0.075, distanceToFront);
  float fade = 1.0 - smoothstep(0.72, 1.0, uProgress);
  float alpha = ring * fade * uOpacity;
  if (alpha <= 0.001) discard;
  gl_FragColor = vec4(uColor, alpha);
}
`;

export const SEALED_ORDER_REVEAL_FRAGMENT_SHADER = `
uniform float uProgress;
uniform vec3 uColor;
uniform float uOpacity;
uniform vec2 uOrigin;
uniform float uSeed;
varying vec2 vUv;

${RADIAL_NOISE_GLSL}

void main() {
  float distanceFromOrigin = length(vUv - uOrigin);
  float radius = mix(0.0, 1.12, clamp(uProgress, 0.0, 1.0));
  float noisyDistance = distanceFromOrigin + radialNoise(vUv, uSeed);
  float revealed = 1.0 - smoothstep(radius - 0.055, radius + 0.035, noisyDistance);
  float edge = 1.0 - smoothstep(0.0, 0.075, abs(noisyDistance - radius));
  float fade = 1.0 - smoothstep(0.8, 1.0, uProgress);
  float alpha = max(revealed * 0.28, edge) * fade * uOpacity;
  if (alpha <= 0.001) discard;
  gl_FragColor = vec4(uColor, alpha);
}
`;

export function radialOverlaySeed(id: string): number {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

export function createRadialOverlayUniforms(
  color: string,
  opacity: number,
  origin: readonly [number, number],
  seed: number,
) {
  return {
    uProgress: { value: 0 },
    uColor: { value: new Color(color) },
    uOpacity: { value: opacity },
    uOrigin: { value: new Vector2(origin[0], origin[1]) },
    uSeed: { value: seed },
  };
}

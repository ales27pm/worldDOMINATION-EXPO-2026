import {
  MANUAL_MIN_VW,
  MAP_H,
  MAP_W,
  autoMinVw,
  cameraForAttention,
  clampCamera,
  computeAttention,
  defaultCamera,
  fullCamera,
  type Camera,
} from "./camera";
import { cameraZoomedAt, stepCriticalSpring, stepDecay } from "./cameraMotion";
import { MAP_SCENE_UNITS_PER_PIXEL } from "./mapSceneGeometry";
import type { GameState, TerritoryId } from "./types";

export type CameraIntentReason =
  | "initial"
  | "focus"
  | "full"
  | "pan"
  | "pinch"
  | "wheel"
  | "zoom-control"
  | "double-tap";

export interface CameraIntent {
  reason: CameraIntentReason;
  target: Camera;
  transition: "snap" | "spring";
}

export type MapCameraMotion = "idle" | "spring" | "inertia";

export interface MapCameraRuntime {
  current: Camera;
  target: Camera;
  velocity: {
    x: number;
    y: number;
    width: number;
  };
  motion: MapCameraMotion;
  lastReason: CameraIntentReason;
}

export interface PerspectiveCameraPose {
  fov: number;
  near: number;
  far: number;
  position: [number, number, number];
  target: [number, number, number];
}

const SPRING_FREQUENCY = 11;
const PAN_FRICTION = 7.5;
const PAN_STOP_SPEED = 2;
const CAMERA_FOV = 35;
const CAMERA_FIT_MARGIN = 1.08;
const CAMERA_ELEVATION = 0.94;
const CAMERA_DEPTH = 0.34;

function cameraForGameAttention(
  game: GameState,
  selected: TerritoryId | null,
  aspect: number,
  viewportWidth: number,
): Camera {
  const points = computeAttention(game, selected);
  return points.length === 0
    ? defaultCamera(aspect)
    : cameraForAttention(points, aspect, autoMinVw(viewportWidth));
}

export function initialCameraIntent(
  game: GameState,
  selected: TerritoryId | null,
  aspect: number,
  viewportWidth: number,
): CameraIntent {
  return {
    reason: "initial",
    target: cameraForGameAttention(game, selected, aspect, viewportWidth),
    transition: "snap",
  };
}

export function focusCameraIntent(
  game: GameState,
  selected: TerritoryId | null,
  aspect: number,
  viewportWidth: number,
): CameraIntent {
  return {
    reason: "focus",
    target: cameraForGameAttention(game, selected, aspect, viewportWidth),
    transition: "spring",
  };
}

export function fullCameraIntent(aspect: number): CameraIntent {
  return {
    reason: "full",
    target: fullCamera(aspect),
    transition: "spring",
  };
}

export function screenPointToBoard(
  camera: Camera,
  viewportWidth: number,
  viewportHeight: number,
  screenX: number,
  screenY: number,
): { x: number; y: number } {
  const safeWidth = Math.max(1, viewportWidth);
  const scale = safeWidth / camera.vw;
  return {
    x: camera.cx + (screenX - safeWidth / 2) / scale,
    y: camera.cy + (screenY - Math.max(1, viewportHeight) / 2) / scale,
  };
}

export function panCameraIntent(
  camera: Camera,
  aspect: number,
  viewportWidth: number,
  translationX: number,
  translationY: number,
): CameraIntent {
  const boardUnitsPerPixel = camera.vw / Math.max(1, viewportWidth);
  return {
    reason: "pan",
    target: clampCamera(
      {
        cx: camera.cx - translationX * boardUnitsPerPixel,
        cy: camera.cy - translationY * boardUnitsPerPixel,
        vw: camera.vw,
      },
      aspect,
    ),
    transition: "snap",
  };
}

export function zoomCameraIntent(
  camera: Camera,
  aspect: number,
  focalPoint: { x: number; y: number },
  nextViewWidth: number,
  reason: Extract<
    CameraIntentReason,
    "pinch" | "wheel" | "zoom-control" | "double-tap"
  >,
  transition: CameraIntent["transition"],
): CameraIntent {
  return {
    reason,
    target: clampCamera(
      cameraZoomedAt(camera, focalPoint, nextViewWidth),
      aspect,
    ),
    transition,
  };
}

export function createMapCameraRuntime(intent: CameraIntent): MapCameraRuntime {
  return {
    current: { ...intent.target },
    target: { ...intent.target },
    velocity: { x: 0, y: 0, width: 0 },
    motion: "idle",
    lastReason: intent.reason,
  };
}

export function applyCameraIntent(
  runtime: MapCameraRuntime,
  intent: CameraIntent,
): void {
  runtime.target = { ...intent.target };
  runtime.velocity = { x: 0, y: 0, width: 0 };
  runtime.motion = intent.transition === "spring" ? "spring" : "idle";
  runtime.lastReason = intent.reason;
  if (intent.transition === "snap") {
    runtime.current = { ...intent.target };
  }
}

export function beginCameraInertia(
  runtime: MapCameraRuntime,
  velocityX: number,
  velocityY: number,
): void {
  runtime.velocity.x = velocityX;
  runtime.velocity.y = velocityY;
  runtime.velocity.width = 0;
  runtime.motion =
    Math.hypot(velocityX, velocityY) >= PAN_STOP_SPEED ? "inertia" : "idle";
}

export function stopCameraMotion(runtime: MapCameraRuntime): void {
  runtime.target = { ...runtime.current };
  runtime.velocity = { x: 0, y: 0, width: 0 };
  runtime.motion = "idle";
}

export function stepMapCameraRuntime(
  runtime: MapCameraRuntime,
  deltaSeconds: number,
  aspect: number,
): boolean {
  if (runtime.motion === "idle") return false;

  if (runtime.motion === "inertia") {
    const nextX = stepDecay(
      runtime.current.cx,
      runtime.velocity.x,
      deltaSeconds,
      PAN_FRICTION,
    );
    const nextY = stepDecay(
      runtime.current.cy,
      runtime.velocity.y,
      deltaSeconds,
      PAN_FRICTION,
    );
    const clamped = clampCamera(
      {
        cx: nextX.position,
        cy: nextY.position,
        vw: runtime.current.vw,
      },
      aspect,
    );
    runtime.velocity.x =
      Math.abs(clamped.cx - nextX.position) > 0.01 ? 0 : nextX.velocity;
    runtime.velocity.y =
      Math.abs(clamped.cy - nextY.position) > 0.01 ? 0 : nextY.velocity;
    runtime.current = clamped;
    runtime.target = { ...clamped };
    if (Math.hypot(runtime.velocity.x, runtime.velocity.y) < PAN_STOP_SPEED) {
      stopCameraMotion(runtime);
    }
    return true;
  }

  const nextX = stepCriticalSpring(
    runtime.current.cx,
    runtime.target.cx,
    runtime.velocity.x,
    deltaSeconds,
    SPRING_FREQUENCY,
  );
  const nextY = stepCriticalSpring(
    runtime.current.cy,
    runtime.target.cy,
    runtime.velocity.y,
    deltaSeconds,
    SPRING_FREQUENCY,
  );
  const nextWidth = stepCriticalSpring(
    runtime.current.vw,
    runtime.target.vw,
    runtime.velocity.width,
    deltaSeconds,
    SPRING_FREQUENCY,
  );
  const clamped = clampCamera(
    {
      cx: nextX.position,
      cy: nextY.position,
      vw: nextWidth.position,
    },
    aspect,
    Math.min(MANUAL_MIN_VW, runtime.target.vw),
  );
  runtime.current = clamped;
  runtime.velocity.x =
    Math.abs(clamped.cx - nextX.position) > 0.01 ? 0 : nextX.velocity;
  runtime.velocity.y =
    Math.abs(clamped.cy - nextY.position) > 0.01 ? 0 : nextY.velocity;
  runtime.velocity.width =
    Math.abs(clamped.vw - nextWidth.position) > 0.01 ? 0 : nextWidth.velocity;

  const settled =
    Math.abs(runtime.target.cx - runtime.current.cx) < 0.05 &&
    Math.abs(runtime.target.cy - runtime.current.cy) < 0.05 &&
    Math.abs(runtime.target.vw - runtime.current.vw) < 0.05 &&
    Math.abs(runtime.velocity.x) < 0.1 &&
    Math.abs(runtime.velocity.y) < 0.1 &&
    Math.abs(runtime.velocity.width) < 0.1;
  if (settled) {
    runtime.current = { ...runtime.target };
    stopCameraMotion(runtime);
  }
  return true;
}

export function perspectivePoseForCamera(
  camera: Camera,
  aspect: number,
): PerspectiveCameraPose {
  const safeAspect = Math.max(0.1, aspect);
  const verticalFov = (CAMERA_FOV * Math.PI) / 180;
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * safeAspect);
  const viewWidth = camera.vw * MAP_SCENE_UNITS_PER_PIXEL;
  const distance =
    (viewWidth / 2 / Math.tan(horizontalFov / 2)) * CAMERA_FIT_MARGIN;
  const directionLength = Math.hypot(CAMERA_ELEVATION, CAMERA_DEPTH);
  const elevation = CAMERA_ELEVATION / directionLength;
  const depth = CAMERA_DEPTH / directionLength;
  const targetX = (camera.cx - MAP_W / 2) * MAP_SCENE_UNITS_PER_PIXEL;
  const targetZ = (camera.cy - MAP_H / 2) * MAP_SCENE_UNITS_PER_PIXEL;

  return {
    fov: CAMERA_FOV,
    near: Math.max(0.03, distance / 200),
    far: Math.max(50, distance + 35),
    position: [targetX, distance * elevation, targetZ + distance * depth],
    target: [targetX, 0, targetZ],
  };
}

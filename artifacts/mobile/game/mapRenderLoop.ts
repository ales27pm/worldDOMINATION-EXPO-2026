import type { MapPerformancePlatform } from "./mapPerformanceEvidence";

export type MapCanvasFrameloop = "always" | "demand" | "never";

export const NATIVE_CAMERA_IDLE_SETTLE_FRAMES = 2;

export interface MapCameraIdleSettle {
  idleFrameCount: number;
  shouldRelease: boolean;
}

export function resolveMapCanvasFrameloop(
  platform: MapPerformancePlatform,
  battleSceneVisible: boolean,
  cameraRendering: boolean,
): MapCanvasFrameloop {
  if (battleSceneVisible) return "never";
  if (platform === "web" || cameraRendering) return "always";
  return "demand";
}

export function advanceMapCameraIdleSettle(
  platform: MapPerformancePlatform,
  cameraIdle: boolean,
  idleFrameCount: number,
): MapCameraIdleSettle {
  if (!cameraIdle) {
    return { idleFrameCount: 0, shouldRelease: false };
  }
  if (platform === "web") {
    return { idleFrameCount: 0, shouldRelease: true };
  }

  const nextIdleFrameCount = idleFrameCount + 1;
  return {
    idleFrameCount: nextIdleFrameCount,
    shouldRelease:
      nextIdleFrameCount > NATIVE_CAMERA_IDLE_SETTLE_FRAMES,
  };
}

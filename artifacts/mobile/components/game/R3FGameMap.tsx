import Ionicons from "@expo/vector-icons/Ionicons";
import * as Application from "expo-application";
import Constants from "expo-constants";
import * as Device from "expo-device";
import React, {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  AppState,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type ViewProps,
} from "react-native";
import {
  AdditiveBlending,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Line as ThreeLine,
  LineBasicMaterial,
  Mesh,
  PerspectiveCamera,
  Raycaster,
  Vector2,
  Vector3,
  type Camera as ThreeCamera,
} from "three";

import { R3FArmyLayer } from "@/components/game/R3FArmyLayer";
import R3FCommandRoom from "@/components/game/R3FCommandRoom";
import { R3FGestureSurface } from "@/components/game/R3FGestureSurface";
import R3FTable from "@/components/game/R3FTable";
import R3FTerritoryLabels from "@/components/game/R3FTerritoryLabels";
import R3FTerritoryMeshes from "@/components/game/R3FTerritoryMeshes";
import {
  Canvas,
  useFrame,
  useThree,
} from "@/components/game/r3fRuntime";
import {
  MAP_H,
  MAP_W,
  autoMinVw,
  clampCamera,
  type Camera,
} from "@/game/camera";
import {
  MapAttentionDirector,
  type MapAttentionEvent,
  type MapAttentionRequest,
  type MapAttentionTargetRegistry,
} from "@/game/mapAttentionDirector";
import { BUILD_SOURCE_REVISION } from "@/game/buildSourceRevision";
import {
  applyCameraIntent,
  beginCameraInertia,
  createMapCameraRuntime,
  focusCameraIntent,
  fullCameraIntent,
  initialCameraIntent,
  panCameraIntent,
  perspectivePoseForCamera,
  screenPointToBoard,
  stepMapCameraRuntime,
  stopCameraMotion,
  zoomCameraIntent,
  type MapCameraRuntime,
} from "@/game/mapCameraIntent";
import {
  advanceMapScenePresentation,
  createMapScenePresentationState,
  type MapSceneBattleEffect,
  type MapSceneModel,
  type MapScenePresentationState,
} from "@/game/mapSceneModel";
import { TERRITORY_MAP } from "@/game/mapData";
import {
  createMapFrameProfile,
  recordMapFrameSample,
  summarizeMapFrameProfile,
  type MapFrameProfileAccumulator,
  type MapFrameProfileKind,
  type MapFrameProfileReport,
} from "@/game/mapFrameProfile";
import {
  qualifyMapRendererPerformance,
  type MapRendererPerformanceQualification,
  type MapPerformanceEnvironment,
} from "@/game/mapFrameQualification";
import {
  createMapPerformanceEvidence,
  type MapPerformanceEvidence,
  type MapPerformancePlatform,
} from "@/game/mapPerformanceEvidence";
import {
  advanceMapCameraIdleSettle,
  resolveMapCanvasFrameloop,
} from "@/game/mapRenderLoop";
import {
  createMapScenePickIndex,
  pickTerritoryFromIntersections,
} from "@/game/mapScenePicking";
import type { GameState, TerritoryId } from "@/game/types";
import {
  getBattleSceneVisibilityRevision,
  getBattleSceneVisible,
  useBattleSceneVisible,
} from "@/lib/battleScenes";

interface Props {
  game: GameState;
  model: MapSceneModel;
  cameraControlsRightInset?: number;
  onTerritoryTap: (id: TerritoryId) => void;
  onPerformanceEvidence?: (evidence: MapPerformanceEvidence) => void;
}

interface LayoutSize {
  width: number;
  height: number;
}

interface PickerState {
  camera: ThreeCamera;
  invalidate: () => void;
  meshes: Mesh[];
}

interface WebWheelEvent {
  preventDefault?: () => void;
  nativeEvent: {
    deltaMode?: number;
    deltaY?: number;
    locationX?: number;
    locationY?: number;
    offsetX?: number;
    offsetY?: number;
  };
}

interface SceneBridgeState extends PickerState {
  projected: Record<string, { x: number; y: number }>;
  roomMeshCount: number;
  texturedRoomMeshCount: number;
  texturedTableMeshCount: number;
  territoryLabelCount: number;
}

const BUTTON_ZOOM = 1.45;
const DOUBLE_TAP_ZOOM = 2.4;
const DYNAMIC_SHADOWS = Platform.OS === "web";
const BATTLE_EFFECT_DURATION = 2.05;
const R3F_DEBUG_ENABLED =
  process.env.EXPO_PUBLIC_BROWSER_SMOKE === "1";
const R3F_QUALIFICATION_ENABLED =
  R3F_DEBUG_ENABLED ||
  process.env.EXPO_PUBLIC_R3F_QUALIFICATION === "1";
const ENABLE_SCENE_PROJECTION =
  Platform.OS === "web" ||
  R3F_DEBUG_ENABLED;
const PERFORMANCE_PLATFORM: MapPerformancePlatform =
  Platform.OS === "ios"
    ? "ios"
    : Platform.OS === "android"
      ? "android"
      : "web";
const PERFORMANCE_ENVIRONMENT: MapPerformanceEnvironment =
  PERFORMANCE_PLATFORM === "web"
    ? "browser"
    : Device.isDevice
      ? "physical"
      : "simulator";
const PERFORMANCE_DEVICE = {
  modelName: Device.modelName,
  modelId: Device.modelId,
  osName: Device.osName,
  osVersion: Device.osVersion,
  deviceYearClass: Device.deviceYearClass,
};
const nativeApplicationVersion =
  PERFORMANCE_PLATFORM === "web"
    ? Constants.expoConfig?.version ?? null
    : Application.nativeApplicationVersion;
const nativeBuildVersion =
  PERFORMANCE_PLATFORM === "web"
    ? null
    : Application.nativeBuildVersion;
const PERFORMANCE_APPLICATION = {
  version: nativeApplicationVersion,
  nativeBuildVersion,
  sourceRevision:
    BUILD_SOURCE_REVISION ??
    (process.env.EXPO_PUBLIC_SOURCE_REVISION?.trim().toLowerCase() ||
      null),
  sessionId: Constants.sessionId,
};
const MAX_ACTIVE_FRAME_GAP_MS = 250;
const NATIVE_CAMERA_PRESENT_DELAY_MS = 80;

function activeFrameTimeMs(): number {
  // iOS can resume GL one callback before performance.now() catches up after
  // a UIKit modal. Wall time is current on that first callback; visibility
  // revisions and the frame-gap guard keep covered time out of the sample.
  return Date.now();
}

function activeFrameDeltaSeconds(
  previousFrameAtMs: number,
  frameAtMs: number,
): number | null {
  const deltaMs = frameAtMs - previousFrameAtMs;
  if (deltaMs < 0 || deltaMs > MAX_ACTIVE_FRAME_GAP_MS) return null;
  return deltaMs / 1000;
}

function updateR3FDebug(values: Record<string, unknown>): void {
  if (!R3F_DEBUG_ENABLED) return;
  const root = globalThis as typeof globalThis & {
    __WORLD_DOMINATION_R3F__?: Record<string, unknown>;
  };
  root.__WORLD_DOMINATION_R3F__ = {
    ...root.__WORLD_DOMINATION_R3F__,
    ...values,
  };
}

function BattleEffect({
  battle,
  onComplete,
  suspended,
}: {
  battle: MapSceneBattleEffect;
  onComplete: (battleId: string) => void;
  suspended: boolean;
}) {
  const projectile = useRef<Mesh>(null);
  const impact = useRef<Group>(null);
  const elapsed = useRef(0);
  const lastActiveFrameAtMs = useRef<number | null>(null);
  const observedVisibilityRevision = useRef(
    getBattleSceneVisibilityRevision(),
  );
  const completed = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const invalidate = useThree((state) => state.invalidate);
  const start = useMemo(() => new Vector3(...battle.fromAnchor), [battle]);
  const end = useMemo(() => new Vector3(...battle.toAnchor), [battle]);
  const lineGeometry = useMemo(() => {
    const points: number[] = [];
    for (let index = 0; index <= 28; index += 1) {
      const t = index / 28;
      points.push(
        start.x + (end.x - start.x) * t,
        start.y + (end.y - start.y) * t + Math.sin(Math.PI * t) * 0.75,
        start.z + (end.z - start.z) * t,
      );
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(points, 3));
    return geometry;
  }, [end, start]);
  const lineMaterial = useMemo(
    () =>
      new LineBasicMaterial({
        color: battle.attackerColor,
        transparent: true,
        opacity: 0.72,
        blending: AdditiveBlending,
      }),
    [battle.attackerColor],
  );
  const line = useMemo(
    () => new ThreeLine(lineGeometry, lineMaterial),
    [lineGeometry, lineMaterial],
  );

  useEffect(() => {
    elapsed.current = 0;
    lastActiveFrameAtMs.current = null;
    completed.current = false;
    line.visible = true;
    if (Platform.OS !== "web") invalidate();
  }, [battle.id, invalidate, line]);

  useEffect(() => {
    if (!suspended) return;
    elapsed.current = 0;
    lastActiveFrameAtMs.current = null;
    completed.current = false;
    line.visible = true;
    if (projectile.current) projectile.current.visible = true;
    if (impact.current) impact.current.visible = false;
  }, [line, suspended]);

  useEffect(
    () => () => {
      lineGeometry.dispose();
      lineMaterial.dispose();
    },
    [lineGeometry, lineMaterial],
  );

  useFrame((_state, frameDeltaSeconds) => {
    const visibilityRevision = getBattleSceneVisibilityRevision();
    if (observedVisibilityRevision.current !== visibilityRevision) {
      observedVisibilityRevision.current = visibilityRevision;
      elapsed.current = 0;
      lastActiveFrameAtMs.current = null;
      completed.current = false;
      line.visible = true;
      if (projectile.current) projectile.current.visible = true;
      if (impact.current) impact.current.visible = false;
      if (Platform.OS !== "web") invalidate();
      return;
    }
    if (getBattleSceneVisible()) {
      lastActiveFrameAtMs.current = null;
      return;
    }
    const frameAtMs = activeFrameTimeMs();
    const previousFrameAtMs = lastActiveFrameAtMs.current;
    lastActiveFrameAtMs.current = frameAtMs;
    if (previousFrameAtMs === null) {
      if (Platform.OS !== "web") invalidate();
      return;
    }
    const deltaSeconds =
      Platform.OS === "web"
        ? Math.min(frameDeltaSeconds, MAX_ACTIVE_FRAME_GAP_MS / 1000)
        : activeFrameDeltaSeconds(previousFrameAtMs, frameAtMs);
    if (deltaSeconds === null) {
      elapsed.current = 0;
      completed.current = false;
      line.visible = true;
      if (projectile.current) projectile.current.visible = true;
      if (impact.current) impact.current.visible = false;
      if (Platform.OS !== "web") invalidate();
      return;
    }
    elapsed.current += deltaSeconds;
    if (elapsed.current >= BATTLE_EFFECT_DURATION) {
      line.visible = false;
      if (projectile.current) projectile.current.visible = false;
      if (impact.current) impact.current.visible = false;
      if (!completed.current) {
        completed.current = true;
        onCompleteRef.current(battle.id);
      }
      return;
    }
    const cycle = elapsed.current;
    const t = Math.min(1, cycle / 1.25);
    const projectileMesh = projectile.current;
    if (projectileMesh) {
      projectileMesh.visible = cycle < 1.35;
      projectileMesh.position.set(
        start.x + (end.x - start.x) * t,
        start.y + (end.y - start.y) * t + Math.sin(Math.PI * t) * 0.75,
        start.z + (end.z - start.z) * t,
      );
      const pulse = 0.8 + Math.sin(t * Math.PI * 8) * 0.2;
      projectileMesh.scale.setScalar(pulse);
    }
    const impactGroup = impact.current;
    if (impactGroup) {
      const impactTime = Math.max(0, Math.min(1, (cycle - 1.15) / 0.7));
      impactGroup.visible = cycle >= 1.05 && cycle <= 2.05;
      impactGroup.scale.setScalar(0.2 + impactTime * 1.8);
      impactGroup.rotation.y = impactTime * Math.PI;
    }
    if (Platform.OS !== "web") invalidate();
  });

  return (
    <group name={`battle_effect__${battle.id}`}>
      <primitive object={line} />
      <mesh ref={projectile}>
        <sphereGeometry args={[0.09, 16, 12]} />
        <meshBasicMaterial color={battle.attackerColor} toneMapped={false} />
      </mesh>
      <group ref={impact} position={end}>
        {Array.from({ length: 8 }, (_, index) => {
          const angle = (index / 8) * Math.PI * 2;
          return (
            <mesh
              key={index}
              position={[Math.cos(angle) * 0.18, 0.14, Math.sin(angle) * 0.18]}
            >
              <sphereGeometry args={[0.035, 8, 6]} />
              <meshBasicMaterial
                color={
                  battle.conquered ? battle.attackerColor : battle.defenderColor
                }
                toneMapped={false}
              />
            </mesh>
          );
        })}
        {Platform.OS === "web" ? (
          <pointLight
            color={
              battle.conquered
                ? battle.attackerColor
                : battle.defenderColor
            }
            intensity={2.4}
            distance={2.2}
          />
        ) : null}
      </group>
    </group>
  );
}

function CameraRig({
  runtime,
  aspect,
  onCameraIdle,
}: {
  runtime: React.MutableRefObject<MapCameraRuntime>;
  aspect: number;
  onCameraIdle: () => void;
}) {
  const camera = useThree((state) => state.camera);
  const invalidate = useThree((state) => state.invalidate);
  const updatePointerEvents = useThree((state) => state.events.update);
  const onCameraIdleRef = useRef(onCameraIdle);
  onCameraIdleRef.current = onCameraIdle;
  const lastApplied = useRef({
    cx: Number.NaN,
    cy: Number.NaN,
    vw: Number.NaN,
    aspect: Number.NaN,
  });
  const idleFrameCount = useRef(0);

  useFrame((_state, deltaSeconds) => {
    const moved = stepMapCameraRuntime(runtime.current, deltaSeconds, aspect);
    const current = runtime.current.current;
    const previous = lastApplied.current;
    const poseUnchanged =
      !moved &&
      previous.cx === current.cx &&
      previous.cy === current.cy &&
      previous.vw === current.vw &&
      previous.aspect === aspect;

    if (!poseUnchanged) {
      const pose = perspectivePoseForCamera(current, aspect);
      camera.position.set(...pose.position);
      camera.lookAt(...pose.target);
      const perspectiveCamera = camera as PerspectiveCamera;
      if (perspectiveCamera.isPerspectiveCamera) {
        perspectiveCamera.fov = pose.fov;
        perspectiveCamera.near = pose.near;
        perspectiveCamera.far = pose.far;
        perspectiveCamera.updateProjectionMatrix();
      }
      camera.updateMatrixWorld(true);
      updatePointerEvents?.();
      previous.cx = current.cx;
      previous.cy = current.cy;
      previous.vw = current.vw;
      previous.aspect = aspect;
      updateR3FDebug({ camera: current });
    }

    const idleSettle = advanceMapCameraIdleSettle(
      PERFORMANCE_PLATFORM,
      runtime.current.motion === "idle",
      idleFrameCount.current,
    );
    idleFrameCount.current = idleSettle.idleFrameCount;
    if (runtime.current.motion !== "idle" && Platform.OS !== "web") {
      invalidate();
    } else if (idleSettle.shouldRelease) {
      onCameraIdleRef.current();
    } else if (Platform.OS !== "web") {
      invalidate();
    }
  });

  return null;
}

function SceneProjection({
  model,
  layout,
  camera,
  projected,
}: {
  model: MapSceneModel;
  layout: LayoutSize;
  camera: ThreeCamera;
  projected: Record<string, { x: number; y: number }>;
}) {
  const point = useRef(new Vector3());

  useFrame(() => {
    for (const territory of model.territories) {
      const screenPoint = point.current
        .set(territory.anchor[0], territory.anchor[1], territory.anchor[2])
        .project(camera);
      const target = projected[territory.id];
      target.x = ((screenPoint.x + 1) / 2) * layout.width;
      target.y = ((1 - screenPoint.y) / 2) * layout.height;
    }
  });

  return null;
}

function meshUsesTexture(mesh: Mesh): boolean {
  const materials = Array.isArray(mesh.material)
    ? mesh.material
    : [mesh.material];
  return materials.some((material) =>
    Boolean((material as { map?: unknown }).map),
  );
}

function SceneBridge({
  model,
  layout,
  onBridge,
}: {
  model: MapSceneModel;
  layout: LayoutSize;
  onBridge: (bridge: SceneBridgeState) => void;
}) {
  const camera = useThree((state) => state.camera);
  const scene = useThree((state) => state.scene);
  const invalidate = useThree((state) => state.invalidate);
  const publishedMeshCount = useRef(-1);
  const projectionKey = model.territories
    .map((territory) => territory.id)
    .join("|");
  const projectionState = useRef<{
    key: string;
    points: Record<string, { x: number; y: number }>;
  }>({ key: "", points: {} });
  if (
    ENABLE_SCENE_PROJECTION &&
    projectionState.current.key !== projectionKey
  ) {
    projectionState.current = {
      key: projectionKey,
      points: Object.fromEntries(
        model.territories.map((territory) => [
          territory.id,
          { x: 0, y: 0 },
        ]),
      ),
    };
  }
  const projected = projectionState.current.points;

  const publishBridge = useCallback(() => {
    const meshes: Mesh[] = [];
    let roomMeshCount = 0;
    let texturedRoomMeshCount = 0;
    let texturedTableMeshCount = 0;
    scene.traverse((object) => {
      const mesh = object as Mesh;
      if (mesh.isMesh && mesh.name.startsWith("pick__")) {
        meshes.push(mesh);
      }
      if (!mesh.isMesh) return;

      const usesTexture = meshUsesTexture(mesh);
      if (mesh.name.startsWith("command_room_")) {
        roomMeshCount += 1;
        if (usesTexture) texturedRoomMeshCount += 1;
      }
      if (mesh.name.startsWith("tabletop_") && usesTexture) {
        texturedTableMeshCount += 1;
      }
    });
    const labelLayer = scene.getObjectByName("territory_labels");
    const territoryLabelCount = Number(
      labelLayer?.userData.territoryCount ?? 0,
    );
    publishedMeshCount.current = meshes.length;
    onBridge({
      camera,
      invalidate,
      meshes,
      projected,
      roomMeshCount,
      texturedRoomMeshCount,
      texturedTableMeshCount,
      territoryLabelCount,
    });
  }, [camera, invalidate, onBridge, projected, scene]);

  useEffect(() => {
    publishedMeshCount.current = -1;
    publishBridge();
  }, [publishBridge]);

  useFrame(() => {
    if (publishedMeshCount.current !== model.territories.length) {
      publishBridge();
    }
  });

  return ENABLE_SCENE_PROJECTION ? (
    <SceneProjection
      model={model}
      layout={layout}
      camera={camera}
      projected={projected}
    />
  ) : null;
}

interface ActiveFrameProfile {
  accumulator: MapFrameProfileAccumulator;
}

type CompletedMapFrameProfiles = Partial<
  Record<MapFrameProfileKind, MapFrameProfileReport>
>;

function publishPerformanceQualification(
  completedProfiles: CompletedMapFrameProfiles,
  onQualification?: (
    qualification: MapRendererPerformanceQualification,
  ) => void,
): void {
  const qualification = qualifyMapRendererPerformance(
    completedProfiles,
    PERFORMANCE_ENVIRONMENT,
  );
  updateR3FDebug({
    performanceQualification: {
      platform: Platform.OS,
      device: PERFORMANCE_DEVICE,
      ...qualification,
    },
  });
  onQualification?.(qualification);
}

function publishFrameProfile(
  profile: ActiveFrameProfile,
  completedProfiles: CompletedMapFrameProfiles,
  onQualification?: (
    qualification: MapRendererPerformanceQualification,
  ) => void,
): void {
  const report = summarizeMapFrameProfile(profile.accumulator);
  if (!report) return;
  completedProfiles[report.kind] = report;
  updateR3FDebug({
    frameProfile: {
      status: "complete",
      platform: Platform.OS,
      ...report,
    },
  });
  publishPerformanceQualification(completedProfiles, onQualification);
}

function PerformanceProbe({
  runtime,
  battle,
  suspended,
  completedProfiles,
  onQualification,
}: {
  runtime: React.MutableRefObject<MapCameraRuntime>;
  battle: MapSceneBattleEffect | null;
  suspended: boolean;
  completedProfiles: React.MutableRefObject<CompletedMapFrameProfiles>;
  onQualification?: (
    qualification: MapRendererPerformanceQualification,
  ) => void;
}) {
  const ambientSample = useRef({ frames: 0, elapsed: 0 });
  const activeProfile = useRef<ActiveFrameProfile | null>(null);
  const lastBattleFrameAtMs = useRef<number | null>(null);
  const observedVisibilityRevision = useRef(
    getBattleSceneVisibilityRevision(),
  );
  const onQualificationRef = useRef(onQualification);
  onQualificationRef.current = onQualification;

  useFrame((_state, deltaSeconds) => {
    const visibilityRevision = getBattleSceneVisibilityRevision();
    if (observedVisibilityRevision.current !== visibilityRevision) {
      observedVisibilityRevision.current = visibilityRevision;
      if (activeProfile.current?.accumulator.kind === "battle") {
        activeProfile.current = null;
      }
      lastBattleFrameAtMs.current = null;
      return;
    }
    if (getBattleSceneVisible()) {
      if (activeProfile.current?.accumulator.kind === "battle") {
        activeProfile.current = null;
      }
      lastBattleFrameAtMs.current = null;
      return;
    }

    if (R3F_DEBUG_ENABLED && Platform.OS === "web") {
      ambientSample.current.frames += 1;
      ambientSample.current.elapsed += deltaSeconds;
      if (ambientSample.current.elapsed >= 1) {
        updateR3FDebug({
          fps:
            ambientSample.current.frames /
            ambientSample.current.elapsed,
        });
        ambientSample.current.frames = 0;
        ambientSample.current.elapsed = 0;
      }
    }

    const kind: MapFrameProfileKind | null = battle
      ? "battle"
      : runtime.current.motion !== "idle"
        ? "camera"
        : null;
    let activeDeltaSeconds = deltaSeconds;
    if (battle) {
      const frameAtMs = activeFrameTimeMs();
      const previousFrameAtMs = lastBattleFrameAtMs.current;
      lastBattleFrameAtMs.current = frameAtMs;
      const battleDeltaSeconds =
        previousFrameAtMs === null
          ? 0
          : Platform.OS === "web"
            ? Math.min(deltaSeconds, MAX_ACTIVE_FRAME_GAP_MS / 1000)
            : activeFrameDeltaSeconds(previousFrameAtMs, frameAtMs);
      if (battleDeltaSeconds === null) {
        if (activeProfile.current?.accumulator.kind === "battle") {
          activeProfile.current = null;
        }
        return;
      }
      activeDeltaSeconds = battleDeltaSeconds;
    } else {
      lastBattleFrameAtMs.current = null;
    }
    const current = activeProfile.current;

    if (current && current.accumulator.kind !== kind) {
      publishFrameProfile(
        current,
        completedProfiles.current,
        onQualificationRef.current,
      );
      activeProfile.current = null;
    }
    if (!kind) return;

    if (!activeProfile.current) {
      activeProfile.current = {
        accumulator: createMapFrameProfile(kind),
      };
      updateR3FDebug({
        frameProfile: {
          status: "active",
          platform: Platform.OS,
          contractVersion: 1,
          kind,
          targetFps: 60,
        },
      });
      return;
    }

    recordMapFrameSample(
      activeProfile.current.accumulator,
      activeDeltaSeconds,
    );
  });

  useEffect(() => {
    const current = activeProfile.current;
    if (battle || current?.accumulator.kind !== "battle") return;
    publishFrameProfile(
      current,
      completedProfiles.current,
      onQualificationRef.current,
    );
    activeProfile.current = null;
  }, [battle]);

  useEffect(() => {
    if (!suspended) return;
    if (activeProfile.current?.accumulator.kind === "battle") {
      activeProfile.current = null;
    }
    lastBattleFrameAtMs.current = null;
  }, [suspended]);

  useEffect(() => {
    lastBattleFrameAtMs.current = null;
    updateR3FDebug({
      frameProfile: null,
    });
    publishPerformanceQualification(
      completedProfiles.current,
      onQualificationRef.current,
    );
    return () => {
      if (activeProfile.current) {
        publishFrameProfile(
          activeProfile.current,
          completedProfiles.current,
          onQualificationRef.current,
        );
      }
      activeProfile.current = null;
    };
  }, [completedProfiles]);

  return null;
}

function TabletopScene({
  model,
  battle,
  battleSceneVisible,
  runtime,
  aspect,
  layout,
  onBridge,
  onLoaded,
  onAttentionTargetsReady,
  onBattleComplete,
  completedProfiles,
  onPerformanceQualification,
  onCameraIdle,
}: {
  model: MapSceneModel;
  battle: MapSceneBattleEffect | null;
  battleSceneVisible: boolean;
  runtime: React.MutableRefObject<MapCameraRuntime>;
  aspect: number;
  layout: LayoutSize;
  onBridge: (bridge: SceneBridgeState) => void;
  onLoaded: () => void;
  onAttentionTargetsReady: (
    registry: MapAttentionTargetRegistry,
  ) => void;
  onBattleComplete: (battleId: string) => void;
  completedProfiles: React.MutableRefObject<CompletedMapFrameProfiles>;
  onPerformanceQualification?: (
    qualification: MapRendererPerformanceQualification,
  ) => void;
  onCameraIdle: () => void;
}) {
  return (
    <>
      <color attach="background" args={["#24201d"]} />
      <ambientLight intensity={0.72} />
      <hemisphereLight args={["#fff0c4", "#6b4b2d", 1.05]} />
      <directionalLight
        castShadow={DYNAMIC_SHADOWS}
        color="#fff1ca"
        intensity={2.1}
        position={[-4.5, 9, 5.5]}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-near={1}
        shadow-camera-far={24}
        shadow-camera-left={-9}
        shadow-camera-right={9}
        shadow-camera-top={7}
        shadow-camera-bottom={-7}
      />
      <Suspense fallback={null}>
        <R3FCommandRoom />
        <R3FTable />
        <R3FTerritoryMeshes
          model={model}
          onLoaded={onLoaded}
          onAttentionTargetsReady={onAttentionTargetsReady}
        />
        <R3FTerritoryLabels model={model} />
        <R3FArmyLayer model={model} />
        {battle ? (
          <BattleEffect
            battle={battle}
            onComplete={onBattleComplete}
            suspended={battleSceneVisible}
          />
        ) : null}
        <SceneBridge model={model} layout={layout} onBridge={onBridge} />
      </Suspense>
      <CameraRig
        runtime={runtime}
        aspect={aspect}
        onCameraIdle={onCameraIdle}
      />
      {R3F_QUALIFICATION_ENABLED ? (
        <PerformanceProbe
          runtime={runtime}
          battle={battle}
          suspended={battleSceneVisible}
          completedProfiles={completedProfiles}
          onQualification={onPerformanceQualification}
        />
      ) : null}
    </>
  );
}

function CameraButton({
  icon,
  label,
  active = false,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => [
        styles.cameraButton,
        active && styles.cameraButtonActive,
        pressed && styles.cameraButtonPressed,
      ]}
    >
      <Ionicons name={icon} size={20} color="#f7e9bc" />
    </Pressable>
  );
}

export default function R3FGameMap({
  game,
  model,
  cameraControlsRightInset,
  onTerritoryTap,
  onPerformanceEvidence,
}: Props) {
  const [layout, setLayout] = useState<LayoutSize>({
    width: 0,
    height: 0,
  });
  const [loaded, setLoaded] = useState(false);
  const [focusActive, setFocusActive] = useState(false);
  const [activeAttentionLabel, setActiveAttentionLabel] = useState<
    string | null
  >(null);
  const [nativeCameraRendering, setNativeCameraRendering] = useState(
    Platform.OS !== "web",
  );
  const nativeCameraRenderingRef = useRef(Platform.OS !== "web");
  const nativeCameraPresentTimer = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const cameraGestureDepth = useRef(0);
  const screenReaderEnabled = useRef(false);
  const reduceMotionEnabled = useRef(false);
  const attentionTargetsRef =
    useRef<MapAttentionTargetRegistry | null>(null);
  const attentionDirectorRef = useRef<MapAttentionDirector | null>(null);
  if (!attentionDirectorRef.current) {
    attentionDirectorRef.current = new MapAttentionDirector({
      defaultPadding: 1.25,
      defaultRequestTtlMs: 1200,
    });
  }
  const attentionDirector = attentionDirectorRef.current;
  const battleSceneVisible = useBattleSceneVisible();
  const pickerRef = useRef<PickerState | null>(null);
  const projectedRef = useRef<Record<string, { x: number; y: number }>>({});
  const completedProfiles = useRef<CompletedMapFrameProfiles>({});
  const completedProfilesVariant = useRef(model.variant);
  if (completedProfilesVariant.current !== model.variant) {
    completedProfilesVariant.current = model.variant;
    completedProfiles.current = {};
  }
  const panStartRef = useRef<Camera | null>(null);
  const pinchStartRef = useRef<{
    camera: Camera;
    point: { x: number; y: number };
  } | null>(null);
  const pendingTapTargetRef = useRef<{
    x: number;
    y: number;
    id: TerritoryId | null;
  } | null>(null);
  const onTapRef = useRef(onTerritoryTap);
  onTapRef.current = onTerritoryTap;
  const aspect =
    layout.width > 0 && layout.height > 0
      ? layout.width / layout.height
      : MAP_W / MAP_H;
  const aspectRef = useRef(aspect);
  aspectRef.current = aspect;
  const layoutWidthRef = useRef(layout.width);
  layoutWidthRef.current = layout.width;
  const presentationRef = useRef<MapScenePresentationState | null>(null);
  if (!presentationRef.current) {
    presentationRef.current = createMapScenePresentationState(model);
  }
  const [presentedBattle, setPresentedBattle] =
    useState<MapSceneBattleEffect | null>(null);
  const pickIndex = useMemo(() => createMapScenePickIndex(model), [model]);
  const runtime = useRef(
    createMapCameraRuntime(
      initialCameraIntent(game, model.selectedId, aspect, layout.width),
    ),
  );
  const initializedLayout = useRef(false);
  const requestRender = useCallback(() => {
    pickerRef.current?.invalidate();
  }, []);
  const activateNativeCameraRendering = useCallback(() => {
    if (Platform.OS === "web") return;
    if (nativeCameraPresentTimer.current) {
      clearTimeout(nativeCameraPresentTimer.current);
      nativeCameraPresentTimer.current = null;
    }
    nativeCameraRenderingRef.current = true;
    setNativeCameraRendering(true);
  }, []);
  const handleCameraIdle = useCallback(() => {
    if (
      Platform.OS === "web" ||
      cameraGestureDepth.current > 0 ||
      !nativeCameraRenderingRef.current
    ) {
      return;
    }
    if (nativeCameraPresentTimer.current) return;
    nativeCameraPresentTimer.current = setTimeout(() => {
      nativeCameraPresentTimer.current = null;
      nativeCameraRenderingRef.current = false;
      setNativeCameraRendering(false);
      requestRender();
    }, NATIVE_CAMERA_PRESENT_DELAY_MS);
  }, [requestRender]);

  const handleAttentionEvent = useCallback(
    (event: MapAttentionEvent) => {
      if (event.type === "cancel") {
        stopCameraMotion(runtime.current);
        setFocusActive(false);
        requestRender();
        return;
      }
      const request = event.request;
      const target =
        request.camera ??
        attentionTargetsRef.current?.cameraForTargets(
          request.targetIds,
          aspectRef.current,
          request.minViewWidth,
          request.padding,
        );
      if (!target) return;
      applyCameraIntent(runtime.current, {
        reason: "attention",
        target,
        transition: reduceMotionEnabled.current ? "snap" : "spring",
      });
      if (request.label) setActiveAttentionLabel(request.label);
      activateNativeCameraRendering();
      setFocusActive(true);
      requestRender();
    },
    [activateNativeCameraRendering, requestRender],
  );

  useEffect(
    () => attentionDirector.subscribe(handleAttentionEvent),
    [attentionDirector, handleAttentionEvent],
  );

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isScreenReaderEnabled().then((enabled) => {
      if (mounted) screenReaderEnabled.current = enabled;
    });
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) reduceMotionEnabled.current = enabled;
    });
    const screenReaderSubscription = AccessibilityInfo.addEventListener(
      "screenReaderChanged",
      (enabled) => {
        screenReaderEnabled.current = enabled;
      },
    );
    const reduceMotionSubscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (enabled) => {
        reduceMotionEnabled.current = enabled;
      },
    );
    return () => {
      mounted = false;
      screenReaderSubscription.remove();
      reduceMotionSubscription.remove();
    };
  }, []);

  useEffect(() => {
    const changeSubscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") attentionDirector.cancel("background");
    });
    const blurSubscription =
      Platform.OS === "android"
        ? AppState.addEventListener("blur", () =>
            attentionDirector.cancel("background"),
          )
        : null;
    return () => {
      changeSubscription.remove();
      blurSubscription?.remove();
    };
  }, [attentionDirector]);

  useEffect(() => {
    if (activeAttentionLabel && screenReaderEnabled.current) {
      AccessibilityInfo.announceForAccessibility(activeAttentionLabel);
    }
  }, [activeAttentionLabel]);

  const requestAttention = useCallback(
    (request: MapAttentionRequest): boolean => {
      const source = request.source ?? "game";
      if (
        source !== "user" &&
        !request.force &&
        (screenReaderEnabled.current || reduceMotionEnabled.current)
      ) {
        if (request.label) setActiveAttentionLabel(request.label);
        return false;
      }
      return attentionDirector.request({
        ...request,
        minViewWidth:
          request.minViewWidth ?? autoMinVw(layoutWidthRef.current),
      });
    },
    [attentionDirector],
  );

  const handleAttentionTargetsReady = useCallback(
    (registry: MapAttentionTargetRegistry) => {
      attentionTargetsRef.current = registry;
    },
    [],
  );
  const claimManualCamera = useCallback(() => {
    attentionDirector.beginManual();
    attentionDirector.endManual();
  }, [attentionDirector]);

  useEffect(
    () => () => {
      if (nativeCameraPresentTimer.current) {
        clearTimeout(nativeCameraPresentTimer.current);
        nativeCameraPresentTimer.current = null;
      }
      attentionDirector.dispose();
    },
    [attentionDirector],
  );

  useEffect(() => {
    if (battleSceneVisible) attentionDirector.cancel("modal");
  }, [attentionDirector, battleSceneVisible]);

  useEffect(() => {
    const update = advanceMapScenePresentation(
      presentationRef.current ?? createMapScenePresentationState(model),
      model,
    );
    presentationRef.current = update.state;
    if (!update.battle) return;
    const battle = update.battle;
    setPresentedBattle(battle);
    setActiveAttentionLabel(
      `${TERRITORY_MAP[battle.from].name} attacks ${TERRITORY_MAP[battle.to].name}.`,
    );
  }, [model]);

  useEffect(() => {
    if (!presentedBattle || battleSceneVisible) return;
    requestAttention({
      key: `combat:${presentedBattle.from}:${presentedBattle.to}`,
      targetIds: [presentedBattle.from, presentedBattle.to],
      priority: 75,
      source: "game",
      label: `${TERRITORY_MAP[presentedBattle.from].name} attacks ${TERRITORY_MAP[presentedBattle.to].name}.`,
      padding: 1.4,
      ttlMs: 1500,
    });
  }, [battleSceneVisible, presentedBattle, requestAttention]);

  useEffect(() => {
    if (layout.width <= 0 || layout.height <= 0) return;
    if (!initializedLayout.current) {
      runtime.current = createMapCameraRuntime(
        initialCameraIntent(
          game,
          model.selectedId,
          aspect,
          layout.width,
        ),
      );
      initializedLayout.current = true;
      activateNativeCameraRendering();
      requestRender();
      return;
    }
    applyCameraIntent(runtime.current, {
      reason: "initial",
      target: clampCamera(runtime.current.current, aspect),
      transition: "snap",
    });
    activateNativeCameraRendering();
    requestRender();
    // State and selection changes must not steal camera ownership.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activateNativeCameraRendering,
    aspect,
    layout.height,
    layout.width,
    requestRender,
  ]);

  useEffect(() => {
    setLoaded(false);
    attentionTargetsRef.current = null;
  }, [model.variant]);

  const handleLayout = useCallback(
    (event: { nativeEvent: { layout: { width: number; height: number } } }) => {
      const { width, height } = event.nativeEvent.layout;
      if (width > 0 && height > 0) setLayout({ width, height });
    },
    [],
  );

  const handleBridge = useCallback((bridge: SceneBridgeState) => {
    pickerRef.current = {
      camera: bridge.camera,
      invalidate: bridge.invalidate,
      meshes: bridge.meshes,
    };
    if (Object.keys(bridge.projected).length > 0) {
      projectedRef.current = bridge.projected;
    }
    updateR3FDebug({
      projected: projectedRef.current,
      pickerMeshCount: bridge.meshes.length,
      room:
        bridge.roomMeshCount > 0 ? "imperial-command-room" : null,
      roomMeshCount: bridge.roomMeshCount,
      roomTextureSet:
        bridge.texturedRoomMeshCount >= 3
          ? "imagegen-command-room-v1"
          : null,
      tableTextureSet:
        bridge.texturedTableMeshCount >= 4
          ? "imagegen-command-table-v1"
          : null,
      texturedRoomMeshCount: bridge.texturedRoomMeshCount,
      texturedTableMeshCount: bridge.texturedTableMeshCount,
      territoryLabelCount: bridge.territoryLabelCount,
      camera: runtime.current.current,
    });
    if (Platform.OS !== "web") bridge.invalidate();
  }, []);
  const handleLoaded = useCallback(() => setLoaded(true), []);

  const beginPan = useCallback(() => {
    pendingTapTargetRef.current = null;
    attentionDirector.beginManual();
    cameraGestureDepth.current += 1;
    stopCameraMotion(runtime.current);
    panStartRef.current = { ...runtime.current.current };
    activateNativeCameraRendering();
    setFocusActive(false);
    requestRender();
  }, [
    activateNativeCameraRendering,
    attentionDirector,
    requestRender,
  ]);

  const updatePan = useCallback(
    (translationX: number, translationY: number) => {
      const start = panStartRef.current;
      if (!start) return;
      applyCameraIntent(
        runtime.current,
        panCameraIntent(
          start,
          aspect,
          layout.width,
          translationX,
          translationY,
        ),
      );
      requestRender();
    },
    [aspect, layout.width, requestRender],
  );

  const endPan = useCallback(
    (velocityX: number, velocityY: number) => {
      if (!panStartRef.current) return;
      const boardUnitsPerPixel =
        runtime.current.current.vw / Math.max(1, layout.width);
      beginCameraInertia(
        runtime.current,
        -velocityX * boardUnitsPerPixel,
        -velocityY * boardUnitsPerPixel,
      );
      panStartRef.current = null;
      cameraGestureDepth.current = Math.max(
        0,
        cameraGestureDepth.current - 1,
      );
      attentionDirector.endManual();
      requestRender();
    },
    [attentionDirector, layout.width, requestRender],
  );

  const beginPinch = useCallback(
    (focalX: number, focalY: number) => {
      pendingTapTargetRef.current = null;
      attentionDirector.beginManual();
      cameraGestureDepth.current += 1;
      stopCameraMotion(runtime.current);
      const camera = { ...runtime.current.current };
      pinchStartRef.current = {
        camera,
        point: screenPointToBoard(
          camera,
          layout.width,
          layout.height,
          focalX,
          focalY,
        ),
      };
      activateNativeCameraRendering();
      setFocusActive(false);
      requestRender();
    },
    [
      activateNativeCameraRendering,
      attentionDirector,
      layout.height,
      layout.width,
      requestRender,
    ],
  );

  const updatePinch = useCallback(
    (scale: number) => {
      const start = pinchStartRef.current;
      if (!start || scale <= 0) return;
      applyCameraIntent(
        runtime.current,
        zoomCameraIntent(
          start.camera,
          aspect,
          start.point,
          start.camera.vw / scale,
          "pinch",
          "snap",
        ),
      );
      requestRender();
    },
    [aspect, requestRender],
  );

  const endPinch = useCallback(() => {
    if (!pinchStartRef.current) return;
    pinchStartRef.current = null;
    cameraGestureDepth.current = Math.max(
      0,
      cameraGestureDepth.current - 1,
    );
    attentionDirector.endManual();
    requestRender();
  }, [attentionDirector, requestRender]);

  const resolveTerritoryAt = useCallback(
    (screenX: number, screenY: number) => {
      const picker = pickerRef.current;
      if (!picker || layout.width <= 0 || layout.height <= 0) return null;
      const raycaster = new Raycaster();
      raycaster.setFromCamera(
        new Vector2(
          (screenX / layout.width) * 2 - 1,
          -(screenY / layout.height) * 2 + 1,
        ),
        picker.camera,
      );
      return pickTerritoryFromIntersections(
        pickIndex,
        raycaster.intersectObjects(picker.meshes, false),
      );
    },
    [layout.height, layout.width, pickIndex],
  );

  const captureTapTarget = useCallback(
    (screenX: number, screenY: number) => {
      pendingTapTargetRef.current = {
        x: screenX,
        y: screenY,
        id: resolveTerritoryAt(screenX, screenY),
      };
    },
    [resolveTerritoryAt],
  );

  const pickTerritory = useCallback(
    (screenX: number, screenY: number) => {
      const pending = pendingTapTargetRef.current;
      pendingTapTargetRef.current = null;
      const id =
        pending &&
        Math.hypot(pending.x - screenX, pending.y - screenY) <= 24
          ? pending.id
          : resolveTerritoryAt(screenX, screenY);
      if (!id) return;
      const territory = model.territories.find((entry) => entry.id === id);
      requestAttention({
        key: `territory:${id}`,
        targetIds: [id],
        priority: 80,
        source: "user",
        label: territory?.displayName ?? id,
        padding: 1.35,
      });
      onTapRef.current(id);
    },
    [
      model.territories,
      requestAttention,
      resolveTerritoryAt,
    ],
  );

  const handleDoubleTap = useCallback(
    (screenX: number, screenY: number) => {
      pendingTapTargetRef.current = null;
      claimManualCamera();
      const current = runtime.current.current;
      const point = screenPointToBoard(
        current,
        layout.width,
        layout.height,
        screenX,
        screenY,
      );
      applyCameraIntent(
        runtime.current,
        zoomCameraIntent(
          current,
          aspect,
          point,
          current.vw / DOUBLE_TAP_ZOOM,
          "double-tap",
          "spring",
        ),
      );
      activateNativeCameraRendering();
      requestRender();
    },
    [
      activateNativeCameraRendering,
      aspect,
      claimManualCamera,
      layout.height,
      layout.width,
      requestRender,
    ],
  );

  const focusAction = useCallback(() => {
    const intent = focusCameraIntent(
      game,
      model.selectedId,
      aspect,
      layout.width,
    );
    requestAttention({
      key: model.selectedId
        ? `focus:${model.selectedId}`
        : `focus:${game.phase}:${game.currentPlayer}`,
      camera: intent.target,
      priority: 80,
      source: "user",
      label: model.selectedId
        ? (model.territories.find(
            (territory) => territory.id === model.selectedId,
          )?.displayName ?? model.selectedId)
        : "Current action",
    });
  }, [
    aspect,
    game,
    layout.width,
    model.selectedId,
    model.territories,
    requestAttention,
  ]);

  const fullAction = useCallback(() => {
    claimManualCamera();
    applyCameraIntent(runtime.current, fullCameraIntent(aspect));
    activateNativeCameraRendering();
    setFocusActive(false);
    requestRender();
  }, [
    activateNativeCameraRendering,
    aspect,
    claimManualCamera,
    requestRender,
  ]);

  const zoomBy = useCallback(
    (factor: number) => {
      claimManualCamera();
      const current = runtime.current.target;
      applyCameraIntent(
        runtime.current,
        zoomCameraIntent(
          current,
          aspect,
          { x: current.cx, y: current.cy },
          current.vw * factor,
          "zoom-control",
          "spring",
        ),
      );
      activateNativeCameraRendering();
      setFocusActive(false);
      requestRender();
    },
    [
      activateNativeCameraRendering,
      aspect,
      claimManualCamera,
      requestRender,
    ],
  );

  const handleWheel = useCallback(
    (event: WebWheelEvent) => {
      claimManualCamera();
      event.preventDefault?.();
      const nativeEvent = event.nativeEvent;
      const rawDelta = nativeEvent.deltaY ?? 0;
      const pixelDelta =
        nativeEvent.deltaMode === 1
          ? rawDelta * 16
          : nativeEvent.deltaMode === 2
            ? rawDelta * layout.height
            : rawDelta;
      const boundedDelta = Math.min(240, Math.max(-240, pixelDelta));
      const current = runtime.current.current;
      const x =
        nativeEvent.offsetX ?? nativeEvent.locationX ?? layout.width / 2;
      const y =
        nativeEvent.offsetY ?? nativeEvent.locationY ?? layout.height / 2;
      const point = screenPointToBoard(
        current,
        layout.width,
        layout.height,
        x,
        y,
      );
      applyCameraIntent(
        runtime.current,
        zoomCameraIntent(
          current,
          aspect,
          point,
          current.vw * Math.exp(boundedDelta * 0.002),
          "wheel",
          "snap",
        ),
      );
      activateNativeCameraRendering();
      setFocusActive(false);
      requestRender();
    },
    [
      activateNativeCameraRendering,
      aspect,
      claimManualCamera,
      layout.height,
      layout.width,
      requestRender,
    ],
  );

  const webWheelProps =
    Platform.OS === "web"
      ? ({ onWheel: handleWheel } as unknown as ViewProps)
      : {};
  const handleBattleComplete = useCallback((battleId: string) => {
    setPresentedBattle((current) =>
      current?.id === battleId ? null : current,
    );
  }, []);
  const handlePerformanceQualification = useCallback(
    (qualification: MapRendererPerformanceQualification) => {
      onPerformanceEvidence?.(
        createMapPerformanceEvidence({
          platform: PERFORMANCE_PLATFORM,
          application: PERFORMANCE_APPLICATION,
          device: PERFORMANCE_DEVICE,
          scene: {
            contractVersion: model.contractVersion,
            variant: model.variant,
            viewMode: model.viewMode,
            revision: model.revision,
            territoryCount: model.territories.length,
          },
          qualification,
        }),
      );
    },
    [model, onPerformanceEvidence],
  );

  useEffect(() => {
    if (!R3F_DEBUG_ENABLED) return;
    updateR3FDebug({
      ready: loaded,
      renderer: "r3f",
      contractVersion: model.contractVersion,
      variant: model.variant,
      territoryCount: model.territories.length,
      armyModels: ["infantry", "cavalry", "artillery"],
      selectedId: model.selectedId,
      targetIds: model.targetIds,
      sceneRevision: model.revision,
      canonicalBattleId: model.battle?.id ?? null,
      battleId: presentedBattle?.id ?? null,
      battleActive: Boolean(presentedBattle),
      projected: projectedRef.current,
      pickerMeshCount: pickerRef.current?.meshes.length ?? 0,
      camera: runtime.current.current,
    });
  }, [loaded, model, presentedBattle]);

  useEffect(
    () => () => {
      updateR3FDebug({ ready: false });
    },
    [],
  );

  return (
    <View testID="map-3d-root" style={styles.container} onLayout={handleLayout}>
      <R3FGestureSurface
        viewProps={{
          ...webWheelProps,
          testID: "map-3d-canvas",
          style: StyleSheet.absoluteFillObject,
          collapsable: false,
        }}
        onPanStart={beginPan}
        onPanUpdate={updatePan}
        onPanEnd={endPan}
        onPinchStart={beginPinch}
        onPinchUpdate={updatePinch}
        onPinchEnd={endPinch}
        onTapStart={captureTapTarget}
        onSingleTap={pickTerritory}
        onDoubleTap={handleDoubleTap}
      >
        <Canvas
          style={StyleSheet.absoluteFillObject}
          shadows={DYNAMIC_SHADOWS}
          dpr={Platform.OS === "web" ? [1, 2] : 1.25}
          frameloop={resolveMapCanvasFrameloop(
            PERFORMANCE_PLATFORM,
            battleSceneVisible,
            nativeCameraRendering,
          )}
          camera={{
            fov: 35,
            near: 0.05,
            far: 80,
            position: [0, 12, 5],
          }}
        >
          <TabletopScene
            model={model}
            battle={presentedBattle}
            battleSceneVisible={battleSceneVisible}
            runtime={runtime}
            aspect={aspect}
            layout={layout}
            onBridge={handleBridge}
            onLoaded={handleLoaded}
            onAttentionTargetsReady={handleAttentionTargetsReady}
            onBattleComplete={handleBattleComplete}
            completedProfiles={completedProfiles}
            onPerformanceQualification={handlePerformanceQualification}
            onCameraIdle={handleCameraIdle}
          />
        </Canvas>
      </R3FGestureSurface>

      {activeAttentionLabel ? (
        <View
          accessible
          accessibilityRole="summary"
          accessibilityLiveRegion="polite"
          accessibilityLabel={activeAttentionLabel}
          importantForAccessibility="yes"
          pointerEvents="none"
          style={styles.accessibilitySummary}
        />
      ) : null}

      {!loaded ? (
        <View style={styles.loading} pointerEvents="none">
          <ActivityIndicator color="#f7e9bc" />
        </View>
      ) : null}

      <View
        testID="map-3d-camera-controls"
        pointerEvents="box-none"
        style={[
          styles.cameraControls,
          layout.width > layout.height && styles.cameraControlsLandscape,
          layout.width > layout.height &&
            cameraControlsRightInset !== undefined && {
              right: cameraControlsRightInset,
            },
        ]}
      >
        <CameraButton
          icon="locate-outline"
          label="Focus action"
          active={focusActive}
          onPress={focusAction}
        />
        <CameraButton
          icon="add"
          label="Zoom in"
          onPress={() => zoomBy(1 / BUTTON_ZOOM)}
        />
        <CameraButton
          icon="remove"
          label="Zoom out"
          onPress={() => zoomBy(BUTTON_ZOOM)}
        />
        <CameraButton
          icon="scan-outline"
          label="Show full board"
          onPress={fullAction}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: "hidden",
    backgroundColor: "#d3b75d",
  },
  loading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(28, 20, 10, 0.18)",
  },
  accessibilitySummary: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0.01,
  },
  cameraControls: {
    position: "absolute",
    right: 12,
    bottom: 180,
    gap: 7,
    zIndex: 2,
    elevation: 2,
  },
  cameraControlsLandscape: {
    right: 344,
    bottom: 16,
  },
  cameraButton: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(232, 205, 137, 0.68)",
    backgroundColor: "rgba(35, 26, 14, 0.58)",
  },
  cameraButtonActive: {
    borderColor: "#f4cf63",
    backgroundColor: "rgba(104, 72, 20, 0.72)",
  },
  cameraButtonPressed: {
    backgroundColor: "rgba(122, 84, 24, 0.78)",
  },
});

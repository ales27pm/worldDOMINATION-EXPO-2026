import Ionicons from "@expo/vector-icons/Ionicons";
import React, {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
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
import { R3FGestureSurface } from "@/components/game/R3FGestureSurface";
import R3FTerritoryMeshes from "@/components/game/R3FTerritoryMeshes";
import { Canvas, useFrame, useThree } from "@/components/game/r3fRuntime";
import { MAP_H, MAP_W, clampCamera, type Camera } from "@/game/camera";
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
import {
  createMapFrameProfile,
  recordMapFrameSample,
  summarizeMapFrameProfile,
  type MapFrameProfileAccumulator,
  type MapFrameProfileKind,
} from "@/game/mapFrameProfile";
import {
  createMapScenePickIndex,
  pickTerritoryFromIntersections,
} from "@/game/mapScenePicking";
import type { GameState, TerritoryId } from "@/game/types";

interface Props {
  game: GameState;
  model: MapSceneModel;
  onTerritoryTap: (id: TerritoryId) => void;
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
}

const BUTTON_ZOOM = 1.45;
const DOUBLE_TAP_ZOOM = 2.4;
const DYNAMIC_SHADOWS = Platform.OS === "web";
const BATTLE_EFFECT_DURATION = 2.05;
const R3F_DEBUG_ENABLED =
  process.env.EXPO_PUBLIC_BROWSER_SMOKE === "1";
const ENABLE_SCENE_PROJECTION =
  Platform.OS === "web" ||
  R3F_DEBUG_ENABLED;

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
}: {
  battle: MapSceneBattleEffect;
  onComplete: (battleId: string) => void;
}) {
  const projectile = useRef<Mesh>(null);
  const impact = useRef<Group>(null);
  const startedAt = useRef<number | null>(null);
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
    startedAt.current = null;
    completed.current = false;
    line.visible = true;
  }, [battle.id, line]);

  useEffect(
    () => () => {
      lineGeometry.dispose();
      lineMaterial.dispose();
    },
    [lineGeometry, lineMaterial],
  );

  useFrame(({ clock }) => {
    if (startedAt.current === null) startedAt.current = clock.elapsedTime;
    const elapsed = clock.elapsedTime - startedAt.current;
    if (elapsed >= BATTLE_EFFECT_DURATION) {
      line.visible = false;
      if (projectile.current) projectile.current.visible = false;
      if (impact.current) impact.current.visible = false;
      if (!completed.current) {
        completed.current = true;
        onCompleteRef.current(battle.id);
      }
      return;
    }
    const cycle = elapsed;
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
        <pointLight
          color={battle.conquered ? battle.attackerColor : battle.defenderColor}
          intensity={2.4}
          distance={2.2}
        />
      </group>
    </group>
  );
}

function CameraRig({
  runtime,
  aspect,
}: {
  runtime: React.MutableRefObject<MapCameraRuntime>;
  aspect: number;
}) {
  const camera = useThree((state) => state.camera);
  const invalidate = useThree((state) => state.invalidate);
  const lastApplied = useRef({
    cx: Number.NaN,
    cy: Number.NaN,
    vw: Number.NaN,
    aspect: Number.NaN,
  });

  useFrame((_state, deltaSeconds) => {
    const moved = stepMapCameraRuntime(runtime.current, deltaSeconds, aspect);
    const current = runtime.current.current;
    const previous = lastApplied.current;
    if (
      !moved &&
      previous.cx === current.cx &&
      previous.cy === current.cy &&
      previous.vw === current.vw &&
      previous.aspect === aspect
    ) {
      return;
    }

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
    previous.cx = current.cx;
    previous.cy = current.cy;
    previous.vw = current.vw;
    previous.aspect = aspect;
    updateR3FDebug({ camera: current });
    if (runtime.current.motion !== "idle" && Platform.OS !== "web") {
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
  const projected = useMemo(
    () =>
      ENABLE_SCENE_PROJECTION
        ? Object.fromEntries(
            model.territories.map((territory) => [
              territory.id,
              { x: 0, y: 0 },
            ]),
          )
        : {},
    [model.territories],
  );

  const publishBridge = useCallback(() => {
    const meshes: Mesh[] = [];
    scene.traverse((object) => {
      const mesh = object as Mesh;
      if (mesh.isMesh && mesh.name.startsWith("pick__")) {
        meshes.push(mesh);
      }
    });
    publishedMeshCount.current = meshes.length;
    onBridge({ camera, invalidate, meshes, projected });
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
  skipNextFrame: boolean;
}

function publishFrameProfile(profile: ActiveFrameProfile): void {
  const report = summarizeMapFrameProfile(profile.accumulator);
  if (!report) return;
  updateR3FDebug({
    frameProfile: {
      status: "complete",
      platform: Platform.OS,
      ...report,
    },
  });
}

function PerformanceProbe({
  runtime,
  battle,
}: {
  runtime: React.MutableRefObject<MapCameraRuntime>;
  battle: MapSceneBattleEffect | null;
}) {
  const ambientSample = useRef({ frames: 0, elapsed: 0 });
  const activeProfile = useRef<ActiveFrameProfile | null>(null);

  useFrame((_state, deltaSeconds) => {
    if (!R3F_DEBUG_ENABLED) return;

    if (Platform.OS === "web") {
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
    const current = activeProfile.current;

    if (current && current.accumulator.kind !== kind) {
      publishFrameProfile(current);
      activeProfile.current = null;
    }
    if (!kind) return;

    if (!activeProfile.current) {
      activeProfile.current = {
        accumulator: createMapFrameProfile(kind),
        skipNextFrame: true,
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

    if (activeProfile.current.skipNextFrame) {
      activeProfile.current.skipNextFrame = false;
      return;
    }
    recordMapFrameSample(
      activeProfile.current.accumulator,
      deltaSeconds,
    );
  });

  useEffect(
    () => () => {
      if (activeProfile.current) publishFrameProfile(activeProfile.current);
      activeProfile.current = null;
    },
    [],
  );

  return null;
}

function TabletopScene({
  model,
  battle,
  runtime,
  aspect,
  layout,
  onBridge,
  onLoaded,
  onBattleComplete,
}: {
  model: MapSceneModel;
  battle: MapSceneBattleEffect | null;
  runtime: React.MutableRefObject<MapCameraRuntime>;
  aspect: number;
  layout: LayoutSize;
  onBridge: (bridge: SceneBridgeState) => void;
  onLoaded: () => void;
  onBattleComplete: (battleId: string) => void;
}) {
  return (
    <>
      <color attach="background" args={["#d3b75d"]} />
      <ambientLight intensity={0.78} />
      <hemisphereLight args={["#fff0c4", "#72542c", 1.1]} />
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
        <R3FTerritoryMeshes model={model} onLoaded={onLoaded} />
        <R3FArmyLayer model={model} />
        {battle ? (
          <BattleEffect battle={battle} onComplete={onBattleComplete} />
        ) : null}
        <SceneBridge model={model} layout={layout} onBridge={onBridge} />
      </Suspense>
      <CameraRig runtime={runtime} aspect={aspect} />
      {R3F_DEBUG_ENABLED ? (
        <PerformanceProbe runtime={runtime} battle={battle} />
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
      accessibilityLabel={label}
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
  onTerritoryTap,
}: Props) {
  const [layout, setLayout] = useState<LayoutSize>({
    width: 0,
    height: 0,
  });
  const [loaded, setLoaded] = useState(false);
  const [focusActive, setFocusActive] = useState(false);
  const pickerRef = useRef<PickerState | null>(null);
  const projectedRef = useRef<Record<string, { x: number; y: number }>>({});
  const panStartRef = useRef<Camera | null>(null);
  const pinchStartRef = useRef<{
    camera: Camera;
    point: { x: number; y: number };
  } | null>(null);
  const onTapRef = useRef(onTerritoryTap);
  onTapRef.current = onTerritoryTap;
  const aspect =
    layout.width > 0 && layout.height > 0
      ? layout.width / layout.height
      : MAP_W / MAP_H;
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

  useEffect(() => {
    const update = advanceMapScenePresentation(
      presentationRef.current ?? createMapScenePresentationState(model),
      model,
    );
    presentationRef.current = update.state;
    if (update.battle) setPresentedBattle(update.battle);
  }, [model]);

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
      return;
    }
    applyCameraIntent(runtime.current, {
      reason: "initial",
      target: clampCamera(runtime.current.current, aspect),
      transition: "snap",
    });
    requestRender();
    // State and selection changes must not steal camera ownership.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aspect, layout.height, layout.width, requestRender]);

  useEffect(() => {
    setLoaded(false);
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
      camera: runtime.current.current,
    });
  }, []);
  const handleLoaded = useCallback(() => setLoaded(true), []);

  const beginPan = useCallback(() => {
    stopCameraMotion(runtime.current);
    panStartRef.current = { ...runtime.current.current };
    setFocusActive(false);
    requestRender();
  }, [requestRender]);

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
      const boardUnitsPerPixel =
        runtime.current.current.vw / Math.max(1, layout.width);
      beginCameraInertia(
        runtime.current,
        -velocityX * boardUnitsPerPixel,
        -velocityY * boardUnitsPerPixel,
      );
      panStartRef.current = null;
      requestRender();
    },
    [layout.width, requestRender],
  );

  const beginPinch = useCallback(
    (focalX: number, focalY: number) => {
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
      setFocusActive(false);
      requestRender();
    },
    [layout.height, layout.width, requestRender],
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
    pinchStartRef.current = null;
  }, []);

  const pickTerritory = useCallback(
    (screenX: number, screenY: number) => {
      const picker = pickerRef.current;
      if (!picker || layout.width <= 0 || layout.height <= 0) return;
      const raycaster = new Raycaster();
      raycaster.setFromCamera(
        new Vector2(
          (screenX / layout.width) * 2 - 1,
          -(screenY / layout.height) * 2 + 1,
        ),
        picker.camera,
      );
      const id = pickTerritoryFromIntersections(
        pickIndex,
        raycaster.intersectObjects(picker.meshes, false),
      );
      if (id) onTapRef.current(id);
    },
    [layout.height, layout.width, pickIndex],
  );

  const handleDoubleTap = useCallback(
    (screenX: number, screenY: number) => {
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
      requestRender();
    },
    [aspect, layout.height, layout.width, requestRender],
  );

  const focusAction = useCallback(() => {
    applyCameraIntent(
      runtime.current,
      focusCameraIntent(game, model.selectedId, aspect, layout.width),
    );
    setFocusActive(true);
    requestRender();
  }, [aspect, game, layout.width, model.selectedId, requestRender]);

  const fullAction = useCallback(() => {
    applyCameraIntent(runtime.current, fullCameraIntent(aspect));
    setFocusActive(true);
    requestRender();
  }, [aspect, requestRender]);

  const zoomBy = useCallback(
    (factor: number) => {
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
      setFocusActive(false);
      requestRender();
    },
    [aspect, requestRender],
  );

  const handleWheel = useCallback(
    (event: WebWheelEvent) => {
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
      setFocusActive(false);
      requestRender();
    },
    [aspect, layout.height, layout.width, requestRender],
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
        onSingleTap={pickTerritory}
        onDoubleTap={handleDoubleTap}
      >
        <Canvas
          style={StyleSheet.absoluteFillObject}
          shadows={DYNAMIC_SHADOWS}
          dpr={Platform.OS === "web" ? [1, 2] : 1.25}
          frameloop={Platform.OS === "web" ? "always" : "demand"}
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
            runtime={runtime}
            aspect={aspect}
            layout={layout}
            onBridge={handleBridge}
            onLoaded={handleLoaded}
            onBattleComplete={handleBattleComplete}
          />
        </Canvas>
      </R3FGestureSurface>

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
  cameraControls: {
    position: "absolute",
    right: 12,
    bottom: 180,
    gap: 7,
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

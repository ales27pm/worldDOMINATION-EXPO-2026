import Ionicons from "@expo/vector-icons/Ionicons";
import { Asset } from "expo-asset";
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
  Color,
  Float32BufferAttribute,
  Group,
  Line as ThreeLine,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Raycaster,
  SRGBColorSpace,
  TextureLoader,
  Vector2,
  Vector3,
  type Camera as ThreeCamera,
} from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";

import { R3FArmyLayer } from "@/components/game/R3FArmyLayer";
import { R3FGestureSurface } from "@/components/game/R3FGestureSurface";
import {
  Canvas,
  useFrame,
  useLoader,
  useThree,
} from "@/components/game/r3fRuntime";
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
  MAP_SCENE_BOARD_PIXELS,
  MAP_SCENE_UNITS_PER_PIXEL,
} from "@/game/mapSceneGeometry";
import {
  buildMapSceneModel,
  type MapSceneBattleEffect,
  type MapSceneModel,
  type MapViewMode,
} from "@/game/mapSceneModel";
import type { GameState, TerritoryId } from "@/game/types";
import { MAP_SCENE_GLBS, WORLD_BOARD } from "@/lib/gameArt";

interface Props {
  game: GameState;
  selected: TerritoryId | null;
  targets: Set<TerritoryId>;
  interactive: Set<TerritoryId>;
  viewMode: MapViewMode;
  onTerritoryTap: (id: TerritoryId) => void;
}

interface LayoutSize {
  width: number;
  height: number;
}

interface PickerState {
  camera: ThreeCamera;
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
const BOARD_WIDTH = MAP_SCENE_BOARD_PIXELS[0] * MAP_SCENE_UNITS_PER_PIXEL;
const BOARD_DEPTH = MAP_SCENE_BOARD_PIXELS[1] * MAP_SCENE_UNITS_PER_PIXEL;

function collectTerritoryGeometries(scene: Group): Map<string, BufferGeometry> {
  const result = new Map<string, BufferGeometry>();
  scene.traverse((object) => {
    if (object instanceof Mesh && object.name.startsWith("territory__")) {
      result.set(object.name, object.geometry);
    }
  });
  return result;
}

function loaderSource(module: number): number | string {
  return Platform.OS === "web" ? Asset.fromModule(module).uri : module;
}

function interactionColor(interaction: string): string {
  if (interaction === "selected") return "#f8cf45";
  if (interaction === "target") return "#ee6049";
  if (interaction === "interactive") return "#61c78b";
  return "#ffffff";
}

function TerritoryMeshes({
  model,
  onLoaded,
}: {
  model: MapSceneModel;
  onLoaded: () => void;
}) {
  const gltf = useLoader(
    GLTFLoader,
    loaderSource(MAP_SCENE_GLBS[model.variant]) as unknown as string,
  ) as GLTF;
  const boardTexture = useLoader(
    TextureLoader,
    loaderSource(WORLD_BOARD) as unknown as string,
  );
  const geometries = useMemo(
    () => collectTerritoryGeometries(gltf.scene),
    [gltf.scene],
  );

  useEffect(() => {
    boardTexture.colorSpace = SRGBColorSpace;
    boardTexture.anisotropy = 8;
    boardTexture.needsUpdate = true;
  }, [boardTexture]);

  useEffect(() => {
    if (geometries.size === model.territories.length) onLoaded();
  }, [geometries, model.territories.length, onLoaded]);

  return (
    <>
      <mesh
        name="painted_board"
        position={[0, -0.018, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[BOARD_WIDTH, BOARD_DEPTH]} />
        <meshStandardMaterial
          map={boardTexture}
          color="#ffffff"
          roughness={0.9}
          metalness={0}
        />
      </mesh>

      {model.territories.map((territory) => {
        const geometry = geometries.get(territory.meshName);
        if (!geometry) return null;
        const highlight = interactionColor(territory.interaction);
        const highlighted = territory.interaction !== "idle";
        return (
          <React.Fragment key={territory.id}>
            <mesh
              geometry={geometry}
              name={territory.meshName}
              receiveShadow
              castShadow
            >
              <meshStandardMaterial
                map={boardTexture}
                color={territory.surfaceTint ?? "#ffffff"}
                emissive={highlighted ? highlight : "#000000"}
                emissiveIntensity={highlighted ? 0.28 : 0}
                roughness={0.76}
                metalness={0.02}
              />
            </mesh>
            <mesh
              geometry={geometry}
              name={`pick__${territory.id}`}
              position={[0, 0.006, 0]}
            >
              <meshBasicMaterial
                transparent
                opacity={0}
                depthWrite={false}
                colorWrite={false}
              />
            </mesh>
            {highlighted ? (
              <mesh
                name={`halo__${territory.id}`}
                position={[
                  territory.anchor[0],
                  territory.anchor[1] + 0.1,
                  territory.anchor[2],
                ]}
                rotation={[-Math.PI / 2, 0, 0]}
              >
                <ringGeometry
                  args={[
                    territory.interaction === "selected" ? 0.23 : 0.2,
                    territory.interaction === "selected" ? 0.32 : 0.28,
                    32,
                  ]}
                />
                <meshBasicMaterial
                  color={highlight}
                  transparent
                  opacity={territory.interaction === "interactive" ? 0.5 : 0.9}
                  depthWrite={false}
                />
              </mesh>
            ) : null}
          </React.Fragment>
        );
      })}
    </>
  );
}

function BattleEffect({ battle }: { battle: MapSceneBattleEffect }) {
  const projectile = useRef<Mesh>(null);
  const impact = useRef<Group>(null);
  const startedAt = useRef<number | null>(null);
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
  }, [battle.id]);

  useFrame(({ clock }) => {
    if (startedAt.current === null) startedAt.current = clock.elapsedTime;
    const elapsed = clock.elapsedTime - startedAt.current;
    const cycle = elapsed % 2.4;
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

  useFrame((_state, deltaSeconds) => {
    stepMapCameraRuntime(runtime.current, deltaSeconds, aspect);
    const pose = perspectivePoseForCamera(runtime.current.current, aspect);
    camera.position.set(...pose.position);
    camera.lookAt(...pose.target);
    if (camera instanceof PerspectiveCamera) {
      camera.fov = pose.fov;
      camera.near = pose.near;
      camera.far = pose.far;
      camera.updateProjectionMatrix();
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
  const meshes = useRef<Mesh[]>([]);
  const frame = useRef(0);

  useEffect(() => {
    const nextMeshes: Mesh[] = [];
    scene.traverse((object) => {
      if (object instanceof Mesh && object.name.startsWith("pick__")) {
        nextMeshes.push(object);
      }
    });
    meshes.current = nextMeshes;
    onBridge({ camera, meshes: nextMeshes, projected: {} });
  }, [camera, model.variant, onBridge, scene]);

  useFrame(() => {
    frame.current += 1;
    if (frame.current % 4 !== 0) return;
    const projected: Record<string, { x: number; y: number }> = {};
    for (const territory of model.territories) {
      const point = new Vector3(...territory.anchor).project(camera);
      projected[territory.id] = {
        x: ((point.x + 1) / 2) * layout.width,
        y: ((1 - point.y) / 2) * layout.height,
      };
    }
    onBridge({ camera, meshes: meshes.current, projected });
  });

  return null;
}

function PerformanceProbe() {
  const sample = useRef({ frames: 0, elapsed: 0 });

  useFrame((_state, deltaSeconds) => {
    if (process.env.EXPO_PUBLIC_BROWSER_SMOKE !== "1") return;
    sample.current.frames += 1;
    sample.current.elapsed += deltaSeconds;
    if (sample.current.elapsed < 1) return;
    const fps = sample.current.frames / sample.current.elapsed;
    const debug = (
      globalThis as typeof globalThis & {
        __WORLD_DOMINATION_R3F__?: Record<string, unknown>;
      }
    ).__WORLD_DOMINATION_R3F__;
    if (debug) debug.fps = fps;
    sample.current = { frames: 0, elapsed: 0 };
  });

  return null;
}

function TabletopScene({
  model,
  runtime,
  aspect,
  layout,
  onBridge,
  onLoaded,
}: {
  model: MapSceneModel;
  runtime: React.MutableRefObject<MapCameraRuntime>;
  aspect: number;
  layout: LayoutSize;
  onBridge: (bridge: SceneBridgeState) => void;
  onLoaded: () => void;
}) {
  return (
    <>
      <color attach="background" args={["#d3b75d"]} />
      <ambientLight intensity={0.78} />
      <hemisphereLight args={["#fff0c4", "#72542c", 1.1]} />
      <directionalLight
        castShadow
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
        <TerritoryMeshes model={model} onLoaded={onLoaded} />
        <R3FArmyLayer model={model} />
        {model.battle ? <BattleEffect battle={model.battle} /> : null}
        <SceneBridge model={model} layout={layout} onBridge={onBridge} />
      </Suspense>
      <CameraRig runtime={runtime} aspect={aspect} />
      <PerformanceProbe />
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
  selected,
  targets,
  interactive,
  viewMode,
  onTerritoryTap,
}: Props) {
  const [layout, setLayout] = useState<LayoutSize>({
    width: MAP_W,
    height: MAP_H,
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
  const model = useMemo(
    () => buildMapSceneModel(game, selected, targets, interactive, viewMode),
    [game, interactive, selected, targets, viewMode],
  );
  const runtime = useRef(
    createMapCameraRuntime(
      initialCameraIntent(game, selected, aspect, layout.width),
    ),
  );
  const initializedLayout = useRef(false);

  useEffect(() => {
    if (!initializedLayout.current) {
      runtime.current = createMapCameraRuntime(
        initialCameraIntent(game, selected, aspect, layout.width),
      );
      initializedLayout.current = true;
      return;
    }
    applyCameraIntent(runtime.current, {
      reason: "initial",
      target: clampCamera(runtime.current.current, aspect),
      transition: "snap",
    });
    // State and selection changes must not steal camera ownership.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aspect, layout.width]);

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
    pickerRef.current = { camera: bridge.camera, meshes: bridge.meshes };
    if (Object.keys(bridge.projected).length > 0) {
      projectedRef.current = bridge.projected;
    }
    if (process.env.EXPO_PUBLIC_BROWSER_SMOKE === "1") {
      const debug = (
        globalThis as typeof globalThis & {
          __WORLD_DOMINATION_R3F__?: Record<string, unknown>;
        }
      ).__WORLD_DOMINATION_R3F__;
      if (debug) {
        debug.projected = projectedRef.current;
        debug.camera = runtime.current.current;
      }
    }
  }, []);

  const beginPan = useCallback(() => {
    stopCameraMotion(runtime.current);
    panStartRef.current = { ...runtime.current.current };
    setFocusActive(false);
  }, []);

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
    },
    [aspect, layout.width],
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
    },
    [layout.width],
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
    },
    [layout.height, layout.width],
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
    },
    [aspect],
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
      const hit = raycaster.intersectObjects(picker.meshes, false)[0];
      const name = hit?.object.name;
      if (!name?.startsWith("pick__")) return;
      onTapRef.current(name.slice("pick__".length) as TerritoryId);
    },
    [layout.height, layout.width],
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
    },
    [aspect, layout.height, layout.width],
  );

  const focusAction = useCallback(() => {
    applyCameraIntent(
      runtime.current,
      focusCameraIntent(game, selected, aspect, layout.width),
    );
    setFocusActive(true);
  }, [aspect, game, layout.width, selected]);

  const fullAction = useCallback(() => {
    applyCameraIntent(runtime.current, fullCameraIntent(aspect));
    setFocusActive(true);
  }, [aspect]);

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
    },
    [aspect],
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
    },
    [aspect, layout.height, layout.width],
  );

  const webWheelProps =
    Platform.OS === "web"
      ? ({ onWheel: handleWheel } as unknown as ViewProps)
      : {};

  useEffect(() => {
    if (process.env.EXPO_PUBLIC_BROWSER_SMOKE !== "1") return;
    const debug = {
      ready: loaded,
      renderer: "r3f",
      contractVersion: model.contractVersion,
      variant: model.variant,
      territoryCount: model.territories.length,
      armyModels: ["infantry", "cavalry", "artillery"],
      selectedId: model.selectedId,
      targetIds: model.targetIds,
      battleId: model.battle?.id ?? null,
      battleActive: Boolean(model.battle),
      projected: projectedRef.current,
      camera: runtime.current.current,
    };
    (
      globalThis as typeof globalThis & {
        __WORLD_DOMINATION_R3F__?: typeof debug;
      }
    ).__WORLD_DOMINATION_R3F__ = debug;
  }, [loaded, model]);

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
          shadows
          dpr={[1, 2]}
          camera={{
            fov: 35,
            near: 0.05,
            far: 80,
            position: [0, 12, 5],
          }}
        >
          <TabletopScene
            model={model}
            runtime={runtime}
            aspect={aspect}
            layout={layout}
            onBridge={handleBridge}
            onLoaded={() => setLoaded(true)}
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

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewProps,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
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
} from "@/game/camera";
import {
  cameraZoomedAt,
  stepCriticalSpring,
  stepDecay,
} from "@/game/cameraMotion";
import { Colors } from "@/constants/colors";
import { MAP_HUD_TEXT_SHADOW, MapHud } from "@/constants/mapHud";
import { Fonts } from "@/constants/typography";
import type { GameState, TerritoryId } from "@/game/types";

/**
 * Renderer-neutral camera rig for both the SVG and R3F boards.
 *
 * Gesture callbacks run on the JavaScript thread and update native Animated
 * values directly. This avoids coupling map navigation to a second JSI runtime
 * while preserving the deterministic camera math shared by every renderer.
 */

const DOUBLE_TAP_ZOOM = 2.4;
const BUTTON_ZOOM = 1.45;
const SPRING_FREQUENCY = 11;
const PAN_FRICTION = 7.5;
const PAN_STOP_SPEED = 2;
const MOTION_IDLE = 0;
const MOTION_SPRING = 1;
const MOTION_INERTIA = 2;

interface MapViewportProps {
  game: GameState;
  selected: TerritoryId | null;
  onBoardTap: (x: number, y: number) => void;
  children: React.ReactNode;
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

interface GestureStart {
  camera: Camera;
  focalX: number;
  focalY: number;
}

const INITIAL_CAMERA: Camera = {
  cx: MAP_W / 2,
  cy: MAP_H / 2,
  vw: MAP_W,
};

export function MapViewport({
  game,
  selected,
  onBoardTap,
  children,
}: MapViewportProps) {
  const [layout, setLayout] = useState({ w: 0, h: 0 });
  const [focusActive, setFocusActive] = useState(false);
  const isLandscape = layout.w > layout.h;

  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;

  const layoutRef = useRef(layout);
  const cameraRef = useRef<Camera>(INITIAL_CAMERA);
  const targetRef = useRef<Camera>(INITIAL_CAMERA);
  const velocityRef = useRef({ x: 0, y: 0, width: 0 });
  const motionRef = useRef(MOTION_IDLE);
  const focusMotionRef = useRef(false);
  const animationFrameRef = useRef<number | null>(null);
  const previousFrameRef = useRef<number | null>(null);
  const animateRef = useRef<(timestamp: number) => void>(() => undefined);
  const initializedRef = useRef(false);
  const previousAspectRef = useRef<number | null>(null);
  const gestureStartRef = useRef<GestureStart>({
    camera: INITIAL_CAMERA,
    focalX: 0,
    focalY: 0,
  });
  const isPanningRef = useRef(false);

  const liveAspect = useCallback(() => {
    const { w, h } = layoutRef.current;
    return w > 0 && h > 0 ? w / h : MAP_W / MAP_H;
  }, []);

  const applyCamera = useCallback(
    (camera: Camera) => {
      cameraRef.current = camera;
      const { w, h } = layoutRef.current;
      const nextScale = w > 0 ? w / camera.vw : 1;
      translateX.setValue(
        (w - MAP_W) / 2 + nextScale * (MAP_W / 2 - camera.cx),
      );
      translateY.setValue(
        (h - MAP_H) / 2 + nextScale * (MAP_H / 2 - camera.cy),
      );
      scale.setValue(nextScale);
    },
    [scale, translateX, translateY],
  );

  const scheduleMotion = useCallback(() => {
    if (animationFrameRef.current !== null) return;
    animationFrameRef.current = requestAnimationFrame((timestamp) =>
      animateRef.current(timestamp),
    );
  }, []);

  animateRef.current = (timestamp: number) => {
    animationFrameRef.current = null;
    const previous = previousFrameRef.current;
    previousFrameRef.current = timestamp;
    const deltaSeconds =
      previous === null ? 1 / 60 : Math.min(0.05, (timestamp - previous) / 1000);
    const motion = motionRef.current;
    const current = cameraRef.current;
    const aspect = liveAspect();

    if (motion === MOTION_INERTIA) {
      const velocity = velocityRef.current;
      const nextX = stepDecay(
        current.cx,
        velocity.x,
        deltaSeconds,
        PAN_FRICTION,
      );
      const nextY = stepDecay(
        current.cy,
        velocity.y,
        deltaSeconds,
        PAN_FRICTION,
      );
      const unclamped = {
        cx: nextX.position,
        cy: nextY.position,
        vw: current.vw,
      };
      const next = clampCamera(unclamped, aspect);
      velocityRef.current = {
        x: Math.abs(next.cx - unclamped.cx) > 0.01 ? 0 : nextX.velocity,
        y: Math.abs(next.cy - unclamped.cy) > 0.01 ? 0 : nextY.velocity,
        width: 0,
      };
      targetRef.current = next;
      applyCamera(next);

      if (
        Math.hypot(velocityRef.current.x, velocityRef.current.y) <
        PAN_STOP_SPEED
      ) {
        velocityRef.current = { x: 0, y: 0, width: 0 };
        motionRef.current = MOTION_IDLE;
        previousFrameRef.current = null;
        return;
      }
      scheduleMotion();
      return;
    }

    if (motion !== MOTION_SPRING) {
      previousFrameRef.current = null;
      return;
    }

    const target = targetRef.current;
    const velocity = velocityRef.current;
    const nextX = stepCriticalSpring(
      current.cx,
      target.cx,
      velocity.x,
      deltaSeconds,
      SPRING_FREQUENCY,
    );
    const nextY = stepCriticalSpring(
      current.cy,
      target.cy,
      velocity.y,
      deltaSeconds,
      SPRING_FREQUENCY,
    );
    const nextWidth = stepCriticalSpring(
      current.vw,
      target.vw,
      velocity.width,
      deltaSeconds,
      SPRING_FREQUENCY,
    );
    const unclamped = {
      cx: nextX.position,
      cy: nextY.position,
      vw: nextWidth.position,
    };
    const next = clampCamera(
      unclamped,
      aspect,
      Math.min(MANUAL_MIN_VW, target.vw),
    );
    velocityRef.current = {
      x: Math.abs(next.cx - unclamped.cx) > 0.01 ? 0 : nextX.velocity,
      y: Math.abs(next.cy - unclamped.cy) > 0.01 ? 0 : nextY.velocity,
      width:
        Math.abs(next.vw - unclamped.vw) > 0.01 ? 0 : nextWidth.velocity,
    };
    applyCamera(next);

    const settled =
      Math.abs(target.cx - next.cx) < 0.05 &&
      Math.abs(target.cy - next.cy) < 0.05 &&
      Math.abs(target.vw - next.vw) < 0.05 &&
      Math.abs(velocityRef.current.x) < 0.1 &&
      Math.abs(velocityRef.current.y) < 0.1 &&
      Math.abs(velocityRef.current.width) < 0.1;
    if (settled) {
      applyCamera(target);
      velocityRef.current = { x: 0, y: 0, width: 0 };
      motionRef.current = MOTION_IDLE;
      previousFrameRef.current = null;
      if (focusMotionRef.current) {
        focusMotionRef.current = false;
        setFocusActive(false);
      }
      return;
    }
    scheduleMotion();
  };

  const setTarget = useCallback(
    (camera: Camera, options: { snap?: boolean; focus?: boolean } = {}) => {
      const { snap = false, focus = false } = options;
      const target = clampCamera(
        camera,
        liveAspect(),
        Math.min(MANUAL_MIN_VW, camera.vw),
      );
      targetRef.current = target;
      velocityRef.current = { x: 0, y: 0, width: 0 };
      focusMotionRef.current = focus && !snap;
      setFocusActive(focus && !snap);
      if (snap) {
        motionRef.current = MOTION_IDLE;
        previousFrameRef.current = null;
        applyCamera(target);
        return;
      }
      motionRef.current = MOTION_SPRING;
      previousFrameRef.current = null;
      scheduleMotion();
    },
    [applyCamera, liveAspect, scheduleMotion],
  );

  const markManual = useCallback(() => {
    motionRef.current = MOTION_IDLE;
    focusMotionRef.current = false;
    velocityRef.current = { x: 0, y: 0, width: 0 };
    targetRef.current = cameraRef.current;
    previousFrameRef.current = null;
    setFocusActive(false);
  }, []);

  const onLayout = useCallback(
    (event: {
      nativeEvent: { layout: { width: number; height: number } };
    }) => {
      const { width, height } = event.nativeEvent.layout;
      const nextLayout = { w: width, h: height };
      layoutRef.current = nextLayout;
      setLayout(nextLayout);
      const aspect = width > 0 && height > 0 ? width / height : MAP_W / MAP_H;

      if (!initializedRef.current) {
        const points = computeAttention(game, selected);
        const camera =
          points.length === 0
            ? defaultCamera(aspect)
            : cameraForAttention(points, aspect, autoMinVw(width));
        initializedRef.current = true;
        previousAspectRef.current = aspect;
        setTarget(camera, { snap: true });
        return;
      }

      if (
        previousAspectRef.current !== null &&
        Math.abs(previousAspectRef.current - aspect) > 0.001
      ) {
        const camera = clampCamera(cameraRef.current, aspect);
        targetRef.current = camera;
        applyCamera(camera);
        previousAspectRef.current = aspect;
        return;
      }
      applyCamera(cameraRef.current);
    },
    [applyCamera, game, selected, setTarget],
  );

  useEffect(
    () => () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    },
    [],
  );

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .maxPointers(1)
        .onStart(() => {
          markManual();
          isPanningRef.current = false;
          gestureStartRef.current = {
            camera: cameraRef.current,
            focalX: 0,
            focalY: 0,
          };
        })
        .onUpdate((event) => {
          const moved =
            Math.abs(event.translationX) + Math.abs(event.translationY);
          if (moved <= 7 && !isPanningRef.current) return;
          isPanningRef.current = true;
          const start = gestureStartRef.current.camera;
          const width = Math.max(1, layoutRef.current.w);
          const pixelsPerMapUnit = width / start.vw;
          const camera = clampCamera(
            {
              cx: start.cx - event.translationX / pixelsPerMapUnit,
              cy: start.cy - event.translationY / pixelsPerMapUnit,
              vw: start.vw,
            },
            liveAspect(),
          );
          targetRef.current = camera;
          applyCamera(camera);
        })
        .onEnd((event) => {
          if (!isPanningRef.current) return;
          const width = Math.max(1, layoutRef.current.w);
          const pixelsPerMapUnit = width / cameraRef.current.vw;
          velocityRef.current = {
            x: -event.velocityX / pixelsPerMapUnit,
            y: -event.velocityY / pixelsPerMapUnit,
            width: 0,
          };
          motionRef.current =
            Math.hypot(velocityRef.current.x, velocityRef.current.y) >=
            PAN_STOP_SPEED
              ? MOTION_INERTIA
              : MOTION_IDLE;
          previousFrameRef.current = null;
          if (motionRef.current === MOTION_INERTIA) scheduleMotion();
        }),
    [applyCamera, liveAspect, markManual, scheduleMotion],
  );

  const pinchGesture = useMemo(
    () =>
      Gesture.Pinch()
        .runOnJS(true)
        .onStart((event) => {
          markManual();
          gestureStartRef.current = {
            camera: cameraRef.current,
            focalX: event.focalX,
            focalY: event.focalY,
          };
        })
        .onUpdate((event) => {
          const start = gestureStartRef.current;
          const { w, h } = layoutRef.current;
          if (w <= 0 || h <= 0) return;
          const startScale = w / start.camera.vw;
          const boardPoint = {
            x: start.camera.cx + (start.focalX - w / 2) / startScale,
            y: start.camera.cy + (start.focalY - h / 2) / startScale,
          };
          const nextWidth = start.camera.vw / Math.max(0.01, event.scale);
          const camera = clampCamera(
            cameraZoomedAt(start.camera, boardPoint, nextWidth),
            liveAspect(),
          );
          targetRef.current = camera;
          applyCamera(camera);
        }),
    [applyCamera, liveAspect, markManual],
  );

  const handleDoubleTap = useCallback(
    (x: number, y: number) => {
      const { w, h } = layoutRef.current;
      if (w <= 0 || h <= 0) return;
      const current = cameraRef.current;
      const currentScale = w / current.vw;
      const boardPoint = {
        x: current.cx + (x - w / 2) / currentScale,
        y: current.cy + (y - h / 2) / currentScale,
      };
      setTarget(
        cameraZoomedAt(
          current,
          boardPoint,
          Math.max(MANUAL_MIN_VW, current.vw / DOUBLE_TAP_ZOOM),
        ),
      );
    },
    [setTarget],
  );

  const handleSingleTap = useCallback(
    (x: number, y: number) => {
      const { w, h } = layoutRef.current;
      if (w <= 0 || h <= 0) return;
      const current = cameraRef.current;
      const currentScale = w / current.vw;
      onBoardTap(
        current.cx + (x - w / 2) / currentScale,
        current.cy + (y - h / 2) / currentScale,
      );
    },
    [onBoardTap],
  );

  const doubleTapGesture = useMemo(
    () =>
      Gesture.Tap()
        .runOnJS(true)
        .numberOfTaps(2)
        .maxDelay(320)
        .onEnd((event) => handleDoubleTap(event.x, event.y)),
    [handleDoubleTap],
  );

  const singleTapGesture = useMemo(
    () =>
      Gesture.Tap()
        .runOnJS(true)
        .numberOfTaps(1)
        .maxDeltaX(12)
        .maxDeltaY(12)
        .onEnd((event) => handleSingleTap(event.x, event.y)),
    [handleSingleTap],
  );

  const composedGesture = useMemo(
    () =>
      Gesture.Simultaneous(
        panGesture,
        pinchGesture,
        Gesture.Exclusive(doubleTapGesture, singleTapGesture),
      ),
    [doubleTapGesture, panGesture, pinchGesture, singleTapGesture],
  );

  const handleWheel = useCallback(
    (event: WebWheelEvent) => {
      const { w, h } = layoutRef.current;
      if (w <= 0 || h <= 0) return;
      event.preventDefault?.();
      const nativeEvent = event.nativeEvent;
      const rawDelta = nativeEvent.deltaY ?? 0;
      const pixelDelta =
        nativeEvent.deltaMode === 1
          ? rawDelta * 16
          : nativeEvent.deltaMode === 2
            ? rawDelta * h
            : rawDelta;
      const boundedDelta = Math.min(240, Math.max(-240, pixelDelta));
      const current = cameraRef.current;
      const currentScale = w / current.vw;
      const pointerX =
        nativeEvent.offsetX ?? nativeEvent.locationX ?? w / 2;
      const pointerY =
        nativeEvent.offsetY ?? nativeEvent.locationY ?? h / 2;
      const boardPoint = {
        x: current.cx + (pointerX - w / 2) / currentScale,
        y: current.cy + (pointerY - h / 2) / currentScale,
      };
      setTarget(
        cameraZoomedAt(
          current,
          boardPoint,
          current.vw * Math.exp(boundedDelta * 0.002),
        ),
        { snap: true },
      );
    },
    [setTarget],
  );

  const webWheelProps =
    Platform.OS === "web"
      ? ({ onWheel: handleWheel } as unknown as ViewProps)
      : {};

  const zoomBy = useCallback(
    (factor: number) => {
      const target = targetRef.current;
      setTarget({ ...target, vw: target.vw * factor });
    },
    [setTarget],
  );

  const showFull = useCallback(() => {
    setTarget(fullCamera(liveAspect()), { focus: true });
  }, [liveAspect, setTarget]);

  const focusAction = useCallback(() => {
    const points = computeAttention(game, selected);
    const camera =
      points.length === 0
        ? defaultCamera(liveAspect())
        : cameraForAttention(
            points,
            liveAspect(),
            autoMinVw(layoutRef.current.w),
          );
    setTarget(camera, { focus: true });
  }, [game, liveAspect, selected, setTarget]);

  return (
    <View style={styles.container} onLayout={onLayout}>
      <GestureDetector gesture={composedGesture}>
        <View
          {...webWheelProps}
          style={StyleSheet.absoluteFillObject}
          collapsable={false}
        >
          <Animated.View
            testID="map-board-transform"
            style={[
              styles.boardWrap,
              {
                transform: [
                  { translateX },
                  { translateY },
                  { scale },
                ],
              },
            ]}
          >
            {children}
          </Animated.View>
        </View>
      </GestureDetector>

      <View
        testID="map-camera-controls"
        style={[styles.cluster, isLandscape && styles.clusterLandscape]}
        pointerEvents="box-none"
      >
        <ClusterButton
          label="⌖"
          active={focusActive}
          onPress={focusAction}
          accessibilityLabel="Focus action"
        />
        <ClusterButton
          label="+"
          onPress={() => zoomBy(1 / BUTTON_ZOOM)}
          accessibilityLabel="Zoom in"
        />
        <ClusterButton
          label="−"
          onPress={() => zoomBy(BUTTON_ZOOM)}
          accessibilityLabel="Zoom out"
        />
        <ClusterButton
          label="▣"
          onPress={showFull}
          accessibilityLabel="Full board"
        />
      </View>
    </View>
  );
}

function ClusterButton({
  label,
  onPress,
  active,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  active?: boolean;
  accessibilityLabel: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.clusterBtn,
        active && styles.clusterBtnActive,
        pressed && { opacity: 0.7 },
      ]}
    >
      <Text style={[styles.clusterLabel, active && styles.clusterLabelActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: "hidden", backgroundColor: Colors.ocean },
  boardWrap: { position: "absolute", width: MAP_W, height: MAP_H },
  cluster: {
    position: "absolute",
    right: 10,
    bottom: 128,
    gap: 6,
  },
  clusterLandscape: {
    right: 372,
    bottom: 10,
  },
  clusterBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "rgba(222,190,115,0.45)",
    backgroundColor: MapHud.control,
    alignItems: "center",
    justifyContent: "center",
  },
  clusterBtnActive: {
    borderColor: Colors.gold,
    backgroundColor: MapHud.focused,
  },
  clusterLabel: {
    ...MAP_HUD_TEXT_SHADOW,
    color: Colors.textMuted,
    fontSize: 16,
    fontFamily: Fonts.bodyBold,
    lineHeight: 20,
  },
  clusterLabelActive: { color: Colors.gold },
});

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, type ViewProps } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
} from 'react-native-reanimated';
import {
  EDGE_PAD,
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
} from '@/game/camera';
import { cameraZoomedAt, stepCriticalSpring, stepDecay } from '@/game/cameraMotion';
import { Colors } from '@/constants/colors';
import { MAP_HUD_TEXT_SHADOW, MapHud } from '@/constants/mapHud';
import { Fonts } from '@/constants/typography';
import type { GameState, TerritoryId } from '@/game/types';

/**
 * Camera rig over the board — mirrors the web build's MapViewport.tsx.
 *
 * The camera is {cx, cy, vw} in map units. Manual input always owns the camera:
 * phase and player changes never recenter it. Programmatic focus and zoom use a
 * velocity-continuous critically damped spring, pan release has bounded inertia,
 * and pinch/double-tap zoom keeps its board-space focal point pinned.
 */

const DOUBLE_TAP_ZOOM = 2.4;
const BUTTON_ZOOM = 1.45;
const SPRING_FREQUENCY = 11;
const PAN_FRICTION = 7.5;
const PAN_STOP_SPEED = 2;
const MOTION_IDLE = 0;
const MOTION_SPRING = 1;
const MOTION_INERTIA = 2;

function clampCameraWorklet(
  ncx: number,
  ncy: number,
  nvw: number,
  aspect: number,
  minVw = MANUAL_MIN_VW,
): Camera {
  'worklet';
  const safeAspect = aspect > 0 ? aspect : MAP_W / MAP_H;
  const fit = Math.max(MAP_W, MAP_H * safeAspect);
  const vw = Math.min(Math.max(nvw, Math.min(minVw, fit)), fit);
  const vh = vw / safeAspect;
  return {
    vw,
    cx:
      vw >= MAP_W
        ? MAP_W / 2
        : Math.min(Math.max(ncx, vw / 2 - EDGE_PAD), MAP_W - vw / 2 + EDGE_PAD),
    cy:
      vh >= MAP_H
        ? MAP_H / 2
        : Math.min(Math.max(ncy, vh / 2), MAP_H - vh / 2),
  };
}

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

export function MapViewport({ game, selected, onBoardTap, children }: MapViewportProps) {
  const [layout, setLayout] = useState({ w: 0, h: 0 });
  // In landscape the command chrome docks bottom-right, so the control
  // cluster moves beside it instead of underneath it.
  const isLandscape = layout.w > layout.h;
  const [focusActive, setFocusActive] = useState(false);

  // Current camera + target camera (map units). Glide happens on the UI thread.
  const cx = useSharedValue(MAP_W / 2);
  const cy = useSharedValue(MAP_H / 2);
  const vw = useSharedValue(MAP_W);
  const tcx = useSharedValue(MAP_W / 2);
  const tcy = useSharedValue(MAP_H / 2);
  const tvw = useSharedValue(MAP_W);
  const velocityX = useSharedValue(0);
  const velocityY = useSharedValue(0);
  const velocityW = useSharedValue(0);
  const motion = useSharedValue(MOTION_IDLE);
  const focusMotion = useSharedValue(0);

  // Layout mirrored into shared values for worklet math.
  const lw = useSharedValue(1);
  const lh = useSharedValue(1);

  const gestureStart = useSharedValue({ cx: 0, cy: 0, vw: 0, fx: 0, fy: 0 });
  const isPanning = useSharedValue(false);
  const panActive = useSharedValue(false);
  const pinchActive = useSharedValue(false);

  const aspect = layout.w > 0 && layout.h > 0 ? layout.w / layout.h : MAP_W / MAP_H;

  const onLayout = useCallback(
    (e: { nativeEvent: { layout: { width: number; height: number } } }) => {
      const { width, height } = e.nativeEvent.layout;
      setLayout({ w: width, h: height });
      lw.value = width;
      lh.value = height;
    },
    [lw, lh],
  );

  const setTarget = useCallback(
    (cam: Camera, options: { snap?: boolean; focus?: boolean } = {}) => {
      const { snap = false, focus = false } = options;
      const clamped = clampCamera(cam, aspect, Math.min(MANUAL_MIN_VW, cam.vw));
      tcx.value = clamped.cx;
      tcy.value = clamped.cy;
      tvw.value = clamped.vw;
      velocityX.value = 0;
      velocityY.value = 0;
      velocityW.value = 0;
      focusMotion.value = focus && !snap ? 1 : 0;
      motion.value = snap ? MOTION_IDLE : MOTION_SPRING;
      setFocusActive(focus && !snap);
      if (snap) {
        cx.value = clamped.cx;
        cy.value = clamped.cy;
        vw.value = clamped.vw;
      }
    },
    [
      aspect,
      tcx,
      tcy,
      tvw,
      cx,
      cy,
      vw,
      velocityX,
      velocityY,
      velocityW,
      focusMotion,
      motion,
    ],
  );

  // Frame the opening state once. Later state/selection changes only alter the
  // suggested focus used by the explicit focus control.
  const initialized = useRef(false);
  const previousAspect = useRef<number | null>(null);

  useEffect(() => {
    if (layout.w <= 0 || layout.h <= 0) return;
    if (!initialized.current) {
      const points = computeAttention(game, selected);
      const cam =
        points.length === 0
          ? defaultCamera(aspect)
          : cameraForAttention(points, aspect, autoMinVw(layout.w));
      setTarget(cam, { snap: true });
      initialized.current = true;
      previousAspect.current = aspect;
      return;
    }

    if (previousAspect.current !== null && Math.abs(previousAspect.current - aspect) > 0.001) {
      setTarget({ cx: cx.value, cy: cy.value, vw: vw.value }, { snap: true });
      previousAspect.current = aspect;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout.w, layout.h, aspect]);

  const finishFocus = useCallback(() => setFocusActive(false), []);

  // Critically damped focus/zoom motion and frame-rate-independent pan inertia.
  useFrameCallback((frame) => {
    'worklet';
    if (panActive.value || pinchActive.value) return;

    const dt = (frame.timeSincePreviousFrame ?? 16) / 1000;
    const liveAspect = lw.value > 0 && lh.value > 0 ? lw.value / lh.value : MAP_W / MAP_H;

    if (motion.value === MOTION_INERTIA) {
      const nextX = stepDecay(cx.value, velocityX.value, dt, PAN_FRICTION);
      const nextY = stepDecay(cy.value, velocityY.value, dt, PAN_FRICTION);
      const clamped = clampCameraWorklet(
        nextX.position,
        nextY.position,
        vw.value,
        liveAspect,
      );
      cx.value = clamped.cx;
      cy.value = clamped.cy;
      tcx.value = clamped.cx;
      tcy.value = clamped.cy;
      if (Math.abs(clamped.cx - nextX.position) > 0.01) velocityX.value = 0;
      else velocityX.value = nextX.velocity;
      if (Math.abs(clamped.cy - nextY.position) > 0.01) velocityY.value = 0;
      else velocityY.value = nextY.velocity;
      if (Math.hypot(velocityX.value, velocityY.value) < PAN_STOP_SPEED) {
        velocityX.value = 0;
        velocityY.value = 0;
        motion.value = MOTION_IDLE;
      }
      return;
    }

    if (motion.value !== MOTION_SPRING) return;

    const nextX = stepCriticalSpring(
      cx.value,
      tcx.value,
      velocityX.value,
      dt,
      SPRING_FREQUENCY,
    );
    const nextY = stepCriticalSpring(
      cy.value,
      tcy.value,
      velocityY.value,
      dt,
      SPRING_FREQUENCY,
    );
    const nextW = stepCriticalSpring(
      vw.value,
      tvw.value,
      velocityW.value,
      dt,
      SPRING_FREQUENCY,
    );
    const clamped = clampCameraWorklet(
      nextX.position,
      nextY.position,
      nextW.position,
      liveAspect,
      Math.min(MANUAL_MIN_VW, tvw.value),
    );
    cx.value = clamped.cx;
    cy.value = clamped.cy;
    vw.value = clamped.vw;
    velocityX.value =
      Math.abs(clamped.cx - nextX.position) > 0.01 ? 0 : nextX.velocity;
    velocityY.value =
      Math.abs(clamped.cy - nextY.position) > 0.01 ? 0 : nextY.velocity;
    velocityW.value =
      Math.abs(clamped.vw - nextW.position) > 0.01 ? 0 : nextW.velocity;

    const settled =
      Math.abs(tcx.value - cx.value) < 0.05 &&
      Math.abs(tcy.value - cy.value) < 0.05 &&
      Math.abs(tvw.value - vw.value) < 0.05 &&
      Math.abs(velocityX.value) < 0.1 &&
      Math.abs(velocityY.value) < 0.1 &&
      Math.abs(velocityW.value) < 0.1;
    if (settled) {
      cx.value = tcx.value;
      cy.value = tcy.value;
      vw.value = tvw.value;
      velocityX.value = 0;
      velocityY.value = 0;
      velocityW.value = 0;
      motion.value = MOTION_IDLE;
      if (focusMotion.value === 1) {
        focusMotion.value = 0;
        runOnJS(finishFocus)();
      }
    }
  });

  // ── Worklet camera clamp ───────────────────────────────────────────────────
  const clampW = useCallback(
    (ncx: number, ncy: number, nvw: number) => {
      'worklet';
      const asp = lw.value > 0 && lh.value > 0 ? lw.value / lh.value : MAP_W / MAP_H;
      return clampCameraWorklet(ncx, ncy, nvw, asp);
    },
    [lw, lh],
  );

  // ── Gestures ───────────────────────────────────────────────────────────────
  const markManual = useCallback(() => setFocusActive(false), []);

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .maxPointers(1)
        .onStart(() => {
          'worklet';
          panActive.value = true;
          isPanning.value = false;
          motion.value = MOTION_IDLE;
          focusMotion.value = 0;
          velocityX.value = 0;
          velocityY.value = 0;
          velocityW.value = 0;
          gestureStart.value = { cx: cx.value, cy: cy.value, vw: vw.value, fx: 0, fy: 0 };
          runOnJS(markManual)();
        })
        .onUpdate((e) => {
          'worklet';
          const moved = Math.abs(e.translationX) + Math.abs(e.translationY);
          if (moved > 7 || isPanning.value) {
            if (!isPanning.value) {
              isPanning.value = true;
            }
            const s = lw.value / vw.value;
            const cam = clampW(
              gestureStart.value.cx - e.translationX / s,
              gestureStart.value.cy - e.translationY / s,
              vw.value,
            );
            cx.value = cam.cx;
            cy.value = cam.cy;
            tcx.value = cam.cx;
            tcy.value = cam.cy;
            tvw.value = vw.value;
          }
        })
        .onEnd((e) => {
          'worklet';
          if (!isPanning.value) return;
          const scale = lw.value / vw.value;
          velocityX.value = -e.velocityX / scale;
          velocityY.value = -e.velocityY / scale;
          motion.value =
            Math.hypot(velocityX.value, velocityY.value) >= PAN_STOP_SPEED
              ? MOTION_INERTIA
              : MOTION_IDLE;
        })
        .onFinalize(() => {
          'worklet';
          panActive.value = false;
        }),
    [
      clampW,
      markManual,
      cx,
      cy,
      vw,
      tcx,
      tcy,
      tvw,
      velocityX,
      velocityY,
      velocityW,
      motion,
      focusMotion,
      gestureStart,
      isPanning,
      panActive,
      lw,
    ],
  );

  const pinchGesture = useMemo(
    () =>
      Gesture.Pinch()
        .onStart((e) => {
          'worklet';
          pinchActive.value = true;
          motion.value = MOTION_IDLE;
          focusMotion.value = 0;
          velocityX.value = 0;
          velocityY.value = 0;
          velocityW.value = 0;
          gestureStart.value = { cx: cx.value, cy: cy.value, vw: vw.value, fx: e.focalX, fy: e.focalY };
          runOnJS(markManual)();
        })
        .onUpdate((e) => {
          'worklet';
          const start = gestureStart.value;
          const s0 = lw.value / start.vw;
          // Board point under the initial focal — keep it pinned on screen.
          const bx = start.cx + (start.fx - lw.value / 2) / s0;
          const by = start.cy + (start.fy - lh.value / 2) / s0;
          const nvwRaw = start.vw / e.scale;
          const asp = lw.value / lh.value;
          const fit = Math.max(MAP_W, MAP_H * asp);
          const nvw = Math.min(Math.max(nvwRaw, MANUAL_MIN_VW), fit);
          const s1 = lw.value / nvw;
          const cam = clampW(bx - (start.fx - lw.value / 2) / s1, by - (start.fy - lh.value / 2) / s1, nvw);
          cx.value = cam.cx;
          cy.value = cam.cy;
          vw.value = cam.vw;
          tcx.value = cam.cx;
          tcy.value = cam.cy;
          tvw.value = cam.vw;
        })
        .onFinalize(() => {
          'worklet';
          pinchActive.value = false;
        }),
    [
      clampW,
      markManual,
      cx,
      cy,
      vw,
      tcx,
      tcy,
      tvw,
      velocityX,
      velocityY,
      velocityW,
      motion,
      focusMotion,
      gestureStart,
      pinchActive,
      lw,
      lh,
    ],
  );

  const handleDoubleTap = useCallback(
    (bx: number, by: number) => {
      const camera = { cx: cx.value, cy: cy.value, vw: vw.value };
      const nextVw = Math.max(MANUAL_MIN_VW, camera.vw / DOUBLE_TAP_ZOOM);
      setTarget(cameraZoomedAt(camera, { x: bx, y: by }, nextVw));
    },
    [cx, cy, vw, setTarget],
  );

  const handleSingleTap = useCallback(
    (bx: number, by: number) => {
      onBoardTap(bx, by);
    },
    [onBoardTap],
  );

  const handleWheel = useCallback(
    (event: WebWheelEvent) => {
      if (layout.w <= 0 || layout.h <= 0) return;
      event.preventDefault?.();
      const nativeEvent = event.nativeEvent;
      const deltaMode = nativeEvent.deltaMode ?? 0;
      const rawDelta = nativeEvent.deltaY ?? 0;
      const pixelDelta =
        deltaMode === 1 ? rawDelta * 16 : deltaMode === 2 ? rawDelta * layout.h : rawDelta;
      const boundedDelta = Math.min(240, Math.max(-240, pixelDelta));
      const current = { cx: cx.value, cy: cy.value, vw: vw.value };
      const scale = layout.w / current.vw;
      const pointerX = nativeEvent.offsetX ?? nativeEvent.locationX ?? layout.w / 2;
      const pointerY = nativeEvent.offsetY ?? nativeEvent.locationY ?? layout.h / 2;
      const point = {
        x: current.cx + (pointerX - layout.w / 2) / scale,
        y: current.cy + (pointerY - layout.h / 2) / scale,
      };
      const nextVw = current.vw * Math.exp(boundedDelta * 0.002);
      setTarget(cameraZoomedAt(current, point, nextVw), { snap: true });
    },
    [layout.w, layout.h, cx, cy, vw, setTarget],
  );

  const doubleTapGesture = useMemo(
    () =>
      Gesture.Tap()
        .numberOfTaps(2)
        .maxDelay(320)
        .onEnd((e) => {
          'worklet';
          const s = lw.value / vw.value;
          const bx = cx.value + (e.x - lw.value / 2) / s;
          const by = cy.value + (e.y - lh.value / 2) / s;
          runOnJS(handleDoubleTap)(bx, by);
        }),
    [handleDoubleTap, cx, cy, vw, lw, lh],
  );

  const singleTapGesture = useMemo(
    () =>
      Gesture.Tap()
        .numberOfTaps(1)
        .maxDeltaX(12)
        .maxDeltaY(12)
        .onEnd((e) => {
          'worklet';
          const s = lw.value / vw.value;
          const bx = cx.value + (e.x - lw.value / 2) / s;
          const by = cy.value + (e.y - lh.value / 2) / s;
          runOnJS(handleSingleTap)(bx, by);
        }),
    [handleSingleTap, cx, cy, vw, lw, lh],
  );

  const composed = useMemo(
    () =>
      Gesture.Simultaneous(
        panGesture,
        pinchGesture,
        Gesture.Exclusive(doubleTapGesture, singleTapGesture),
      ),
    [panGesture, pinchGesture, doubleTapGesture, singleTapGesture],
  );

  const webWheelProps =
    Platform.OS === 'web' ? ({ onWheel: handleWheel } as unknown as ViewProps) : {};

  // ── Control cluster actions ────────────────────────────────────────────────
  const zoomBy = useCallback(
    (factor: number) => {
      setTarget({ cx: tcx.value, cy: tcy.value, vw: tvw.value * factor });
    },
    [setTarget, tcx, tcy, tvw],
  );

  const showFull = useCallback(() => {
    setTarget(fullCamera(aspect), { focus: true });
  }, [aspect, setTarget]);

  const focusAction = useCallback(() => {
    const points = computeAttention(game, selected);
    const cam =
      points.length === 0
        ? defaultCamera(aspect)
        : cameraForAttention(points, aspect, autoMinVw(layout.w));
    setTarget(cam, { focus: true });
  }, [game, selected, aspect, layout.w, setTarget]);

  // ── Board transform ────────────────────────────────────────────────────────
  const animatedStyle = useAnimatedStyle(() => {
    const s = lw.value > 0 ? lw.value / vw.value : 1;
    return {
      transform: [
        { translateX: (lw.value - MAP_W) / 2 + s * (MAP_W / 2 - cx.value) },
        { translateY: (lh.value - MAP_H) / 2 + s * (MAP_H / 2 - cy.value) },
        { scale: s },
      ],
    };
  });

  return (
    <View style={styles.container} onLayout={onLayout}>
      <GestureDetector gesture={composed}>
        <View
          {...webWheelProps}
          style={StyleSheet.absoluteFillObject}
          collapsable={false}
        >
          <Animated.View
            testID="map-board-transform"
            style={[styles.boardWrap, animatedStyle]}
          >
            {children}
          </Animated.View>
        </View>
      </GestureDetector>

      {/* Control cluster — Focus action / Zoom in / Zoom out / Full board */}
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
        <ClusterButton label="+" onPress={() => zoomBy(1 / BUTTON_ZOOM)} accessibilityLabel="Zoom in" />
        <ClusterButton label="−" onPress={() => zoomBy(BUTTON_ZOOM)} accessibilityLabel="Zoom out" />
        <ClusterButton label="▣" onPress={showFull} accessibilityLabel="Full board" />
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
      <Text style={[styles.clusterLabel, active && styles.clusterLabelActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: 'hidden', backgroundColor: Colors.ocean },
  boardWrap: { position: 'absolute', width: MAP_W, height: MAP_H },
  cluster: {
    position: 'absolute',
    right: 10,
    // Clear the floating bottom command panel.
    bottom: 128,
    gap: 6,
  },
  clusterLandscape: {
    // Sit beside the right-docked command column, not behind it.
    right: 372,
    bottom: 10,
  },
  clusterBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: 'rgba(222,190,115,0.45)',
    backgroundColor: MapHud.control,
    alignItems: 'center',
    justifyContent: 'center',
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

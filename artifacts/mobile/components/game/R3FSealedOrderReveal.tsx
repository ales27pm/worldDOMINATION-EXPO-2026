import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { Platform } from "react-native";
import {
  AdditiveBlending,
  DoubleSide,
  Mesh,
  ShaderMaterial,
  type BufferGeometry,
} from "three";

import {
  RADIAL_OVERLAY_VERTEX_SHADER,
  SEALED_ORDER_REVEAL_FRAGMENT_SHADER,
  createRadialOverlayUniforms,
  radialOverlaySeed,
} from "@/components/game/shaders/radial-overlay";
import { useFrame, useThree } from "@/components/game/r3fRuntime";
import {
  advanceR3FEffectTimeline,
  createR3FEffectTimelineState,
} from "@/game/r3fEffectTimeline";
import type { MapSceneRevealEffect } from "@/game/mapSceneModel";

const ORDER_REVEAL_DURATION_SECONDS = 1.4;

interface Props {
  effect: MapSceneRevealEffect;
  geometry: BufferGeometry;
  reducedMotion: boolean;
  suspended: boolean;
  onComplete: (effectId: string) => void;
}

export function R3FSealedOrderReveal({
  effect,
  geometry,
  reducedMotion,
  suspended,
  onComplete,
}: Props) {
  const meshRef = useRef<Mesh>(null);
  const timelineRef = useRef(createR3FEffectTimelineState());
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const invalidate = useThree((state) => state.invalidate);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: RADIAL_OVERLAY_VERTEX_SHADER,
        fragmentShader: SEALED_ORDER_REVEAL_FRAGMENT_SHADER,
        uniforms: createRadialOverlayUniforms(
          effect.color,
          effect.opacity,
          effect.origin,
          radialOverlaySeed(effect.id),
        ),
        transparent: true,
        depthTest: true,
        depthWrite: false,
        side: DoubleSide,
        blending: AdditiveBlending,
        toneMapped: false,
      }),
    [],
  );

  useEffect(() => {
    timelineRef.current = createR3FEffectTimelineState();
    material.uniforms.uProgress.value = 0;
    material.uniforms.uColor.value.set(effect.color);
    material.uniforms.uOpacity.value = effect.opacity;
    material.uniforms.uOrigin.value.set(effect.origin[0], effect.origin[1]);
    material.uniforms.uSeed.value = radialOverlaySeed(effect.id);
    material.userData.worldDominationRendered = false;
    if (meshRef.current) meshRef.current.visible = true;
    if (Platform.OS !== "web") invalidate();
  }, [effect, invalidate, material]);

  useEffect(() => () => material.dispose(), [material]);

  const markRendered = useCallback(() => {
    material.userData.worldDominationRendered = true;
    if (meshRef.current) {
      meshRef.current.userData.worldDominationRendered = true;
    }
  }, [material]);

  useFrame((_state, deltaSeconds) => {
    const step = advanceR3FEffectTimeline(timelineRef.current, deltaSeconds, {
      durationSeconds: ORDER_REVEAL_DURATION_SECONDS,
      reducedMotion,
      suspended,
    });
    timelineRef.current = step.state;
    material.uniforms.uProgress.value = step.state.progress;
    if (meshRef.current) meshRef.current.visible = step.visible;
    if (step.completedNow) onCompleteRef.current(effect.id);
    if (!suspended && step.visible && Platform.OS !== "web") invalidate();
  });

  return (
    <mesh
      ref={meshRef}
      dispose={null}
      geometry={geometry}
      material={material}
      name={`sealed_order_reveal__${effect.id}`}
      position={[0, 0.014, 0]}
      renderOrder={4}
      raycast={() => undefined}
      onBeforeRender={markRendered}
      userData={{
        worldDominationKind: "sealed-order-reveal",
        effectId: effect.id,
        revealKind: effect.kind,
        territoryId: effect.territoryId,
        worldDominationRendered: false,
      }}
    />
  );
}

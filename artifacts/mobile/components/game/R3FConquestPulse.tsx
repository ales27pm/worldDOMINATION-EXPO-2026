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
  CONQUEST_PULSE_FRAGMENT_SHADER,
  RADIAL_OVERLAY_VERTEX_SHADER,
  createRadialOverlayUniforms,
  radialOverlaySeed,
} from "@/components/game/shaders/radial-overlay";
import { useFrame, useThree } from "@/components/game/r3fRuntime";
import {
  advanceR3FEffectTimeline,
  createR3FEffectTimelineState,
} from "@/game/r3fEffectTimeline";
import type { MapScenePulseEffect } from "@/game/mapSceneModel";

const CONQUEST_PULSE_DURATION_SECONDS = 1.15;

interface Props {
  effect: MapScenePulseEffect;
  geometry: BufferGeometry;
  reducedMotion: boolean;
  suspended: boolean;
  onComplete: (effectId: string) => void;
}

export function R3FConquestPulse({
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
        fragmentShader: CONQUEST_PULSE_FRAGMENT_SHADER,
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
      durationSeconds: CONQUEST_PULSE_DURATION_SECONDS,
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
      name={`conquest_pulse__${effect.id}`}
      position={[0, 0.012, 0]}
      renderOrder={3}
      raycast={() => undefined}
      onBeforeRender={markRendered}
      userData={{
        worldDominationKind: "conquest-pulse",
        effectId: effect.id,
        pulseKind: effect.kind,
        territoryId: effect.territoryId,
        worldDominationRendered: false,
      }}
    />
  );
}

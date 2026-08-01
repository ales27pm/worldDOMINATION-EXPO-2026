import React from "react";
import type { BufferGeometry, Texture } from "three";

import { R3FConquestPulse } from "@/components/game/R3FConquestPulse";
import { R3FSealedOrderReveal } from "@/components/game/R3FSealedOrderReveal";
import type {
  MapSceneModel,
  MapScenePulseEffect,
  MapSceneRevealEffect,
} from "@/game/mapSceneModel";
import {
  CORRECTED_CHINA_OUTLINE,
  resolveTerritorySurfaceAppearance,
} from "@/game/mapSurfaceAppearance";

function interactionColor(interaction: string): string {
  if (interaction === "selected") return "#f8cf45";
  if (interaction === "target") return "#ee6049";
  if (interaction === "interactive") return "#61c78b";
  return "#ffffff";
}

export function R3FTerritorySurface({
  model,
  geometries,
  boardTexture,
  shadows,
  pulses,
  reveals,
  reducedMotion,
  suspended,
  onPulseComplete,
  onRevealComplete,
}: {
  model: MapSceneModel;
  geometries: Map<string, BufferGeometry>;
  boardTexture: Texture;
  shadows: boolean;
  pulses: MapScenePulseEffect[];
  reveals: MapSceneRevealEffect[];
  reducedMotion: boolean;
  suspended: boolean;
  onPulseComplete: (effectId: string) => void;
  onRevealComplete: (effectId: string) => void;
}) {
  return model.territories.map((territory) => {
    const geometry = geometries.get(territory.meshName);
    if (!geometry) return null;
    const surface = resolveTerritorySurfaceAppearance(
      territory.id,
      territory.surfaceTint,
    );
    const highlight = interactionColor(territory.interaction);
    const highlighted = territory.interaction !== "idle";
    return (
      <React.Fragment key={territory.id}>
        <mesh
          geometry={geometry}
          name={territory.meshName}
          receiveShadow={shadows}
          castShadow={shadows}
        >
          <meshStandardMaterial
            map={surface.useBoardTexture ? boardTexture : null}
            color={surface.color}
            emissive={highlighted ? highlight : "#000000"}
            emissiveIntensity={highlighted ? 0.28 : 0}
            roughness={0.76}
            metalness={0.02}
          />
        </mesh>
        {pulses
          .filter((effect) => effect.territoryId === territory.id)
          .map((effect) => (
            <R3FConquestPulse
              key={effect.id}
              effect={effect}
              geometry={geometry}
              reducedMotion={reducedMotion}
              suspended={suspended}
              onComplete={onPulseComplete}
            />
          ))}
        {reveals
          .filter((effect) => effect.territoryId === territory.id)
          .map((effect) => (
            <R3FSealedOrderReveal
              key={effect.id}
              effect={effect}
              geometry={geometry}
              reducedMotion={reducedMotion}
              suspended={suspended}
              onComplete={onRevealComplete}
            />
          ))}
        {surface.drawAuthoritativeOutline ? (
          <lineSegments
            name="outline__china"
            position={[0, 0.008, 0]}
            renderOrder={2}
          >
            <edgesGeometry args={[geometry, 30]} />
            <lineBasicMaterial
              color={CORRECTED_CHINA_OUTLINE}
              transparent
              opacity={0.68}
              depthWrite={false}
            />
          </lineSegments>
        ) : null}
        <mesh
          geometry={geometry}
          name={territory.pickMeshName}
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
  });
}

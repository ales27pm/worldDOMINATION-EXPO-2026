import React from "react";
import type { BufferGeometry, Texture } from "three";

import type { MapSceneModel } from "@/game/mapSceneModel";

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
}: {
  model: MapSceneModel;
  geometries: Map<string, BufferGeometry>;
  boardTexture: Texture;
  shadows: boolean;
}) {
  return model.territories.map((territory) => {
    const geometry = geometries.get(territory.meshName);
    if (!geometry) return null;
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

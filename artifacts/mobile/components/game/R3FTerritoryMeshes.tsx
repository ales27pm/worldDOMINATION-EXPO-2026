import { Asset } from "expo-asset";
import React, { useEffect, useMemo } from "react";
import {
  BufferGeometry,
  Group,
  Mesh,
  SRGBColorSpace,
  TextureLoader,
} from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";

import { useLoader } from "@/components/game/r3fRuntime";
import { R3FTerritorySurface } from "@/components/game/R3FTerritorySurface";
import {
  createMapAttentionTargetRegistry,
  type MapAttentionTargetRegistry,
} from "@/game/mapAttentionDirector";
import {
  MAP_SCENE_BOARD_PIXELS,
  MAP_SCENE_UNITS_PER_PIXEL,
} from "@/game/mapSceneGeometry";
import type { MapSceneModel } from "@/game/mapSceneModel";
import { MAP_SCENE_GLBS, WORLD_BOARD } from "@/lib/gameArt";

interface Props {
  model: MapSceneModel;
  onLoaded: () => void;
  onAttentionTargetsReady: (
    registry: MapAttentionTargetRegistry,
  ) => void;
}

const BOARD_WIDTH = MAP_SCENE_BOARD_PIXELS[0] * MAP_SCENE_UNITS_PER_PIXEL;
const BOARD_DEPTH = MAP_SCENE_BOARD_PIXELS[1] * MAP_SCENE_UNITS_PER_PIXEL;

function collectTerritoryGeometries(
  scene: Group,
): Map<string, BufferGeometry> {
  const result = new Map<string, BufferGeometry>();
  scene.traverse((object) => {
    const mesh = object as Mesh;
    if (mesh.isMesh && mesh.name.startsWith("territory__")) {
      result.set(mesh.name, mesh.geometry);
    }
  });
  return result;
}

export default function R3FTerritoryMeshes({
  model,
  onLoaded,
  onAttentionTargetsReady,
}: Props) {
  const gltf = useLoader(
    GLTFLoader,
    Asset.fromModule(MAP_SCENE_GLBS[model.variant]).uri,
  ) as GLTF;
  const boardTexture = useLoader(
    TextureLoader,
    Asset.fromModule(WORLD_BOARD).uri,
  );
  const geometries = useMemo(
    () => collectTerritoryGeometries(gltf.scene),
    [gltf.scene],
  );
  const attentionTargets = useMemo(
    () => createMapAttentionTargetRegistry(model.territories, geometries),
    // Territory mesh membership changes only when the map variant changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [geometries, model.variant],
  );

  useEffect(() => {
    boardTexture.colorSpace = SRGBColorSpace;
    boardTexture.anisotropy = 8;
    boardTexture.needsUpdate = true;
  }, [boardTexture]);

  useEffect(() => {
    if (geometries.size !== model.territories.length) return;
    onAttentionTargetsReady(attentionTargets);
    onLoaded();
  }, [
    attentionTargets,
    geometries,
    model.territories.length,
    onAttentionTargetsReady,
    onLoaded,
  ]);

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
      <R3FTerritorySurface
        model={model}
        geometries={geometries}
        boardTexture={boardTexture}
        shadows
      />
    </>
  );
}

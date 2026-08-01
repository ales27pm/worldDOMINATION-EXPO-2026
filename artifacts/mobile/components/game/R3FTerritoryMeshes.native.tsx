import { Asset } from "expo-asset";
import { File } from "expo-file-system";
import React, { useEffect, useMemo, useState } from "react";
import { SRGBColorSpace, TextureLoader } from "three";

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
import { parseMapSceneGlb, type ParsedMapSceneGlb } from "@/game/mapSceneGlb";
import type {
  MapSceneModel,
  MapScenePulseEffect,
  MapSceneRevealEffect,
} from "@/game/mapSceneModel";
import { MAP_SCENE_GLBS, WORLD_BOARD_NATIVE } from "@/lib/gameArt";

interface Props {
  model: MapSceneModel;
  onLoaded: () => void;
  onAttentionTargetsReady: (registry: MapAttentionTargetRegistry) => void;
  pulses: MapScenePulseEffect[];
  reveals: MapSceneRevealEffect[];
  reducedMotion: boolean;
  suspended: boolean;
  onPulseComplete: (effectId: string) => void;
  onRevealComplete: (effectId: string) => void;
}

const BOARD_WIDTH = MAP_SCENE_BOARD_PIXELS[0] * MAP_SCENE_UNITS_PER_PIXEL;
const BOARD_DEPTH = MAP_SCENE_BOARD_PIXELS[1] * MAP_SCENE_UNITS_PER_PIXEL;

async function readAssetBytes(module: number): Promise<Uint8Array> {
  const asset = Asset.fromModule(module);
  await asset.downloadAsync();
  const uri = asset.localUri ?? asset.uri;
  if (uri.startsWith("file:")) return new File(uri).bytes();

  const response = await fetch(uri);
  if (!response.ok) {
    throw new Error(`Unable to load canonical map asset (${response.status})`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

function useNativeMapScene(module: number): ParsedMapSceneGlb | null {
  const [scene, setScene] = useState<ParsedMapSceneGlb | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let cancelled = false;
    let loaded: ParsedMapSceneGlb | null = null;
    setScene(null);
    setError(null);

    void readAssetBytes(module)
      .then((bytes) => parseMapSceneGlb(bytes))
      .then((next) => {
        loaded = next;
        if (cancelled) {
          next.dispose();
          return;
        }
        setScene(next);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason);
      });

    return () => {
      cancelled = true;
      loaded?.dispose();
    };
  }, [module]);

  if (error) throw error;
  return scene;
}

export default function R3FTerritoryMeshes({
  model,
  onLoaded,
  onAttentionTargetsReady,
  pulses,
  reveals,
  reducedMotion,
  suspended,
  onPulseComplete,
  onRevealComplete,
}: Props) {
  const scene = useNativeMapScene(MAP_SCENE_GLBS[model.variant]);
  const boardTexture = useLoader(
    TextureLoader,
    WORLD_BOARD_NATIVE as unknown as string,
  );

  useEffect(() => {
    boardTexture.colorSpace = SRGBColorSpace;
    boardTexture.anisotropy = 4;
    boardTexture.needsUpdate = true;
  }, [boardTexture]);

  const attentionTargets = useMemo(
    () =>
      scene
        ? createMapAttentionTargetRegistry(model.territories, scene.geometries)
        : null,
    // Territory mesh membership changes only when the map variant changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [model.variant, scene],
  );

  useEffect(() => {
    if (
      scene?.geometries.size !== model.territories.length ||
      !attentionTargets
    ) {
      return;
    }
    onAttentionTargetsReady(attentionTargets);
    onLoaded();
  }, [
    attentionTargets,
    model.territories.length,
    onAttentionTargetsReady,
    onLoaded,
    scene,
  ]);

  return (
    <>
      <mesh
        name="painted_board"
        position={[0, -0.018, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <planeGeometry args={[BOARD_WIDTH, BOARD_DEPTH]} />
        <meshStandardMaterial
          map={boardTexture}
          color="#ffffff"
          roughness={0.9}
          metalness={0}
        />
      </mesh>
      {scene ? (
        <R3FTerritorySurface
          model={model}
          geometries={scene.geometries}
          boardTexture={boardTexture}
          shadows={false}
          pulses={pulses}
          reveals={reveals}
          reducedMotion={reducedMotion}
          suspended={suspended}
          onPulseComplete={onPulseComplete}
          onRevealComplete={onRevealComplete}
        />
      ) : null}
    </>
  );
}

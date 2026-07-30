import React, { useEffect } from "react";
import { SRGBColorSpace, TextureLoader } from "three";

import { R3FTerritoryLabelSurface } from "@/components/game/R3FTerritoryLabelSurface";
import { useLoader } from "@/components/game/r3fRuntime";
import type { MapSceneModel } from "@/game/mapSceneModel";
import { MAP_SCENE_LABEL_ATLAS } from "@/lib/gameArt";

export default function R3FTerritoryLabels({
  model,
}: {
  model: MapSceneModel;
}) {
  const texture = useLoader(
    TextureLoader,
    MAP_SCENE_LABEL_ATLAS as unknown as string,
  );

  useEffect(() => {
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 4;
    texture.needsUpdate = true;
  }, [texture]);

  return <R3FTerritoryLabelSurface model={model} texture={texture} />;
}

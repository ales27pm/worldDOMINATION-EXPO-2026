import React from "react";
import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  type Texture,
} from "three";

import {
  buildMapSceneLabelLayout,
  type MapSceneLabelLayout,
} from "@/game/mapSceneLabels";
import type { MapSceneModel } from "@/game/mapSceneModel";

const geometryCache = new Map<MapSceneModel["variant"], BufferGeometry>();

function createLabelGeometry(labels: readonly MapSceneLabelLayout[]) {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  labels.forEach((label, index) => {
    const [x, y, z] = label.center;
    const halfWidth = label.width / 2;
    const halfDepth = label.depth / 2;
    const vertex = index * 4;

    positions.push(
      x - halfWidth,
      y,
      z - halfDepth,
      x + halfWidth,
      y,
      z - halfDepth,
      x + halfWidth,
      y,
      z + halfDepth,
      x - halfWidth,
      y,
      z + halfDepth,
    );
    uvs.push(
      label.uv.left,
      label.uv.top,
      label.uv.right,
      label.uv.top,
      label.uv.right,
      label.uv.bottom,
      label.uv.left,
      label.uv.bottom,
    );
    indices.push(
      vertex,
      vertex + 2,
      vertex + 1,
      vertex,
      vertex + 3,
      vertex + 2,
    );
  });

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function geometryForModel(model: MapSceneModel): BufferGeometry {
  const cached = geometryCache.get(model.variant);
  if (cached) return cached;
  const geometry = createLabelGeometry(
    buildMapSceneLabelLayout(model.territories),
  );
  geometry.name = `territory_labels__${model.variant}`;
  geometryCache.set(model.variant, geometry);
  return geometry;
}

export function R3FTerritoryLabelSurface({
  model,
  texture,
}: {
  model: MapSceneModel;
  texture: Texture;
}) {
  const geometry = geometryForModel(model);
  return (
    <mesh
      geometry={geometry}
      name="territory_labels"
      renderOrder={4}
      userData={{ territoryCount: model.territories.length }}
    >
      <meshBasicMaterial
        map={texture}
        color="#ffffff"
        transparent
        alphaTest={0.04}
        depthWrite={false}
        side={DoubleSide}
        toneMapped={false}
      />
    </mesh>
  );
}

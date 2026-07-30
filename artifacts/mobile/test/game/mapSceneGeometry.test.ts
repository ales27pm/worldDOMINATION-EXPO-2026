import { createHash } from "node:crypto";
import { deepEqual, equal, ok } from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import { activeTerritories, ALL_TERRITORIES } from "../../game/mapData";
import { getTerritoryPath } from "../../game/mapGeometry";
import {
  MAP_SCENE_CONTRACT_VERSION,
  MAP_SCENE_FORMAT,
  MAP_SCENE_TERRITORY_HEIGHT,
  MAP_SCENE_UNITS_PER_PIXEL,
  MAP_VARIANTS,
  mapVariantIncludesExtraTerritories,
  territoryMeshName,
  type MapSceneAssetManifest,
  type MapVariant,
  type TerritoryMeshMetadata,
} from "../../game/mapSceneGeometry";
import { SHAPES_H, SHAPES_W } from "../../game/mapShapes";

interface GltfAccessor {
  componentType: number;
  count: number;
  type: string;
  min?: number[];
  max?: number[];
}

interface GltfPrimitive {
  attributes: {
    POSITION?: number;
    NORMAL?: number;
    TEXCOORD_0?: number;
  };
  mode?: number;
}

interface GltfMesh {
  name?: string;
  primitives: GltfPrimitive[];
}

interface GltfNode {
  name?: string;
  mesh?: number;
  extras?: TerritoryMeshMetadata;
}

interface GltfDocument {
  asset: {
    version: string;
  };
  accessors: GltfAccessor[];
  buffers: Array<{ byteLength: number }>;
  meshes: GltfMesh[];
  nodes: GltfNode[];
  scene: number;
  scenes: Array<{
    nodes: number[];
    extras?: Record<string, unknown>;
  }>;
}

const GLB_MAGIC = 0x46546c67;
const GLB_JSON_CHUNK = 0x4e4f534a;
const GLB_BINARY_CHUNK = 0x004e4942;
const assetDirectory = path.resolve(process.cwd(), "assets/game/map-3d");

function sha256(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

function parseGlb(bytes: Buffer): {
  document: GltfDocument;
  binaryByteLength: number;
} {
  equal(bytes.readUInt32LE(0), GLB_MAGIC);
  equal(bytes.readUInt32LE(4), 2);
  equal(bytes.readUInt32LE(8), bytes.byteLength);

  let offset = 12;
  let document: GltfDocument | null = null;
  let binaryByteLength = 0;
  while (offset < bytes.byteLength) {
    const chunkLength = bytes.readUInt32LE(offset);
    const chunkType = bytes.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + chunkLength;
    ok(end <= bytes.byteLength, "GLB chunk extends beyond the container");

    if (chunkType === GLB_JSON_CHUNK) {
      document = JSON.parse(
        bytes.subarray(start, end).toString("utf8").trim(),
      ) as GltfDocument;
    } else if (chunkType === GLB_BINARY_CHUNK) {
      binaryByteLength = chunkLength;
    }
    offset = end;
  }

  ok(document, "GLB is missing its JSON chunk");
  ok(binaryByteLength > 0, "GLB is missing its binary geometry chunk");
  return { document, binaryByteLength };
}

function assertNear(
  actual: number,
  expected: number,
  epsilon: number,
  message: string,
): void {
  ok(
    Math.abs(actual - expected) <= epsilon,
    `${message}: expected ${expected}, got ${actual}`,
  );
}

async function validateVariant(
  variant: MapVariant,
  manifest: MapSceneAssetManifest,
): Promise<void> {
  const variantManifest = manifest.variants[variant];
  const bytes = await readFile(path.join(assetDirectory, variantManifest.file));
  const { document, binaryByteLength } = parseGlb(bytes);
  const includeExtra = mapVariantIncludesExtraTerritories(variant);
  const territories = activeTerritories(includeExtra);
  const expectedIds = territories.map((territory) => territory.id);
  const expectedMeshNames = territories.map((territory) =>
    territoryMeshName(territory.id),
  );

  equal(document.asset.version, "2.0");
  equal(document.meshes.length, territories.length);
  equal(document.buffers.length, 1);
  ok(document.buffers[0].byteLength <= binaryByteLength);
  equal(variantManifest.byteLength, bytes.byteLength);
  equal(variantManifest.sha256, sha256(bytes));
  equal(variantManifest.territoryCount, territories.length);
  deepEqual(variantManifest.meshNames, expectedMeshNames);

  const activeScene = document.scenes[document.scene];
  equal(activeScene.extras?.format, MAP_SCENE_FORMAT);
  equal(activeScene.extras?.contractVersion, MAP_SCENE_CONTRACT_VERSION);
  equal(activeScene.extras?.variant, variant);
  equal(
    activeScene.extras?.canonicalGeometrySha256,
    variantManifest.canonicalGeometrySha256,
  );

  const territoryNodes = activeScene.nodes
    .map((nodeIndex) => document.nodes[nodeIndex])
    .filter(
      (
        node,
      ): node is GltfNode & { extras: TerritoryMeshMetadata; mesh: number } =>
        Boolean(node.extras?.territoryId && node.mesh !== undefined),
    );
  equal(territoryNodes.length, territories.length);
  deepEqual(
    territoryNodes.map((node) => node.extras.territoryId),
    expectedIds,
  );

  for (const [index, territory] of territories.entries()) {
    const node = territoryNodes[index];
    const metadata = node.extras;
    const mesh = document.meshes[node.mesh];
    const expectedName = territoryMeshName(territory.id);

    equal(node.name, expectedName);
    equal(mesh.name, expectedName);
    equal(metadata.contractVersion, MAP_SCENE_CONTRACT_VERSION);
    equal(metadata.territoryId, territory.id);
    equal(metadata.displayName, territory.name);
    equal(metadata.continentId, territory.continent);
    equal(metadata.variant, variant);
    equal(
      metadata.stableIndex,
      ALL_TERRITORIES.findIndex(({ id }) => id === territory.id),
    );
    equal(metadata.isExtra, territory.isExtra);
    equal(
      metadata.pathSha256,
      sha256(getTerritoryPath(territory.id, includeExtra)),
    );
    equal(mesh.primitives.length, 1);

    const primitive = mesh.primitives[0];
    equal(primitive.mode ?? 4, 4);
    ok(primitive.attributes.NORMAL !== undefined);
    ok(primitive.attributes.TEXCOORD_0 !== undefined);
    const positionAccessor =
      document.accessors[primitive.attributes.POSITION ?? -1];
    const uvAccessor =
      document.accessors[primitive.attributes.TEXCOORD_0 ?? -1];
    ok(positionAccessor);
    ok(uvAccessor);
    equal(positionAccessor.componentType, 5126);
    equal(positionAccessor.type, "VEC3");
    equal(uvAccessor.type, "VEC2");
    equal(positionAccessor.count, uvAccessor.count);
    ok(
      positionAccessor.count >= 24,
      `${territory.id} has insufficient geometry`,
    );
    ok(positionAccessor.min && positionAccessor.max);

    const [anchorX, anchorY, anchorZ] = metadata.anchor;
    const expectedAnchorX =
      (territory.x * SHAPES_W - SHAPES_W / 2) * MAP_SCENE_UNITS_PER_PIXEL;
    const expectedAnchorZ =
      (territory.y * SHAPES_H - SHAPES_H / 2) * MAP_SCENE_UNITS_PER_PIXEL;
    assertNear(anchorX, expectedAnchorX, 1e-9, `${territory.id} anchor x`);
    assertNear(
      anchorY,
      MAP_SCENE_TERRITORY_HEIGHT,
      1e-9,
      `${territory.id} anchor height`,
    );
    assertNear(anchorZ, expectedAnchorZ, 1e-9, `${territory.id} anchor z`);
    const halfBoardWidth = (SHAPES_W * MAP_SCENE_UNITS_PER_PIXEL) / 2;
    const halfBoardDepth = (SHAPES_H * MAP_SCENE_UNITS_PER_PIXEL) / 2;
    ok(positionAccessor.min[0] >= -halfBoardWidth - 1e-6);
    ok(positionAccessor.max[0] <= halfBoardWidth + 1e-6);
    ok(positionAccessor.min[2] >= -halfBoardDepth - 1e-6);
    ok(positionAccessor.max[2] <= halfBoardDepth + 1e-6);
    assertNear(positionAccessor.min[1], 0, 1e-6, `${territory.id} base height`);
    assertNear(
      positionAccessor.max[1],
      MAP_SCENE_TERRITORY_HEIGHT,
      1e-6,
      `${territory.id} top height`,
    );
  }
}

test("checked-in map GLBs preserve canonical territory mesh IDs and geometry", async () => {
  const manifest = JSON.parse(
    await readFile(path.join(assetDirectory, "manifest.json"), "utf8"),
  ) as MapSceneAssetManifest;

  equal(manifest.format, MAP_SCENE_FORMAT);
  equal(manifest.contractVersion, MAP_SCENE_CONTRACT_VERSION);
  deepEqual(manifest.source.boardPixels, [SHAPES_W, SHAPES_H]);
  equal(manifest.source.unitsPerPixel, MAP_SCENE_UNITS_PER_PIXEL);
  equal(manifest.source.territoryHeight, MAP_SCENE_TERRITORY_HEIGHT);

  for (const variant of MAP_VARIANTS) {
    await validateVariant(variant, manifest);
  }
});

import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  BufferAttribute,
  ExtrudeGeometry,
  Mesh,
  MeshStandardMaterial,
  Scene,
  Shape,
  ShapeUtils,
  Vector2,
} from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";

import {
  activeTerritories,
  ALL_TERRITORIES,
  CONTINENTS,
} from "../game/mapData";
import { getTerritoryPath } from "../game/mapGeometry";
import {
  MAP_SCENE_CONTRACT_VERSION,
  MAP_SCENE_FORMAT,
  MAP_SCENE_TERRITORY_HEIGHT,
  MAP_SCENE_UNITS_PER_PIXEL,
  MAP_VARIANTS,
  mapBoardPointToWorld,
  mapSceneAssetFilename,
  mapVariantIncludesExtraTerritories,
  territoryMeshName,
  type MapSceneAssetManifest,
  type MapSceneVariantManifest,
  type MapVariant,
} from "../game/mapSceneGeometry";
import { SHAPES_H, SHAPES_W } from "../game/mapShapes";
import type { TerritoryDef } from "../game/types";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const outputDirectory = path.resolve(scriptDirectory, "../assets/game/map-3d");
const manifestFilename = "manifest.json";
const checkOnly = process.argv.slice(2).includes("--check");

function sha256(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

function parseLinearSvgPath(source: string): Vector2[][] {
  const tokens = source.match(/[MLZ]|-?\d+(?:\.\d+)?/g) ?? [];
  const polygons: Vector2[][] = [];
  let polygon: Vector2[] | null = null;

  for (let index = 0; index < tokens.length;) {
    const command = tokens[index++];
    if (command === "M" || command === "L") {
      const xToken = tokens[index++];
      const yToken = tokens[index++];
      if (
        xToken === undefined ||
        yToken === undefined ||
        /[MLZ]/.test(xToken + yToken)
      ) {
        throw new Error(
          `Invalid ${command} command in path: ${source.slice(0, 80)}`,
        );
      }
      const point = new Vector2(
        (Number(xToken) - SHAPES_W / 2) * MAP_SCENE_UNITS_PER_PIXEL,
        (SHAPES_H / 2 - Number(yToken)) * MAP_SCENE_UNITS_PER_PIXEL,
      );
      if (command === "M") {
        if (polygon)
          throw new Error(
            "Path started a new polygon before closing the previous one",
          );
        polygon = [point];
      } else {
        if (!polygon)
          throw new Error("Path line command appeared before a move command");
        polygon.push(point);
      }
      continue;
    }

    if (command !== "Z" || !polygon) {
      throw new Error(`Unsupported path token ${command}`);
    }

    const first = polygon[0];
    const last = polygon.at(-1);
    if (last?.equals(first)) polygon.pop();
    if (polygon.length < 3)
      throw new Error("Territory polygon has fewer than three points");
    if (!ShapeUtils.isClockWise(polygon)) polygon.reverse();
    polygons.push(polygon);
    polygon = null;
  }

  if (polygon)
    throw new Error("Territory path did not close its final polygon");
  if (polygons.length === 0)
    throw new Error("Territory path contained no polygons");
  return polygons;
}

function applyAtlasUvs(geometry: ExtrudeGeometry): void {
  const positions = geometry.getAttribute("position");
  const normals = geometry.getAttribute("normal");
  const uvs = geometry.getAttribute("uv") as BufferAttribute;
  const boardWidth = SHAPES_W * MAP_SCENE_UNITS_PER_PIXEL;
  const boardDepth = SHAPES_H * MAP_SCENE_UNITS_PER_PIXEL;

  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const y = positions.getY(index);
    const z = positions.getZ(index);
    const normalY = normals.getY(index);
    if (Math.abs(normalY) > 0.9) {
      uvs.setXY(index, x / boardWidth + 0.5, 0.5 - z / boardDepth);
      continue;
    }

    const normalX = Math.abs(normals.getX(index));
    const normalZ = Math.abs(normals.getZ(index));
    const u = normalX > normalZ ? z / boardDepth + 0.5 : x / boardWidth + 0.5;
    uvs.setXY(index, u, y / MAP_SCENE_TERRITORY_HEIGHT);
  }
  uvs.needsUpdate = true;
}

function pathDigest(territory: TerritoryDef, variant: MapVariant): string {
  return sha256(
    getTerritoryPath(territory.id, mapVariantIncludesExtraTerritories(variant)),
  );
}

function canonicalGeometryDigest(
  territories: TerritoryDef[],
  variant: MapVariant,
): string {
  return sha256(
    territories
      .map((territory) => `${territory.id}\0${pathDigest(territory, variant)}`)
      .join("\n"),
  );
}

function buildScene(variant: MapVariant): {
  scene: Scene;
  territories: TerritoryDef[];
  dispose: () => void;
} {
  const includeExtra = mapVariantIncludesExtraTerritories(variant);
  const territories = activeTerritories(includeExtra);
  const scene = new Scene();
  const materials = new Map(
    Object.values(CONTINENTS).map((continent) => [
      continent.id,
      new MeshStandardMaterial({
        name: `continent__${continent.id}`,
        color: continent.color,
        metalness: 0.04,
        roughness: 0.82,
      }),
    ]),
  );

  scene.name = `worldDOMINATION__${variant}`;
  scene.userData = {
    format: MAP_SCENE_FORMAT,
    contractVersion: MAP_SCENE_CONTRACT_VERSION,
    variant,
    boardPixels: [SHAPES_W, SHAPES_H],
    unitsPerPixel: MAP_SCENE_UNITS_PER_PIXEL,
    territoryHeight: MAP_SCENE_TERRITORY_HEIGHT,
    canonicalGeometrySha256: canonicalGeometryDigest(territories, variant),
  };

  for (const territory of territories) {
    const sourcePath = getTerritoryPath(territory.id, includeExtra);
    const shapes = parseLinearSvgPath(sourcePath).map(
      (points) => new Shape(points),
    );
    const geometry = new ExtrudeGeometry(shapes, {
      bevelEnabled: false,
      curveSegments: 1,
      depth: MAP_SCENE_TERRITORY_HEIGHT,
      steps: 1,
    });
    geometry.rotateX(-Math.PI / 2);
    geometry.clearGroups();
    geometry.computeVertexNormals();
    applyAtlasUvs(geometry);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    const stableIndex = ALL_TERRITORIES.findIndex(
      (candidate) => candidate.id === territory.id,
    );
    const mesh = new Mesh(geometry, materials.get(territory.continent));
    mesh.name = territoryMeshName(territory.id);
    mesh.userData = {
      contractVersion: MAP_SCENE_CONTRACT_VERSION,
      territoryId: territory.id,
      displayName: territory.name,
      continentId: territory.continent,
      variant,
      stableIndex,
      isExtra: territory.isExtra,
      pathSha256: sha256(sourcePath),
      anchor: mapBoardPointToWorld(territory.x, territory.y),
    };
    scene.add(mesh);
  }

  return {
    scene,
    territories,
    dispose: () => {
      for (const child of scene.children) {
        if (child instanceof Mesh) child.geometry.dispose();
      }
      for (const material of materials.values()) material.dispose();
    },
  };
}

function installNodeFileReader(): void {
  if (typeof FileReader !== "undefined") return;

  class NodeFileReader {
    result: ArrayBuffer | null = null;
    onloadend: (() => void) | null = null;

    readAsArrayBuffer(blob: Blob): void {
      void blob.arrayBuffer().then((result) => {
        this.result = result;
        this.onloadend?.();
      });
    }
  }

  Object.defineProperty(globalThis, "FileReader", {
    configurable: true,
    value: NodeFileReader,
  });
}

async function exportVariant(variant: MapVariant): Promise<{
  bytes: Buffer;
  manifest: MapSceneVariantManifest;
}> {
  installNodeFileReader();
  const { scene, territories, dispose } = buildScene(variant);

  try {
    const exporter = new GLTFExporter().register(() => ({
      writeMesh: (mesh, meshDefinition) => {
        if (mesh.name) meshDefinition.name = mesh.name;
      },
    }));
    const result = await exporter.parseAsync(scene, {
      binary: true,
      includeCustomExtensions: false,
      onlyVisible: false,
      trs: false,
    });
    if (!(result instanceof ArrayBuffer))
      throw new Error(`Expected binary GLB for ${variant}`);

    const bytes = Buffer.from(result);
    return {
      bytes,
      manifest: {
        file: mapSceneAssetFilename(variant),
        sha256: sha256(bytes),
        byteLength: bytes.byteLength,
        territoryCount: territories.length,
        canonicalGeometrySha256: canonicalGeometryDigest(territories, variant),
        meshNames: territories.map((territory) =>
          territoryMeshName(territory.id),
        ),
      },
    };
  } finally {
    dispose();
  }
}

async function writeAtomically(
  filename: string,
  data: string | Uint8Array,
): Promise<void> {
  const temporaryFilename = `${filename}.tmp`;
  await writeFile(temporaryFilename, data);
  await rename(temporaryFilename, filename);
}

async function assertCurrent(
  filename: string,
  expected: string | Uint8Array,
): Promise<void> {
  const actual = await readFile(filename).catch(() => null);
  const expectedBytes =
    typeof expected === "string"
      ? Buffer.from(expected)
      : Buffer.from(expected);
  if (!actual?.equals(expectedBytes)) {
    throw new Error(
      `${path.relative(process.cwd(), filename)} is missing or stale; run pnpm run map:glb`,
    );
  }
}

async function main(): Promise<void> {
  const variants = await Promise.all(
    MAP_VARIANTS.map((variant) => exportVariant(variant)),
  );
  const manifest: MapSceneAssetManifest = {
    format: MAP_SCENE_FORMAT,
    contractVersion: MAP_SCENE_CONTRACT_VERSION,
    source: {
      geometry: "game/mapShapes.ts",
      territories: "game/mapData.ts",
      boardPixels: [SHAPES_W, SHAPES_H],
      unitsPerPixel: MAP_SCENE_UNITS_PER_PIXEL,
      territoryHeight: MAP_SCENE_TERRITORY_HEIGHT,
    },
    variants: {
      classic: variants[0].manifest,
      expanded: variants[1].manifest,
    },
  };
  const manifestJson = `${JSON.stringify(manifest, null, 2)}\n`;

  if (checkOnly) {
    for (const { bytes, manifest: variant } of variants) {
      await assertCurrent(path.join(outputDirectory, variant.file), bytes);
    }
    await assertCurrent(
      path.join(outputDirectory, manifestFilename),
      manifestJson,
    );
  } else {
    await mkdir(outputDirectory, { recursive: true });
    await Promise.all(
      variants.map(({ bytes, manifest: variant }) =>
        writeAtomically(path.join(outputDirectory, variant.file), bytes),
      ),
    );
    await writeAtomically(
      path.join(outputDirectory, manifestFilename),
      manifestJson,
    );
  }

  for (const { manifest: variant } of variants) {
    console.log(
      `${checkOnly ? "verified" : "wrote"} ${variant.file}: ${variant.territoryCount} territories, ${variant.byteLength} bytes, sha256 ${variant.sha256}`,
    );
  }
}

void main().catch(async (error: unknown) => {
  await rm(path.join(outputDirectory, `${manifestFilename}.tmp`), {
    force: true,
  });
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

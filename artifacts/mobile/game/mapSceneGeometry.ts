import type { ContinentId, TerritoryId } from "./types";

export const MAP_SCENE_CONTRACT_VERSION = 1 as const;
export const MAP_SCENE_FORMAT = "worlddomination-map-scene" as const;
export const MAP_SCENE_BOARD_PIXELS = [1536, 1024] as const;
export const MAP_SCENE_UNITS_PER_PIXEL = 0.01;
export const MAP_SCENE_TERRITORY_HEIGHT = 0.08;
export const MAP_SCENE_TABLETOP_RADIUS = 9.55;
export const MAP_SCENE_TABLETOP_Y = -0.06;

export const MAP_VARIANTS = ["classic", "expanded"] as const;

export type MapVariant = (typeof MAP_VARIANTS)[number];
export type TerritoryMeshName = `territory__${TerritoryId}`;
export type TerritoryPickMeshName = `pick__${TerritoryId}`;

export function mapVariantIncludesExtraTerritories(
  variant: MapVariant,
): boolean {
  return variant === "expanded";
}

export function mapSceneAssetFilename(
  variant: MapVariant,
): `world-map-${MapVariant}.glb` {
  return `world-map-${variant}.glb`;
}

export function territoryMeshName(id: TerritoryId): TerritoryMeshName {
  return `territory__${id}`;
}

export function territoryPickMeshName(id: TerritoryId): TerritoryPickMeshName {
  return `pick__${id}`;
}

export function mapBoardPointToWorld(
  x: number,
  y: number,
  elevation = MAP_SCENE_TERRITORY_HEIGHT,
): [number, number, number] {
  const [boardWidth, boardHeight] = MAP_SCENE_BOARD_PIXELS;
  return [
    (x * boardWidth - boardWidth / 2) * MAP_SCENE_UNITS_PER_PIXEL,
    elevation,
    (y * boardHeight - boardHeight / 2) * MAP_SCENE_UNITS_PER_PIXEL,
  ];
}

export interface TerritoryMeshMetadata {
  contractVersion: typeof MAP_SCENE_CONTRACT_VERSION;
  territoryId: TerritoryId;
  displayName: string;
  continentId: ContinentId;
  variant: MapVariant;
  stableIndex: number;
  isExtra: boolean;
  pathSha256: string;
  anchor: [number, number, number];
}

export interface MapSceneVariantManifest {
  file: string;
  sha256: string;
  byteLength: number;
  territoryCount: number;
  canonicalGeometrySha256: string;
  meshNames: TerritoryMeshName[];
}

export interface MapSceneAssetManifest {
  format: typeof MAP_SCENE_FORMAT;
  contractVersion: typeof MAP_SCENE_CONTRACT_VERSION;
  source: {
    geometry: "game/mapShapes.ts";
    territories: "game/mapData.ts";
    boardPixels: [number, number];
    unitsPerPixel: number;
    territoryHeight: number;
  };
  variants: Record<MapVariant, MapSceneVariantManifest>;
}

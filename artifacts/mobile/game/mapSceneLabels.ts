import { MAP_SCENE_TERRITORY_HEIGHT } from "./mapSceneGeometry";
import type { MapSceneTerritory } from "./mapSceneModel";
import type { TerritoryId } from "./types";

export const MAP_SCENE_LABEL_ATLAS_FORMAT =
  "worlddomination-territory-label-atlas" as const;
export const MAP_SCENE_LABEL_ATLAS_WIDTH = 1024;
export const MAP_SCENE_LABEL_ATLAS_HEIGHT = 1024;
export const MAP_SCENE_LABEL_ATLAS_COLUMNS = 4;
export const MAP_SCENE_LABEL_ATLAS_ROWS = 16;
export const MAP_SCENE_LABEL_CELL_WIDTH =
  MAP_SCENE_LABEL_ATLAS_WIDTH / MAP_SCENE_LABEL_ATLAS_COLUMNS;
export const MAP_SCENE_LABEL_CELL_HEIGHT =
  MAP_SCENE_LABEL_ATLAS_HEIGHT / MAP_SCENE_LABEL_ATLAS_ROWS;
export const MAP_SCENE_LABEL_WORLD_WIDTH = 1.28;
export const MAP_SCENE_LABEL_WORLD_DEPTH =
  MAP_SCENE_LABEL_WORLD_WIDTH *
  (MAP_SCENE_LABEL_CELL_HEIGHT / MAP_SCENE_LABEL_CELL_WIDTH);
export const MAP_SCENE_LABEL_OFFSET_Z = 0.3;
export const MAP_SCENE_LABEL_ELEVATION =
  MAP_SCENE_TERRITORY_HEIGHT + 0.014;

export interface MapSceneLabelAtlasEntry {
  territoryId: TerritoryId;
  displayName: string;
  stableIndex: number;
}

export interface MapSceneLabelAtlasManifest {
  format: typeof MAP_SCENE_LABEL_ATLAS_FORMAT;
  contractVersion: 1;
  file: "territory-labels.png";
  sha256: string;
  byteLength: number;
  width: typeof MAP_SCENE_LABEL_ATLAS_WIDTH;
  height: typeof MAP_SCENE_LABEL_ATLAS_HEIGHT;
  columns: typeof MAP_SCENE_LABEL_ATLAS_COLUMNS;
  rows: typeof MAP_SCENE_LABEL_ATLAS_ROWS;
  cellWidth: typeof MAP_SCENE_LABEL_CELL_WIDTH;
  cellHeight: typeof MAP_SCENE_LABEL_CELL_HEIGHT;
  font: {
    source: string;
    sha256: string;
    family: "IM Fell English";
    pixelSize: number;
  };
  labels: MapSceneLabelAtlasEntry[];
}

export interface MapSceneLabelLayout {
  territoryId: TerritoryId;
  displayName: string;
  atlasIndex: number;
  center: [number, number, number];
  width: number;
  depth: number;
  uv: {
    left: number;
    right: number;
    top: number;
    bottom: number;
  };
}

function atlasCell(index: number): MapSceneLabelLayout["uv"] {
  const capacity =
    MAP_SCENE_LABEL_ATLAS_COLUMNS * MAP_SCENE_LABEL_ATLAS_ROWS;
  if (!Number.isInteger(index) || index < 0 || index >= capacity) {
    throw new Error(`Invalid territory label atlas index ${index}`);
  }
  const column = index % MAP_SCENE_LABEL_ATLAS_COLUMNS;
  const row = Math.floor(index / MAP_SCENE_LABEL_ATLAS_COLUMNS);
  return {
    left: column / MAP_SCENE_LABEL_ATLAS_COLUMNS,
    right: (column + 1) / MAP_SCENE_LABEL_ATLAS_COLUMNS,
    top: 1 - row / MAP_SCENE_LABEL_ATLAS_ROWS,
    bottom: 1 - (row + 1) / MAP_SCENE_LABEL_ATLAS_ROWS,
  };
}

export function buildMapSceneLabelLayout(
  territories: readonly MapSceneTerritory[],
): MapSceneLabelLayout[] {
  const usedAtlasIndexes = new Set<number>();
  return territories.map((territory) => {
    if (usedAtlasIndexes.has(territory.stableIndex)) {
      throw new Error(
        `Duplicate territory label atlas index ${territory.stableIndex}`,
      );
    }
    usedAtlasIndexes.add(territory.stableIndex);
    return {
      territoryId: territory.id,
      displayName: territory.displayName,
      atlasIndex: territory.stableIndex,
      center: [
        territory.anchor[0],
        MAP_SCENE_LABEL_ELEVATION,
        territory.anchor[2] + MAP_SCENE_LABEL_OFFSET_Z,
      ],
      width: MAP_SCENE_LABEL_WORLD_WIDTH,
      depth: MAP_SCENE_LABEL_WORLD_DEPTH,
      uv: atlasCell(territory.stableIndex),
    };
  });
}

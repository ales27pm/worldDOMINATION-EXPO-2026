import type { MapSceneModel } from "./mapSceneModel";
import type { TerritoryId } from "./types";

export interface MapScenePickIntersection {
  distance: number;
  object: {
    name: string;
  };
}

export interface MapScenePickIndexEntry {
  id: TerritoryId;
  stableIndex: number;
}

export type MapScenePickIndex = ReadonlyMap<string, MapScenePickIndexEntry>;

export const MAP_SCENE_PICK_DISTANCE_EPSILON = 1e-5;

export function createMapScenePickIndex(
  model: Pick<MapSceneModel, "territories">,
): MapScenePickIndex {
  return new Map(
    model.territories.map((territory) => [
      territory.pickMeshName,
      { id: territory.id, stableIndex: territory.stableIndex },
    ]),
  );
}

export function pickTerritoryFromIntersections(
  index: MapScenePickIndex,
  intersections: readonly MapScenePickIntersection[],
): TerritoryId | null {
  let best:
    | {
        distance: number;
        entry: MapScenePickIndexEntry;
      }
    | undefined;

  for (const intersection of intersections) {
    if (!Number.isFinite(intersection.distance)) continue;
    const entry = index.get(intersection.object.name);
    if (!entry) continue;
    if (
      !best ||
      intersection.distance < best.distance - MAP_SCENE_PICK_DISTANCE_EPSILON ||
      (Math.abs(intersection.distance - best.distance) <=
        MAP_SCENE_PICK_DISTANCE_EPSILON &&
        entry.stableIndex < best.entry.stableIndex)
    ) {
      best = { distance: intersection.distance, entry };
    }
  }

  return best?.entry.id ?? null;
}

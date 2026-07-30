import { activeTerritories, TERRITORY_MAP } from "./mapData";
import type { TerritoryId } from "./types";

export interface BoardRouteSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface BoardRouteEdge {
  key: string;
  segments: BoardRouteSegment[];
}

/** Neighbor pairs that cross open water and should render as sea-route lines. */
export const SEA_ROUTE_KEYS = new Set<string>(
  [
    ["alaska", "kamchatka"],
    ["greenland", "northwestTerritory"],
    ["greenland", "ontario"],
    ["greenland", "quebec"],
    ["greenland", "iceland"],
    ["greenland", "svalbard"],
    ["iceland", "svalbard"],
    ["iceland", "scandinavia"],
    ["iceland", "greatBritain"],
    ["scandinavia", "svalbard"],
    ["scandinavia", "greatBritain"],
    ["greatBritain", "northernEurope"],
    ["greatBritain", "westernEurope"],
    ["brazil", "northAfrica"],
    ["westernEurope", "northAfrica"],
    ["southernEurope", "northAfrica"],
    ["southernEurope", "egypt"],
    ["eastAfrica", "middleEast"],
    ["eastAfrica", "madagascar"],
    ["southAfrica", "madagascar"],
    ["madagascar", "falklandIslands"],
    ["argentina", "falklandIslands"],
    ["argentina", "newZealand"],
    ["easternAustralia", "newZealand"],
    ["kamchatka", "japan"],
    ["mongolia", "japan"],
    ["japan", "philippines"],
    ["japan", "hawaii"],
    ["westernUS", "hawaii"],
    ["siam", "indonesia"],
    ["siam", "philippines"],
    ["philippines", "indonesia"],
    ["indonesia", "newGuinea"],
    ["indonesia", "westernAustralia"],
    ["newGuinea", "westernAustralia"],
    ["newGuinea", "easternAustralia"],
  ].map(([a, b]) => seaRouteKey(a as TerritoryId, b as TerritoryId)),
);

export function seaRouteKey(a: TerritoryId, b: TerritoryId): string {
  return [a, b].sort().join("~");
}

export function buildSeaRouteEdges(includeExtra: boolean, width: number, height: number): BoardRouteEdge[] {
  const defs = activeTerritories(includeExtra);
  const pos = new Map<TerritoryId, { x: number; y: number }>();
  for (const def of defs) pos.set(def.id, { x: def.x * width, y: def.y * height });
  const seen = new Set<string>();
  const edges: BoardRouteEdge[] = [];
  for (const def of defs) {
    for (const neighbor of def.neighbors) {
      const key = seaRouteKey(def.id, neighbor);
      if (seen.has(key)) continue;
      seen.add(key);
      if (!SEA_ROUTE_KEYS.has(key)) continue;
      const a = pos.get(def.id);
      const b = pos.get(neighbor);
      if (!a || !b) continue;
      if (Math.abs(a.x - b.x) > width * 0.5) {
        // Wrap-around route (for example Alaska-Kamchatka): exit both map edges.
        const left = a.x < b.x ? a : b;
        const right = a.x < b.x ? b : a;
        edges.push({
          key,
          segments: [
            { x1: left.x, y1: left.y, x2: 0, y2: (left.y + right.y) / 2 },
            { x1: width, y1: (left.y + right.y) / 2, x2: right.x, y2: right.y },
          ],
        });
      } else {
        edges.push({ key, segments: [{ x1: a.x, y1: a.y, x2: b.x, y2: b.y }] });
      }
    }
  }
  return edges;
}

export function validateSeaRouteAdjacency(): string[] {
  const invalid: string[] = [];
  for (const key of SEA_ROUTE_KEYS) {
    const [a, b] = key.split("~") as [TerritoryId, TerritoryId];
    if (!TERRITORY_MAP[a]?.neighbors.includes(b) || !TERRITORY_MAP[b]?.neighbors.includes(a)) {
      invalid.push(key);
    }
  }
  return invalid;
}

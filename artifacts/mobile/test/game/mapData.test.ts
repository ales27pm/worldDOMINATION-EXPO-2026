import { deepEqual, equal, ok } from "node:assert/strict";
import { test } from "node:test";

import { activeTerritories, ALL_TERRITORIES, TERRITORY_MAP } from "../../game/mapData";
import { getTerritoryPath, hitTestTerritory } from "../../game/mapGeometry";
import { SHAPES_H, SHAPES_W, TERRITORY_PATHS } from "../../game/mapShapes";
import { buildSeaRouteEdges, seaRouteKey, validateSeaRouteAdjacency } from "../../game/mapRoutes";
import type { TerritoryId } from "../../game/types";

const EXPECTED_EXTRA_TERRITORIES: TerritoryId[] = [
  "falklandIslands",
  "hawaii",
  "newZealand",
  "philippines",
  "svalbard",
  "westAfrica",
];

const EXPECTED_BOARD_ANCHORS: Record<TerritoryId, [number, number]> = {
  alaska: [0.0911, 0.1729],
  northwestTerritory: [0.1725, 0.1797],
  greenland: [0.4063, 0.1201],
  alberta: [0.1673, 0.2588],
  ontario: [0.2493, 0.2744],
  quebec: [0.3203, 0.2734],
  westernUS: [0.1771, 0.3496],
  easternUS: [0.2493, 0.3652],
  centralAmerica: [0.1921, 0.415],
  hawaii: [0.071, 0.5127],
  venezuela: [0.2363, 0.5479],
  peru: [0.2565, 0.667],
  brazil: [0.3145, 0.6475],
  argentina: [0.2624, 0.7773],
  falklandIslands: [0.3125, 0.873],
  iceland: [0.4375, 0.2002],
  scandinavia: [0.5098, 0.1504],
  greatBritain: [0.4401, 0.3018],
  northernEurope: [0.4967, 0.3105],
  westernEurope: [0.429, 0.4014],
  southernEurope: [0.5098, 0.375],
  ukraine: [0.5612, 0.2715],
  svalbard: [0.5371, 0.0654],
  northAfrica: [0.4349, 0.5127],
  egypt: [0.5098, 0.5068],
  eastAfrica: [0.5384, 0.6016],
  congo: [0.5052, 0.6719],
  southAfrica: [0.5, 0.792],
  madagascar: [0.5762, 0.7607],
  westAfrica: [0.4688, 0.6035],
  ural: [0.6569, 0.2393],
  siberia: [0.7188, 0.1992],
  yakutsk: [0.819, 0.1895],
  kamchatka: [0.8926, 0.1836],
  irkutsk: [0.7832, 0.2715],
  mongolia: [0.8125, 0.3281],
  japan: [0.8451, 0.3477],
  afghanistan: [0.6413, 0.3516],
  china: [0.7116, 0.4189],
  middleEast: [0.5768, 0.4551],
  india: [0.679, 0.5137],
  siam: [0.7402, 0.5107],
  philippines: [0.8294, 0.4883],
  indonesia: [0.7813, 0.6084],
  newGuinea: [0.8789, 0.6367],
  westernAustralia: [0.7773, 0.7773],
  easternAustralia: [0.8496, 0.7549],
  newZealand: [0.9121, 0.8223],
};

test("standard and expanded maps expose the expected territory counts", () => {
  const standard = activeTerritories(false);
  const expanded = activeTerritories(true);

  equal(standard.length, 42);
  equal(expanded.length, 48);
  ok(standard.some((territory) => territory.id === "madagascar"));
  ok(!standard.some((territory) => territory.id === "westAfrica"));
  ok(expanded.some((territory) => territory.id === "madagascar"));
  ok(expanded.some((territory) => territory.id === "westAfrica"));

  const extraIds = ALL_TERRITORIES.filter((territory) => territory.isExtra)
    .map((territory) => territory.id)
    .sort();
  deepEqual(extraIds, [...EXPECTED_EXTRA_TERRITORIES].sort());
});

test("active territory coordinates stay normalized to the board", () => {
  for (const territory of ALL_TERRITORIES) {
    ok(territory.x >= 0 && territory.x <= 1, `${territory.id} x=${territory.x}`);
    ok(territory.y >= 0 && territory.y <= 1, `${territory.id} y=${territory.y}`);
  }
});

test("territory anchors stay locked to the painted board piece centers", () => {
  const byId = new Map(ALL_TERRITORIES.map((territory) => [territory.id, territory]));

  for (const [id, [expectedX, expectedY]] of Object.entries(EXPECTED_BOARD_ANCHORS) as Array<
    [TerritoryId, [number, number]]
  >) {
    const territory = byId.get(id);

    ok(territory, id);
    ok(Math.abs(territory.x - expectedX) <= 0.0005, `${id} x=${territory.x}`);
    ok(Math.abs(territory.y - expectedY) <= 0.0005, `${id} y=${territory.y}`);
  }
});

test("active-map adjacency is symmetric after filtering optional territories", () => {
  for (const includeExtra of [false, true]) {
    const byId = new Map(activeTerritories(includeExtra).map((territory) => [territory.id, territory]));

    for (const territory of byId.values()) {
      for (const neighborId of territory.neighbors) {
        const neighbor = byId.get(neighborId);

        ok(neighbor, `${territory.id} has inactive neighbor ${neighborId}`);
        ok(neighbor.neighbors.includes(territory.id), `${territory.id} -> ${neighborId} is not symmetric`);
      }
    }
  }
});

test("every active territory has a rendered shape path", () => {
  equal(SHAPES_W, 1536);
  equal(SHAPES_H, 1024);

  for (const includeExtra of [false, true]) {
    const missing = activeTerritories(includeExtra)
      .filter((territory) => !getTerritoryPath(territory.id, includeExtra)?.trim())
      .map((territory) => territory.id);

    deepEqual(missing, [], `missing paths with includeExtra=${includeExtra}`);
  }
});

test("classic and expanded atlas geometry resolve Africa and China taps", () => {
  const standardIds = activeTerritories(false).map((territory) => territory.id);
  const expandedIds = activeTerritories(true).map((territory) => territory.id);
  const westAfrica = TERRITORY_MAP.westAfrica;
  const china = TERRITORY_MAP.china;

  equal(
    hitTestTerritory(westAfrica.x * SHAPES_W, westAfrica.y * SHAPES_H, standardIds),
    "northAfrica",
  );
  equal(
    hitTestTerritory(westAfrica.x * SHAPES_W, westAfrica.y * SHAPES_H, expandedIds),
    "westAfrica",
  );
  equal(hitTestTerritory(china.x * SHAPES_W, china.y * SHAPES_H, standardIds), "china");
  equal(hitTestTerritory(china.x * SHAPES_W, china.y * SHAPES_H, expandedIds), "china");
  ok(getTerritoryPath("northAfrica", false).length > getTerritoryPath("northAfrica", true).length);

  for (const includeExtra of [false, true]) {
    const territories = activeTerritories(includeExtra);
    const activeIds = territories.map((territory) => territory.id);
    for (const territory of territories) {
      equal(
        hitTestTerritory(territory.x * SHAPES_W, territory.y * SHAPES_H, activeIds),
        territory.id,
        `${territory.id} piece anchor missed in ${includeExtra ? "expanded" : "classic"} mode`,
      );
    }
  }
});

test("territory map exposes every authored territory exactly once", () => {
  const ids = ALL_TERRITORIES.map((territory) => territory.id);
  const uniqueIds = new Set(ids);

  equal(uniqueIds.size, ids.length);
  deepEqual(Object.keys(TERRITORY_MAP).sort(), [...ids].sort());
});

test("sea routes are backed by adjacency and preserve edge-wrap rendering", () => {
  deepEqual(validateSeaRouteAdjacency(), []);

  const standard = buildSeaRouteEdges(false, SHAPES_W, SHAPES_H);
  const expanded = buildSeaRouteEdges(true, SHAPES_W, SHAPES_H);
  const standardKeys = new Set(standard.map((edge) => edge.key));
  const expandedKeys = new Set(expanded.map((edge) => edge.key));

  ok(standardKeys.has(seaRouteKey("alaska", "kamchatka")));
  ok(standardKeys.has(seaRouteKey("greenland", "iceland")));
  ok(!standardKeys.has(seaRouteKey("westernUS", "hawaii")));
  ok(!standardKeys.has(seaRouteKey("greenland", "svalbard")));
  ok(expandedKeys.has(seaRouteKey("westernUS", "hawaii")));
  ok(expandedKeys.has(seaRouteKey("greenland", "svalbard")));
  ok(expanded.length > standard.length);

  const wrapped = standard.find((edge) => edge.key === seaRouteKey("alaska", "kamchatka"));
  ok(wrapped);
  equal(wrapped.segments.length, 2);
  equal(wrapped.segments[0].x2, 0);
  equal(wrapped.segments[1].x1, SHAPES_W);
  equal(wrapped.segments[0].y2, wrapped.segments[1].y1);

  const direct = standard.find((edge) => edge.key === seaRouteKey("greenland", "iceland"));
  ok(direct);
  equal(direct.segments.length, 1);
  ok(direct.segments[0].x1 > 0 && direct.segments[0].x2 < SHAPES_W);
});

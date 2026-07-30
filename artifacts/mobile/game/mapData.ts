import type { ContinentDef, ContinentId, TerritoryDef, TerritoryId } from "./types";

/**
 * World map data ported from RiskConquest MapData.swift.
 * Coordinates are normalized (0..1) positions calibrated against the painted
 * world-board artwork (WORLD_BOARD in lib/gameArt, 3:2 aspect).
 */
export const CONTINENTS: Record<ContinentId, ContinentDef> = {
  northAmerica: { id: "northAmerica", name: "North America", bonus: 5, color: "#d9b167" },
  southAmerica: { id: "southAmerica", name: "South America", bonus: 2, color: "#e08f74" },
  europe: { id: "europe", name: "Europe", bonus: 5, color: "#b3a0d6" },
  africa: { id: "africa", name: "Africa", bonus: 3, color: "#d29a4b" },
  asia: { id: "asia", name: "Asia", bonus: 7, color: "#a5c47f" },
  australia: { id: "australia", name: "Australia", bonus: 2, color: "#e18cae" },
};

/** Same Time RISK uses its own, richer continent bonus table (manual, Chapter 9). */
export const SAME_TIME_CONTINENT_BONUS: Record<ContinentId, number> = {
  australia: 4,
  southAmerica: 4,
  africa: 5,
  europe: 6,
  northAmerica: 6,
  asia: 8,
};

const t = (
  id: TerritoryId,
  name: string,
  x: number,
  y: number,
  continent: ContinentId,
  neighbors: TerritoryId[],
  isExtra = false,
): TerritoryDef => ({ id, name, x, y, continent, neighbors, isExtra });

export const ALL_TERRITORIES: TerritoryDef[] = [
  // North America
  t("alaska", "Alaska", 0.0911, 0.1729, "northAmerica", ["northwestTerritory", "alberta", "kamchatka"]),
  t("northwestTerritory", "NW Territory", 0.1725, 0.1797, "northAmerica", ["alaska", "alberta", "ontario", "greenland"]),
  t("greenland", "Greenland", 0.4063, 0.1201, "northAmerica", ["northwestTerritory", "ontario", "quebec", "iceland", "svalbard"]),
  t("alberta", "Alberta", 0.1673, 0.2588, "northAmerica", ["alaska", "northwestTerritory", "ontario", "westernUS"]),
  t("ontario", "Ontario", 0.2493, 0.2744, "northAmerica", ["northwestTerritory", "alberta", "greenland", "quebec", "westernUS", "easternUS"]),
  t("quebec", "Quebec", 0.3203, 0.2734, "northAmerica", ["ontario", "greenland", "easternUS"]),
  t("westernUS", "W. United States", 0.1771, 0.3496, "northAmerica", ["alberta", "ontario", "easternUS", "centralAmerica", "hawaii"]),
  t("easternUS", "E. United States", 0.2493, 0.3652, "northAmerica", ["ontario", "quebec", "westernUS", "centralAmerica"]),
  t("centralAmerica", "Central America", 0.1921, 0.4150, "northAmerica", ["westernUS", "easternUS", "venezuela"]),
  t("hawaii", "Hawaii", 0.0710, 0.5127, "northAmerica", ["westernUS", "japan"], true),
  // South America
  t("venezuela", "Venezuela", 0.2363, 0.5479, "southAmerica", ["centralAmerica", "peru", "brazil"]),
  t("peru", "Peru", 0.2565, 0.6670, "southAmerica", ["venezuela", "brazil", "argentina"]),
  t("brazil", "Brazil", 0.3145, 0.6475, "southAmerica", ["venezuela", "peru", "argentina", "northAfrica"]),
  t("argentina", "Argentina", 0.2624, 0.7773, "southAmerica", ["peru", "brazil", "falklandIslands", "newZealand"]),
  t("falklandIslands", "Falkland Is.", 0.3125, 0.8730, "southAmerica", ["argentina", "madagascar"], true),
  // Europe
  t("iceland", "Iceland", 0.4375, 0.2002, "europe", ["greenland", "scandinavia", "greatBritain", "svalbard"]),
  t("scandinavia", "Scandinavia", 0.5098, 0.1504, "europe", ["iceland", "greatBritain", "northernEurope", "ukraine", "svalbard"]),
  t("greatBritain", "Great Britain", 0.4401, 0.3018, "europe", ["iceland", "scandinavia", "northernEurope", "westernEurope"]),
  t("northernEurope", "N. Europe", 0.4967, 0.3105, "europe", ["scandinavia", "greatBritain", "westernEurope", "southernEurope", "ukraine"]),
  t("westernEurope", "W. Europe", 0.4290, 0.4014, "europe", ["greatBritain", "northernEurope", "southernEurope", "northAfrica"]),
  t("southernEurope", "S. Europe", 0.5098, 0.3750, "europe", ["northernEurope", "westernEurope", "ukraine", "northAfrica", "egypt", "middleEast"]),
  t("ukraine", "Ukraine", 0.5612, 0.2715, "europe", ["scandinavia", "northernEurope", "southernEurope", "ural", "afghanistan", "middleEast"]),
  t("svalbard", "Svalbard", 0.5371, 0.0654, "europe", ["greenland", "iceland", "scandinavia"], true),
  // Africa
  t("northAfrica", "N. Africa", 0.4349, 0.5127, "africa", ["westernEurope", "southernEurope", "egypt", "eastAfrica", "congo", "brazil", "westAfrica"]),
  t("egypt", "Egypt", 0.5098, 0.5068, "africa", ["southernEurope", "northAfrica", "eastAfrica", "middleEast"]),
  t("eastAfrica", "E. Africa", 0.5384, 0.6016, "africa", ["egypt", "northAfrica", "congo", "southAfrica", "madagascar", "middleEast"]),
  t("congo", "Congo", 0.5052, 0.6719, "africa", ["northAfrica", "eastAfrica", "southAfrica", "westAfrica"]),
  t("southAfrica", "S. Africa", 0.5000, 0.7920, "africa", ["congo", "eastAfrica", "madagascar"]),
  t("madagascar", "Madagascar", 0.5762, 0.7607, "africa", ["eastAfrica", "southAfrica", "falklandIslands"]),
  t("westAfrica", "W. Africa", 0.4688, 0.6035, "africa", ["northAfrica", "congo"], true),
  // Asia
  t("ural", "Ural", 0.6569, 0.2393, "asia", ["ukraine", "siberia", "china", "afghanistan"]),
  t("siberia", "Siberia", 0.7188, 0.1992, "asia", ["ural", "yakutsk", "irkutsk", "mongolia", "china"]),
  t("yakutsk", "Yakutsk", 0.8190, 0.1895, "asia", ["siberia", "kamchatka", "irkutsk"]),
  t("kamchatka", "Kamchatka", 0.8926, 0.1836, "asia", ["yakutsk", "irkutsk", "mongolia", "japan", "alaska"]),
  t("irkutsk", "Irkutsk", 0.7832, 0.2715, "asia", ["siberia", "yakutsk", "kamchatka", "mongolia"]),
  t("mongolia", "Mongolia", 0.8125, 0.3281, "asia", ["siberia", "irkutsk", "kamchatka", "japan", "china"]),
  t("japan", "Japan", 0.8451, 0.3477, "asia", ["kamchatka", "mongolia", "philippines", "hawaii"]),
  t("afghanistan", "Afghanistan", 0.6413, 0.3516, "asia", ["ukraine", "ural", "china", "middleEast", "india"]),
  t("china", "China", 0.7116, 0.4189, "asia", ["ural", "siberia", "mongolia", "afghanistan", "india", "siam"]),
  t("middleEast", "Middle East", 0.5768, 0.4551, "asia", ["ukraine", "southernEurope", "egypt", "afghanistan", "india", "eastAfrica"]),
  t("india", "India", 0.6790, 0.5137, "asia", ["afghanistan", "china", "middleEast", "siam"]),
  t("siam", "Siam", 0.7402, 0.5107, "asia", ["china", "india", "indonesia", "philippines"]),
  t("philippines", "Philippines", 0.8294, 0.4883, "asia", ["siam", "indonesia", "japan"], true),
  // Australia
  t("indonesia", "Indonesia", 0.7813, 0.6084, "australia", ["siam", "newGuinea", "westernAustralia", "philippines"]),
  t("newGuinea", "New Guinea", 0.8789, 0.6367, "australia", ["indonesia", "westernAustralia", "easternAustralia"]),
  t("westernAustralia", "W. Australia", 0.7773, 0.7773, "australia", ["indonesia", "easternAustralia", "newGuinea"]),
  t("easternAustralia", "E. Australia", 0.8496, 0.7549, "australia", ["newGuinea", "westernAustralia", "newZealand"]),
  t("newZealand", "New Zealand", 0.9121, 0.8223, "australia", ["easternAustralia", "argentina"], true),
];

export const TERRITORY_MAP: Record<TerritoryId, TerritoryDef> = ALL_TERRITORIES.reduce(
  (acc, def) => {
    acc[def.id] = def;
    return acc;
  },
  {} as Record<TerritoryId, TerritoryDef>,
);

/** Active territory defs for a given configuration, with neighbor lists filtered to active ids. */
export function activeTerritories(includeExtra: boolean): TerritoryDef[] {
  const active = ALL_TERRITORIES.filter((def) => includeExtra || !def.isExtra);
  const activeIds = new Set<TerritoryId>(active.map((def) => def.id));
  return active.map((def) => ({
    ...def,
    neighbors: def.neighbors.filter((n) => activeIds.has(n)),
  }));
}

/** Territories grouped by continent for the active set. */
export function continentTerritories(includeExtra: boolean): Record<ContinentId, TerritoryId[]> {
  const groups: Record<ContinentId, TerritoryId[]> = {
    northAmerica: [],
    southAmerica: [],
    europe: [],
    africa: [],
    asia: [],
    australia: [],
  };
  for (const def of activeTerritories(includeExtra)) {
    groups[def.continent].push(def.id);
  }
  return groups;
}

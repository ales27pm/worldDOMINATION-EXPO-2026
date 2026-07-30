import { borderThreat, largestEmpire } from "./analysis";
import { activeTerritories, ALL_TERRITORIES, TERRITORY_MAP } from "./mapData";
import {
  MAP_SCENE_TERRITORY_HEIGHT,
  mapBoardPointToWorld,
  mapVariantIncludesExtraTerritories,
  territoryPickMeshName,
  territoryMeshName,
  type MapVariant,
  type TerritoryMeshName,
  type TerritoryPickMeshName,
} from "./mapSceneGeometry";
import { dominantPiece, type PieceType } from "./pieces";
import type {
  BattleReport,
  GameState,
  TerritoryId,
  TerritoryState,
} from "./types";

export type MapViewMode =
  "board" | "ownership" | "threats" | "strength" | "empire";

export const MAP_VIEW_MODES: MapViewMode[] = [
  "board",
  "ownership",
  "threats",
  "strength",
  "empire",
];

export const MAP_VIEW_LABELS: Record<MapViewMode, string> = {
  board: "Board",
  ownership: "Ownership",
  threats: "Border Threats",
  strength: "Troop Strength",
  empire: "Empires",
};

export type TerritoryInteraction =
  "idle" | "interactive" | "selected" | "target";

export interface MapSceneTerritory {
  id: TerritoryId;
  meshName: TerritoryMeshName;
  pickMeshName: TerritoryPickMeshName;
  displayName: string;
  stableIndex: number;
  ownerId: number;
  ownerColor: string | null;
  armies: number;
  pieceType: PieceType | null;
  anchor: [number, number, number];
  interaction: TerritoryInteraction;
  surfaceTint: string | null;
  isCapital: boolean;
}

export interface MapSceneBattleEffect {
  id: string;
  from: TerritoryId;
  to: TerritoryId;
  fromAnchor: [number, number, number];
  toAnchor: [number, number, number];
  attackerColor: string;
  defenderColor: string;
  conquered: boolean;
}

export interface MapSceneModel {
  contractVersion: 1;
  variant: MapVariant;
  viewMode: MapViewMode;
  revision: string;
  territories: MapSceneTerritory[];
  selectedId: TerritoryId | null;
  targetIds: TerritoryId[];
  interactiveIds: TerritoryId[];
  battle: MapSceneBattleEffect | null;
}

export interface MapScenePresentationState {
  seenBattleIds: ReadonlySet<string>;
}

export interface MapScenePresentationUpdate {
  state: MapScenePresentationState;
  battle: MapSceneBattleEffect | null;
}

export function createMapScenePresentationState(
  model: Pick<MapSceneModel, "battle">,
): MapScenePresentationState {
  return {
    seenBattleIds: new Set(model.battle ? [model.battle.id] : []),
  };
}

export function advanceMapScenePresentation(
  state: MapScenePresentationState,
  model: Pick<MapSceneModel, "battle">,
): MapScenePresentationUpdate {
  const battle = model.battle;
  if (!battle || state.seenBattleIds.has(battle.id)) {
    return { state, battle: null };
  }

  return {
    state: {
      seenBattleIds: new Set([...state.seenBattleIds, battle.id]),
    },
    battle,
  };
}

function heatColor(value: number): string {
  const clamped = Math.min(1, Math.max(0, value));
  return `hsl(${Math.round(215 - 215 * clamped)}, 78%, 46%)`;
}

function territoryViewTints(
  game: GameState,
  viewMode: MapViewMode,
): Map<TerritoryId, string> {
  const result = new Map<TerritoryId, string>();
  if (viewMode === "board") return result;

  if (viewMode === "ownership") {
    for (const id of game.activeIds) {
      const owner = game.players[game.territories[id].owner];
      if (owner) result.set(id, owner.color);
    }
    return result;
  }

  if (viewMode === "threats") {
    for (const id of game.activeIds) {
      const territory = game.territories[id];
      if (territory.owner < 0) continue;
      const threat = borderThreat(game, id, territory.owner);
      result.set(id, heatColor(threat / Math.max(1, territory.armies) / 3));
    }
    return result;
  }

  if (viewMode === "strength") {
    const maximum = Math.max(
      1,
      ...game.activeIds.map((id) => game.territories[id].armies),
    );
    for (const id of game.activeIds) {
      if (game.territories[id].owner < 0) continue;
      result.set(id, heatColor(game.territories[id].armies / maximum));
    }
    return result;
  }

  for (const player of game.players) {
    if (!player.alive) continue;
    for (const id of largestEmpire(game, player.id)) {
      result.set(id, player.color);
    }
  }
  return result;
}

function territoryInteraction(
  id: TerritoryId,
  selected: TerritoryId | null,
  targets: ReadonlySet<TerritoryId>,
  interactive: ReadonlySet<TerritoryId>,
): TerritoryInteraction {
  if (id === selected) return "selected";
  if (targets.has(id)) return "target";
  if (interactive.has(id)) return "interactive";
  return "idle";
}

function battleEffect(
  game: GameState,
  battle: BattleReport | null,
): MapSceneBattleEffect | null {
  if (!battle) return null;
  const from = TERRITORY_MAP[battle.from];
  const to = TERRITORY_MAP[battle.to];
  if (!from || !to) return null;

  return {
    id: [
      game.turn,
      game.battlesFought,
      battle.from,
      battle.to,
      battle.attackerRolls.join(""),
      battle.defenderRolls.join(""),
      battle.conquered ? 1 : 0,
    ].join(":"),
    from: battle.from,
    to: battle.to,
    fromAnchor: mapBoardPointToWorld(from.x, from.y),
    toAnchor: mapBoardPointToWorld(to.x, to.y),
    attackerColor: game.players[battle.attacker]?.color ?? "#d14b3f",
    defenderColor: game.players[battle.defender]?.color ?? "#4776c7",
    conquered: battle.conquered,
  };
}

function capitalTerritories(game: GameState): Set<TerritoryId> {
  const viewerId = game.players.find((player) => player.isHuman)?.id;
  const result = new Set<TerritoryId>();
  for (const player of game.players) {
    if (player.capital && (game.capitalsRevealed || player.id === viewerId)) {
      result.add(player.capital);
    }
  }
  return result;
}

function sceneTerritory(
  game: GameState,
  id: TerritoryId,
  state: TerritoryState,
  selected: TerritoryId | null,
  targets: ReadonlySet<TerritoryId>,
  interactive: ReadonlySet<TerritoryId>,
  tints: ReadonlyMap<TerritoryId, string>,
  capitals: ReadonlySet<TerritoryId>,
): MapSceneTerritory {
  const definition = TERRITORY_MAP[id];
  const owner = game.players[state.owner];
  return {
    id,
    meshName: territoryMeshName(id),
    pickMeshName: territoryPickMeshName(id),
    displayName: definition.name,
    stableIndex: ALL_TERRITORIES.findIndex((territory) => territory.id === id),
    ownerId: state.owner,
    ownerColor: owner?.color ?? null,
    armies: state.armies,
    pieceType: state.owner < 0 ? null : dominantPiece(state.armies),
    anchor: mapBoardPointToWorld(
      definition.x,
      definition.y,
      MAP_SCENE_TERRITORY_HEIGHT,
    ),
    interaction: territoryInteraction(id, selected, targets, interactive),
    surfaceTint: tints.get(id) ?? null,
    isCapital: capitals.has(id),
  };
}

export function buildMapSceneModel(
  game: GameState,
  selected: TerritoryId | null,
  targets: ReadonlySet<TerritoryId>,
  interactive: ReadonlySet<TerritoryId>,
  viewMode: MapViewMode,
): MapSceneModel {
  const variant: MapVariant = game.setup.useExtraTerritories
    ? "expanded"
    : "classic";
  const definitions = activeTerritories(
    mapVariantIncludesExtraTerritories(variant),
  );
  const tints = territoryViewTints(game, viewMode);
  const capitals = capitalTerritories(game);
  const activeBattle = game.sameTime?.playback[0] ?? game.lastBattle;
  const targetIds = definitions
    .map((territory) => territory.id)
    .filter((id) => targets.has(id));
  const interactiveIds = definitions
    .map((territory) => territory.id)
    .filter((id) => interactive.has(id));
  const territories = definitions.map((definition) =>
    sceneTerritory(
      game,
      definition.id,
      game.territories[definition.id],
      selected,
      targets,
      interactive,
      tints,
      capitals,
    ),
  );
  const battle = battleEffect(game, activeBattle);
  const scene: Omit<MapSceneModel, "revision"> = {
    contractVersion: 1,
    variant,
    viewMode,
    territories,
    selectedId: selected,
    targetIds,
    interactiveIds,
    battle,
  };

  return {
    ...scene,
    revision: JSON.stringify(scene),
  };
}

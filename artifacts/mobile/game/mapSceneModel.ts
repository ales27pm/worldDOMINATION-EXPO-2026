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
  Mission,
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

export type MapScenePulseKind = "selection" | "impact" | "conquest";

export interface MapScenePulseEffect {
  id: string;
  kind: MapScenePulseKind;
  territoryId: TerritoryId;
  color: string;
  opacity: number;
  origin: [number, number];
}

export type MapSceneRevealKind =
  "sealed-order" | "playback" | "mission" | "victory";

export interface MapSceneRevealEffect {
  id: string;
  kind: MapSceneRevealKind;
  territoryId: TerritoryId;
  color: string;
  opacity: number;
  origin: [number, number];
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
  pulses: MapScenePulseEffect[];
  reveals: MapSceneRevealEffect[];
}

export interface MapScenePresentationState {
  seenBattleIds: ReadonlySet<string>;
  seenPulseIds: ReadonlySet<string>;
  seenRevealIds: ReadonlySet<string>;
  selectedId: TerritoryId | null;
  selectionSequence: number;
}

export interface MapScenePresentationUpdate {
  state: MapScenePresentationState;
  battle: MapSceneBattleEffect | null;
  pulses: MapScenePulseEffect[];
  reveals: MapSceneRevealEffect[];
}

export function createMapScenePresentationState(
  model: Pick<MapSceneModel, "battle" | "pulses" | "selectedId">,
): MapScenePresentationState {
  return {
    seenBattleIds: new Set(model.battle ? [model.battle.id] : []),
    seenPulseIds: new Set(model.pulses.map((pulse) => pulse.id)),
    // Initial mission, order, playback, and victory descriptors are allowed to
    // reveal once. Battle/pulse snapshots remain suppressed after restoration.
    seenRevealIds: new Set(),
    selectedId: model.selectedId,
    selectionSequence: 0,
  };
}

export function advanceMapScenePresentation(
  state: MapScenePresentationState,
  model: Pick<
    MapSceneModel,
    "battle" | "pulses" | "reveals" | "selectedId" | "territories"
  >,
): MapScenePresentationUpdate {
  const battle = model.battle;
  const presentedBattle =
    battle && !state.seenBattleIds.has(battle.id) ? battle : null;
  const pulses = model.pulses.filter(
    (pulse) => !state.seenPulseIds.has(pulse.id),
  );
  const reveals = model.reveals.filter(
    (reveal) => !state.seenRevealIds.has(reveal.id),
  );
  const selected =
    model.selectedId && model.selectedId !== state.selectedId
      ? model.territories.find((territory) => territory.id === model.selectedId)
      : null;
  const selectionSequence = selected
    ? state.selectionSequence + 1
    : state.selectionSequence;
  if (selected) {
    pulses.push({
      id: `selection:${selected.id}:${selectionSequence}`,
      kind: "selection",
      territoryId: selected.id,
      color: "#f8cf45",
      opacity: 0.68,
      origin: [0.5, 0.5],
    });
  }

  return {
    state: {
      seenBattleIds: presentedBattle
        ? new Set([...state.seenBattleIds, presentedBattle.id])
        : state.seenBattleIds,
      seenPulseIds:
        model.pulses.length > 0
          ? new Set([
              ...state.seenPulseIds,
              ...model.pulses.map((pulse) => pulse.id),
            ])
          : state.seenPulseIds,
      seenRevealIds:
        model.reveals.length > 0
          ? new Set([
              ...state.seenRevealIds,
              ...model.reveals.map((reveal) => reveal.id),
            ])
          : state.seenRevealIds,
      selectedId: model.selectedId,
      selectionSequence,
    },
    battle: presentedBattle,
    pulses,
    reveals,
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

function battlePulse(
  battle: MapSceneBattleEffect | null,
): MapScenePulseEffect[] {
  if (!battle) return [];
  return [
    {
      id: `${battle.conquered ? "conquest" : "impact"}:${battle.id}`,
      kind: battle.conquered ? "conquest" : "impact",
      territoryId: battle.to,
      color: battle.conquered ? battle.attackerColor : battle.defenderColor,
      opacity: battle.conquered ? 0.88 : 0.72,
      origin: [0.5, 0.5],
    },
  ];
}

function validViewerPlayerId(
  game: GameState,
  requestedViewerPlayerId: number | undefined,
): number {
  if (
    requestedViewerPlayerId !== undefined &&
    game.players[requestedViewerPlayerId]
  ) {
    return requestedViewerPlayerId;
  }
  if (game.players[game.currentPlayer]?.isHuman) return game.currentPlayer;
  return (
    game.players.find((player) => player.isHuman)?.id ?? game.currentPlayer
  );
}

function firstOwnedTerritory(
  game: GameState,
  playerId: number,
): TerritoryId | null {
  return (
    game.players[playerId]?.capital ??
    game.activeIds.find((id) => game.territories[id]?.owner === playerId) ??
    null
  );
}

function missionRevealTerritory(
  game: GameState,
  playerId: number,
  mission: Mission,
): TerritoryId | null {
  if (mission.kind === "continentPlusNamed") {
    return (
      mission.territories.find((id) => game.activeIds.includes(id)) ?? null
    );
  }
  if (mission.kind === "destroyPlayer") {
    return firstOwnedTerritory(game, mission.targetPlayerId);
  }
  if (
    mission.kind === "conquerContinents" ||
    mission.kind === "continentPlusPresence" ||
    mission.kind === "continentPlusConnected"
  ) {
    const continent =
      mission.kind === "conquerContinents"
        ? mission.continents[0]
        : mission.continent;
    const territory = game.activeIds.find(
      (id) => TERRITORY_MAP[id]?.continent === continent,
    );
    if (territory) return territory;
  }
  return firstOwnedTerritory(game, playerId);
}

function sceneRevealEffects(
  game: GameState,
  battle: MapSceneBattleEffect | null,
  requestedViewerPlayerId: number | undefined,
): MapSceneRevealEffect[] {
  const viewerPlayerId = validViewerPlayerId(game, requestedViewerPlayerId);
  const viewer = game.players[viewerPlayerId];
  const reveals: MapSceneRevealEffect[] = [];

  if (game.phase === "sameTimeBattle" && game.sameTime) {
    if (game.sameTime.readyBattle[viewerPlayerId]) {
      for (const order of game.sameTime.orders) {
        if (order.player !== viewerPlayerId) continue;
        reveals.push({
          id: `sealed-order:${order.id}`,
          kind: "sealed-order",
          territoryId: order.to,
          color: viewer?.color ?? "#f8cf45",
          opacity: 0.82,
          origin: [0.5, 0.5],
        });
      }
    }
    if (game.sameTime.playback.length > 0 && battle) {
      reveals.push({
        id: `playback:${battle.id}`,
        kind: "playback",
        territoryId: battle.to,
        color: battle.attackerColor,
        opacity: 0.86,
        origin: [0.5, 0.5],
      });
    }
  }

  if (game.setup.objective === "mission" && viewer?.mission) {
    const territoryId = missionRevealTerritory(
      game,
      viewerPlayerId,
      viewer.mission,
    );
    if (territoryId) {
      reveals.push({
        id: `mission:${viewerPlayerId}:${JSON.stringify(viewer.mission)}`,
        kind: "mission",
        territoryId,
        color: viewer.color,
        opacity: 0.72,
        origin: [0.5, 0.5],
      });
    }
  }

  if (game.phase === "gameOver") {
    const winnerIds =
      game.coWinners ?? (game.winner === null ? [] : [game.winner]);
    for (const winnerId of winnerIds) {
      const territoryId = firstOwnedTerritory(game, winnerId);
      const winner = game.players[winnerId];
      if (!territoryId || !winner) continue;
      reveals.push({
        id: `victory:${game.turn}:${winnerId}:${territoryId}`,
        kind: "victory",
        territoryId,
        color: winner.color,
        opacity: 0.9,
        origin: [0.5, 0.5],
      });
    }
  }

  return reveals;
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
  viewerPlayerId?: number,
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
  const pulses = battlePulse(battle);
  const reveals = sceneRevealEffects(game, battle, viewerPlayerId);
  const scene: Omit<MapSceneModel, "revision"> = {
    contractVersion: 1,
    variant,
    viewMode,
    territories,
    selectedId: selected,
    targetIds,
    interactiveIds,
    battle,
    pulses,
    reveals,
  };

  return {
    ...scene,
    revision: JSON.stringify(scene),
  };
}

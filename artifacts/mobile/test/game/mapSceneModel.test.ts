import { deepEqual, equal, ok } from "node:assert/strict";
import { test } from "node:test";

import { activeTerritories, TERRITORY_MAP } from "../../game/mapData";
import {
  MAP_SCENE_TERRITORY_HEIGHT,
  mapBoardPointToWorld,
  territoryMeshName,
} from "../../game/mapSceneGeometry";
import { buildMapSceneModel } from "../../game/mapSceneModel";
import type { BattleReport, TerritoryId } from "../../game/types";
import {
  createClassicState,
  createSameTimeState,
  setTerritories,
} from "../helpers/gameState";

function battle(
  from: TerritoryId,
  to: TerritoryId,
  attacker = 0,
  defender = 1,
): BattleReport {
  return {
    from,
    to,
    attacker,
    defender,
    attackerRolls: [6, 4, 2],
    defenderRolls: [5, 1],
    attackerLosses: 0,
    defenderLosses: 2,
    rounds: 1,
    conquered: true,
    attackerTier: "classicAttack",
    defenderTier: "classicDefend",
  };
}

test("scene model preserves stable territory identities and renderer state", () => {
  const game = createClassicState();
  setTerritories(game, {
    brazil: { owner: 0, armies: 6 },
    china: { owner: 0, armies: 12 },
    peru: { owner: 0, armies: 1 },
    northAfrica: { owner: 1, armies: 2 },
  });
  game.players[0].capital = "brazil";
  game.players[1].capital = "china";
  game.capitalsRevealed = false;

  const model = buildMapSceneModel(
    game,
    "brazil",
    new Set(["northAfrica"]),
    new Set(["brazil", "china"]),
    "board",
  );
  const definitions = activeTerritories(false);
  const byId = new Map(
    model.territories.map((territory) => [territory.id, territory]),
  );

  equal(model.contractVersion, 1);
  equal(model.variant, "classic");
  deepEqual(
    model.territories.map((territory) => territory.id),
    definitions.map((territory) => territory.id),
  );
  equal(new Set(model.territories.map(({ meshName }) => meshName)).size, 42);
  deepEqual(model.targetIds, ["northAfrica"]);
  deepEqual(model.interactiveIds, ["brazil", "china"]);

  const brazil = byId.get("brazil");
  ok(brazil);
  equal(brazil.meshName, territoryMeshName("brazil"));
  equal(brazil.interaction, "selected");
  equal(brazil.pieceType, "cavalry");
  equal(brazil.isCapital, true);
  equal(brazil.surfaceTint, null);
  deepEqual(
    brazil.anchor,
    mapBoardPointToWorld(
      TERRITORY_MAP.brazil.x,
      TERRITORY_MAP.brazil.y,
      MAP_SCENE_TERRITORY_HEIGHT,
    ),
  );

  equal(byId.get("northAfrica")?.interaction, "target");
  equal(byId.get("northAfrica")?.pieceType, "infantry");
  equal(byId.get("china")?.pieceType, "artillery");
  equal(byId.get("china")?.isCapital, false);
  equal(byId.get("peru")?.pieceType, "infantry");

  const ownership = buildMapSceneModel(
    game,
    null,
    new Set(),
    new Set(),
    "ownership",
  );
  equal(
    ownership.territories.find(({ id }) => id === "brazil")?.surfaceTint,
    game.players[0].color,
  );
});

test("scene model switches to all 48 expanded-map territory meshes", () => {
  const game = createClassicState();
  const definitions = activeTerritories(true);
  game.setup.useExtraTerritories = true;
  game.activeIds = definitions.map((territory) => territory.id);
  for (const territory of definitions) {
    game.territories[territory.id] ??= { owner: -1, armies: 0 };
  }

  const model = buildMapSceneModel(game, null, new Set(), new Set(), "board");

  equal(model.variant, "expanded");
  equal(model.territories.length, 48);
  ok(model.territories.some(({ id }) => id === "westAfrica"));
  equal(
    model.territories.find(({ id }) => id === "westAfrica")?.meshName,
    territoryMeshName("westAfrica"),
  );
});

test("scene model emits deterministic classic and same-time battle effects", () => {
  const classic = createClassicState();
  classic.turn = 4;
  classic.battlesFought = 7;
  classic.lastBattle = battle("brazil", "northAfrica");

  const classicModel = buildMapSceneModel(
    classic,
    null,
    new Set(),
    new Set(),
    "board",
  );
  ok(classicModel.battle);
  equal(classicModel.battle.from, "brazil");
  equal(classicModel.battle.to, "northAfrica");
  equal(classicModel.battle.id, "4:7:brazil:northAfrica:642:51:1");
  deepEqual(
    classicModel.battle.fromAnchor,
    mapBoardPointToWorld(TERRITORY_MAP.brazil.x, TERRITORY_MAP.brazil.y),
  );

  const sameTime = createSameTimeState();
  sameTime.lastBattle = battle("brazil", "northAfrica");
  ok(sameTime.sameTime);
  sameTime.sameTime.playback = [battle("china", "india")];
  const sameTimeModel = buildMapSceneModel(
    sameTime,
    null,
    new Set(),
    new Set(),
    "board",
  );
  equal(sameTimeModel.battle?.from, "china");
  equal(sameTimeModel.battle?.to, "india");
});

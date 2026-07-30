import { createHash } from "node:crypto";
import { deepEqual, equal, ok } from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import { activeTerritories, ALL_TERRITORIES } from "../../game/mapData";
import {
  buildMapSceneLabelLayout,
  MAP_SCENE_LABEL_ATLAS_COLUMNS,
  MAP_SCENE_LABEL_ATLAS_FORMAT,
  MAP_SCENE_LABEL_ATLAS_HEIGHT,
  MAP_SCENE_LABEL_ATLAS_ROWS,
  MAP_SCENE_LABEL_ATLAS_WIDTH,
  MAP_SCENE_LABEL_CELL_HEIGHT,
  MAP_SCENE_LABEL_CELL_WIDTH,
  MAP_SCENE_LABEL_ELEVATION,
  MAP_SCENE_LABEL_OFFSET_Z,
  type MapSceneLabelAtlasManifest,
} from "../../game/mapSceneLabels";
import { buildMapSceneModel } from "../../game/mapSceneModel";
import { createClassicState } from "../helpers/gameState";

const assetDirectory = path.resolve(process.cwd(), "assets/game/map-3d");

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function expandedModel() {
  const game = createClassicState();
  const definitions = activeTerritories(true);
  game.setup.useExtraTerritories = true;
  game.activeIds = definitions.map((territory) => territory.id);
  for (const territory of definitions) {
    game.territories[territory.id] ??= { owner: -1, armies: 0 };
  }
  return buildMapSceneModel(game, null, new Set(), new Set(), "board");
}

test("territory-label atlas is canonical, indexed, and current", async () => {
  const atlas = await readFile(path.join(assetDirectory, "territory-labels.png"));
  const manifest = JSON.parse(
    await readFile(
      path.join(assetDirectory, "territory-labels.json"),
      "utf8",
    ),
  ) as MapSceneLabelAtlasManifest;

  deepEqual(
    [...atlas.subarray(0, 8)],
    [137, 80, 78, 71, 13, 10, 26, 10],
  );
  equal(atlas.readUInt32BE(16), MAP_SCENE_LABEL_ATLAS_WIDTH);
  equal(atlas.readUInt32BE(20), MAP_SCENE_LABEL_ATLAS_HEIGHT);
  equal(manifest.format, MAP_SCENE_LABEL_ATLAS_FORMAT);
  equal(manifest.contractVersion, 1);
  equal(manifest.file, "territory-labels.png");
  equal(manifest.sha256, sha256(atlas));
  equal(manifest.byteLength, atlas.byteLength);
  equal(manifest.width, MAP_SCENE_LABEL_ATLAS_WIDTH);
  equal(manifest.height, MAP_SCENE_LABEL_ATLAS_HEIGHT);
  equal(manifest.columns, MAP_SCENE_LABEL_ATLAS_COLUMNS);
  equal(manifest.rows, MAP_SCENE_LABEL_ATLAS_ROWS);
  equal(manifest.cellWidth, MAP_SCENE_LABEL_CELL_WIDTH);
  equal(manifest.cellHeight, MAP_SCENE_LABEL_CELL_HEIGHT);
  equal(manifest.font.family, "IM Fell English");
  ok(manifest.font.sha256.length === 64);
  deepEqual(
    manifest.labels,
    ALL_TERRITORIES.map((territory, stableIndex) => ({
      territoryId: territory.id,
      displayName: territory.name,
      stableIndex,
    })),
  );
});

test("classic and expanded label layouts map every scene territory once", () => {
  const classic = buildMapSceneModel(
    createClassicState(),
    null,
    new Set(),
    new Set(),
    "board",
  );
  const expanded = expandedModel();

  for (const model of [classic, expanded]) {
    const labels = buildMapSceneLabelLayout(model.territories);
    equal(labels.length, model.territories.length);
    equal(new Set(labels.map((label) => label.territoryId)).size, labels.length);
    equal(new Set(labels.map((label) => label.atlasIndex)).size, labels.length);
    deepEqual(
      labels.map((label) => label.displayName),
      model.territories.map((territory) => territory.displayName),
    );
    for (const [index, label] of labels.entries()) {
      const territory = model.territories[index];
      equal(label.atlasIndex, territory.stableIndex);
      equal(label.center[0], territory.anchor[0]);
      equal(label.center[1], MAP_SCENE_LABEL_ELEVATION);
      equal(
        label.center[2],
        territory.anchor[2] + MAP_SCENE_LABEL_OFFSET_Z,
      );
      ok(label.uv.left >= 0 && label.uv.left < label.uv.right);
      ok(label.uv.right <= 1);
      ok(label.uv.bottom >= 0 && label.uv.bottom < label.uv.top);
      ok(label.uv.top <= 1);
    }
  }

  equal(classic.territories.length, 42);
  equal(expanded.territories.length, 48);
  equal(
    buildMapSceneLabelLayout(classic.territories).some(
      (label) => label.territoryId === "westAfrica",
    ),
    false,
  );
  equal(
    buildMapSceneLabelLayout(expanded.territories).some(
      (label) => label.territoryId === "westAfrica",
    ),
    true,
  );
});

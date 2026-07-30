import { equal } from "node:assert/strict";
import { test } from "node:test";

import { buildMapSceneModel } from "../../game/mapSceneModel";
import {
  createMapScenePickIndex,
  MAP_SCENE_PICK_DISTANCE_EPSILON,
  pickTerritoryFromIntersections,
} from "../../game/mapScenePicking";
import { createClassicState } from "../helpers/gameState";

test("scene picking ignores malformed and inactive mesh names", () => {
  const model = buildMapSceneModel(
    createClassicState(),
    null,
    new Set(),
    new Set(),
    "board",
  );
  const index = createMapScenePickIndex(model);

  equal(
    pickTerritoryFromIntersections(index, [
      { distance: 0.5, object: { name: "pick__westAfrica" } },
      { distance: 0.6, object: { name: "territory__brazil" } },
      { distance: Number.NaN, object: { name: "pick__brazil" } },
      { distance: 0.8, object: { name: "pick__brazil" } },
    ]),
    "brazil",
  );
  equal(
    pickTerritoryFromIntersections(index, [
      { distance: 0.5, object: { name: "pick__not-a-territory" } },
    ]),
    null,
  );
});

test("scene picking uses canonical territory order for equal-depth border hits", () => {
  const model = buildMapSceneModel(
    createClassicState(),
    null,
    new Set(),
    new Set(),
    "board",
  );
  const index = createMapScenePickIndex(model);
  const first = model.territories[0];
  const second = model.territories[1];
  if (!first || !second)
    throw new Error("Classic scene is missing territories");

  equal(
    pickTerritoryFromIntersections(index, [
      { distance: 1, object: { name: second.pickMeshName } },
      {
        distance: 1 + MAP_SCENE_PICK_DISTANCE_EPSILON / 2,
        object: { name: first.pickMeshName },
      },
    ]),
    first.id,
  );
  equal(
    pickTerritoryFromIntersections(index, [
      { distance: 0.75, object: { name: second.pickMeshName } },
      { distance: 1, object: { name: first.pickMeshName } },
    ]),
    second.id,
  );
});

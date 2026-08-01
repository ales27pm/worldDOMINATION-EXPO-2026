import { deepEqual, equal, notDeepEqual } from "node:assert/strict";
import { test } from "node:test";

import { prepareMapQualificationFixture } from "../../game/mapQualificationFixture";
import { buildMapSceneModel } from "../../game/mapSceneModel";
import { createClassicState } from "../helpers/gameState";

test("native qualification fixture replaces random ownership deterministically", () => {
  const left = createClassicState();
  const right = createClassicState();
  right.territories = Object.fromEntries(
    right.activeIds.map((id, index) => [
      id,
      { owner: (index + 1) % right.players.length, armies: 9 - (index % 3) },
    ]),
  ) as typeof right.territories;
  const originalLeftTerritories = structuredClone(left.territories);

  const leftFixture = prepareMapQualificationFixture(left);
  const rightFixture = prepareMapQualificationFixture(right);

  notDeepEqual(left.territories, right.territories);
  deepEqual(left.territories, originalLeftTerritories);
  deepEqual(leftFixture.territories, rightFixture.territories);
  equal(leftFixture.phase, "reinforcement");
  equal(leftFixture.currentPlayer, 0);
  equal(leftFixture.lastBattle, null);
  equal(leftFixture.battlesFought, 0);

  const leftScene = buildMapSceneModel(
    leftFixture,
    null,
    new Set(),
    new Set(),
    "board",
  );
  const rightScene = buildMapSceneModel(
    rightFixture,
    null,
    new Set(),
    new Set(),
    "board",
  );
  equal(leftScene.revision, rightScene.revision);
});

import { equal, ok } from "node:assert/strict";
import { test } from "node:test";

import {
  autoMinVw,
  cameraForAttention,
  computeAttention,
  MAP_H,
  MAP_W,
  type AttentionPoint,
  type Camera,
} from "../../game/camera";
import { TERRITORY_MAP } from "../../game/mapData";
import type { TerritoryId } from "../../game/types";
import { attackOrder, createSameTimeState, setTerritories } from "../helpers/gameState";

function pointById(points: AttentionPoint[], id: TerritoryId): AttentionPoint | undefined {
  return points.find((point) => point.id === id);
}

function pointFitsCamera(point: AttentionPoint, cam: Camera, aspect: number): boolean {
  const viewHeight = cam.vw / aspect;
  return (
    point.x >= cam.cx - cam.vw / 2 &&
    point.x <= cam.cx + cam.vw / 2 &&
    point.y >= cam.cy - viewHeight / 2 &&
    point.y <= cam.cy + viewHeight / 2
  );
}

test("Same Time battle attention frames queued orders and selected attack targets", () => {
  const state = createSameTimeState(2);
  state.phase = "sameTimeBattle";
  state.currentPlayer = 0;
  setTerritories(state, {
    alaska: { owner: 0, armies: 8 },
    alberta: { owner: 0, armies: 5 },
    northwestTerritory: { owner: 1, armies: 3 },
    kamchatka: { owner: 1, armies: 4 },
  });
  state.sameTime!.orders = [attackOrder("queued", 0, "alberta", "northwestTerritory", 2)];

  const queued = computeAttention(state, null);
  equal(pointById(queued, "alberta")?.required, true);
  equal(pointById(queued, "northwestTerritory")?.required, true);

  const selected = computeAttention(state, "alaska");
  equal(pointById(selected, "alaska")?.required, true);
  equal(pointById(selected, "northwestTerritory")?.required, true);
  equal(pointById(selected, "kamchatka")?.required, false);
});

test("Same Time tactical movement attention frames direct friendly corridors", () => {
  const state = createSameTimeState(2);
  state.phase = "sameTimeMove";
  state.currentPlayer = 0;
  setTerritories(state, {
    alaska: { owner: 0, armies: 8 },
    alberta: { owner: 0, armies: 2 },
    northwestTerritory: { owner: 0, armies: 2 },
    kamchatka: { owner: 1, armies: 4 },
  });

  const points = computeAttention(state, "alaska");

  equal(pointById(points, "alaska")?.required, true);
  equal(pointById(points, "alberta")?.required, true);
  equal(pointById(points, "northwestTerritory")?.required, true);
  equal(pointById(points, "kamchatka")?.required, false);
});

test("attention camera keeps Same Time required points in a portrait frame", () => {
  const state = createSameTimeState(2);
  state.phase = "sameTimeBattle";
  state.currentPlayer = 0;
  setTerritories(state, {
    alaska: { owner: 0, armies: 8 },
    northwestTerritory: { owner: 1, armies: 3 },
  });

  const aspect = 390 / 844;
  const points = computeAttention(state, "alaska");
  const cam = cameraForAttention(points, aspect, autoMinVw(390));

  ok(cam.vw <= MAP_W);
  ok(cam.vw / aspect <= MAP_H);
  for (const point of points.filter((candidate) => candidate.required)) {
    ok(pointFitsCamera(point, cam, aspect), `${TERRITORY_MAP[point.id]?.name ?? point.id} should fit`);
  }
});

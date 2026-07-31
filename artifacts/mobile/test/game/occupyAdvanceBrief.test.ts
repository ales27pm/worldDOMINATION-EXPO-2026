import { equal } from "node:assert/strict";
import { test } from "node:test";

import { occupyAdvanceBrief } from "../../game/occupyAdvanceBrief";
import { createClassicState, setTerritories } from "../helpers/gameState";

test("occupy advance brief reports destination range and leave-behind armies", () => {
  const state = createClassicState();
  state.pendingOccupy = { from: "alaska", to: "northwestTerritory", min: 2, max: 5 };
  setTerritories(state, {
    alaska: { owner: 0, armies: 7 },
    northwestTerritory: { owner: 0, armies: 0 },
  });

  const defaultBrief = occupyAdvanceBrief(state, state.pendingOccupy);

  equal(defaultBrief.fromName, "Alaska");
  equal(defaultBrief.toName, "NW Territory");
  equal(defaultBrief.count, 5);
  equal(defaultBrief.rangeLabel, "2-5");
  equal(defaultBrief.ruleText, "Min 2; 2 stay in Alaska");
  equal(defaultBrief.leaveBehindText, "Leave 2 armies in Alaska");

  const adjustedBrief = occupyAdvanceBrief(state, state.pendingOccupy, 3);

  equal(adjustedBrief.count, 3);
  equal(adjustedBrief.leaveBehind, 4);
  equal(adjustedBrief.leaveBehindText, "Leave 4 armies in Alaska");
});

test("occupy advance brief clamps counts to the legal range", () => {
  const state = createClassicState();
  state.pendingOccupy = { from: "alaska", to: "northwestTerritory", min: 2, max: 5 };
  setTerritories(state, { alaska: { owner: 0, armies: 7 } });

  const lowBrief = occupyAdvanceBrief(state, state.pendingOccupy, 1);
  const highBrief = occupyAdvanceBrief(state, state.pendingOccupy, 99);

  equal(lowBrief.count, 2);
  equal(lowBrief.leaveBehindText, "Leave 5 armies in Alaska");
  equal(highBrief.count, 5);
  equal(highBrief.leaveBehindText, "Leave 2 armies in Alaska");
});

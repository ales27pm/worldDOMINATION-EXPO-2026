import { equal, ok } from "node:assert/strict";
import { test } from "node:test";

import { phaseBannerContent } from "../../game/phaseBannerContent";
import type { BattleReport } from "../../game/types";
import { attackOrder, createClassicState, createSameTimeState } from "../helpers/gameState";

test("Classic phase banners keep the command-table chapter language", () => {
  const state = createClassicState();
  state.phase = "reinforcement";
  state.reinforcementsRemaining = 3;

  const reinforcement = phaseBannerContent(state);
  equal(reinforcement?.title, "I. DEPLOYMENT");
  equal(reinforcement?.sub, "Muster 3 battalions - tap your territories");

  state.phase = "attack";
  const attack = phaseBannerContent(state);
  equal(attack?.title, "II. ENGAGEMENT");
  ok(attack?.sub.includes("strike a neighbour"));

  state.phase = "fortify";
  const fortify = phaseBannerContent(state);
  equal(fortify?.title, "III. MANEUVER");
  ok(fortify?.sub.includes("One tactical march"));
});

test("Same Time reinforcement banners distinguish secret placement and sealed waiting", () => {
  const state = createSameTimeState(2);
  state.phase = "sameTimeReinforce";
  state.sameTime!.reinforcementsRemaining = [4, 0];

  const open = phaseBannerContent(state);
  equal(open?.title, "I. SECRET MUSTER");
  ok(open?.sub.includes("Place 4 battalions in secret"));

  state.sameTime!.readyReinforce = [true, false];
  state.sameTime!.reinforcementsRemaining = [0, 0];

  const sealed = phaseBannerContent(state);
  equal(sealed?.title, "I. SECRET MUSTER");
  equal(sealed?.sub, "Envelope sealed; waiting on 1 commander");
});

test("Same Time battle banners expose queued orders and playback acknowledgement", () => {
  const state = createSameTimeState(3);
  state.phase = "sameTimeBattle";

  const empty = phaseBannerContent(state);
  equal(empty?.title, "II. SEALED ORDERS");
  ok(empty?.sub.includes("Queue attack routes in secret"));

  state.sameTime!.orders = [
    attackOrder("o1", 0, "alaska", "northwestTerritory", 3),
    attackOrder("o2", 0, "alberta", "ontario", 2),
  ];

  const queued = phaseBannerContent(state);
  equal(queued?.sub, "2 orders committing 5 battalions; seal when satisfied");

  state.sameTime!.playback = [{} as BattleReport, {} as BattleReport];

  const playback = phaseBannerContent(state);
  equal(playback?.title, "III. BATTLE REPORTS");
  equal(playback?.sub, "Acknowledge 2 simultaneous reports before tactical movement");
});

test("Same Time movement banners distinguish staged marches from sealed waiting", () => {
  const state = createSameTimeState(3);
  state.phase = "sameTimeMove";
  state.sameTime!.moves = [
    { id: "m1", player: 0, from: "alaska", to: "alberta", count: 3 },
  ];

  const queued = phaseBannerContent(state);
  equal(queued?.title, "IV. TACTICAL MARCH");
  equal(queued?.sub, "1 march committing 3 battalions; confirm movement");

  state.sameTime!.readyMove = [true, false, true];

  const sealed = phaseBannerContent(state);
  equal(sealed?.sub, "Marches sealed; waiting on 1 commander");
});

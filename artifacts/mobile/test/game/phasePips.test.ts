import { equal, deepEqual } from "node:assert/strict";
import { test } from "node:test";

import { commandPhasePips } from "../../game/phasePips";
import type { BattleReport } from "../../game/types";
import { createClassicState, createSameTimeState } from "../helpers/gameState";

function labels(state: ReturnType<typeof createClassicState>): string[] {
  return commandPhasePips(state).map((pip) => `${pip.active ? "*" : ""}${pip.label}`);
}

test("Classic command pips track deployment, engagement, and maneuver", () => {
  const state = createClassicState();

  state.phase = "reinforcement";
  deepEqual(labels(state), ["*I. DEP", "II. ENG", "III. MAN"]);

  state.phase = "attack";
  deepEqual(labels(state), ["I. DEP", "*II. ENG", "III. MAN"]);

  state.phase = "fortify";
  deepEqual(labels(state), ["I. DEP", "II. ENG", "*III. MAN"]);
});

test("Same Time command pips distinguish sealed orders from playback review", () => {
  const state = createSameTimeState();

  state.phase = "sameTimeReinforce";
  deepEqual(labels(state), ["*I. MUSTER", "II. SEAL", "III. REVIEW", "IV. MARCH"]);

  state.phase = "sameTimeBattle";
  state.sameTime!.playback = [];
  deepEqual(labels(state), ["I. MUSTER", "*II. SEAL", "III. REVIEW", "IV. MARCH"]);

  state.sameTime!.playback = [{} as BattleReport];
  deepEqual(labels(state), ["I. MUSTER", "II. SEAL", "*III. REVIEW", "IV. MARCH"]);

  state.phase = "sameTimeMove";
  state.sameTime!.playback = [];
  deepEqual(labels(state), ["I. MUSTER", "II. SEAL", "III. REVIEW", "*IV. MARCH"]);
});

test("setup and completed campaigns collapse to single active command pips", () => {
  const state = createClassicState();

  state.phase = "chooseCapital";
  const setup = commandPhasePips(state);
  equal(setup.length, 1);
  equal(setup[0]?.label, "CAPITAL");
  equal(setup[0]?.active, true);

  state.phase = "gameOver";
  const complete = commandPhasePips(state);
  equal(complete.length, 1);
  equal(complete[0]?.label, "COMPLETE");
  equal(complete[0]?.active, true);
});

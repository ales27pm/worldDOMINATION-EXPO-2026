import { deepEqual, equal, ok } from "node:assert/strict";
import { test } from "node:test";

import {
  mapSetupBriefing,
  optionByValue,
  setupBriefingLines,
  turnStyleDoctrine,
  TURN_STYLE_OPTIONS,
} from "../../game/setupBriefing";

test("map setup briefing distinguishes Classic and extended boards", () => {
  const classic = mapSetupBriefing(false);
  const extended = mapSetupBriefing(true);

  equal(classic.label, "Classic Map");
  equal(classic.territoryCount, 42);
  equal(extended.label, "Extended Map");
  equal(extended.territoryCount, 48);
  ok(extended.desc.includes("Hawaii"));
  ok(extended.desc.includes("Svalbard"));
});

test("turn style briefing preserves explicit Classic and Same Time contracts", () => {
  const classic = optionByValue(TURN_STYLE_OPTIONS, "classic");
  const sameTime = optionByValue(TURN_STYLE_OPTIONS, "sameTime");
  const classicDoctrine = turnStyleDoctrine("classic");
  const sameTimeDoctrine = turnStyleDoctrine("sameTime");

  equal(classic.label, "Classic RISK");
  ok(classic.tableCue.includes("red dice"));
  ok(classicDoctrine.steps.some((step) => step.label === "Occupation"));
  ok(classicDoctrine.steps.some((step) => step.detail.includes("mandatory card trades")));
  equal(sameTime.label, "Same Time RISK");
  ok(sameTime.tableCue.includes("Secret reinforcement"));
  ok(sameTime.tableCue.includes("playback acknowledgement"));
  ok(sameTimeDoctrine.steps.some((step) => step.detail.includes("queued armies")));
  ok(sameTimeDoctrine.steps.some((step) => step.detail.includes("committed armies")));
  ok(sameTimeDoctrine.steps.some((step) => step.detail.includes("border clashes")));
});

test("launch briefing summarizes the chosen campaign order", () => {
  const lines = setupBriefingLines({
    objective: "capital",
    allocation: "election",
    cardRule: "setValue",
    turnStyle: "sameTime",
    useExtraTerritories: true,
    restrictedReinforcement: true,
  });

  deepEqual(lines[0]?.startsWith("48 territories:"), true);
  ok(lines.some((line) => line.includes("Same Time RISK")));
  ok(lines.some((line) => line.includes("Sealed simultaneous command")));
  ok(lines.some((line) => line.includes("Sealed attacks")));
  ok(lines.some((line) => line.includes("Elections")));
  ok(lines.some((line) => line.includes("Set Value")));
  ok(lines.some((line) => line.includes("Restricted reinforcement is on")));
});

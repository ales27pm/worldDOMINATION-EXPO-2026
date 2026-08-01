import { equal } from "node:assert/strict";
import { test } from "node:test";

import {
  resolveMapQualificationBattleCount,
  shouldAutostartMapFixture,
} from "../../game/mapQualificationLaunch";

const production = {
  autostart: "1",
  qualificationRun: undefined,
  development: false,
  browserSmokeEnabled: false,
  qualificationEnabled: false,
};

test("production builds reject deterministic fixture deep links", () => {
  equal(shouldAutostartMapFixture(production), false);
  equal(
    shouldAutostartMapFixture({
      ...production,
      qualificationRun: "1",
    }),
    false,
  );
});

test("qualification builds require an explicit qualification run", () => {
  equal(
    shouldAutostartMapFixture({
      ...production,
      qualificationEnabled: true,
    }),
    false,
  );
  equal(
    shouldAutostartMapFixture({
      ...production,
      qualificationEnabled: true,
      qualificationRun: "true",
    }),
    true,
  );
});

test("qualification battle repeats are explicit, bounded, and qualification-only", () => {
  equal(resolveMapQualificationBattleCount("50", true), 50);
  equal(resolveMapQualificationBattleCount("400", true), 400);
  equal(resolveMapQualificationBattleCount("600", true), 500);
  equal(resolveMapQualificationBattleCount("2.5", true), 0);
  equal(resolveMapQualificationBattleCount("50", false), 0);
});

test("development and browser smoke retain preview autostart", () => {
  equal(
    shouldAutostartMapFixture({
      ...production,
      development: true,
    }),
    true,
  );
  equal(
    shouldAutostartMapFixture({
      ...production,
      browserSmokeEnabled: true,
    }),
    true,
  );
});

test("autostart remains mandatory in every environment", () => {
  equal(
    shouldAutostartMapFixture({
      ...production,
      autostart: undefined,
      development: true,
      browserSmokeEnabled: true,
      qualificationEnabled: true,
      qualificationRun: "yes",
    }),
    false,
  );
});

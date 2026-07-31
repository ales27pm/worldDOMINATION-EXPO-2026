import { equal } from "node:assert/strict";
import { test } from "node:test";

import { shouldAutostartMapFixture } from "../../game/mapQualificationLaunch";

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

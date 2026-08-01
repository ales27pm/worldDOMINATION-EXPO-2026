import { deepEqual, equal } from "node:assert/strict";
import { test } from "node:test";

import {
  R3F_FEATURE_FLAG_ENV,
  resolveR3FFeatureFlags,
} from "../../game/r3fFeatureFlags";

test("R3F feature flags default to qualified battle instancing only", () => {
  deepEqual(resolveR3FFeatureFlags({}), {
    battleInstancing: true,
    conquestPulse: false,
    orderReveal: false,
    stylizedWater: false,
    qualification: false,
  });
});

test("R3F feature flags parse explicit truthy and falsy env values", () => {
  const flags = resolveR3FFeatureFlags({
    [R3F_FEATURE_FLAG_ENV.battleInstancing]: "0",
    [R3F_FEATURE_FLAG_ENV.conquestPulse]: "true",
    [R3F_FEATURE_FLAG_ENV.orderReveal]: "yes",
    [R3F_FEATURE_FLAG_ENV.stylizedWater]: "on",
    [R3F_FEATURE_FLAG_ENV.qualification]: "1",
  });

  deepEqual(flags, {
    battleInstancing: false,
    conquestPulse: true,
    orderReveal: true,
    stylizedWater: true,
    qualification: true,
  });
});

test("R3F feature flags ignore unrecognized env values", () => {
  equal(
    resolveR3FFeatureFlags({
      [R3F_FEATURE_FLAG_ENV.battleInstancing]: "maybe",
      [R3F_FEATURE_FLAG_ENV.conquestPulse]: "soon",
    }).battleInstancing,
    true,
  );
  equal(
    resolveR3FFeatureFlags({
      [R3F_FEATURE_FLAG_ENV.battleInstancing]: "maybe",
      [R3F_FEATURE_FLAG_ENV.conquestPulse]: "soon",
    }).conquestPulse,
    false,
  );
});

test("qualification mode enables proposed shaders unless explicitly disabled", () => {
  deepEqual(
    resolveR3FFeatureFlags({
      [R3F_FEATURE_FLAG_ENV.qualification]: "1",
    }),
    {
      battleInstancing: true,
      conquestPulse: true,
      orderReveal: true,
      stylizedWater: false,
      qualification: true,
    },
  );
  const overridden = resolveR3FFeatureFlags({
    [R3F_FEATURE_FLAG_ENV.qualification]: "1",
    [R3F_FEATURE_FLAG_ENV.conquestPulse]: "0",
    [R3F_FEATURE_FLAG_ENV.orderReveal]: "off",
  });
  equal(overridden.conquestPulse, false);
  equal(overridden.orderReveal, false);
});

import { equal } from "node:assert/strict";
import { test } from "node:test";

import {
  DEFAULT_MAP_RENDERER_MODE,
  mapRendererModeFromParam,
} from "../../game/mapRendererMode";

test("R3F is the production map renderer default", () => {
  equal(DEFAULT_MAP_RENDERER_MODE, "r3f");
  equal(mapRendererModeFromParam(undefined), "r3f");
  equal(mapRendererModeFromParam("r3f"), "r3f");
  equal(mapRendererModeFromParam("3D"), "r3f");
  equal(mapRendererModeFromParam("unknown"), "r3f");
});

test("explicit 2D renderer parameters retain the SVG fallback", () => {
  equal(mapRendererModeFromParam("svg"), "svg");
  equal(mapRendererModeFromParam("2D"), "svg");
  equal(mapRendererModeFromParam(["svg", "r3f"]), "svg");
});

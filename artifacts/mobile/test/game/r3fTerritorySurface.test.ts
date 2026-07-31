import assert from "node:assert/strict";
import test from "node:test";

import { resolveTerritorySurfaceAppearance } from "../../game/mapSurfaceAppearance";

test("R3F China replaces the obsolete raster region with the corrected atlas fill", () => {
  assert.deepEqual(resolveTerritorySurfaceAppearance("china", null), {
    color: "#abc886",
    useBoardTexture: false,
    drawAuthoritativeOutline: true,
  });
});

test("R3F territories outside China retain the canonical painted texture", () => {
  assert.deepEqual(resolveTerritorySurfaceAppearance("india", null), {
    color: "#ffffff",
    useBoardTexture: true,
    drawAuthoritativeOutline: false,
  });
});

test("R3F China keeps renderer view tints without restoring the obsolete texture", () => {
  assert.deepEqual(
    resolveTerritorySurfaceAppearance("china", "#4f8a62"),
    {
      color: "#4f8a62",
      useBoardTexture: false,
      drawAuthoritativeOutline: true,
    },
  );
});

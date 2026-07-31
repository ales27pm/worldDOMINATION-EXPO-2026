import { equal } from "node:assert/strict";
import { test } from "node:test";

import { resolveMultiplayerCommandLayout } from "../../game/multiplayerCommandLayout";

test("multiplayer command uses one readable column on phones", () => {
  const layout = resolveMultiplayerCommandLayout({
    width: 390,
    height: 844,
    insets: { top: 47, right: 0, bottom: 34, left: 0 },
  });

  equal(layout.columns, 1);
  equal(layout.sectionWidth, 358);
  equal(layout.wideSectionWidth, 358);
  equal(layout.contentMaxWidth, 560);
  equal(layout.contentPaddingLeft, 16);
  equal(layout.contentPaddingRight, 16);
  equal(layout.contentPaddingBottom, 74);
  equal(layout.headerDirection, "column");
  equal(layout.sealSize, 54);
});

test("multiplayer command uses two columns in compact landscape", () => {
  const layout = resolveMultiplayerCommandLayout({
    width: 844,
    height: 390,
    insets: { top: 0, right: 21, bottom: 0, left: 21 },
  });

  equal(layout.columns, 2);
  equal(layout.sectionWidth, 369);
  equal(layout.wideSectionWidth, 754);
  equal(layout.contentMaxWidth, 900);
  equal(layout.contentPaddingLeft, 45);
  equal(layout.contentPaddingRight, 45);
  equal(layout.headerDirection, "row");
  equal(layout.sealSize, 62);
});

test("multiplayer command uses a three-column dispatch board on desktop", () => {
  const layout = resolveMultiplayerCommandLayout({
    width: 1280,
    height: 720,
    insets: { top: 0, right: 0, bottom: 0, left: 0 },
  });

  equal(layout.columns, 3);
  equal(layout.sectionWidth, 366);
  equal(layout.wideSectionWidth, 748);
  equal(layout.contentMaxWidth, 1180);
  equal(layout.contentPaddingLeft, 24);
  equal(layout.contentPaddingRight, 24);
  equal(layout.headerDirection, "row");
});

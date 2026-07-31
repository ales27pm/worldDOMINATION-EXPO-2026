import { equal, ok } from "node:assert/strict";
import { test } from "node:test";

import {
  resolveCampaignHudLayout,
  resolveCardHandLayout,
  resolveDecisionSheetLayout,
  resolveDispatchLogLayout,
  resolveRosterDrawerLayout,
  resolveStatsSheetLayout,
} from "../../game/overlayLayout";

test("campaign HUD uses a full-width bottom command strip on phone portrait", () => {
  const layout = resolveCampaignHudLayout({
    width: 390,
    height: 844,
    insets: { top: 47, right: 0, bottom: 34, left: 0 },
  });

  equal(layout.commandPlacement, "bottom");
  equal(layout.commandWidth, "100%");
  equal(layout.commandMaxHeight, 336);
  equal(layout.cameraControlsRightInset, null);
  equal(layout.legendBottom, 156);
  equal(layout.legendLeft, 10);
  equal(layout.tickerLines, 3);
});

test("campaign HUD keeps a shallow bottom command dock on short landscape phones", () => {
  const layout = resolveCampaignHudLayout({
    width: 844,
    height: 390,
    insets: { top: 0, right: 21, bottom: 0, left: 21 },
  });

  equal(layout.commandPlacement, "bottom");
  equal(layout.commandWidth, "100%");
  equal(layout.commandMaxHeight, 117);
  equal(layout.commandPaddingRight, 21);
  equal(layout.commandPaddingBottom, 0);
  equal(layout.cameraControlsRightInset, null);
  equal(layout.legendBottom, 127);
  equal(layout.legendLeft, 31);
  equal(layout.tickerLines, 1);
});

test("campaign HUD widens the command rail on tablet landscape without taking the board", () => {
  const layout = resolveCampaignHudLayout({
    width: 1180,
    height: 820,
    insets: { top: 24, right: 0, bottom: 20, left: 0 },
  });

  equal(layout.commandPlacement, "right");
  equal(layout.commandWidth, 366);
  equal(layout.commandMaxHeight, 698);
  equal(layout.commandPaddingRight, 6);
  equal(layout.commandPaddingBottom, 26);
  equal(layout.cameraControlsRightInset, 376);
  equal(layout.legendBottom, 30);
  equal(layout.tickerLines, 3);
});

test("roster drawer uses a capped bottom sheet on narrow portrait screens", () => {
  const layout = resolveRosterDrawerLayout({
    width: 390,
    height: 844,
    insets: { top: 47, right: 0, bottom: 34, left: 0 },
  });

  equal(layout.placement, "bottom");
  equal(layout.width, "100%");
  equal(layout.borderEdge, "top");
  ok(layout.maxHeight <= 520);
  ok(layout.maxHeight < 844);
  equal(layout.paddingBottom, 46);
});

test("roster drawer docks at the right edge in landscape", () => {
  const layout = resolveRosterDrawerLayout({
    width: 844,
    height: 390,
    insets: { top: 0, right: 21, bottom: 0, left: 21 },
  });

  equal(layout.placement, "right");
  equal(layout.borderEdge, "left");
  equal(layout.width, 276);
  equal(layout.paddingRight, 33);
  ok(layout.maxHeight <= 390);
});

test("roster drawer uses a wider right rail on tablet-width portrait screens", () => {
  const layout = resolveRosterDrawerLayout({
    width: 820,
    height: 1180,
    insets: { top: 24, right: 0, bottom: 20, left: 0 },
  });

  equal(layout.placement, "right");
  equal(layout.borderEdge, "left");
  equal(layout.width, 279);
  equal(layout.paddingTop, 36);
  equal(layout.paddingBottom, 32);
});

test("card hand uses a capped bottom sheet on narrow portrait screens", () => {
  const layout = resolveCardHandLayout({
    width: 390,
    height: 844,
    insets: { top: 47, right: 0, bottom: 34, left: 0 },
  });

  equal(layout.placement, "bottom");
  equal(layout.width, "100%");
  equal(layout.borderEdge, "top");
  equal(layout.actionsDirection, "row");
  equal(layout.cardRailHeight, 158);
  equal(layout.maxHeight, 412);
  equal(layout.paddingBottom, 48);
});

test("card hand docks as a right command drawer in landscape", () => {
  const layout = resolveCardHandLayout({
    width: 844,
    height: 390,
    insets: { top: 0, right: 21, bottom: 0, left: 21 },
  });

  equal(layout.placement, "right");
  equal(layout.width, 340);
  equal(layout.borderEdge, "left");
  equal(layout.actionsDirection, "column");
  equal(layout.cardRailHeight, 142);
  equal(layout.paddingRight, 35);
});

test("card hand keeps a compact right rail on tablet portrait screens", () => {
  const layout = resolveCardHandLayout({
    width: 820,
    height: 1180,
    insets: { top: 24, right: 0, bottom: 20, left: 0 },
  });

  equal(layout.placement, "right");
  equal(layout.width, 340);
  equal(layout.borderEdge, "left");
  equal(layout.cardRailHeight, 190);
  equal(layout.paddingTop, 38);
  equal(layout.paddingBottom, 34);
});

test("dispatch log uses a capped bottom sheet on narrow portrait screens", () => {
  const layout = resolveDispatchLogLayout({
    width: 390,
    height: 844,
    insets: { top: 47, right: 0, bottom: 34, left: 0 },
  });

  equal(layout.placement, "bottom");
  equal(layout.width, "100%");
  equal(layout.borderEdge, "top");
  equal(layout.maxHeight, 397);
  equal(layout.paddingBottom, 48);
});

test("dispatch log docks at the right edge in landscape", () => {
  const layout = resolveDispatchLogLayout({
    width: 844,
    height: 390,
    insets: { top: 0, right: 21, bottom: 0, left: 21 },
  });

  equal(layout.placement, "right");
  equal(layout.width, 320);
  equal(layout.borderEdge, "left");
  equal(layout.paddingRight, 35);
  ok(layout.maxHeight <= 390);
});

test("dispatch log keeps a right rail on tablet portrait screens", () => {
  const layout = resolveDispatchLogLayout({
    width: 820,
    height: 1180,
    insets: { top: 24, right: 0, bottom: 20, left: 0 },
  });

  equal(layout.placement, "right");
  equal(layout.width, 320);
  equal(layout.borderEdge, "left");
  equal(layout.paddingTop, 38);
  equal(layout.paddingBottom, 34);
});

test("decision sheets use a safe bottom sheet on narrow portrait screens", () => {
  const layout = resolveDecisionSheetLayout({
    width: 390,
    height: 844,
    insets: { top: 47, right: 0, bottom: 34, left: 0 },
  });

  equal(layout.placement, "bottom");
  equal(layout.width, "100%");
  equal(layout.borderEdge, "top");
  equal(layout.maxHeight, 412);
  equal(layout.paddingBottom, 54);
});

test("decision sheets dock as a compact right rail in landscape", () => {
  const layout = resolveDecisionSheetLayout({
    width: 844,
    height: 390,
    insets: { top: 0, right: 21, bottom: 0, left: 21 },
  });

  equal(layout.placement, "right");
  equal(layout.width, 320);
  equal(layout.borderEdge, "left");
  equal(layout.paddingRight, 41);
  ok(layout.maxHeight <= 390);
});

test("playback decision sheets get a wider review rail", () => {
  const layout = resolveDecisionSheetLayout({
    width: 844,
    height: 390,
    insets: { top: 0, right: 21, bottom: 0, left: 21 },
    kind: "playback",
  });

  equal(layout.placement, "right");
  equal(layout.width, 369);
  equal(layout.borderEdge, "left");
  equal(layout.paddingRight, 41);
});

test("victory decision sheets stay prominent without covering the whole board", () => {
  const layout = resolveDecisionSheetLayout({
    width: 844,
    height: 390,
    insets: { top: 0, right: 21, bottom: 0, left: 21 },
    kind: "victory",
  });

  equal(layout.placement, "right");
  equal(layout.width, 340);
  equal(layout.borderEdge, "left");
  equal(layout.paddingRight, 41);
});

test("victory decision sheets keep a larger bottom-sheet allowance on phones", () => {
  const layout = resolveDecisionSheetLayout({
    width: 390,
    height: 844,
    insets: { top: 47, right: 0, bottom: 34, left: 0 },
    kind: "victory",
  });

  equal(layout.placement, "bottom");
  equal(layout.width, "100%");
  equal(layout.borderEdge, "top");
  equal(layout.maxHeight, 443);
  equal(layout.paddingBottom, 54);
});

test("campaign statistics use a capped bottom sheet with a stable phone chart", () => {
  const layout = resolveStatsSheetLayout({
    width: 390,
    height: 844,
    insets: { top: 47, right: 0, bottom: 34, left: 0 },
  });

  equal(layout.placement, "bottom");
  equal(layout.width, "100%");
  equal(layout.borderEdge, "top");
  equal(layout.maxHeight, 504);
  equal(layout.chartWidth, 342);
  equal(layout.chartHeight, 214);
  equal(layout.paddingBottom, 54);
});

test("campaign statistics dock to the right in landscape without covering the board", () => {
  const layout = resolveStatsSheetLayout({
    width: 844,
    height: 390,
    insets: { top: 0, right: 21, bottom: 0, left: 21 },
  });

  equal(layout.placement, "right");
  equal(layout.width, 360);
  equal(layout.borderEdge, "left");
  equal(layout.chartWidth, 291);
  equal(layout.chartHeight, 164);
  equal(layout.paddingRight, 41);
});

test("campaign statistics keep a wider census rail on tablet portrait screens", () => {
  const layout = resolveStatsSheetLayout({
    width: 820,
    height: 1180,
    insets: { top: 24, right: 0, bottom: 20, left: 0 },
  });

  equal(layout.placement, "right");
  equal(layout.width, 360);
  equal(layout.borderEdge, "left");
  equal(layout.chartWidth, 312);
  equal(layout.chartHeight, 210);
  equal(layout.paddingTop, 44);
  equal(layout.paddingBottom, 40);
});

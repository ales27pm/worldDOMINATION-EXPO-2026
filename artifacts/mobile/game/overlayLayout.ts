export interface EdgeInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export type DrawerPlacement = "bottom" | "right";
export type DecisionSheetKind = "compact" | "playback" | "victory";

export interface RosterDrawerLayout {
  placement: DrawerPlacement;
  width: number | "100%";
  maxHeight: number;
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;
  borderEdge: "left" | "top";
}

export interface CardHandLayout {
  placement: DrawerPlacement;
  width: number | "100%";
  maxHeight: number;
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;
  borderEdge: "left" | "top";
  cardRailHeight: number;
  actionsDirection: "column" | "row";
}

export interface DispatchLogLayout {
  placement: DrawerPlacement;
  width: number | "100%";
  maxHeight: number;
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;
  borderEdge: "left" | "top";
}

export interface DecisionSheetLayout {
  placement: DrawerPlacement;
  width: number | "100%";
  maxHeight: number;
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;
  borderEdge: "left" | "top";
}

export interface StatsSheetLayout {
  placement: DrawerPlacement;
  width: number | "100%";
  maxHeight: number;
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;
  borderEdge: "left" | "top";
  chartWidth: number;
  chartHeight: number;
}

export interface CampaignHudLayout {
  commandPlacement: DrawerPlacement;
  commandWidth: number | "100%";
  commandMaxHeight: number;
  commandPaddingRight: number;
  commandPaddingBottom: number;
  cameraControlsRightInset: number | null;
  legendBottom: number;
  legendLeft: number;
  tickerLines: number;
}

export interface OccupyToastLayout {
  bottom: number;
  left: number;
  right: number;
  maxWidth: number;
}

export function resolveCampaignHudLayout({
  width,
  height,
  insets,
}: {
  width: number;
  height: number;
  insets: EdgeInsets;
}): CampaignHudLayout {
  const isLandscape = width > height;
  const safeWidth = Math.max(320, width - insets.left - insets.right);
  const safeHeight = Math.max(320, height - insets.top - insets.bottom);

  if (isLandscape && safeHeight < 520) {
    const commandAllowance = clamp(Math.round(safeHeight * 0.3), 112, 132);

    return {
      commandPlacement: "bottom",
      commandWidth: "100%",
      commandMaxHeight: commandAllowance,
      commandPaddingRight: insets.right,
      commandPaddingBottom: insets.bottom,
      cameraControlsRightInset: null,
      legendBottom: insets.bottom + commandAllowance + 10,
      legendLeft: insets.left + 10,
      tickerLines: 1,
    };
  }

  if (isLandscape) {
    const maxByBoardReserve = Math.max(300, safeWidth - 160);
    const dockWidth = clamp(
      Math.round(safeWidth * (safeWidth >= 1000 ? 0.31 : 0.42)),
      safeWidth >= 900 ? 360 : 320,
      Math.min(safeWidth >= 1100 ? 440 : 380, maxByBoardReserve),
    );

    return {
      commandPlacement: "right",
      commandWidth: dockWidth,
      commandMaxHeight: clamp(Math.round(safeHeight * 0.9), 260, safeHeight),
      commandPaddingRight: insets.right + 6,
      commandPaddingBottom: insets.bottom + 6,
      cameraControlsRightInset: dockWidth + 10,
      legendBottom: insets.bottom + 10,
      legendLeft: insets.left + 10,
      tickerLines: safeHeight < 430 ? 2 : 3,
    };
  }

  const commandAllowance = clamp(Math.round(safeHeight * 0.44), 220, 420);
  return {
    commandPlacement: "bottom",
    commandWidth: "100%",
    commandMaxHeight: commandAllowance,
    commandPaddingRight: insets.right,
    commandPaddingBottom: insets.bottom,
    cameraControlsRightInset: null,
    legendBottom:
      insets.bottom + clamp(Math.round(safeHeight * 0.16), 118, 168),
    legendLeft: insets.left + 10,
    tickerLines: safeWidth < 360 ? 2 : 3,
  };
}

export function resolveOccupyToastLayout({
  width,
  height,
  insets,
}: {
  width: number;
  height: number;
  insets: EdgeInsets;
}): OccupyToastLayout {
  const hud = resolveCampaignHudLayout({ width, height, insets });
  const safeWidth = Math.max(320, width - insets.left - insets.right);
  const safeHeight = Math.max(320, height - insets.top - insets.bottom);
  const edgeGap = safeWidth < 380 ? 8 : 12;

  if (hud.commandPlacement === "right" && typeof hud.commandWidth === "number") {
    const rightRail = hud.commandWidth + hud.commandPaddingRight + edgeGap;
    const availableWidth = Math.max(280, width - insets.left - rightRail - edgeGap);

    return {
      left: insets.left + edgeGap,
      right: rightRail,
      bottom: insets.bottom + clamp(Math.round(safeHeight * 0.04), 12, 28),
      maxWidth: clamp(Math.round(availableWidth * 0.72), 300, 520),
    };
  }

  const bottomOffset =
    width > height && safeHeight < 520
      ? hud.commandMaxHeight + 8
      : clamp(Math.round(safeHeight * 0.18), 124, 178);

  return {
    left: insets.left + edgeGap,
    right: insets.right + edgeGap,
    bottom: insets.bottom + bottomOffset,
    maxWidth: clamp(safeWidth - edgeGap * 2, 300, 520),
  };
}

export function resolveRosterDrawerLayout({
  width,
  height,
  insets,
}: {
  width: number;
  height: number;
  insets: EdgeInsets;
}): RosterDrawerLayout {
  const isLandscape = width > height;
  const isTabletWidth = width >= 700;
  const placement: DrawerPlacement =
    isLandscape || isTabletWidth ? "right" : "bottom";
  const safeWidth = Math.max(320, width - insets.left - insets.right);
  const safeHeight = Math.max(360, height - insets.top - insets.bottom);

  if (placement === "right") {
    return {
      placement,
      width: clamp(Math.round(safeWidth * 0.34), 276, 380),
      maxHeight: safeHeight,
      paddingTop: insets.top + 12,
      paddingRight: insets.right + 12,
      paddingBottom: insets.bottom + 12,
      paddingLeft: 12,
      borderEdge: "left",
    };
  }

  return {
    placement,
    width: "100%",
    maxHeight: clamp(Math.round(safeHeight * 0.56), 300, 520),
    paddingTop: 12,
    paddingRight: insets.right + 12,
    paddingBottom: insets.bottom + 12,
    paddingLeft: insets.left + 12,
    borderEdge: "top",
  };
}

export function resolveCardHandLayout({
  width,
  height,
  insets,
}: {
  width: number;
  height: number;
  insets: EdgeInsets;
}): CardHandLayout {
  const isLandscape = width > height;
  const isTabletWidth = width >= 780;
  const placement: DrawerPlacement =
    isLandscape || isTabletWidth ? "right" : "bottom";
  const safeWidth = Math.max(320, width - insets.left - insets.right);
  const safeHeight = Math.max(360, height - insets.top - insets.bottom);

  if (placement === "right") {
    return {
      placement,
      width: clamp(Math.round(safeWidth * 0.4), 340, 460),
      maxHeight: safeHeight,
      paddingTop: insets.top + 14,
      paddingRight: insets.right + 14,
      paddingBottom: insets.bottom + 14,
      paddingLeft: 14,
      borderEdge: "left",
      cardRailHeight: clamp(Math.round(safeHeight * 0.34), 142, 190),
      actionsDirection: "column",
    };
  }

  return {
    placement,
    width: "100%",
    maxHeight: clamp(Math.round(safeHeight * 0.54), 320, 540),
    paddingTop: 14,
    paddingRight: insets.right + 14,
    paddingBottom: insets.bottom + 14,
    paddingLeft: insets.left + 14,
    borderEdge: "top",
    cardRailHeight: 158,
    actionsDirection: "row",
  };
}

export function resolveDispatchLogLayout({
  width,
  height,
  insets,
}: {
  width: number;
  height: number;
  insets: EdgeInsets;
}): DispatchLogLayout {
  const isLandscape = width > height;
  const isTabletWidth = width >= 760;
  const placement: DrawerPlacement =
    isLandscape || isTabletWidth ? "right" : "bottom";
  const safeWidth = Math.max(320, width - insets.left - insets.right);
  const safeHeight = Math.max(360, height - insets.top - insets.bottom);

  if (placement === "right") {
    return {
      placement,
      width: clamp(Math.round(safeWidth * 0.36), 320, 440),
      maxHeight: safeHeight,
      paddingTop: insets.top + 14,
      paddingRight: insets.right + 14,
      paddingBottom: insets.bottom + 14,
      paddingLeft: 14,
      borderEdge: "left",
    };
  }

  return {
    placement,
    width: "100%",
    maxHeight: clamp(Math.round(safeHeight * 0.52), 300, 560),
    paddingTop: 14,
    paddingRight: insets.right + 14,
    paddingBottom: insets.bottom + 14,
    paddingLeft: insets.left + 14,
    borderEdge: "top",
  };
}

export function resolveDecisionSheetLayout({
  width,
  height,
  insets,
  kind = "compact",
}: {
  width: number;
  height: number;
  insets: EdgeInsets;
  kind?: DecisionSheetKind;
}): DecisionSheetLayout {
  const isLandscape = width > height;
  const isTabletWidth = width >= 760;
  const placement: DrawerPlacement =
    isLandscape || isTabletWidth ? "right" : "bottom";
  const safeWidth = Math.max(320, width - insets.left - insets.right);
  const safeHeight = Math.max(360, height - insets.top - insets.bottom);
  const widthFactor =
    kind === "playback" ? 0.46 : kind === "victory" ? 0.42 : 0.38;
  const minWidth =
    kind === "playback" ? 360 : kind === "victory" ? 340 : 320;
  const maxWidth =
    kind === "playback" ? 520 : kind === "victory" ? 480 : 420;
  const bottomFactor =
    kind === "playback" ? 0.64 : kind === "victory" ? 0.58 : 0.54;
  const bottomMin =
    kind === "playback" ? 360 : kind === "victory" ? 340 : 320;
  const bottomMax =
    kind === "playback" ? 640 : kind === "victory" ? 580 : 540;

  if (placement === "right") {
    return {
      placement,
      width: clamp(Math.round(safeWidth * widthFactor), minWidth, maxWidth),
      maxHeight: safeHeight,
      paddingTop: insets.top + 20,
      paddingRight: insets.right + 20,
      paddingBottom: insets.bottom + 20,
      paddingLeft: 20,
      borderEdge: "left",
    };
  }

  return {
    placement,
    width: "100%",
    maxHeight: clamp(Math.round(safeHeight * bottomFactor), bottomMin, bottomMax),
    paddingTop: 20,
    paddingRight: insets.right + 20,
    paddingBottom: insets.bottom + 20,
    paddingLeft: insets.left + 20,
    borderEdge: "top",
  };
}

export function resolveStatsSheetLayout({
  width,
  height,
  insets,
}: {
  width: number;
  height: number;
  insets: EdgeInsets;
}): StatsSheetLayout {
  const isLandscape = width > height;
  const isTabletWidth = width >= 760;
  const placement: DrawerPlacement =
    isLandscape || isTabletWidth ? "right" : "bottom";
  const safeWidth = Math.max(320, width - insets.left - insets.right);
  const safeHeight = Math.max(360, height - insets.top - insets.bottom);

  if (placement === "right") {
    const sheetWidth = clamp(Math.round(safeWidth * 0.42), 360, 500);
    const paddingLeft = 20;
    const paddingRight = insets.right + 20;
    return {
      placement,
      width: sheetWidth,
      maxHeight: safeHeight,
      paddingTop: insets.top + 20,
      paddingRight,
      paddingBottom: insets.bottom + 20,
      paddingLeft,
      borderEdge: "left",
      chartWidth: clamp(sheetWidth - paddingLeft - paddingRight - 8, 260, 420),
      chartHeight: clamp(Math.round(safeHeight * 0.42), 150, 210),
    };
  }

  const paddingLeft = insets.left + 20;
  const paddingRight = insets.right + 20;
  return {
    placement,
    width: "100%",
    maxHeight: clamp(Math.round(safeHeight * 0.66), 420, 640),
    paddingTop: 20,
    paddingRight,
    paddingBottom: insets.bottom + 20,
    paddingLeft,
    borderEdge: "top",
    chartWidth: clamp(safeWidth - paddingLeft - paddingRight - 8, 280, 460),
    chartHeight: clamp(Math.round(safeHeight * 0.28), 170, 220),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

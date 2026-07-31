import type { EdgeInsets } from "./overlayLayout";

export type MultiplayerCommandColumnCount = 1 | 2 | 3;

export interface MultiplayerCommandLayout {
  columns: MultiplayerCommandColumnCount;
  contentMaxWidth: number;
  contentPaddingTop: number;
  contentPaddingRight: number;
  contentPaddingBottom: number;
  contentPaddingLeft: number;
  sectionWidth: number;
  wideSectionWidth: number;
  headerDirection: "column" | "row";
  sealSize: number;
}

export function resolveMultiplayerCommandLayout({
  width,
  height,
  insets,
}: {
  width: number;
  height: number;
  insets: EdgeInsets;
}): MultiplayerCommandLayout {
  const safeWidth = Math.max(320, width - insets.left - insets.right);
  const safeHeight = Math.max(360, height - insets.top - insets.bottom);
  const columns: MultiplayerCommandColumnCount =
    safeWidth >= 1080 ? 3 : safeWidth >= 760 ? 2 : 1;
  const horizontalPadding = columns === 1 ? 16 : 24;
  const contentMaxWidth = columns === 3 ? 1180 : columns === 2 ? 900 : 560;
  const innerWidth = Math.max(
    288,
    Math.min(contentMaxWidth, safeWidth) - horizontalPadding * 2,
  );
  const gap = 16;
  const sectionWidth = Math.floor(
    (innerWidth - gap * (columns - 1)) / columns,
  );

  return {
    columns,
    contentMaxWidth,
    contentPaddingTop: columns === 1 ? 16 : 20,
    contentPaddingRight: insets.right + horizontalPadding,
    contentPaddingBottom: insets.bottom + 40,
    contentPaddingLeft: insets.left + horizontalPadding,
    sectionWidth,
    wideSectionWidth:
      columns === 3 ? sectionWidth * 2 + gap : innerWidth,
    headerDirection: safeWidth >= 620 || safeHeight < 520 ? "row" : "column",
    sealSize: columns === 1 ? 54 : 62,
  };
}

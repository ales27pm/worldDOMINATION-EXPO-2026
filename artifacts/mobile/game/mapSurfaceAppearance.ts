export const CORRECTED_CHINA_ATLAS_FILL = "#abc886";
export const CORRECTED_CHINA_OUTLINE = "#4a3418";

export function resolveTerritorySurfaceAppearance(
  territoryId: string,
  surfaceTint: string | null,
) {
  const repairsChinaAtlas = territoryId === "china";
  return {
    color:
      surfaceTint ??
      (repairsChinaAtlas ? CORRECTED_CHINA_ATLAS_FILL : "#ffffff"),
    useBoardTexture: !repairsChinaAtlas,
    drawAuthoritativeOutline: repairsChinaAtlas,
  };
}

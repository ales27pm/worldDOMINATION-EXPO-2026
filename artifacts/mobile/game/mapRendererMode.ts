export type MapRendererMode = "svg" | "r3f";

export const DEFAULT_MAP_RENDERER_MODE: MapRendererMode = "r3f";

export function mapRendererModeFromParam(
  value: string | string[] | undefined,
): MapRendererMode {
  const renderer = (Array.isArray(value) ? value[0] : value)?.toLowerCase();
  return renderer === "svg" || renderer === "2d"
    ? "svg"
    : DEFAULT_MAP_RENDERER_MODE;
}

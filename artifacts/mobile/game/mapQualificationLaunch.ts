export interface MapQualificationLaunchOptions {
  autostart: string | undefined;
  qualificationRun: string | undefined;
  development: boolean;
  browserSmokeEnabled: boolean;
  qualificationEnabled: boolean;
}

function isTruthyLaunchValue(value: string | undefined): boolean {
  return value === "1" || value === "true" || value === "yes";
}

export function shouldAutostartMapFixture({
  autostart,
  qualificationRun,
  development,
  browserSmokeEnabled,
  qualificationEnabled,
}: MapQualificationLaunchOptions): boolean {
  if (!autostart) return false;
  if (development || browserSmokeEnabled) return true;
  return qualificationEnabled && isTruthyLaunchValue(qualificationRun);
}

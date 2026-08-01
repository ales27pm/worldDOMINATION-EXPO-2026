export interface MapQualificationLaunchOptions {
  autostart: string | undefined;
  qualificationRun: string | undefined;
  development: boolean;
  browserSmokeEnabled: boolean;
  qualificationEnabled: boolean;
}

const MAXIMUM_QUALIFICATION_BATTLE_COUNT = 500;

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

export function resolveMapQualificationBattleCount(
  value: string | undefined,
  qualificationEnabled: boolean,
): number {
  if (!qualificationEnabled || !value) return 0;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return 0;
  return Math.min(parsed, MAXIMUM_QUALIFICATION_BATTLE_COUNT);
}

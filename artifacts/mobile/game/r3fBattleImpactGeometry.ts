export const BATTLE_IMPACT_INSTANCE_COUNT = 8;
export const BATTLE_IMPACT_RADIUS = 0.18;
export const BATTLE_IMPACT_HEIGHT = 0.14;

export interface BattleImpactInstanceOffset {
  x: number;
  y: number;
  z: number;
}

export function battleImpactInstanceOffset(
  index: number,
  count = BATTLE_IMPACT_INSTANCE_COUNT,
  radius = BATTLE_IMPACT_RADIUS,
  height = BATTLE_IMPACT_HEIGHT,
): BattleImpactInstanceOffset {
  const safeCount =
    Number.isFinite(count) && count > 0 ? Math.floor(count) : 1;
  const safeIndex =
    Number.isFinite(index) && safeCount > 0
      ? ((Math.floor(index) % safeCount) + safeCount) % safeCount
      : 0;
  const angle = (safeIndex / safeCount) * Math.PI * 2;
  return {
    x: Math.cos(angle) * radius,
    y: height,
    z: Math.sin(angle) * radius,
  };
}

export function battleImpactInstanceOffsets(
  count = BATTLE_IMPACT_INSTANCE_COUNT,
): BattleImpactInstanceOffset[] {
  const safeCount =
    Number.isFinite(count) && count > 0 ? Math.floor(count) : 1;
  return Array.from({ length: safeCount }, (_, index) =>
    battleImpactInstanceOffset(index, safeCount),
  );
}

export function battleImpactColor(
  attackerColor: string,
  defenderColor: string,
  conquered: boolean,
): string {
  return conquered ? attackerColor : defenderColor;
}

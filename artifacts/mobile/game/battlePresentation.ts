import type { BattleReport, DieColor } from "./types";

export type BattleOutlook = "attacker" | "defender" | "even";

export interface BattlePresentationSummary {
  attackerStart: number;
  defenderStart: number;
  attackerRemaining: number;
  defenderRemaining: number;
  attackerPressurePct: number;
  defenderPressurePct: number;
  outlook: BattleOutlook;
  outlookLabel: string;
}

const DIE_POWER: Record<DieColor, number> = {
  white: 1,
  yellow: 2,
  orange: 3,
  red: 4,
  black: 5,
  classicAttack: 3,
  classicDefend: 3,
};

function asArmyCount(value: number | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.round(value));
}

function sidePower(armies: number, tier: DieColor, defender: boolean): number {
  const count = Math.max(1, armies);
  const tierBonus = DIE_POWER[tier] * 0.12;
  const defenderBias = defender ? 1.08 : 1;
  return count * (1 + tierBonus) * defenderBias;
}

function outlookFor(attackerPressurePct: number): BattleOutlook {
  if (attackerPressurePct >= 55) return "attacker";
  if (attackerPressurePct <= 45) return "defender";
  return "even";
}

export function battlePresentationSummary(battle: BattleReport): BattlePresentationSummary | null {
  const attackerStart = asArmyCount(battle.attackerArmiesBefore);
  const defenderStart = asArmyCount(battle.defenderArmiesBefore);
  if (attackerStart === null || defenderStart === null) return null;

  const attackerRemaining = Math.max(0, attackerStart - Math.max(0, battle.attackerLosses));
  const defenderRemaining = Math.max(0, defenderStart - Math.max(0, battle.defenderLosses));
  const attackerField = battle.attackerTier === "classicAttack" ? Math.max(1, attackerStart - 1) : attackerStart;
  const attackerPower = sidePower(attackerField, battle.attackerTier, false);
  const defenderPower = sidePower(defenderStart, battle.defenderTier, true);
  const attackerPressurePct = Math.round((attackerPower / Math.max(1, attackerPower + defenderPower)) * 100);
  const defenderPressurePct = 100 - attackerPressurePct;
  const outlook = outlookFor(attackerPressurePct);

  return {
    attackerStart,
    defenderStart,
    attackerRemaining,
    defenderRemaining,
    attackerPressurePct,
    defenderPressurePct,
    outlook,
    outlookLabel:
      outlook === "attacker" ? "Attacker edge" : outlook === "defender" ? "Defender edge" : "Even field",
  };
}

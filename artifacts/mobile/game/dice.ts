import type { DiceTier } from "./types";

export type RandomSource = () => number;

/**
 * Tiered D12 dice system ported from RiskConquest DiceSystem.swift.
 * The tier color escalates with committed army strength and drives the
 * hex-die presentation in battle dispatches.
 */
// Face totals/averages verified against the manual (Chapter 9, "The 5 Battle
// Dice"): White 31/2.6, Yellow 35/2.9, Orange 42/3.5, Red 49/4.1, Black 54/4.5.
export const DICE_FACES: Record<DiceTier, number[]> = {
  white: [1, 1, 1, 1, 2, 2, 2, 3, 3, 4, 5, 6],
  // Manual specifies exactly 3 of 12 faces (25%) carry a "2" — not 4.
  yellow: [1, 1, 1, 2, 2, 2, 3, 3, 4, 5, 5, 6],
  orange: [1, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 6],
  red: [1, 2, 3, 3, 4, 4, 5, 5, 5, 5, 6, 6],
  black: [1, 2, 3, 4, 4, 5, 5, 6, 6, 6, 6, 6],
};

/** Colors follow the manual's stated scheme: Black > Red > Orange > Yellow > White. */
export const DICE_TIER_COLORS: Record<DiceTier, { fill: string; text: string }> = {
  white: { fill: "#e8e2d2", text: "#2e2417" },
  yellow: { fill: "#e0b52e", text: "#2e2417" },
  orange: { fill: "#d9711a", text: "#f2ecdc" },
  red: { fill: "#a1292e", text: "#f2ecdc" },
  black: { fill: "#26221c", text: "#f2ecdc" },
};

export function tierForAttacker(armies: number): DiceTier {
  if (armies <= 3) return "white";
  if (armies <= 7) return "yellow";
  if (armies <= 12) return "orange";
  if (armies <= 18) return "red";
  return "black";
}

export function tierForDefender(armies: number): DiceTier {
  if (armies <= 6) return "white";
  if (armies <= 12) return "yellow";
  if (armies <= 20) return "orange";
  return "red";
}

export function rollTier(tier: DiceTier, random: RandomSource = Math.random): number {
  const faces = DICE_FACES[tier];
  return faces[Math.floor(random() * faces.length)] ?? 3;
}

/** Tier rank (white=1 ... black=5) — Same Time casualties equal the lower side's rank (manual, Chapter 9). */
const TIER_RANK: Record<DiceTier, number> = { white: 1, yellow: 2, orange: 3, red: 4, black: 5 };

export function rankOf(tier: DiceTier): number {
  return TIER_RANK[tier];
}

/** Same Time casualties scale to the lower-ranked tier in the current exchange. */
export function tieredCasualtyCount(tierA: DiceTier, tierB: DiceTier): number {
  return Math.min(rankOf(tierA), rankOf(tierB));
}

export interface BattleRound {
  attackerRolls: number[];
  defenderRolls: number[];
  attackerLosses: number;
  defenderLosses: number;
}

/**
 * Resolve one classic battle round: attacker rolls up to 3 dice (armies - 1),
 * defender up to 2, highest pairs compared, defender wins ties.
 *
 * The attacker chooses how many dice to commit (manual, Ch. 9: "An attacking
 * player... can choose how many dice to attack with"), clamped to what the
 * garrison allows. `attackerDice` omitted defaults to the maximum.
 */
export function resolveBattleRound(
  attackerArmies: number,
  defenderArmies: number,
  attackerDice?: number,
  random: RandomSource = Math.random,
): BattleRound {
  const maxAttackDice = Math.max(1, Math.min(3, attackerArmies - 1));
  const attackCount = Math.max(1, Math.min(attackerDice ?? maxAttackDice, maxAttackDice));
  const defendCount = Math.min(2, defenderArmies);
  const attackerRolls = Array.from({ length: attackCount }, () => 1 + Math.floor(random() * 6)).sort(
    (a, b) => b - a,
  );
  const defenderRolls = Array.from({ length: defendCount }, () => 1 + Math.floor(random() * 6)).sort(
    (a, b) => b - a,
  );
  let attackerLosses = 0;
  let defenderLosses = 0;
  const comparisons = Math.min(attackerRolls.length, defenderRolls.length);
  for (let i = 0; i < comparisons; i += 1) {
    const attackRoll = attackerRolls[i] ?? 0;
    const defendRoll = defenderRolls[i] ?? 0;
    if (attackRoll > defendRoll) {
      defenderLosses += 1;
    } else {
      attackerLosses += 1;
    }
  }
  return { attackerRolls, defenderRolls, attackerLosses, defenderLosses };
}

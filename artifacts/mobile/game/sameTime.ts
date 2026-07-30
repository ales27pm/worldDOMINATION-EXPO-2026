/**
 * Same Time RISK (manual, Chapter 9): every commander stages reinforcements
 * and attack orders in secret, then a round resolves for everyone at once.
 * This module holds the pure resolution logic; engine.ts wires it into the
 * reducer's phase machine.
 *
 * Combat here deliberately uses the tiered D12 dice system in dice.ts
 * (DICE_FACES / tierForAttacker / tierForDefender / rollTier), not the
 * classic 1-6 pairwise dice — Same Time battles can combine many armies at
 * once, and the tiered system scales with committed force size. Per
 * comparison, the losing side's casualties equal the *rank* (white=1 ...
 * black=5) of whichever side's die tier is lower, not a flat 1. Ties favor
 * the defender, as in Classic.
 *
 * Design simplifications (the manual underspecifies simultaneous combat):
 * - Border clashes (two territories that both order an attack on each
 *   other) fight only each other, not the underlying home garrisons.
 *   Survivors return home rather than pressing on into the enemy territory.
 * - "Mass invasions" (several columns, possibly from different players,
 *   all targeting the same territory) and single invasions share one
 *   resolver: columns fight the territory's current holder one at a time.
 *   This naturally produces "spoils of war" — if column A conquers the
 *   territory first, column B's fight is just against column A's survivors,
 *   who are now the (very fresh) defenders.
 * - A surge attack (a pre-declared follow-on target, pressed only if the
 *   conquering column has more than one survivor) leaves one army behind to
 *   hold the newly-won territory and sends the rest onward, chaining
 *   through the same resolver.
 */
import { largestEmpire } from "./analysis";
import { shuffle } from "./cards";
import { rollTier, tieredCasualtyCount, tierForAttacker, tierForDefender } from "./dice";
import { continentTerritories, SAME_TIME_CONTINENT_BONUS, TERRITORY_MAP } from "./mapData";
import type { RandomSource } from "./dice";
import type { AttackOrder, BattleReport, ContinentId, DiceTier, GameState, TerritoryId, TerritoryState } from "./types";

/** Reinforcements: floor((owned + largest connected empire) / 3) plus Same Time continent bonuses. */
export function sameTimeReinforcementsFor(state: GameState, playerId: number): number {
  const owned = state.activeIds.filter((id) => state.territories[id].owner === playerId).length;
  const empire = largestEmpire(state, playerId).size;
  let total = Math.floor((owned + empire) / 3);
  const groups = continentTerritories(state.setup.useExtraTerritories);
  for (const continentId of Object.keys(groups) as ContinentId[]) {
    const members = groups[continentId];
    if (members.length > 0 && members.every((id) => state.territories[id].owner === playerId)) {
      total += SAME_TIME_CONTINENT_BONUS[continentId];
    }
  }
  return Math.max(1, total);
}

/** Restricted Reinforcement option: caps per-territory placement to (friendly bordering neighbors + 1). */
export function restrictedReinforcementCap(state: GameState, playerId: number, territory: TerritoryId): number {
  const neighbors = TERRITORY_MAP[territory]?.neighbors ?? [];
  const friendly = neighbors.filter(
    (n) => state.activeIds.includes(n) && state.territories[n]?.owner === playerId,
  ).length;
  return friendly + 1;
}

/**
 * Friendly Tactical Move targets from `start` — the manual's Tactical Move
 * Phase (Ch. 9, identical wording for Classic and Same Time) is a single
 * transfer "from one territory to another, provided the territories border
 * one another, or are linked by a dotted line" — i.e. direct neighbours
 * only, never a multi-hop chain through owned territory. Dotted-line links
 * (e.g. Alaska–Kamchatka) are already folded into `neighbors` in mapData.
 */
export function friendlyReachableSet(state: GameState, playerId: number, start: TerritoryId): Set<TerritoryId> {
  const result = new Set<TerritoryId>();
  for (const n of TERRITORY_MAP[start]?.neighbors ?? []) {
    if (!state.activeIds.includes(n)) continue;
    if (state.territories[n]?.owner !== playerId) continue;
    result.add(n);
  }
  return result;
}

/** One tiered-dice comparison; the loser's casualties equal the lower side's tier rank. Ties favor the defender. */
function combatRound(
  attackerArmies: number,
  defenderArmies: number,
  random: RandomSource = Math.random,
): {
  attackerLosses: number;
  defenderLosses: number;
  attackerRoll: number;
  defenderRoll: number;
  attackerTier: DiceTier;
  defenderTier: DiceTier;
} {
  // Manual, Chapter 9: tier is keyed to the committed army's own size (e.g. an
  // 8-battalion attack rolls Orange directly) — no "minus one" adjustment.
  const attackerTier = tierForAttacker(Math.max(1, attackerArmies));
  const defenderTier = tierForDefender(Math.max(1, defenderArmies));
  const attackerRoll = rollTier(attackerTier, random);
  const defenderRoll = rollTier(defenderTier, random);
  const loserRank = tieredCasualtyCount(attackerTier, defenderTier);
  if (attackerRoll > defenderRoll) {
    return { attackerLosses: 0, defenderLosses: Math.min(loserRank, defenderArmies), attackerRoll, defenderRoll, attackerTier, defenderTier };
  }
  return { attackerLosses: Math.min(loserRank, attackerArmies), defenderLosses: 0, attackerRoll, defenderRoll, attackerTier, defenderTier };
}

/** A symmetric comparison for a border clash — neither side is dug in, so both use the attacker tiering. */
function clashRound(
  armiesA: number,
  armiesB: number,
  random: RandomSource = Math.random,
): { lossesA: number; lossesB: number; rollA: number; rollB: number; tierA: DiceTier; tierB: DiceTier } {
  const tierA = tierForAttacker(Math.max(1, armiesA));
  const tierB = tierForAttacker(Math.max(1, armiesB));
  const rollA = rollTier(tierA, random);
  const rollB = rollTier(tierB, random);
  if (rollA === rollB) {
    return { lossesA: 0, lossesB: 0, rollA, rollB, tierA, tierB };
  }
  const loserRank = tieredCasualtyCount(tierA, tierB);
  if (rollA > rollB) return { lossesA: 0, lossesB: Math.min(loserRank, armiesB), rollA, rollB, tierA, tierB };
  return { lossesA: Math.min(loserRank, armiesA), lossesB: 0, rollA, rollB, tierA, tierB };
}

/** A surviving attacking force en route to (or occupying) a territory, awaiting resolution. */
interface Column {
  player: number;
  /** Where this force currently stands — its original launch territory, or a just-conquered one mid-surge. */
  from: TerritoryId;
  armies: number;
  surgeTo: TerritoryId | null;
}

export interface SameTimeRoundResult {
  territories: Record<TerritoryId, TerritoryState>;
  reports: BattleReport[];
  /** Players who conquered at least one territory this round (earns a Risk card, as in Classic). */
  conquerors: Set<number>;
}

export interface SameTimeRoundOptions {
  random?: RandomSource;
}

const MAX_ROUNDS_PER_BATTLE = 200;
const MAX_SURGE_DEPTH = 20;

/** Resolve every queued attack order for a round: border clashes, then grouped battles, then surge chains. */
export function resolveSameTimeRound(
  territories: Record<TerritoryId, TerritoryState>,
  orders: AttackOrder[],
  options: SameTimeRoundOptions = {},
): SameTimeRoundResult {
  const t: Record<TerritoryId, TerritoryState> = { ...territories };
  const reports: BattleReport[] = [];
  const conquerors = new Set<number>();
  const random = options.random ?? Math.random;

  // 0. Every attacking column leaves its home territory before anything
  // else resolves — otherwise the committed troops would fight abroad
  // while an identical copy of them stayed behind, minting armies out of
  // thin air. This also means a territory that gutted its own defense to
  // attack is genuinely vulnerable to a third party's order this round.
  for (const o of orders) {
    const home = t[o.from];
    if (home) t[o.from] = { ...home, armies: Math.max(0, home.armies - o.count) };
  }

  // 1. Border clashes: mutual attacks between two territories fight each
  // other only; survivors return home rather than continuing into the
  // enemy's territory (a deliberate simplification — the manual doesn't
  // spell out this case).
  const byFromTo = new Map<string, AttackOrder>();
  for (const o of orders) byFromTo.set(`${o.from}>${o.to}`, o);
  const consumed = new Set<string>();
  for (const o of orders) {
    if (consumed.has(o.id)) continue;
    const mirror = byFromTo.get(`${o.to}>${o.from}`);
    if (mirror && !consumed.has(mirror.id)) {
      consumed.add(o.id);
      consumed.add(mirror.id);
      resolveClash(t, o, mirror, reports, random);
    }
  }

  // 2. Group the remaining orders by target territory (invasions and mass
  // invasions share one resolver).
  const groups = new Map<TerritoryId, Column[]>();
  for (const o of orders) {
    if (consumed.has(o.id)) continue;
    const arr = groups.get(o.to) ?? [];
    arr.push({ player: o.player, from: o.from, armies: o.count, surgeTo: o.surgeTo });
    groups.set(o.to, arr);
  }
  let pendingSurges: Column[] = [];
  for (const [target, columns] of groups) {
    resolveDefendedGroup(t, target, columns, reports, conquerors, pendingSurges, random);
  }

  // 3. Surge attacks chain through the same resolver, grouped by their
  // declared follow-on target, until nothing presses onward.
  let depth = 0;
  while (pendingSurges.length > 0 && depth < MAX_SURGE_DEPTH) {
    depth += 1;
    const surges = pendingSurges;
    pendingSurges = [];
    const bySurgeTarget = new Map<TerritoryId, Column[]>();
    for (const s of surges) {
      if (!s.surgeTo) continue;
      const arr = bySurgeTarget.get(s.surgeTo) ?? [];
      arr.push({ ...s, surgeTo: null });
      bySurgeTarget.set(s.surgeTo, arr);
    }
    for (const [target, columns] of bySurgeTarget) {
      resolveDefendedGroup(t, target, columns, reports, conquerors, pendingSurges, random);
    }
  }

  return { territories: t, reports, conquerors };
}

function resolveClash(
  t: Record<TerritoryId, TerritoryState>,
  orderA: AttackOrder,
  orderB: AttackOrder,
  reports: BattleReport[],
  random: RandomSource,
): void {
  let armiesA = orderA.count;
  let armiesB = orderB.count;
  const rollsA: number[] = [];
  const rollsB: number[] = [];
  let lastTierA: DiceTier = "white";
  let lastTierB: DiceTier = "white";
  let rounds = 0;
  while (armiesA > 0 && armiesB > 0 && rounds < MAX_ROUNDS_PER_BATTLE) {
    const r = clashRound(armiesA, armiesB, random);
    armiesA -= r.lossesA;
    armiesB -= r.lossesB;
    rollsA.push(r.rollA);
    rollsB.push(r.rollB);
    lastTierA = r.tierA;
    lastTierB = r.tierB;
    rounds += 1;
  }
  t[orderA.from] = { ...t[orderA.from], armies: t[orderA.from].armies + armiesA };
  t[orderB.from] = { ...t[orderB.from], armies: t[orderB.from].armies + armiesB };
  reports.push({
    from: orderA.from,
    to: orderB.from,
    attacker: orderA.player,
    defender: orderB.player,
    attackerRolls: rollsA,
    defenderRolls: rollsB,
    attackerLosses: orderA.count - armiesA,
    defenderLosses: orderB.count - armiesB,
    rounds,
    conquered: false,
    attackerTier: lastTierA,
    defenderTier: lastTierB,
    attackerArmiesBefore: orderA.count,
    defenderArmiesBefore: orderB.count,
  });
}

/**
 * Fight every surviving column against a target territory, one at a time,
 * in a random order (the manual doesn't specify a tiebreak). Because each
 * column fights whoever currently holds the territory, a column arriving
 * after an earlier one conquered it is automatically "spoils of war" —
 * fighting the new (freshly arrived) occupier rather than the original
 * defender.
 */
function resolveDefendedGroup(
  t: Record<TerritoryId, TerritoryState>,
  target: TerritoryId,
  columns: Column[],
  reports: BattleReport[],
  conquerors: Set<number>,
  pendingSurges: Column[],
  random: RandomSource,
): void {
  const order = shuffle(columns.filter((c) => c.armies > 0), random);
  for (const col of order) {
    const holder = t[target];
    if (holder.owner === col.player) {
      // A teammate (or an earlier column from the same player) already
      // holds it — link up rather than fight.
      t[target] = { owner: col.player, armies: holder.armies + col.armies };
      continue;
    }
    let attackerArmies = col.armies;
    let defenderArmies = holder.armies;
    const defenderOwner = holder.owner;
    const attackerRolls: number[] = [];
    const defenderRolls: number[] = [];
    let attackerTier: DiceTier = "white";
    let defenderTier: DiceTier = "white";
    let rounds = 0;
    while (attackerArmies > 0 && defenderArmies > 0 && rounds < MAX_ROUNDS_PER_BATTLE) {
      const r = combatRound(attackerArmies, defenderArmies, random);
      attackerArmies -= r.attackerLosses;
      defenderArmies -= r.defenderLosses;
      attackerRolls.push(r.attackerRoll);
      defenderRolls.push(r.defenderRoll);
      attackerTier = r.attackerTier;
      defenderTier = r.defenderTier;
      rounds += 1;
    }
    const conquered = defenderArmies <= 0 && attackerArmies > 0;
    reports.push({
      from: col.from,
      to: target,
      attacker: col.player,
      defender: defenderOwner,
      attackerRolls,
      defenderRolls,
      attackerLosses: col.armies - attackerArmies,
      defenderLosses: holder.armies - defenderArmies,
      rounds,
      conquered,
      attackerTier,
      defenderTier,
      attackerArmiesBefore: col.armies,
      defenderArmiesBefore: holder.armies,
    });
    if (conquered) {
      conquerors.add(col.player);
      if (col.surgeTo && attackerArmies > 1) {
        t[target] = { owner: col.player, armies: 1 };
        pendingSurges.push({ player: col.player, from: target, armies: attackerArmies - 1, surgeTo: col.surgeTo });
      } else {
        t[target] = { owner: col.player, armies: attackerArmies };
      }
    } else {
      t[target] = { owner: defenderOwner, armies: Math.max(0, defenderArmies) };
    }
  }
}

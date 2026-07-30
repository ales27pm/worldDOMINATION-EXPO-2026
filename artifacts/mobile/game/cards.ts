import type { CardRule, CardType, RiskCard, TerritoryId } from "./types";

let cardCounter = 0;
export type RandomSource = () => number;

function nextCardId(): string {
  cardCounter += 1;
  return `card-${cardCounter}`;
}

/** Build a shuffled Risk card deck: one card per territory plus two wilds. */
export function buildDeck(territoryIds: TerritoryId[]): RiskCard[] {
  const types: CardType[] = ["infantry", "cavalry", "artillery"];
  const deck: RiskCard[] = territoryIds.map((territory, i) => ({
    id: nextCardId(),
    type: types[i % 3] ?? "infantry",
    territory,
  }));
  deck.push({ id: nextCardId(), type: "wild", territory: null });
  deck.push({ id: nextCardId(), type: "wild", territory: null });
  return shuffle(deck);
}

export function shuffle<T>(items: T[], random: RandomSource = Math.random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const a = result[i];
    const b = result[j];
    if (a !== undefined && b !== undefined) {
      result[i] = b;
      result[j] = a;
    }
  }
  return result;
}

/** Ascending Armies schedule (4, 6, 8, 10, 12, 15, then +5 per set). */
export function tradeBonus(tradesCompleted: number): number {
  const schedule = [4, 6, 8, 10, 12, 15];
  const fromSchedule = schedule[tradesCompleted];
  if (fromSchedule !== undefined) return fromSchedule;
  return 15 + (tradesCompleted - 5) * 5;
}

type ConcreteType = Exclude<CardType, "wild">;

const SET_VALUES: Record<ConcreteType, number> = { infantry: 4, cavalry: 6, artillery: 8 };
const MIXED_VALUE = 10;
const CONCRETE_TYPES: ConcreteType[] = ["infantry", "cavalry", "artillery"];

/** Best Set Value interpretation of a set (wilds count as whichever type pays most). */
export function setTradeValue(cards: RiskCard[]): number {
  if (cards.length !== 3) return 0;
  const base = cards.filter((c) => c.type !== "wild").map((c) => c.type as ConcreteType);
  const wilds = cards.length - base.length;
  let best = 0;
  const evaluate = (types: ConcreteType[]): number => {
    const unique = new Set(types);
    if (unique.size === 3) return MIXED_VALUE;
    if (unique.size === 1 && types[0] !== undefined) return SET_VALUES[types[0]];
    return 0;
  };
  const assign = (chosen: ConcreteType[], remaining: number): void => {
    if (remaining === 0) {
      best = Math.max(best, evaluate([...base, ...chosen]));
      return;
    }
    for (const type of CONCRETE_TYPES) assign([...chosen, type], remaining - 1);
  };
  assign([], wilds);
  return best;
}

/** Armies received for trading a set under the active RISK II card rule (manual, Chapter 8). */
export function tradeValue(cards: RiskCard[], rule: CardRule, tradesCompleted: number): number {
  if (rule === "setValue") return setTradeValue(cards);
  if (rule === "ascendingByOne") return 4 + tradesCompleted;
  return tradeBonus(tradesCompleted);
}

/** A set of three cards is valid if all match one type or cover three types, wilds count as any. */
export function isValidSet(cards: RiskCard[]): boolean {
  if (cards.length !== 3) return false;
  const wilds = cards.filter((c) => c.type === "wild").length;
  const nonWild = cards.filter((c) => c.type !== "wild").map((c) => c.type);
  if (wilds >= 1) return true;
  const unique = new Set(nonWild).size;
  return unique === 1 || unique === 3;
}

/** Find the best tradeable set in a hand — highest payout under the rule, preferring to keep wilds. */
export function findBestSet(hand: RiskCard[], rule: CardRule = "ascending"): RiskCard[] | null {
  if (hand.length < 3) return null;
  let best: { set: RiskCard[]; score: number } | null = null;
  for (let i = 0; i < hand.length; i += 1) {
    for (let j = i + 1; j < hand.length; j += 1) {
      for (let k = j + 1; k < hand.length; k += 1) {
        const a = hand[i];
        const b = hand[j];
        const c = hand[k];
        if (!a || !b || !c) continue;
        const set = [a, b, c];
        if (!isValidSet(set)) continue;
        const wilds = set.filter((card) => card.type === "wild").length;
        const score = (rule === "setValue" ? setTradeValue(set) * 10 : 10) - wilds;
        if (!best || score > best.score) best = { set, score };
      }
    }
  }
  return best?.set ?? null;
}

export const CARD_TYPE_LABEL: Record<CardType, string> = {
  infantry: "Infantry",
  cavalry: "Cavalry",
  artillery: "Artillery",
  wild: "Wild",
};

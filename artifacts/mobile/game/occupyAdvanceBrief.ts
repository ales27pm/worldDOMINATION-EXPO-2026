import { TERRITORY_MAP } from "./mapData";
import type { GameState } from "./types";

export interface OccupyAdvanceBrief {
  fromName: string;
  toName: string;
  count: number;
  min: number;
  max: number;
  leaveBehind: number;
  rangeLabel: string;
  leaveBehindText: string;
  ruleText: string;
}

export function occupyAdvanceBrief(
  game: GameState,
  pending: NonNullable<GameState["pendingOccupy"]>,
  count = pending.max,
): OccupyAdvanceBrief {
  const fromName = TERRITORY_MAP[pending.from]?.name ?? pending.from;
  const toName = TERRITORY_MAP[pending.to]?.name ?? pending.to;
  const fromArmies = game.territories[pending.from]?.armies ?? 0;
  const boundedCount = Math.min(pending.max, Math.max(pending.min, count));
  const leaveBehind = Math.max(0, fromArmies - boundedCount);
  const defaultLeaveBehind = Math.max(0, fromArmies - pending.max);

  return {
    fromName,
    toName,
    count: boundedCount,
    min: pending.min,
    max: pending.max,
    leaveBehind,
    rangeLabel: `${pending.min}-${pending.max}`,
    leaveBehindText: `Leave ${leaveBehind} ${armyLabel(leaveBehind)} in ${fromName}`,
    ruleText: `Min ${pending.min}; ${defaultLeaveBehind} stay in ${fromName}`,
  };
}

function armyLabel(count: number): string {
  return count === 1 ? "army" : "armies";
}

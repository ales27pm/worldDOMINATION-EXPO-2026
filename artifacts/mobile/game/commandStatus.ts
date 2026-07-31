import { TERRITORY_MAP } from "./mapData";
import { friendlyReachableSet, restrictedReinforcementCap } from "./sameTime";
import type { AttackOrder, GamePhase, GameState, TacticalOrder, TerritoryId } from "./types";

export type CommandTone =
  | "active"
  | "blocked"
  | "complete"
  | "danger"
  | "sealed"
  | "waiting";

export interface CommandChip {
  label: string;
  value: string;
  tone?: CommandTone;
}

export interface CommandStatus {
  headline: string;
  tone: CommandTone;
  chips: CommandChip[];
}

export interface CommandStatusInput {
  game: GameState;
  playerId: number;
  selected: TerritoryId | null;
  targetsCount: number;
  stagedMove: { from: TerritoryId; to: TerritoryId; count: number } | null;
  diceCount: number;
}

export function buildCommandStatus({
  game,
  playerId,
  selected,
  targetsCount,
  stagedMove,
  diceCount,
}: CommandStatusInput): CommandStatus | null {
  const player = game.players[playerId];
  if (!player) return null;

  switch (game.phase) {
    case "territoryGrab":
      return {
        headline: "Claim an open territory",
        tone: "active",
        chips: [{ label: "Selectable", value: "Unclaimed", tone: "active" }],
      };
    case "election":
      return {
        headline: "Auction in progress",
        tone: "waiting",
        chips: [{ label: "Opening", value: "Bids / Passes", tone: "waiting" }],
      };
    case "initialDeploy": {
      const remaining = game.initialRemaining[playerId] ?? 0;
      return {
        headline: remaining > 0 ? "Place starting armies" : "Initial deployment complete",
        tone: remaining > 0 ? "active" : "complete",
        chips: [{ label: "Pending", value: String(remaining), tone: remaining > 0 ? "active" : "complete" }],
      };
    }
    case "chooseCapital":
      return {
        headline: player.capital ? "Capital established" : "Choose a capital city",
        tone: player.capital ? "complete" : "active",
        chips: [{ label: "Capital", value: player.capital ?? "Unset", tone: player.capital ? "complete" : "active" }],
      };
    case "reinforcement":
      if (game.mustTrade) {
        return {
          headline: "Card trade required before deployment",
          tone: "blocked",
          chips: [
            { label: "Cards", value: String(player.cards.length), tone: "blocked" },
            { label: "Deploy", value: "Blocked", tone: "blocked" },
          ],
        };
      }
      return {
        headline:
          game.reinforcementsRemaining > 0
            ? "Open reinforcement placement"
            : "Deployment complete; attacks available",
        tone: game.reinforcementsRemaining > 0 ? "active" : "complete",
        chips: [
          {
            label: "Pending",
            value: String(game.reinforcementsRemaining),
            tone: game.reinforcementsRemaining > 0 ? "active" : "complete",
          },
          buildSelectedChip(game, playerId, selected),
        ],
      };
    case "attack":
      {
        const sources = countAttackSources(game, playerId, []);
        const hasTargets = selected !== null && targetsCount > 0;
        const hasSources = sources > 0;
        return {
          headline: hasTargets
            ? "Enemy borders exposed"
            : hasSources
              ? "Select a stronghold with two or more armies"
              : "No attack source available",
          tone: hasTargets ? "danger" : hasSources ? "active" : "waiting",
          chips: [
            { label: "Sources", value: String(sources), tone: hasSources ? "active" : "waiting" },
            { label: "Targets", value: String(targetsCount), tone: targetsCount > 0 ? "danger" : "waiting" },
            buildAttackSelectionChip(game, playerId, selected, []),
            { label: "Dice", value: String(diceCount), tone: "active" },
          ],
        };
      }
    case "fortify":
      if (game.fortifyUsed) {
        return {
          headline: "Tactical movement complete",
          tone: "complete",
          chips: [{ label: "March", value: "Complete", tone: "complete" }],
        };
      }
      {
        const sources = countMoveSources(game, playerId, []);
        const hasSources = sources > 0;
        const hasTargets = targetsCount > 0;
        return {
          headline: stagedMove
            ? "Tactical march staged"
            : hasSources
              ? "Select one mobile force"
              : "No tactical march available",
          tone: stagedMove ? "active" : hasSources ? "waiting" : "complete",
          chips: [
            { label: "Sources", value: String(sources), tone: hasSources ? "active" : "waiting" },
            { label: "Targets", value: String(targetsCount), tone: hasTargets ? "active" : "waiting" },
            {
              label: "Staged",
              value: stagedMove ? String(stagedMove.count) : "None",
              tone: stagedMove ? "active" : "waiting",
            },
          ],
        };
      }
    case "sameTimeReinforce":
    case "sameTimeBattle":
    case "sameTimeMove":
      return buildSameTimeStatus(game, playerId, selected, targetsCount, stagedMove);
    case "gameOver":
      return null;
  }
}

function buildSameTimeStatus(
  game: GameState,
  playerId: number,
  selected: TerritoryId | null,
  targetsCount: number,
  stagedMove: { from: TerritoryId; to: TerritoryId; count: number } | null,
): CommandStatus | null {
  const st = game.sameTime;
  const player = game.players[playerId];
  if (!st || !player) return null;

  const aliveCount = game.players.filter((p) => p.alive).length;
  const readyForPhase = readyArrayForPhase(game.phase, st);
  const readyCount = readyForPhase.filter((ready, index) => ready && game.players[index]?.alive).length;
  const waitingCount = Math.max(0, aliveCount - readyCount);
  const readyChip: CommandChip = {
    label: "Ready",
    value: `${readyCount}/${aliveCount}`,
    tone: waitingCount > 0 ? "waiting" : "complete",
  };
  const waitingChip: CommandChip = {
    label: "Waiting",
    value: String(waitingCount),
    tone: waitingCount > 0 ? "waiting" : "complete",
  };

  if (game.phase === "sameTimeReinforce") {
    const remaining = st.reinforcementsRemaining[playerId] ?? 0;
    const deployed = (st.deployLog[playerId] ?? []).reduce((sum, entry) => sum + entry.count, 0);
    if (player.cards.length >= 5) {
      return {
        headline: "Card trade blocks sealed reinforcement",
        tone: "blocked",
        chips: [
          { label: "Cards", value: String(player.cards.length), tone: "blocked" },
          { label: "Secret pool", value: String(remaining), tone: "blocked" },
          readyChip,
          waitingChip,
        ],
      };
    }
    const sealed = st.readyReinforce[playerId] === true;
    return {
      headline: sealed
        ? `Reinforcements sealed; waiting for ${waitingCount} commander${waitingCount === 1 ? "" : "s"}`
        : remaining > 0
          ? "Secret reinforcement placement"
          : "Ready to seal reinforcements",
      tone: sealed ? "sealed" : remaining > 0 ? "active" : "complete",
      chips: [
        { label: "Pending", value: String(remaining), tone: remaining > 0 ? "active" : "complete" },
        { label: "Placed", value: String(deployed), tone: deployed > 0 ? "active" : "waiting" },
        buildSameTimeReinforceSelectionChip(game, playerId, selected),
        readyChip,
        waitingChip,
      ],
    };
  }

  if (game.phase === "sameTimeBattle") {
    if (st.playback.length > 0) {
      return {
        headline: "Simultaneous resolution playback pending",
        tone: "danger",
        chips: [
          { label: "Reports", value: String(st.playback.length), tone: "danger" },
          { label: "Review", value: "Pending", tone: "danger" },
          readyChip,
          waitingChip,
        ],
      };
    }
    const playerOrders = st.orders.filter((order) => order.player === playerId);
    const committed = playerOrders.reduce((sum, order) => sum + order.count, 0);
    const sealed = st.readyBattle[playerId] === true;
    const sources = countAttackSources(game, playerId, st.orders);
    return {
      headline: sealed
        ? `Attack orders sealed; waiting for ${waitingCount} commander${waitingCount === 1 ? "" : "s"}`
        : playerOrders.length > 0
          ? "Attack orders queued; seal when satisfied"
          : "Stage sealed attack orders",
      tone: sealed ? "sealed" : playerOrders.length > 0 ? "danger" : "active",
      chips: [
        { label: "Queued", value: String(playerOrders.length), tone: playerOrders.length > 0 ? "danger" : "waiting" },
        { label: "Committed", value: String(committed), tone: committed > 0 ? "danger" : "waiting" },
        stagedMove
          ? { label: "Staged", value: String(stagedMove.count), tone: "danger" }
          : { label: "Sources", value: String(sources), tone: sources > 0 ? "active" : "waiting" },
        { label: "Targets", value: String(targetsCount), tone: targetsCount > 0 ? "danger" : "waiting" },
        readyChip,
        waitingChip,
      ],
    };
  }

  if (game.phase === "sameTimeMove") {
    const playerMoves = st.moves.filter((move) => move.player === playerId);
    const committed = playerMoves.reduce((sum, move) => sum + move.count, 0);
    const sealed = st.readyMove[playerId] === true;
    const sources = countMoveSources(game, playerId, st.moves);
    return {
      headline: sealed
        ? `Tactical movement sealed; waiting for ${waitingCount} commander${waitingCount === 1 ? "" : "s"}`
        : playerMoves.length > 0
          ? "Tactical movement queued; confirm when satisfied"
          : "Stage a march or confirm no movement",
      tone: sealed ? "sealed" : playerMoves.length > 0 ? "active" : "waiting",
      chips: [
        { label: "Queued", value: String(playerMoves.length), tone: playerMoves.length > 0 ? "active" : "waiting" },
        { label: "Committed", value: String(committed), tone: committed > 0 ? "active" : "waiting" },
        stagedMove
          ? { label: "Staged", value: String(stagedMove.count), tone: "active" }
          : { label: "Sources", value: String(sources), tone: sources > 0 ? "active" : "waiting" },
        { label: "Targets", value: String(targetsCount), tone: targetsCount > 0 ? "active" : "waiting" },
        readyChip,
        waitingChip,
      ],
    };
  }

  return null;
}

function readyArrayForPhase(
  phase: GamePhase,
  st: NonNullable<GameState["sameTime"]>,
): boolean[] {
  if (phase === "sameTimeReinforce") return st.readyReinforce;
  if (phase === "sameTimeBattle") return st.readyBattle;
  if (phase === "sameTimeMove") return st.readyMove;
  return [];
}

function buildSelectedChip(
  game: GameState,
  playerId: number,
  selected: TerritoryId | null,
): CommandChip {
  if (!selected) return { label: "Selected", value: "None", tone: "waiting" };
  const territory = game.territories[selected];
  if (!territory) return { label: "Selected", value: "Invalid", tone: "blocked" };
  if (territory.owner === playerId) return { label: "Selected", value: "Own", tone: "active" };
  if (territory.owner < 0) return { label: "Selected", value: "Open", tone: "blocked" };
  return { label: "Selected", value: "Rival", tone: "blocked" };
}

function buildAttackSelectionChip(
  game: GameState,
  playerId: number,
  selected: TerritoryId | null,
  orders: AttackOrder[],
): CommandChip {
  if (!selected) return { label: "Selected", value: "None", tone: "waiting" };
  const territory = game.territories[selected];
  if (!territory) return { label: "Selected", value: "Invalid", tone: "blocked" };
  if (territory.owner !== playerId) return { label: "Selected", value: territory.owner < 0 ? "Open" : "Rival", tone: "blocked" };
  const committed = countCommittedFrom(orders, selected, playerId);
  const available = territory.armies - 1 - committed;
  if (available < 1) return { label: "Selected", value: "Pinned", tone: "blocked" };
  const targets = attackTargetsFrom(game, playerId, selected).length;
  return {
    label: "Selected",
    value: targets > 0 ? "Source" : "No border",
    tone: targets > 0 ? "active" : "waiting",
  };
}

function buildSameTimeReinforceSelectionChip(
  game: GameState,
  playerId: number,
  selected: TerritoryId | null,
): CommandChip {
  if (!selected || !game.setup.restrictedReinforcement || !game.sameTime) {
    return buildSelectedChip(game, playerId, selected);
  }
  const territory = game.territories[selected];
  if (!territory || territory.owner !== playerId) return buildSelectedChip(game, playerId, selected);
  const cap = restrictedReinforcementCap(game, playerId, selected);
  const placed = (game.sameTime.deployLog[playerId] ?? []).reduce(
    (sum, entry) => (entry.territory === selected ? sum + entry.count : sum),
    0,
  );
  const open = Math.max(0, cap - placed);
  return {
    label: "Cap",
    value: open > 0 ? String(open) : "Full",
    tone: open > 0 ? "active" : "blocked",
  };
}

function countAttackSources(game: GameState, playerId: number, orders: AttackOrder[]): number {
  return game.activeIds.filter((id) => {
    const territory = game.territories[id];
    if (!territory || territory.owner !== playerId) return false;
    const available = territory.armies - 1 - countCommittedFrom(orders, id, playerId);
    if (available < 1) return false;
    return attackTargetsFrom(game, playerId, id).length > 0;
  }).length;
}

function countMoveSources(game: GameState, playerId: number, moves: TacticalOrder[]): number {
  return game.activeIds.filter((id) => {
    const territory = game.territories[id];
    if (!territory || territory.owner !== playerId) return false;
    const available = territory.armies - 1 - countCommittedFrom(moves, id, playerId);
    if (available < 1) return false;
    return friendlyReachableSet(game, playerId, id).size > 0;
  }).length;
}

function attackTargetsFrom(
  game: GameState,
  playerId: number,
  from: TerritoryId,
): TerritoryId[] {
  return (TERRITORY_MAP[from]?.neighbors ?? []).filter((id) => {
    if (!game.activeIds.includes(id)) return false;
    const territory = game.territories[id];
    return territory !== undefined && territory.owner >= 0 && territory.owner !== playerId;
  });
}

function countCommittedFrom(
  orders: Array<{ player: number; from: TerritoryId; count: number }>,
  from: TerritoryId,
  playerId: number,
): number {
  return orders
    .filter((order) => order.player === playerId && order.from === from)
    .reduce((sum, order) => sum + order.count, 0);
}

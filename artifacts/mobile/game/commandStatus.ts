import type { GamePhase, GameState, TerritoryId } from "./types";

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
          { label: "Selected", value: selected ? "Yes" : "No", tone: selected ? "active" : "waiting" },
        ],
      };
    case "attack":
      return {
        headline:
          selected && targetsCount > 0
            ? "Enemy borders exposed"
            : "Select a stronghold with two or more armies",
        tone: selected && targetsCount > 0 ? "danger" : "active",
        chips: [
          { label: "Targets", value: String(targetsCount), tone: targetsCount > 0 ? "danger" : "waiting" },
          { label: "Dice", value: String(diceCount), tone: "active" },
        ],
      };
    case "fortify":
      if (game.fortifyUsed) {
        return {
          headline: "Tactical movement complete",
          tone: "complete",
          chips: [{ label: "March", value: "Complete", tone: "complete" }],
        };
      }
      return {
        headline: stagedMove ? "Tactical march staged" : "Select one mobile force",
        tone: stagedMove ? "active" : "waiting",
        chips: [
          { label: "Targets", value: String(targetsCount), tone: targetsCount > 0 ? "active" : "waiting" },
          { label: "Staged", value: stagedMove ? String(stagedMove.count) : "None", tone: stagedMove ? "active" : "waiting" },
        ],
      };
    case "sameTimeReinforce":
    case "sameTimeBattle":
    case "sameTimeMove":
      return buildSameTimeStatus(game, playerId);
    case "gameOver":
      return null;
  }
}

function buildSameTimeStatus(game: GameState, playerId: number): CommandStatus | null {
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
        readyChip,
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
          readyChip,
        ],
      };
    }
    const playerOrders = st.orders.filter((order) => order.player === playerId);
    const committed = playerOrders.reduce((sum, order) => sum + order.count, 0);
    const sealed = st.readyBattle[playerId] === true;
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
        readyChip,
      ],
    };
  }

  if (game.phase === "sameTimeMove") {
    const playerMoves = st.moves.filter((move) => move.player === playerId);
    const committed = playerMoves.reduce((sum, move) => sum + move.count, 0);
    const sealed = st.readyMove[playerId] === true;
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
        readyChip,
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

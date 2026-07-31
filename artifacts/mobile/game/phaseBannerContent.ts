import type { GamePhase, GameState } from "./types";

export interface PhaseBannerContent {
  key: string;
  title: string;
  sub: string;
}

export function phaseBannerContent(game: GameState): PhaseBannerContent | null {
  switch (game.phase) {
    case "reinforcement":
      return {
        key: "classic-reinforcement",
        title: "I. DEPLOYMENT",
        sub: `Muster ${game.reinforcementsRemaining} ${plural(game.reinforcementsRemaining, "battalion")} - tap your territories`,
      };
    case "attack":
      return {
        key: "classic-attack",
        title: "II. ENGAGEMENT",
        sub: "Select a stronghold, then strike a neighbour",
      };
    case "fortify":
      return {
        key: "classic-fortify",
        title: "III. MANEUVER",
        sub: "One tactical march, then end the turn",
      };
    case "sameTimeReinforce":
      return sameTimeReinforcementBanner(game);
    case "sameTimeBattle":
      return sameTimeBattleBanner(game);
    case "sameTimeMove":
      return sameTimeMoveBanner(game);
    default:
      return null;
  }
}

function sameTimeReinforcementBanner(game: GameState): PhaseBannerContent | null {
  const st = game.sameTime;
  const player = game.players[game.currentPlayer];
  if (!st || !player) return null;
  const remaining = st.reinforcementsRemaining[player.id] ?? 0;
  if (st.readyReinforce[player.id]) {
    const waiting = waitingCommanders(game, "sameTimeReinforce");
    return {
      key: `same-time-reinforce-sealed-${waiting}`,
      title: "I. SECRET MUSTER",
      sub: `Envelope sealed; waiting on ${waiting} ${plural(waiting, "commander")}`,
    };
  }
  return {
    key: `same-time-reinforce-${remaining}`,
    title: "I. SECRET MUSTER",
    sub:
      remaining > 0
        ? `Place ${remaining} ${plural(remaining, "battalion")} in secret, then seal the envelope`
        : "All battalions placed; seal your reinforcement envelope",
  };
}

function sameTimeBattleBanner(game: GameState): PhaseBannerContent | null {
  const st = game.sameTime;
  const player = game.players[game.currentPlayer];
  if (!st || !player) return null;
  if (st.playback.length > 0) {
    const reports = st.playback.length;
    return {
      key: `same-time-playback-${reports}`,
      title: "III. BATTLE REPORTS",
      sub: `Acknowledge ${reports} simultaneous ${plural(reports, "report")} before tactical movement`,
    };
  }

  const orders = st.orders.filter((order) => order.player === player.id);
  const committed = orders.reduce((sum, order) => sum + order.count, 0);
  if (st.readyBattle[player.id]) {
    const waiting = waitingCommanders(game, "sameTimeBattle");
    return {
      key: `same-time-battle-sealed-${waiting}`,
      title: "II. SEALED ORDERS",
      sub: `Attack orders sealed; waiting on ${waiting} ${plural(waiting, "commander")}`,
    };
  }
  return {
    key: `same-time-battle-${orders.length}-${committed}`,
    title: "II. SEALED ORDERS",
    sub:
      orders.length > 0
        ? `${orders.length} ${plural(orders.length, "order")} committing ${committed} ${plural(committed, "battalion")}; seal when satisfied`
        : "Queue attack routes in secret, then seal for simultaneous resolution",
  };
}

function sameTimeMoveBanner(game: GameState): PhaseBannerContent | null {
  const st = game.sameTime;
  const player = game.players[game.currentPlayer];
  if (!st || !player) return null;
  const moves = st.moves.filter((move) => move.player === player.id);
  const committed = moves.reduce((sum, move) => sum + move.count, 0);
  if (st.readyMove[player.id]) {
    const waiting = waitingCommanders(game, "sameTimeMove");
    return {
      key: `same-time-move-sealed-${waiting}`,
      title: "IV. TACTICAL MARCH",
      sub: `Marches sealed; waiting on ${waiting} ${plural(waiting, "commander")}`,
    };
  }
  return {
    key: `same-time-move-${moves.length}-${committed}`,
    title: "IV. TACTICAL MARCH",
    sub:
      moves.length > 0
        ? `${moves.length} ${plural(moves.length, "march")} committing ${committed} ${plural(committed, "battalion")}; confirm movement`
        : "Stage one-border friendly marches or confirm no movement",
  };
}

function waitingCommanders(game: GameState, phase: GamePhase): number {
  const st = game.sameTime;
  if (!st) return 0;
  const ready =
    phase === "sameTimeReinforce"
      ? st.readyReinforce
      : phase === "sameTimeBattle"
        ? st.readyBattle
        : phase === "sameTimeMove"
          ? st.readyMove
          : [];
  const alive = game.players.filter((player) => player.alive).length;
  const readyAlive = ready.filter((isReady, index) => isReady && game.players[index]?.alive).length;
  return Math.max(0, alive - readyAlive);
}

function plural(count: number, noun: string): string {
  return count === 1 ? noun : `${noun}s`;
}

import type { GamePhase, GameState, SameTimeState } from './types';

export type MultiplayerCommandStatusTone = 'gold' | 'crimson' | 'muted' | 'pending';

export interface MultiplayerCommandStatusPill {
  label: string;
  tone: MultiplayerCommandStatusTone;
}

export interface MultiplayerSnapshotSeatBrief {
  playerId: number;
  claimed: boolean;
  isHuman: boolean;
  invited: boolean;
}

export interface MultiplayerSnapshotBriefingInput {
  version: number;
  you: number | null;
  seats: readonly MultiplayerSnapshotSeatBrief[];
  state: GameState;
}

export interface MultiplayerSnapshotBriefingChip {
  label: string;
  value: string;
  tone: MultiplayerCommandStatusTone;
}

export interface MultiplayerSnapshotBriefing {
  headline: string;
  detail: string;
  tone: MultiplayerCommandStatusTone;
  chips: MultiplayerSnapshotBriefingChip[];
}

export function multiplayerCommandStatusPills({
  apiReady,
  hasAuthToken,
  linked,
  version,
  busy,
  liveMode,
  invitationLiveMode,
}: {
  apiReady: boolean;
  hasAuthToken: boolean;
  linked: boolean;
  version?: number | null;
  busy: boolean;
  liveMode: string;
  invitationLiveMode: string;
}): MultiplayerCommandStatusPill[] {
  const pills: MultiplayerCommandStatusPill[] = [
    {
      label: busy ? 'SERVER PENDING' : apiReady ? 'API ROUTE READY' : 'API ROUTE NEEDED',
      tone: busy ? 'pending' : apiReady ? 'gold' : 'crimson',
    },
    {
      label: hasAuthToken ? 'AUTH TOKEN SET' : 'NO SHARED TOKEN',
      tone: 'muted',
    },
    {
      label: linked ? `MATCH V${version ?? '-'} LINKED` : 'NO LINKED MATCH',
      tone: linked ? 'gold' : 'muted',
    },
  ];

  if (linked) {
    pills.push({
      label: `REALTIME ${modeLabel(liveMode)}`,
      tone: liveMode === 'off' ? 'muted' : 'gold',
    });
  }

  if (invitationLiveMode !== 'off') {
    pills.push({
      label: `INVITES ${modeLabel(invitationLiveMode)}`,
      tone: 'gold',
    });
  }

  return pills;
}

export function multiplayerSnapshotBriefing(
  snapshot: MultiplayerSnapshotBriefingInput,
): MultiplayerSnapshotBriefing {
  const game = snapshot.state;
  const baseChips: MultiplayerSnapshotBriefingChip[] = [
    { label: 'Turn', value: String(game.turn), tone: 'muted' },
    {
      label: 'Seat',
      value: snapshot.you === null ? 'Observer' : `P${snapshot.you}`,
      tone: snapshot.you === null ? 'muted' : 'gold',
    },
    ...seatChips(snapshot),
  ];

  if (game.phase === 'gameOver') {
    const winnerName =
      game.winner === null ? null : game.players[game.winner]?.name ?? `P${game.winner}`;
    return {
      headline: winnerName ? `${winnerName} holds the field` : 'Campaign complete',
      detail: game.winReason ?? 'The server has marked this campaign complete.',
      tone: 'gold',
      chips: [
        { label: 'Result', value: 'Complete', tone: 'gold' },
        { label: 'Version', value: String(snapshot.version), tone: 'muted' },
        ...baseChips,
      ],
    };
  }

  if (game.sameTime && isSameTimePhase(game.phase)) {
    return sameTimeSnapshotBriefing(snapshot, game.sameTime, baseChips);
  }

  const player =
    game.players[game.currentPlayer]?.name ?? `P${game.currentPlayer}`;
  const blockers = [
    game.pendingOccupy ? 'occupation order pending' : null,
    game.awaitingHandoff ? 'handoff confirmation pending' : null,
    game.pendingProposal ? 'diplomacy response pending' : null,
  ].filter(Boolean);

  return {
    headline: `${player}: ${phaseLabel(game.phase)}`,
    detail:
      blockers.length > 0
        ? `Server is holding action until ${blockers.join(', ')}.`
        : 'Server-authoritative Classic turn state is linked and ready for orders.',
    tone: blockers.length > 0 ? 'pending' : 'gold',
    chips: [
      { label: 'Phase', value: phaseShortLabel(game.phase), tone: 'gold' },
      { label: 'Version', value: String(snapshot.version), tone: 'muted' },
      { label: 'Battles', value: String(game.battlesFought), tone: 'muted' },
      ...baseChips,
    ],
  };
}

function modeLabel(mode: string): string {
  const normalized = mode.trim();
  return normalized ? normalized.replace(/\s+/g, ' ').toUpperCase() : 'OFF';
}

function sameTimeSnapshotBriefing(
  snapshot: MultiplayerSnapshotBriefingInput,
  sameTime: SameTimeState,
  baseChips: MultiplayerSnapshotBriefingChip[],
): MultiplayerSnapshotBriefing {
  const game = snapshot.state;
  const ready = readyArrayForPhase(game.phase, sameTime);
  const aliveIds = game.players.filter((player) => player.alive).map((player) => player.id);
  const readyCount = aliveIds.filter((id) => ready[id] === true).length;
  const waitingCount = Math.max(0, aliveIds.length - readyCount);
  const readyTone = waitingCount > 0 ? 'pending' : 'gold';
  const readyChips: MultiplayerSnapshotBriefingChip[] = [
    { label: 'Ready', value: `${readyCount}/${aliveIds.length}`, tone: readyTone },
    { label: 'Waiting', value: String(waitingCount), tone: readyTone },
  ];

  if (game.phase === 'sameTimeReinforce') {
    const pending = aliveIds.reduce(
      (sum, id) => sum + Math.max(0, sameTime.reinforcementsRemaining[id] ?? 0),
      0,
    );
    const placed = sameTime.deployLog.reduce(
      (sum, log) => sum + log.reduce((inner, entry) => inner + entry.count, 0),
      0,
    );
    return {
      headline:
        waitingCount > 0
          ? `Secret muster awaiting ${commanderCount(waitingCount)}`
          : 'Secret muster complete',
      detail:
        'Reinforcement placements stay private on the server until every active commander seals.',
      tone: waitingCount > 0 ? 'pending' : 'gold',
      chips: [
        { label: 'Phase', value: 'Muster', tone: 'gold' },
        ...readyChips,
        { label: 'Pending', value: String(pending), tone: pending > 0 ? 'pending' : 'gold' },
        { label: 'Placed', value: String(placed), tone: placed > 0 ? 'gold' : 'muted' },
        ...baseChips,
      ],
    };
  }

  if (game.phase === 'sameTimeBattle') {
    const committed = sameTime.orders.reduce((sum, order) => sum + order.count, 0);
    if (sameTime.playback.length > 0) {
      return {
        headline: `${sameTime.playback.length} battle ${plural(sameTime.playback.length, 'report')} awaiting playback`,
        detail:
          'Simultaneous battle reports must be acknowledged before tactical movement opens.',
        tone: 'crimson',
        chips: [
          { label: 'Phase', value: 'Review', tone: 'crimson' },
          { label: 'Reports', value: String(sameTime.playback.length), tone: 'crimson' },
          ...readyChips,
          { label: 'Committed', value: String(committed), tone: committed > 0 ? 'crimson' : 'muted' },
          ...baseChips,
        ],
      };
    }

    return {
      headline: `Sealed attack table: ${sameTime.orders.length} ${plural(sameTime.orders.length, 'order')}, ${committed} armies committed`,
      detail:
        waitingCount > 0
          ? `Attack routes remain staged until ${commanderCount(waitingCount)} seals.`
          : 'All active commanders are sealed; simultaneous resolution is ready.',
      tone: waitingCount > 0 ? 'pending' : 'gold',
      chips: [
        { label: 'Phase', value: 'Seal', tone: 'gold' },
        ...readyChips,
        { label: 'Queued', value: String(sameTime.orders.length), tone: sameTime.orders.length > 0 ? 'crimson' : 'muted' },
        { label: 'Committed', value: String(committed), tone: committed > 0 ? 'crimson' : 'muted' },
        ...baseChips,
      ],
    };
  }

  const committed = sameTime.moves.reduce((sum, move) => sum + move.count, 0);
  return {
    headline: `Tactical movement table: ${sameTime.moves.length} ${plural(sameTime.moves.length, 'march')}, ${committed} armies committed`,
    detail:
      waitingCount > 0
        ? `Round closes after ${commanderCount(waitingCount)} confirms movement.`
        : 'All active commanders are sealed; the server can open the next round.',
    tone: waitingCount > 0 ? 'pending' : 'gold',
    chips: [
      { label: 'Phase', value: 'March', tone: 'gold' },
      ...readyChips,
      { label: 'Queued', value: String(sameTime.moves.length), tone: sameTime.moves.length > 0 ? 'gold' : 'muted' },
      { label: 'Committed', value: String(committed), tone: committed > 0 ? 'gold' : 'muted' },
      ...baseChips,
    ],
  };
}

function seatChips(
  snapshot: MultiplayerSnapshotBriefingInput,
): MultiplayerSnapshotBriefingChip[] {
  if (snapshot.seats.length === 0) return [];
  const humanSeats = snapshot.seats.filter((seat) => seat.isHuman);
  const claimed = humanSeats.filter((seat) => seat.claimed).length;
  const open = humanSeats.filter((seat) => !seat.claimed).length;
  const invited = humanSeats.filter((seat) => seat.invited).length;

  return [
    {
      label: 'Seats',
      value: `${claimed}/${humanSeats.length}`,
      tone: open > 0 ? 'pending' : 'gold',
    },
    { label: 'Open', value: String(open), tone: open > 0 ? 'pending' : 'muted' },
    ...(invited > 0
      ? [{ label: 'Invited', value: String(invited), tone: 'gold' as const }]
      : []),
  ];
}

function isSameTimePhase(phase: GamePhase): boolean {
  return (
    phase === 'sameTimeReinforce' ||
    phase === 'sameTimeBattle' ||
    phase === 'sameTimeMove'
  );
}

function readyArrayForPhase(phase: GamePhase, sameTime: SameTimeState): boolean[] {
  if (phase === 'sameTimeReinforce') return sameTime.readyReinforce;
  if (phase === 'sameTimeBattle') return sameTime.readyBattle;
  if (phase === 'sameTimeMove') return sameTime.readyMove;
  return [];
}

function phaseLabel(phase: GamePhase): string {
  switch (phase) {
    case 'territoryGrab':
      return 'territory grab';
    case 'initialDeploy':
      return 'initial deployment';
    case 'chooseCapital':
      return 'capital choice';
    case 'reinforcement':
      return 'reinforcement';
    case 'attack':
      return 'attack';
    case 'fortify':
      return 'fortification';
    case 'election':
      return 'election';
    case 'sameTimeReinforce':
      return 'secret muster';
    case 'sameTimeBattle':
      return 'sealed attacks';
    case 'sameTimeMove':
      return 'tactical movement';
    case 'gameOver':
      return 'complete';
  }
}

function phaseShortLabel(phase: GamePhase): string {
  return phaseLabel(phase)
    .split(' ')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function commanderCount(count: number): string {
  return `${count} commander${count === 1 ? '' : 's'}`;
}

function plural(count: number, noun: string): string {
  return `${noun}${count === 1 ? '' : 's'}`;
}

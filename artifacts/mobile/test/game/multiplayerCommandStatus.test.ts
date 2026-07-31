import { deepEqual, equal, ok } from 'node:assert/strict';
import { test } from 'node:test';

import {
  multiplayerCommandStatusPills,
  multiplayerSnapshotBriefing,
} from '../../game/multiplayerCommandStatus';
import {
  attackOrder,
  createClassicState,
  createSameTimeState,
} from '../helpers/gameState';

test('multiplayer command status reports missing API and local link state', () => {
  const pills = multiplayerCommandStatusPills({
    apiReady: false,
    hasAuthToken: false,
    linked: false,
    version: null,
    busy: false,
    liveMode: 'off',
    invitationLiveMode: 'off',
  });

  deepEqual(pills, [
    { label: 'API ROUTE NEEDED', tone: 'crimson' },
    { label: 'NO SHARED TOKEN', tone: 'muted' },
    { label: 'NO LINKED MATCH', tone: 'muted' },
  ]);
});

test('multiplayer command status makes server-pending visible', () => {
  const pills = multiplayerCommandStatusPills({
    apiReady: true,
    hasAuthToken: true,
    linked: true,
    version: 42,
    busy: true,
    liveMode: 'websocket',
    invitationLiveMode: 'polling',
  });

  deepEqual(pills, [
    { label: 'SERVER PENDING', tone: 'pending' },
    { label: 'AUTH TOKEN SET', tone: 'muted' },
    { label: 'MATCH V42 LINKED', tone: 'gold' },
    { label: 'REALTIME WEBSOCKET', tone: 'gold' },
    { label: 'INVITES POLLING', tone: 'gold' },
  ]);
});

test('multiplayer command status exposes linked realtime waiting state', () => {
  const pills = multiplayerCommandStatusPills({
    apiReady: true,
    hasAuthToken: false,
    linked: true,
    version: null,
    busy: false,
    liveMode: 'off',
    invitationLiveMode: 'event stream',
  });

  deepEqual(pills, [
    { label: 'API ROUTE READY', tone: 'gold' },
    { label: 'NO SHARED TOKEN', tone: 'muted' },
    { label: 'MATCH V- LINKED', tone: 'gold' },
    { label: 'REALTIME OFF', tone: 'muted' },
    { label: 'INVITES EVENT STREAM', tone: 'gold' },
  ]);
});

test('multiplayer snapshot briefing exposes Same Time attack readiness', () => {
  const state = createSameTimeState(3);
  state.phase = 'sameTimeBattle';
  state.sameTime!.orders = [
    attackOrder('o1', 0, 'alaska', 'northwestTerritory', 3),
    attackOrder('o2', 2, 'greenland', 'quebec', 2),
  ];
  state.sameTime!.readyBattle = [true, false, true];

  const briefing = multiplayerSnapshotBriefing({
    version: 7,
    you: 0,
    state,
    seats: [
      { playerId: 0, claimed: true, isHuman: true, invited: false },
      { playerId: 1, claimed: false, isHuman: true, invited: true },
      { playerId: 2, claimed: true, isHuman: true, invited: false },
    ],
  });

  equal(briefing.headline, 'Sealed attack table: 2 orders, 5 armies committed');
  equal(briefing.tone, 'pending');
  equal(briefing.chips.find((chip) => chip.label === 'Ready')?.value, '2/3');
  equal(briefing.chips.find((chip) => chip.label === 'Waiting')?.value, '1');
  equal(briefing.chips.find((chip) => chip.label === 'Queued')?.value, '2');
  equal(briefing.chips.find((chip) => chip.label === 'Committed')?.value, '5');
  equal(briefing.chips.find((chip) => chip.label === 'Seats')?.value, '2/3');
  equal(briefing.chips.find((chip) => chip.label === 'Open')?.value, '1');
  equal(briefing.chips.find((chip) => chip.label === 'Invited')?.value, '1');
});

test('multiplayer snapshot briefing prioritizes Same Time playback acknowledgement', () => {
  const state = createSameTimeState(2);
  state.phase = 'sameTimeBattle';
  state.sameTime!.readyBattle = [true, true];
  state.sameTime!.orders = [
    attackOrder('o1', 0, 'alaska', 'northwestTerritory', 4),
  ];
  state.sameTime!.playback = [
    {
      from: 'alaska',
      to: 'northwestTerritory',
      attacker: 0,
      defender: 1,
      attackerRolls: [6, 5, 2],
      defenderRolls: [4, 1],
      attackerLosses: 0,
      defenderLosses: 2,
      rounds: 1,
      conquered: true,
      attackerTier: 'red',
      defenderTier: 'yellow',
    },
  ];

  const briefing = multiplayerSnapshotBriefing({
    version: 8,
    you: 0,
    state,
    seats: [
      { playerId: 0, claimed: true, isHuman: true, invited: false },
      { playerId: 1, claimed: true, isHuman: true, invited: false },
    ],
  });

  equal(briefing.headline, '1 battle report awaiting playback');
  equal(briefing.tone, 'crimson');
  ok(briefing.detail.includes('acknowledged before tactical movement'));
  equal(briefing.chips.find((chip) => chip.label === 'Reports')?.value, '1');
  equal(briefing.chips.find((chip) => chip.label === 'Ready')?.value, '2/2');
});

test('multiplayer snapshot briefing marks Classic blockers before accepting orders', () => {
  const state = createClassicState();
  state.phase = 'attack';
  state.currentPlayer = 0;
  state.awaitingHandoff = true;

  const briefing = multiplayerSnapshotBriefing({
    version: 3,
    you: 0,
    state,
    seats: [
      { playerId: 0, claimed: true, isHuman: true, invited: false },
      { playerId: 1, claimed: true, isHuman: true, invited: false },
    ],
  });

  equal(briefing.headline, 'P1: attack');
  equal(briefing.tone, 'pending');
  ok(briefing.detail.includes('handoff confirmation pending'));
  equal(briefing.chips.find((chip) => chip.label === 'Phase')?.value, 'Attack');
});

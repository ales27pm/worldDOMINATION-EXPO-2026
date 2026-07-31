import { deepEqual } from 'node:assert/strict';
import { test } from 'node:test';

import { multiplayerCommandStatusPills } from '../../game/multiplayerCommandStatus';

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

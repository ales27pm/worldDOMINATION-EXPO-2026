import { deepEqual, equal, ok } from 'node:assert/strict';
import { test } from 'node:test';

import {
  createMultiplayerClientSessionId,
  createMultiplayerClient,
  type EventSourceLike,
  MultiplayerApiError,
  type MultiplayerInvitationSummary,
  type MultiplayerSnapshot,
  type WebSocketLike,
  normalizeApiBaseUrl,
  webSocketUrlFromApiBaseUrl,
} from '../../lib/multiplayerClient';
import type { GameSetup } from '../../game/types';

const setup: GameSetup = {
  players: [
    { name: 'Ada', colorIdx: 0, isHuman: true, generalId: null },
    { name: 'Ben', colorIdx: 1, isHuman: true, generalId: null },
  ],
  objective: 'domination60',
  useExtraTerritories: false,
  allocation: 'random',
  cardRule: 'ascending',
  turnStyle: 'sameTime',
  restrictedReinforcement: true,
};

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

test('normalizes API base URLs to the workspace /api route prefix', () => {
  equal(normalizeApiBaseUrl('https://example.com'), 'https://example.com/api');
  equal(normalizeApiBaseUrl('https://example.com/api'), 'https://example.com/api');
  equal(normalizeApiBaseUrl(' https://example.com/api/ '), 'https://example.com/api');
});

test('creates stable local multiplayer session identifiers', () => {
  ok(createMultiplayerClientSessionId().length >= 8);
});

test('builds multiplayer WebSocket URLs from the API base route', () => {
  equal(
    webSocketUrlFromApiBaseUrl('https://game.example/api', 'm1', 'token value'),
    'wss://game.example/api/multiplayer/matches/m1/socket?playerToken=token%20value',
  );
  equal(
    webSocketUrlFromApiBaseUrl('http://game.example', 'm 2', 'token/value'),
    'ws://game.example/api/multiplayer/matches/m%202/socket?playerToken=token%2Fvalue',
  );
});

test('creates matches, joins seats, reads snapshots, and submits actions through REST paths', async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    if (String(input).endsWith('/multiplayer/matches?limit=5&status=joinable&scope=mine')) {
      return jsonResponse([{
        id: 'm1',
        version: 2,
        createdAt: '',
        updatedAt: '',
        lobbyStatus: 'joinable',
        phase: 'reinforce',
        turn: 1,
        objective: 'domination60',
        turnStyle: 'sameTime',
        currentPlayer: 0,
        currentPlayerName: 'Ada',
        winner: null,
        playerCount: 2,
        humanSeatCount: 2,
        claimedSeatCount: 1,
        openSeatCount: 1,
        invitedSeatCount: 0,
        openHumanSeats: [1],
        seats: [
          { playerId: 0, playerName: 'Ada', isHuman: true, claimed: true, invited: false },
          { playerId: 1, playerName: 'Ben', isHuman: true, claimed: false, invited: false },
        ],
      }]);
    }
    if (String(input).endsWith('/multiplayer/invitations?limit=3')) {
      return jsonResponse([{
        matchId: 'm1',
        matchVersion: 2,
        matchCreatedAt: '',
        matchUpdatedAt: '',
        lobbyStatus: 'joinable',
        phase: 'reinforce',
        turn: 1,
        objective: 'domination60',
        turnStyle: 'sameTime',
        playerId: 1,
        playerName: 'Ben',
        invitedByPlayerId: 0,
        invitedByPlayerName: 'Ada',
        createdAt: '',
      }]);
    }
    if (String(input).endsWith('/multiplayer/contacts')) {
      return jsonResponse([
        { userId: 'user-ben-0001', displayName: 'Benedict' },
      ]);
    }
    if (String(input).endsWith('/multiplayer/quick-match')) {
      return jsonResponse({
        snapshot: { id: 'm1', version: 2, seats: [], you: 1, state: {}, createdAt: '', updatedAt: '' },
        playerToken: 'quick-token',
        sessionId: 'quick-session-0001',
        matchSource: 'joined',
      });
    }
    return jsonResponse(
      String(input).endsWith('/join') || String(input).endsWith('/multiplayer/matches')
        ? { snapshot: { id: 'm1', version: 1, seats: [], you: 0, state: {}, createdAt: '', updatedAt: '' }, playerToken: 'token' }
        : { id: 'm1', version: 2, seats: [], you: 0, state: {}, createdAt: '', updatedAt: '' },
    );
  };
  const client = createMultiplayerClient('https://game.example', fetchImpl);

  await client.createMatch({
    setup,
    hostPlayerId: 0,
    sessionId: 'host-session-0001',
    sessionLabel: 'Ada browser',
  });
  const quick = await client.quickMatch({
    setup,
    playerName: 'Ben',
    sessionId: 'quick-session-0001',
    sessionLabel: 'Ben quick',
  });
  await client.joinMatch('m1', {
    playerId: 1,
    playerName: 'Ben',
    sessionId: 'join-session-0001',
    sessionLabel: 'Ben phone',
  });
  await client.inviteSeat('m1', {
    playerToken: 'token value',
    sessionId: 'host-session-0001',
    playerId: 1,
    invitedUserId: 'user-ben-0001',
  });
  await client.getSnapshot('m1', 'token value');
  await client.applyAction('m1', {
    playerToken: 'token value',
    sessionId: 'host-session-0001',
    expectedVersion: 2,
    action: { type: 'ACKNOWLEDGE_HANDOFF' },
  });
  const lobby = await client.listMatches({ limit: 5, status: 'joinable', scope: 'mine' });
  const invitations = await client.listInvitations({ limit: 3 });
  const contacts = await client.listContacts();

  deepEqual(calls.map((call) => call.url), [
    'https://game.example/api/multiplayer/matches',
    'https://game.example/api/multiplayer/quick-match',
    'https://game.example/api/multiplayer/matches/m1/join',
    'https://game.example/api/multiplayer/matches/m1/invitations',
    'https://game.example/api/multiplayer/matches/m1?playerToken=token%20value',
    'https://game.example/api/multiplayer/matches/m1/actions',
    'https://game.example/api/multiplayer/matches?limit=5&status=joinable&scope=mine',
    'https://game.example/api/multiplayer/invitations?limit=3',
    'https://game.example/api/multiplayer/contacts',
  ]);
  equal(calls[0]?.init?.method, 'POST');
  equal(calls[1]?.init?.method, 'POST');
  equal(calls[2]?.init?.method, 'POST');
  equal(calls[3]?.init?.method, 'POST');
  equal(calls[4]?.init?.method, undefined);
  equal(calls[5]?.init?.method, 'POST');
  equal(calls[6]?.init?.method, undefined);
  equal(calls[7]?.init?.method, undefined);
  equal(calls[8]?.init?.method, undefined);
  equal(quick.matchSource, 'joined');
  equal(quick.playerToken, 'quick-token');
  equal(lobby[0]?.invitedSeatCount, 0);
  equal(lobby[0]?.openSeatCount, 1);
  equal(invitations[0]?.matchId, 'm1');
  equal(invitations[0]?.playerId, 1);
  deepEqual(contacts, [{ userId: 'user-ben-0001', displayName: 'Benedict' }]);
  deepEqual(JSON.parse(String(calls[0]?.init?.body)), {
    setup,
    hostPlayerId: 0,
    sessionId: 'host-session-0001',
    sessionLabel: 'Ada browser',
  });
  deepEqual(JSON.parse(String(calls[1]?.init?.body)), {
    setup,
    playerName: 'Ben',
    sessionId: 'quick-session-0001',
    sessionLabel: 'Ben quick',
  });
  deepEqual(JSON.parse(String(calls[2]?.init?.body)), {
    playerId: 1,
    playerName: 'Ben',
    sessionId: 'join-session-0001',
    sessionLabel: 'Ben phone',
  });
  deepEqual(JSON.parse(String(calls[3]?.init?.body)), {
    playerToken: 'token value',
    sessionId: 'host-session-0001',
    playerId: 1,
    invitedUserId: 'user-ben-0001',
  });
  deepEqual(JSON.parse(String(calls[5]?.init?.body)), {
    playerToken: 'token value',
    sessionId: 'host-session-0001',
    expectedVersion: 2,
    action: { type: 'ACKNOWLEDGE_HANDOFF' },
  });
});

test('sends configured multiplayer API auth on REST and realtime transports', async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  let socketUrl = '';
  const socket: WebSocketLike = {
    onmessage: null,
    onerror: null,
    close() {},
  };
  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return jsonResponse({ snapshot: { id: 'm1', version: 1, seats: [], you: 0, state: {}, createdAt: '', updatedAt: '' }, playerToken: 'seat' });
  };
  const client = createMultiplayerClient('https://game.example', fetchImpl, { apiAuthToken: ' api secret ' });

  await client.createMatch({ setup, hostPlayerId: 0 });
  const subscription = client.watchSnapshot('m1', 'seat token', () => {}, undefined, {
    webSocketFactory(url) {
      socketUrl = url;
      return socket;
    },
  });
  subscription.close();

  const headers = calls[0]?.init?.headers as Record<string, string> | undefined;
  equal(headers?.authorization, 'Bearer api secret');
  equal(socketUrl, 'wss://game.example/api/multiplayer/matches/m1/socket?playerToken=seat%20token&apiAuthToken=api%20secret');
});

test('turns API error envelopes into typed multiplayer errors without leaking tokens', async () => {
  const fetchImpl = async () => jsonResponse({ error: 'VERSION_CONFLICT', message: 'stale' }, { status: 409 });
  const client = createMultiplayerClient('https://game.example/api', fetchImpl);

  try {
    await client.getSnapshot('m1', 'secret-token');
  } catch (error) {
    ok(error instanceof MultiplayerApiError);
    equal(error.status, 409);
    equal(error.code, 'VERSION_CONFLICT');
    equal(error.message, 'stale');
    ok(!String(error.message).includes('secret-token'));
    return;
  }
  throw new Error('Expected MultiplayerApiError.');
});

test('subscribes to the multiplayer snapshot event stream when EventSource is available', () => {
  const snapshots: MultiplayerSnapshot[] = [];
  const errors: unknown[] = [];
  let streamUrl = '';
  const listeners: { snapshot?: (event: { data: string }) => void } = {};
  let closed = false;
  const source: EventSourceLike = {
    onmessage: null,
    onerror: null,
    addEventListener(type, listener) {
      if (type === 'snapshot') listeners.snapshot = listener;
    },
    close() {
      closed = true;
    },
  };
  const snapshot = {
    id: 'm1',
    version: 3,
    seats: [],
    you: 0,
    state: {},
    createdAt: '',
    updatedAt: '',
  } as unknown as MultiplayerSnapshot;
  const client = createMultiplayerClient('https://game.example/api', async () => {
    throw new Error('Event streams should not poll.');
  });

  const subscription = client.watchSnapshot(
    'm1',
    'token value',
    (next) => snapshots.push(next),
    (error) => errors.push(error),
    {
      webSocketFactory: null,
      eventSourceFactory(url) {
        streamUrl = url;
        return source;
      },
    },
  );
  ok(listeners.snapshot);
  listeners.snapshot({ data: JSON.stringify(snapshot) });
  subscription.close();

  equal(subscription.mode, 'events');
  equal(streamUrl, 'https://game.example/api/multiplayer/matches/m1/events?playerToken=token%20value');
  equal(snapshots[0]?.version, 3);
  equal(errors.length, 0);
  equal(closed, true);
});

test('adds multiplayer API auth to EventSource URLs when WebSocket is unavailable', () => {
  let streamUrl = '';
  const source: EventSourceLike = {
    onmessage: null,
    onerror: null,
    close() {},
  };
  const client = createMultiplayerClient('https://game.example/api', async () => {
    throw new Error('Event streams should not poll.');
  }, { apiAuthToken: 'api secret' });

  const subscription = client.watchSnapshot('m1', 'token value', () => {}, undefined, {
    webSocketFactory: null,
    eventSourceFactory(url) {
      streamUrl = url;
      return source;
    },
  });
  subscription.close();

  equal(streamUrl, 'https://game.example/api/multiplayer/matches/m1/events?playerToken=token%20value&apiAuthToken=api%20secret');
});

test('subscribes to trusted invitation event streams with auth query tokens', () => {
  const invitations: MultiplayerInvitationSummary[][] = [];
  const errors: unknown[] = [];
  const listeners: { invitations?: (event: { data: string }) => void } = {};
  let streamUrl = '';
  let closed = false;
  const source: EventSourceLike = {
    onmessage: null,
    onerror: null,
    addEventListener(type, listener) {
      if (type === 'invitations') listeners.invitations = listener;
    },
    close() {
      closed = true;
    },
  };
  const invitation = {
    matchId: 'm1',
    matchVersion: 3,
    matchCreatedAt: '',
    matchUpdatedAt: '',
    lobbyStatus: 'joinable',
    phase: 'reinforcement',
    turn: 1,
    objective: 'domination60',
    turnStyle: 'sameTime',
    playerId: 1,
    playerName: 'Ben',
    invitedByPlayerId: 0,
    invitedByPlayerName: 'Ada',
    createdAt: '',
  } satisfies MultiplayerInvitationSummary;
  const client = createMultiplayerClient('https://game.example/api', async () => {
    throw new Error('Invitation event streams should not poll.');
  }, { apiAuthToken: 'api secret' });

  const subscription = client.watchInvitations(
    (next) => invitations.push(next),
    (error) => errors.push(error),
    {
      limit: 3,
      eventSourceFactory(url) {
        streamUrl = url;
        return source;
      },
    },
  );
  ok(listeners.invitations);
  listeners.invitations({ data: JSON.stringify([invitation]) });
  subscription.close();

  equal(subscription.mode, 'events');
  equal(streamUrl, 'https://game.example/api/multiplayer/invitations/events?limit=3&apiAuthToken=api%20secret');
  equal(invitations[0]?.[0]?.matchId, 'm1');
  equal(errors.length, 0);
  equal(closed, true);
});

test('subscribes to WebSocket snapshots before EventSource when available', () => {
  const snapshots: MultiplayerSnapshot[] = [];
  const errors: unknown[] = [];
  let socketUrl = '';
  let closed = false;
  const socket: WebSocketLike = {
    onmessage: null,
    onerror: null,
    close() {
      closed = true;
    },
  };
  const snapshot = {
    id: 'm1',
    version: 5,
    seats: [],
    you: 0,
    state: {},
    createdAt: '',
    updatedAt: '',
  } as unknown as MultiplayerSnapshot;
  const client = createMultiplayerClient('https://game.example/api', async () => {
    throw new Error('WebSocket streams should not poll.');
  });

  const subscription = client.watchSnapshot(
    'm1',
    'token value',
    (next) => snapshots.push(next),
    (error) => errors.push(error),
    {
      webSocketFactory(url) {
        socketUrl = url;
        return socket;
      },
      eventSourceFactory() {
        throw new Error('WebSocket should be preferred before EventSource.');
      },
    },
  );
  socket.onmessage?.({ data: JSON.stringify(snapshot) });
  subscription.close();

  equal(subscription.mode, 'websocket');
  equal(socketUrl, 'wss://game.example/api/multiplayer/matches/m1/socket?playerToken=token%20value');
  equal(snapshots[0]?.version, 5);
  equal(errors.length, 0);
  equal(closed, true);
});

test('falls back to polling trusted invitations when EventSource is unavailable', async () => {
  const calls: string[] = [];
  const invitations: MultiplayerInvitationSummary[][] = [];
  const timer: { handler?: () => void | Promise<void> } = {};
  let cleared = false;
  const invitation = {
    matchId: 'm1',
    matchVersion: 3,
    matchCreatedAt: '',
    matchUpdatedAt: '',
    lobbyStatus: 'joinable',
    phase: 'reinforcement',
    turn: 1,
    objective: 'domination60',
    turnStyle: 'sameTime',
    playerId: 1,
    playerName: 'Ben',
    invitedByPlayerId: 0,
    invitedByPlayerName: 'Ada',
    createdAt: '',
  } satisfies MultiplayerInvitationSummary;
  const fetchImpl = async (input: RequestInfo | URL) => {
    calls.push(String(input));
    return jsonResponse([invitation]);
  };
  const client = createMultiplayerClient('https://game.example', fetchImpl);

  const subscription = client.watchInvitations((next) => invitations.push(next), undefined, {
    limit: 2,
    eventSourceFactory: null,
    intervalMs: 25,
    setIntervalImpl: ((handler: () => void | Promise<void>) => {
      timer.handler = handler;
      return 7 as unknown as ReturnType<typeof setInterval>;
    }) as typeof setInterval,
    clearIntervalImpl: (() => {
      cleared = true;
    }) as typeof clearInterval,
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  ok(timer.handler);
  await timer.handler();
  subscription.close();

  equal(subscription.mode, 'polling');
  deepEqual(calls, [
    'https://game.example/api/multiplayer/invitations?limit=2',
    'https://game.example/api/multiplayer/invitations?limit=2',
  ]);
  equal(invitations.length, 2);
  equal(invitations[1]?.[0]?.matchId, 'm1');
  equal(cleared, true);
});

test('falls back to polling snapshots when EventSource is unavailable', async () => {
  const calls: string[] = [];
  const snapshots: MultiplayerSnapshot[] = [];
  const timer: { handler?: () => void | Promise<void> } = {};
  let cleared = false;
  const snapshot = {
    id: 'm1',
    version: 4,
    seats: [],
    you: 1,
    state: {},
    createdAt: '',
    updatedAt: '',
  } as unknown as MultiplayerSnapshot;
  const fetchImpl = async (input: RequestInfo | URL) => {
    calls.push(String(input));
    return jsonResponse(snapshot);
  };
  const client = createMultiplayerClient('https://game.example', fetchImpl);

  const subscription = client.watchSnapshot('m1', 'token value', (next) => snapshots.push(next), undefined, {
    webSocketFactory: null,
    eventSourceFactory: null,
    intervalMs: 25,
    setIntervalImpl: ((handler: () => void | Promise<void>) => {
      timer.handler = handler;
      return 7 as unknown as ReturnType<typeof setInterval>;
    }) as typeof setInterval,
    clearIntervalImpl: (() => {
      cleared = true;
    }) as typeof clearInterval,
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  ok(timer.handler);
  await timer.handler();
  subscription.close();

  equal(subscription.mode, 'polling');
  deepEqual(calls, [
    'https://game.example/api/multiplayer/matches/m1?playerToken=token%20value',
    'https://game.example/api/multiplayer/matches/m1?playerToken=token%20value',
  ]);
  equal(snapshots.length, 2);
  equal(snapshots[1]?.version, 4);
  equal(cleared, true);
});

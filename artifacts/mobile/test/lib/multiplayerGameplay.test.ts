import { deepEqual, equal } from 'node:assert/strict';
import { test } from 'node:test';

import type { GameAction } from '../../game/types';
import {
  MultiplayerApiError,
  type MultiplayerClient,
  type MultiplayerSnapshot,
} from '../../lib/multiplayerClient';
import type { MultiplayerLocalSession } from '../../lib/multiplayerSession';
import {
  multiplayerActionStatus,
  submitMultiplayerGameplayAction,
} from '../../lib/multiplayerGameplay';

const session: MultiplayerLocalSession = {
  apiBaseUrl: 'https://game.example/api',
  matchId: 'match-1',
  playerToken: 'seat-token',
  playerId: 0,
  sessionId: 'local-session-0001',
  sessionLabel: 'Ada browser',
  updatedAt: '2026-07-29T00:00:00.000Z',
};

const snapshot = {
  id: 'match-1',
  version: 7,
  createdAt: '2026-07-29T00:00:00.000Z',
  updatedAt: '2026-07-29T00:00:00.000Z',
  seats: [],
  you: 0,
  state: {},
} as unknown as MultiplayerSnapshot;

function clientWith(overrides: Partial<MultiplayerClient>): MultiplayerClient {
  return {
    createMatch: async () => {
      throw new Error('not used');
    },
    joinMatch: async () => {
      throw new Error('not used');
    },
    quickMatch: async () => {
      throw new Error('not used');
    },
    inviteSeat: async () => {
      throw new Error('not used');
    },
    getSnapshot: async () => {
      throw new Error('not used');
    },
    applyAction: async () => {
      throw new Error('not used');
    },
    listMatches: async () => {
      throw new Error('not used');
    },
    listContacts: async () => {
      throw new Error('not used');
    },
    listInvitations: async () => {
      throw new Error('not used');
    },
    watchInvitations: () => {
      throw new Error('not used');
    },
    watchSnapshot: () => {
      throw new Error('not used');
    },
    ...overrides,
  };
}

test('submits gameplay actions with the current snapshot version and seat token', async () => {
  const action: GameAction = { type: 'DEPLOY', territory: 'alaska', count: 1 };
  const calls: unknown[] = [];
  const accepted = { ...snapshot, version: 8 };
  const client = clientWith({
    async applyAction(matchId, input) {
      calls.push({ matchId, input });
      return accepted;
    },
  });

  const result = await submitMultiplayerGameplayAction({
    client,
    session,
    snapshot,
    action,
  });

  deepEqual(calls, [
    {
      matchId: 'match-1',
      input: {
        playerToken: 'seat-token',
        sessionId: 'local-session-0001',
        expectedVersion: 7,
        action,
      },
    },
  ]);
  equal(result.snapshot.version, 8);
  equal(result.refreshedAfterConflict, false);
  equal(multiplayerActionStatus(action, result.snapshot.version), 'DEPLOY accepted at version 8.');
});

test('refreshes the server snapshot after a multiplayer version conflict', async () => {
  const calls: string[] = [];
  const refreshed = { ...snapshot, version: 9 };
  const client = clientWith({
    async applyAction() {
      calls.push('applyAction');
      throw new MultiplayerApiError(409, 'VERSION_CONFLICT', 'stale');
    },
    async getSnapshot(matchId, playerToken) {
      calls.push(`${matchId}:${playerToken}`);
      return refreshed;
    },
  });

  const result = await submitMultiplayerGameplayAction({
    client,
    session,
    snapshot,
    action: { type: 'ACKNOWLEDGE_HANDOFF' },
  });

  deepEqual(calls, ['applyAction', 'match-1:seat-token']);
  equal(result.snapshot.version, 9);
  equal(result.refreshedAfterConflict, true);
});

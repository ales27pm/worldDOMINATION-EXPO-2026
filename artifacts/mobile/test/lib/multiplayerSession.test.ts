import { equal } from 'node:assert/strict';
import { test } from 'node:test';

import {
  clearMultiplayerSession,
  loadMultiplayerSession,
  MULTIPLAYER_SESSION_KEY,
  saveMultiplayerSession,
  type KeyValueStorage,
} from '../../lib/multiplayerSession';

class MemoryStorage implements KeyValueStorage {
  readonly data = new Map<string, string>();

  async getItem(key: string): Promise<string | null> {
    return this.data.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.data.set(key, value);
  }

  async removeItem(key: string): Promise<void> {
    this.data.delete(key);
  }
}

test('multiplayer reconnect sessions save, load, and clear local seat tokens', async () => {
  const storage = new MemoryStorage();
  const saved = await saveMultiplayerSession(storage, {
    apiBaseUrl: 'https://game.example/api',
    apiAuthToken: 'api-secret',
    matchId: 'm1',
    playerToken: 'secret-token',
    playerId: 1,
    sessionId: 'local-session-0001',
    sessionLabel: 'Ben phone',
  });
  const loaded = await loadMultiplayerSession(storage);

  equal(loaded?.apiBaseUrl, 'https://game.example/api');
  equal(loaded?.apiAuthToken, 'api-secret');
  equal(loaded?.matchId, 'm1');
  equal(loaded?.playerToken, 'secret-token');
  equal(loaded?.playerId, 1);
  equal(loaded?.sessionId, 'local-session-0001');
  equal(loaded?.sessionLabel, 'Ben phone');
  equal(typeof saved.updatedAt, 'string');

  await clearMultiplayerSession(storage);
  equal(await loadMultiplayerSession(storage), null);
});

test('multiplayer reconnect sessions accept legacy records without API auth tokens', async () => {
  const storage = new MemoryStorage();
  await storage.setItem(MULTIPLAYER_SESSION_KEY, JSON.stringify({
    apiBaseUrl: 'https://game.example/api',
    matchId: 'm1',
    playerToken: 'secret-token',
    playerId: 1,
    updatedAt: new Date().toISOString(),
  }));
  const loaded = await loadMultiplayerSession(storage);

  equal(loaded?.apiAuthToken, undefined);
  equal(loaded?.sessionId, undefined);
  equal(loaded?.matchId, 'm1');
});

test('multiplayer reconnect sessions fail closed on malformed storage', async () => {
  const storage = new MemoryStorage();
  await storage.setItem(MULTIPLAYER_SESSION_KEY, JSON.stringify({ matchId: 'm1' }));
  equal(await loadMultiplayerSession(storage), null);

  await storage.setItem(MULTIPLAYER_SESSION_KEY, 'not json');
  equal(await loadMultiplayerSession(storage), null);
});

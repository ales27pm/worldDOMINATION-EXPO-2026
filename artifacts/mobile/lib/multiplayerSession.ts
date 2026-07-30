export const MULTIPLAYER_SESSION_KEY = 'worlddomination.multiplayer.session';

export interface MultiplayerLocalSession {
  apiBaseUrl: string;
  apiAuthToken?: string;
  matchId: string;
  playerToken: string;
  playerId: number;
  sessionId?: string;
  sessionLabel?: string;
  updatedAt: string;
}

export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export async function loadMultiplayerSession(storage: KeyValueStorage): Promise<MultiplayerLocalSession | null> {
  const raw = await storage.getItem(MULTIPLAYER_SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return normalizeSession(parsed);
  } catch {
    return null;
  }
}

export async function saveMultiplayerSession(
  storage: KeyValueStorage,
  session: Omit<MultiplayerLocalSession, 'updatedAt'>,
): Promise<MultiplayerLocalSession> {
  const value: MultiplayerLocalSession = {
    ...session,
    updatedAt: new Date().toISOString(),
  };
  await storage.setItem(MULTIPLAYER_SESSION_KEY, JSON.stringify(value));
  return value;
}

export async function clearMultiplayerSession(storage: KeyValueStorage): Promise<void> {
  await storage.removeItem(MULTIPLAYER_SESSION_KEY);
}

function normalizeSession(value: unknown): MultiplayerLocalSession | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.apiBaseUrl !== 'string' ||
    typeof record.matchId !== 'string' ||
    typeof record.playerToken !== 'string' ||
    typeof record.playerId !== 'number' ||
    typeof record.updatedAt !== 'string' ||
    (record.apiAuthToken !== undefined && typeof record.apiAuthToken !== 'string') ||
    (record.sessionId !== undefined && typeof record.sessionId !== 'string') ||
    (record.sessionLabel !== undefined && typeof record.sessionLabel !== 'string')
  ) {
    return null;
  }
  if (
    !record.apiBaseUrl.trim() ||
    !record.matchId.trim() ||
    !record.playerToken.trim() ||
    !Number.isInteger(record.playerId)
  ) {
    return null;
  }
  return {
    apiBaseUrl: record.apiBaseUrl,
    ...(typeof record.apiAuthToken === 'string' && record.apiAuthToken.trim()
      ? { apiAuthToken: record.apiAuthToken.trim() }
      : {}),
    matchId: record.matchId,
    playerToken: record.playerToken,
    playerId: record.playerId,
    ...(typeof record.sessionId === 'string' && record.sessionId.trim()
      ? { sessionId: record.sessionId.trim() }
      : {}),
    ...(typeof record.sessionLabel === 'string' && record.sessionLabel.trim()
      ? { sessionLabel: record.sessionLabel.trim() }
      : {}),
    updatedAt: record.updatedAt,
  };
}

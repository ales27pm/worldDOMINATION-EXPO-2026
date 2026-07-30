import type { GameAction, GameSetup, GameState } from '@/game/types';

export interface MultiplayerSeat {
  playerId: number;
  claimed: boolean;
  playerName: string;
  isHuman: boolean;
  invited: boolean;
  invitedUserId: string | null;
  invitedByPlayerId: number | null;
  sessionBound: boolean;
  sessionId: string | null;
  sessionLabel: string | null;
  userBound: boolean;
  userId: string | null;
  lastSeenAt: string | null;
}

export interface MultiplayerSnapshot {
  id: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  seats: MultiplayerSeat[];
  you: number | null;
  state: GameState;
}

export type MultiplayerMatchListStatus = 'all' | 'joinable' | 'active' | 'finished';
export type MultiplayerMatchListScope = 'public' | 'mine';

export interface MultiplayerMatchSummary {
  id: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  lobbyStatus: Exclude<MultiplayerMatchListStatus, 'all'>;
  phase: GameState['phase'];
  turn: number;
  objective: GameSetup['objective'];
  turnStyle: NonNullable<GameSetup['turnStyle']>;
  currentPlayer: number;
  currentPlayerName: string;
  winner: number | null;
  playerCount: number;
  humanSeatCount: number;
  claimedSeatCount: number;
  openSeatCount: number;
  invitedSeatCount: number;
  openHumanSeats: number[];
  seats: {
    playerId: number;
    playerName: string;
    isHuman: boolean;
    claimed: boolean;
    invited: boolean;
  }[];
}

export interface MultiplayerInvitationSummary {
  matchId: string;
  matchVersion: number;
  matchCreatedAt: string;
  matchUpdatedAt: string;
  lobbyStatus: Exclude<MultiplayerMatchListStatus, 'all'>;
  phase: GameState['phase'];
  turn: number;
  objective: GameSetup['objective'];
  turnStyle: NonNullable<GameSetup['turnStyle']>;
  playerId: number;
  playerName: string;
  invitedByPlayerId: number;
  invitedByPlayerName: string;
  createdAt: string;
}

export interface MultiplayerContactSummary {
  userId: string;
  displayName: string | null;
}

export interface MultiplayerSessionResponse {
  snapshot: MultiplayerSnapshot;
  playerToken: string;
  sessionId?: string | null;
}

export interface MultiplayerQuickMatchResponse extends MultiplayerSessionResponse {
  matchSource: 'created' | 'joined';
}

export interface MultiplayerSeatInvitation {
  playerId: number;
  invitedUserId: string;
  invitedByPlayerId: number;
  invitedByUserId?: string;
  createdAt: string;
}

export interface MultiplayerSeatInvitationResponse {
  snapshot: MultiplayerSnapshot;
  invitation: MultiplayerSeatInvitation;
}

export interface MultiplayerClient {
  createMatch(input: {
    setup: GameSetup;
    hostPlayerId?: number;
    sessionId?: string;
    sessionLabel?: string;
  }): Promise<MultiplayerSessionResponse>;
  quickMatch(input: {
    setup: GameSetup;
    playerName?: string;
    sessionId?: string;
    sessionLabel?: string;
  }): Promise<MultiplayerQuickMatchResponse>;
  joinMatch(matchId: string, input: {
    playerId: number;
    playerName?: string;
    sessionId?: string;
    sessionLabel?: string;
  }): Promise<MultiplayerSessionResponse>;
  inviteSeat(matchId: string, input: {
    playerToken: string;
    sessionId?: string;
    playerId: number;
    invitedUserId: string;
  }): Promise<MultiplayerSeatInvitationResponse>;
  getSnapshot(matchId: string, playerToken?: string): Promise<MultiplayerSnapshot>;
  applyAction(matchId: string, input: {
    playerToken: string;
    sessionId?: string;
    expectedVersion: number;
    action: GameAction;
  }): Promise<MultiplayerSnapshot>;
  listMatches(options?: {
    limit?: number;
    status?: MultiplayerMatchListStatus;
    scope?: MultiplayerMatchListScope;
  }): Promise<MultiplayerMatchSummary[]>;
  listContacts(): Promise<MultiplayerContactSummary[]>;
  listInvitations(options?: { limit?: number }): Promise<MultiplayerInvitationSummary[]>;
  watchInvitations(
    onInvitations: (invitations: MultiplayerInvitationSummary[]) => void,
    onError?: (error: unknown) => void,
    options?: MultiplayerInvitationWatchOptions,
  ): MultiplayerInvitationSubscription;
  watchSnapshot(
    matchId: string,
    playerToken: string,
    onSnapshot: (snapshot: MultiplayerSnapshot) => void,
    onError?: (error: unknown) => void,
    options?: MultiplayerWatchOptions,
  ): MultiplayerSnapshotSubscription;
}

export interface MultiplayerApiErrorBody {
  error?: string;
  message?: string;
}

export class MultiplayerApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type IntervalId = ReturnType<typeof setInterval>;

export interface MultiplayerClientOptions {
  apiAuthToken?: string | null;
}

export interface MultiplayerSnapshotSubscription {
  mode: 'websocket' | 'events' | 'polling';
  close(): void;
}

export interface MultiplayerInvitationSubscription {
  mode: 'events' | 'polling';
  close(): void;
}

export interface MultiplayerWatchOptions {
  intervalMs?: number;
  webSocketFactory?: WebSocketFactory | null;
  eventSourceFactory?: EventSourceFactory | null;
  setIntervalImpl?: typeof setInterval;
  clearIntervalImpl?: typeof clearInterval;
}

export interface MultiplayerInvitationWatchOptions {
  limit?: number;
  intervalMs?: number;
  eventSourceFactory?: EventSourceFactory | null;
  setIntervalImpl?: typeof setInterval;
  clearIntervalImpl?: typeof clearInterval;
}

export interface WebSocketLike {
  onmessage: ((event: { data: string }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  close(): void;
}

export type WebSocketFactory = (url: string) => WebSocketLike | null;

export interface EventSourceLike {
  onmessage: ((event: { data: string }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  addEventListener?: (type: string, listener: (event: { data: string }) => void) => void;
  close(): void;
}

export type EventSourceFactory = (url: string) => EventSourceLike | null;

export function defaultMultiplayerApiBaseUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (configured) {
    return normalizeApiBaseUrl(configured);
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return normalizeApiBaseUrl(window.location.origin);
  }
  return '';
}

export function defaultMultiplayerApiAuthToken(): string {
  return normalizeApiAuthToken(process.env.EXPO_PUBLIC_MULTIPLAYER_API_AUTH_TOKEN);
}

export function createMultiplayerClientSessionId(): string {
  const cryptoApi = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (cryptoApi?.randomUUID) {
    return cryptoApi.randomUUID();
  }
  return `session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function normalizeApiBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
}

export function webSocketUrlFromApiBaseUrl(
  apiBaseUrl: string,
  matchId: string,
  playerToken: string,
  apiAuthToken?: string | null,
): string {
  const base = normalizeApiBaseUrl(apiBaseUrl);
  const path = `/multiplayer/matches/${encodeURIComponent(matchId)}/socket?${snapshotQuery(playerToken, apiAuthToken)}`;
  const origin = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : undefined;
  try {
    const url = origin ? new URL(`${base}${path}`, origin) : new URL(`${base}${path}`);
    if (url.protocol === 'http:') {
      url.protocol = 'ws:';
    } else if (url.protocol === 'https:') {
      url.protocol = 'wss:';
    }
    return url.toString();
  } catch {
    return `${base}${path}`;
  }
}

export function createMultiplayerClient(
  apiBaseUrl: string,
  fetchImpl: FetchLike = fetch,
  options: MultiplayerClientOptions = {},
): MultiplayerClient {
  const base = normalizeApiBaseUrl(apiBaseUrl);
  if (!base) {
    throw new MultiplayerApiError(0, 'MISSING_API_BASE_URL', 'API base URL is required.');
  }
  const apiAuthToken = normalizeApiAuthToken(options.apiAuthToken ?? defaultMultiplayerApiAuthToken());

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetchImpl(`${base}${path}`, {
      ...init,
      headers: {
        accept: 'application/json',
        ...(apiAuthToken ? { authorization: `Bearer ${apiAuthToken}` } : {}),
        ...(init.body ? { 'content-type': 'application/json' } : {}),
        ...init.headers,
      },
    });
    const payload = await readJson(response);
    if (!response.ok) {
      const body = payload as MultiplayerApiErrorBody | null;
      throw new MultiplayerApiError(
        response.status,
        body?.error ?? 'MULTIPLAYER_API_ERROR',
        body?.message ?? `Multiplayer API request failed with status ${response.status}.`,
      );
    }
    return payload as T;
  }

  function getSnapshot(matchId: string, playerToken?: string): Promise<MultiplayerSnapshot> {
    const query = playerToken ? `?playerToken=${encodeURIComponent(playerToken)}` : '';
    return request(`/multiplayer/matches/${encodeURIComponent(matchId)}${query}`);
  }

  function listInvitations(options: { limit?: number } = {}): Promise<MultiplayerInvitationSummary[]> {
    return request(`/multiplayer/invitations${limitQuery(options.limit)}`);
  }

  return {
    createMatch(input) {
      return request('/multiplayer/matches', {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    quickMatch(input) {
      return request('/multiplayer/quick-match', {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    joinMatch(matchId, input) {
      return request(`/multiplayer/matches/${encodeURIComponent(matchId)}/join`, {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    inviteSeat(matchId, input) {
      return request(`/multiplayer/matches/${encodeURIComponent(matchId)}/invitations`, {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    getSnapshot(matchId, playerToken) {
      return getSnapshot(matchId, playerToken);
    },
    applyAction(matchId, input) {
      return request(`/multiplayer/matches/${encodeURIComponent(matchId)}/actions`, {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    listMatches(options = {}) {
      return request(`/multiplayer/matches${matchListQuery(options)}`);
    },
    listContacts() {
      return request('/multiplayer/contacts');
    },
    listInvitations(options = {}) {
      return listInvitations(options);
    },
    watchInvitations(onInvitations, onError, options = {}) {
      const streamUrl = `${base}/multiplayer/invitations/events${invitationEventsQuery(options.limit, apiAuthToken)}`;
      const factory = options.eventSourceFactory === undefined ? defaultEventSourceFactory : options.eventSourceFactory;
      const source = factory?.(streamUrl);
      if (source) {
        const handleMessage = (event: { data: string }) => {
          try {
            onInvitations(JSON.parse(event.data) as MultiplayerInvitationSummary[]);
          } catch (error) {
            onError?.(error);
          }
        };
        if (source.addEventListener) {
          source.addEventListener('invitations', handleMessage);
        }
        source.onmessage = handleMessage;
        source.onerror = (error) => onError?.(error);
        return {
          mode: 'events',
          close: () => source.close(),
        };
      }

      let closed = false;
      const intervalMs = options.intervalMs ?? 5000;
      const setIntervalImpl = options.setIntervalImpl ?? setInterval;
      const clearIntervalImpl = options.clearIntervalImpl ?? clearInterval;
      const refresh = async () => {
        try {
          const invitations = await listInvitations({ limit: options.limit });
          if (!closed) onInvitations(invitations);
        } catch (error) {
          if (!closed) onError?.(error);
        }
      };
      const intervalId: IntervalId = setIntervalImpl(refresh, intervalMs);
      void refresh();
      return {
        mode: 'polling',
        close: () => {
          closed = true;
          clearIntervalImpl(intervalId);
        },
      };
    },
    watchSnapshot(matchId, playerToken, onSnapshot, onError, options = {}) {
      const socketUrl = webSocketUrlFromApiBaseUrl(base, matchId, playerToken, apiAuthToken);
      const socketFactory = options.webSocketFactory === undefined ? defaultWebSocketFactory : options.webSocketFactory;
      let socket: WebSocketLike | null = null;
      try {
        socket = socketFactory?.(socketUrl) ?? null;
      } catch (error) {
        onError?.(error);
      }
      if (socket) {
        socket.onmessage = (event) => {
          try {
            onSnapshot(JSON.parse(event.data) as MultiplayerSnapshot);
          } catch (error) {
            onError?.(error);
          }
        };
        socket.onerror = (error) => onError?.(error);
        return {
          mode: 'websocket',
          close: () => socket.close(),
        };
      }

      const streamUrl = `${base}/multiplayer/matches/${encodeURIComponent(matchId)}/events?${snapshotQuery(playerToken, apiAuthToken)}`;
      const factory = options.eventSourceFactory === undefined ? defaultEventSourceFactory : options.eventSourceFactory;
      const source = factory?.(streamUrl);
      if (source) {
        const handleMessage = (event: { data: string }) => {
          try {
            onSnapshot(JSON.parse(event.data) as MultiplayerSnapshot);
          } catch (error) {
            onError?.(error);
          }
        };
        if (source.addEventListener) {
          source.addEventListener('snapshot', handleMessage);
        }
        source.onmessage = handleMessage;
        source.onerror = (error) => onError?.(error);
        return {
          mode: 'events',
          close: () => source.close(),
        };
      }

      let closed = false;
      const intervalMs = options.intervalMs ?? 3000;
      const setIntervalImpl = options.setIntervalImpl ?? setInterval;
      const clearIntervalImpl = options.clearIntervalImpl ?? clearInterval;
      const refresh = async () => {
        try {
          const snapshot = await getSnapshot(matchId, playerToken);
          if (!closed) onSnapshot(snapshot);
        } catch (error) {
          if (!closed) onError?.(error);
        }
      };
      const intervalId: IntervalId = setIntervalImpl(refresh, intervalMs);
      void refresh();
      return {
        mode: 'polling',
        close: () => {
          closed = true;
          clearIntervalImpl(intervalId);
        },
      };
    },
  };
}

function limitQuery(limit: number | undefined): string {
  return Number.isInteger(limit) ? `?limit=${limit}` : '';
}

function matchListQuery(options: {
  limit?: number;
  status?: MultiplayerMatchListStatus;
  scope?: MultiplayerMatchListScope;
}): string {
  const params: string[] = [];
  if (Number.isInteger(options.limit)) {
    params.push(`limit=${options.limit}`);
  }
  if (options.status && options.status !== 'all') {
    params.push(`status=${encodeURIComponent(options.status)}`);
  }
  if (options.scope && options.scope !== 'public') {
    params.push(`scope=${encodeURIComponent(options.scope)}`);
  }
  return params.length ? `?${params.join('&')}` : '';
}

function invitationEventsQuery(limit: number | undefined, apiAuthToken?: string | null): string {
  const params: string[] = [];
  if (Number.isInteger(limit)) {
    params.push(`limit=${limit}`);
  }
  const normalizedAuthToken = normalizeApiAuthToken(apiAuthToken);
  if (normalizedAuthToken) {
    params.push(`apiAuthToken=${encodeURIComponent(normalizedAuthToken)}`);
  }
  return params.length ? `?${params.join('&')}` : '';
}

function snapshotQuery(playerToken: string, apiAuthToken?: string | null): string {
  const parts = [`playerToken=${encodeURIComponent(playerToken)}`];
  const normalizedAuthToken = normalizeApiAuthToken(apiAuthToken);
  if (normalizedAuthToken) {
    parts.push(`apiAuthToken=${encodeURIComponent(normalizedAuthToken)}`);
  }
  return parts.join('&');
}

function normalizeApiAuthToken(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

function defaultWebSocketFactory(url: string): WebSocketLike | null {
  const WebSocketCtor = (globalThis as { WebSocket?: new (url: string) => WebSocketLike }).WebSocket;
  return WebSocketCtor ? new WebSocketCtor(url) : null;
}

function defaultEventSourceFactory(url: string): EventSourceLike | null {
  const EventSourceCtor = (globalThis as { EventSource?: new (url: string) => EventSourceLike }).EventSource;
  return EventSourceCtor ? new EventSourceCtor(url) : null;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (response.ok) return text;
    return { error: 'INVALID_JSON', message: text };
  }
}

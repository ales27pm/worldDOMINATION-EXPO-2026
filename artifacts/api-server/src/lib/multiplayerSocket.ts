import type { IncomingMessage, Server as HttpServer } from "node:http";
import type { Duplex } from "node:stream";

import { WebSocket, WebSocketServer } from "ws";

import {
  MultiplayerAuthority,
  MultiplayerError,
  multiplayerAuthority,
  type MultiplayerSnapshot,
} from "./multiplayerAuthority";
import {
  identityTokenFromSearchParams,
  resolveConfiguredSocketIdentityHeaders,
} from "./accountIdentity";
import {
  authTokenFromSearchParams,
  configuredMultiplayerApiAuthToken,
  configuredMultiplayerRequireTrustedUser,
  isMultiplayerApiAuthorized,
  trustedMultiplayerUserIdFromHeaders,
} from "./multiplayerAuth";

export interface MultiplayerSocketRequest {
  matchId: string;
  playerToken?: string;
  apiAuthToken?: string;
  identityToken?: string;
  userId?: string;
}

export interface MultiplayerSocketOptions {
  apiAuthToken?: string;
  pollIntervalMs?: number;
  requireTrustedUser?: boolean;
}

export function attachMultiplayerWebSocketServer(
  server: HttpServer,
  authority: MultiplayerAuthority = multiplayerAuthority,
  options: MultiplayerSocketOptions = {},
): WebSocketServer {
  const socketServer = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    void handleMultiplayerSocketUpgrade(socketServer, authority, options, request, socket, head);
  });

  return socketServer;
}

async function handleMultiplayerSocketUpgrade(
  socketServer: WebSocketServer,
  authority: MultiplayerAuthority,
  options: MultiplayerSocketOptions,
  request: IncomingMessage,
  socket: Duplex,
  head: Buffer,
): Promise<void> {
  const socketRequest = multiplayerSocketRequest(request.url);
  if (!socketRequest) {
    return;
  }
  const requiredAuthToken = options.apiAuthToken ?? configuredMultiplayerApiAuthToken();
  if (!isMultiplayerApiAuthorized(socketRequest.apiAuthToken, requiredAuthToken)) {
    socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
    socket.destroy();
    return;
  }
  let headers = request.headers;
  try {
    headers = await resolveConfiguredSocketIdentityHeaders(request.headers, socketRequest.identityToken);
  } catch {
    socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
    socket.destroy();
    return;
  }
  const userId = trustedMultiplayerUserIdFromHeaders(headers);
  const requireTrustedUser = options.requireTrustedUser ?? configuredMultiplayerRequireTrustedUser();
  if (requireTrustedUser && !userId) {
    socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
    socket.destroy();
    return;
  }
  if (userId) socketRequest.userId = userId;

  const pollIntervalMs = options.pollIntervalMs ?? configuredMultiplayerSocketPollIntervalMs();
  socketServer.handleUpgrade(request, socket, head, (webSocket) => {
    void streamMultiplayerSnapshots(webSocket, socketRequest, authority, pollIntervalMs);
  });
}

export function multiplayerSocketRequest(rawUrl: string | undefined): MultiplayerSocketRequest | null {
  if (!rawUrl) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(rawUrl, "http://localhost");
  } catch {
    return null;
  }

  const match = /^\/api\/multiplayer\/matches\/([^/]+)\/socket$/.exec(url.pathname);
  const encodedMatchId = match?.[1];
  if (!encodedMatchId) {
    return null;
  }

  try {
    const socketRequest: MultiplayerSocketRequest = {
      matchId: decodeURIComponent(encodedMatchId),
      playerToken: url.searchParams.get("playerToken") ?? undefined,
    };
    const apiAuthToken = authTokenFromSearchParams(url.searchParams);
    if (apiAuthToken) {
      socketRequest.apiAuthToken = apiAuthToken;
    }
    const identityToken = identityTokenFromSearchParams(url.searchParams);
    if (identityToken) {
      socketRequest.identityToken = identityToken;
    }
    return socketRequest;
  } catch {
    return null;
  }
}

async function streamMultiplayerSnapshots(
  webSocket: WebSocket,
  socketRequest: MultiplayerSocketRequest,
  authority: MultiplayerAuthority,
  pollIntervalMs = 0,
): Promise<void> {
  let unsubscribe: (() => void) | null = null;
  let pollTimer: NodeJS.Timeout | null = null;
  let closed = false;
  let lastSentVersion: number | null = null;
  const closeSubscription = () => {
    closed = true;
    unsubscribe?.();
    unsubscribe = null;
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  };
  const sendLatestSnapshot = async (force = false) => {
    if (closed || webSocket.readyState !== WebSocket.OPEN) {
      return;
    }
    const snapshot = await authority.snapshot(socketRequest.matchId, socketRequest.playerToken, socketRequest.userId);
    if (force || snapshot.version !== lastSentVersion) {
      lastSentVersion = snapshot.version;
      sendSnapshot(webSocket, snapshot);
    }
  };

  webSocket.on("close", closeSubscription);

  try {
    unsubscribe = authority.subscribe(socketRequest.matchId, () => {
      void sendLatestSnapshot().catch((error) => {
        sendSocketError(webSocket, error);
        webSocket.close(1011);
      });
    });
    if (pollIntervalMs > 0) {
      pollTimer = setInterval(() => {
        void sendLatestSnapshot().catch((error) => {
          sendSocketError(webSocket, error);
          webSocket.close(1011);
        });
      }, pollIntervalMs);
    }
    await sendLatestSnapshot(true);
  } catch (error) {
    closeSubscription();
    sendSocketError(webSocket, error);
    webSocket.close(error instanceof MultiplayerError ? 1008 : 1011);
  }
}

function configuredMultiplayerSocketPollIntervalMs(): number {
  const raw = process.env.MULTIPLAYER_SOCKET_POLL_INTERVAL_MS;
  if (!raw) {
    return 0;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return Math.min(Math.trunc(value), 60_000);
}

function sendSnapshot(webSocket: WebSocket, snapshot: MultiplayerSnapshot): void {
  if (webSocket.readyState === WebSocket.OPEN) {
    webSocket.send(JSON.stringify(snapshot));
  }
}

function sendSocketError(webSocket: WebSocket, error: unknown): void {
  if (webSocket.readyState !== WebSocket.OPEN) {
    return;
  }

  const body = error instanceof MultiplayerError
    ? { type: "error", error: error.code, message: error.message, status: error.status }
    : {
        type: "error",
        error: "MULTIPLAYER_SOCKET_ERROR",
        message: "Multiplayer socket failed.",
        status: 500,
      };
  webSocket.send(JSON.stringify(body));
}

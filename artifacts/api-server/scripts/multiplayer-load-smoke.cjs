#!/usr/bin/env node

const { WebSocket } = require("ws");

let config;

main().catch((error) => {
  console.error(`[multiplayer-load-smoke] ${error.message}`);
  process.exitCode = 1;
});

async function main() {
  config = readConfig();
  if (!config.apiBaseUrl) {
    throw new Error(
      "MULTIPLAYER_SMOKE_API_BASE_URL is required, for example http://127.0.0.1:4317/api",
    );
  }

  console.log(
    `[multiplayer-load-smoke] target=${config.apiBaseUrl} rounds=${config.rounds} timeoutMs=${config.timeoutMs}`,
  );

  const summaries = [];
  for (let round = 1; round <= config.rounds; round += 1) {
    summaries.push(await runRound(round));
  }

  const joinedExisting = summaries.filter((summary) => summary.quickMatchJoinedExisting).length;
  const fallbackCreated = summaries.filter((summary) => summary.quickMatchCreatedFallback).length;
  const scopedLobbyVerified = summaries.filter((summary) => summary.scopedLobbyVerified).length;
  console.log(
    `[multiplayer-load-smoke] success rounds=${summaries.length} joinedExisting=${joinedExisting} fallbackCreated=${fallbackCreated} scopedLobbyVerified=${scopedLobbyVerified}`,
  );
}

async function runRound(round) {
  const label = `smoke-${Date.now()}-${process.pid}-${round}`;
  const users = {
    host: `${label}-host-user`,
    contenderA: `${label}-contender-a-user`,
    contenderB: `${label}-contender-b-user`,
  };
  const sessions = {
    host: `${label}-host-session`,
    contenderA: `${label}-contender-a-session`,
    contenderB: `${label}-contender-b-session`,
  };

  let hostSocket = null;
  let joinSocket = null;

  try {
    const gameSetup = setup(label);
    const expectedJoinPlayerId = gameSetup.players.findIndex((player, index) => index !== 0 && player.isHuman);
    const created = await apiRequest("/multiplayer/matches", {
      method: "POST",
      userId: users.host,
      body: {
        setup: gameSetup,
        hostPlayerId: 0,
        sessionId: sessions.host,
        sessionLabel: "Smoke host",
      },
    });
    assert(created.snapshot?.you === 0, "host seat was not claimed by player 0");
    assertSecretRedacted(created.snapshot, created.playerToken, "created snapshot");

    hostSocket = multiplayerSocket(created.snapshot.id, created.playerToken, users.host);
    const hostInitial = await readSocketSnapshot(hostSocket);
    assert(hostInitial.version === created.snapshot.version, "host socket did not receive the created version");
    assert(hostInitial.you === 0, "host socket did not identify the host viewer");

    const [contenderA, contenderB] = await Promise.all([
      apiRequest("/multiplayer/quick-match", {
        method: "POST",
        userId: users.contenderA,
        body: {
          setup: gameSetup,
          playerName: "Smoke B",
          sessionId: sessions.contenderA,
          sessionLabel: "Smoke contender A",
        },
      }),
      apiRequest("/multiplayer/quick-match", {
        method: "POST",
        userId: users.contenderB,
        body: {
          setup: gameSetup,
          playerName: "Smoke C",
          sessionId: sessions.contenderB,
          sessionLabel: "Smoke contender B",
        },
      }),
    ]);

    const contenders = [
      { key: "contenderA", result: contenderA },
      { key: "contenderB", result: contenderB },
    ];
    const joinedExisting = contenders.filter(
      ({ result }) => result.matchSource === "joined" && result.snapshot?.id === created.snapshot.id,
    );
    const fallbackCreated = contenders.filter(
      ({ result }) => result.matchSource === "created" && result.snapshot?.id !== created.snapshot.id,
    );
    const matchedOtherCapacity = contenders.filter(
      ({ result }) => result.matchSource === "joined" && result.snapshot?.id !== created.snapshot.id,
    );
    assert(joinedExisting.length === 1, "quick-match did not claim exactly one public seat on the hosted match");
    assert(
      fallbackCreated.length + matchedOtherCapacity.length === 1,
      "quick-match loser neither created a fallback match nor joined existing compatible capacity",
    );

    const joinedEntry = joinedExisting[0];
    const loserEntry = fallbackCreated[0] ?? matchedOtherCapacity[0];
    const joined = joinedEntry.result;
    const loser = loserEntry.result;
    const joinedUserId = users[joinedEntry.key];
    const joinedSessionId = sessions[joinedEntry.key];
    assert(joined.snapshot.you === expectedJoinPlayerId, "quick-match joined the hosted match as the wrong seat");
    assertSecretRedacted(joined.snapshot, created.playerToken, "joined snapshot against host token");
    assertSecretRedacted(joined.snapshot, joined.playerToken, "joined snapshot against own token");
    assertSecretRedacted(loser.snapshot, loser.playerToken, "quick-match loser snapshot");

    const hostAfterJoin = await readSocketSnapshot(hostSocket);
    assert(hostAfterJoin.version === joined.snapshot.version, "host socket did not receive the joined version");
    assert(
      hostAfterJoin.seats?.[expectedJoinPlayerId]?.claimed === true,
      `host socket snapshot did not show player ${expectedJoinPlayerId} claimed`,
    );

    const activeMatches = await apiRequest("/multiplayer/matches?limit=10&status=active", {
      method: "GET",
      userId: users.host,
    });
    const activeSummary = activeMatches.find((match) => match.id === created.snapshot.id);
    assert(activeSummary, "active match summary was not returned after both seats were claimed");
    assert(activeSummary.claimedSeatCount === 2, "active summary did not report two claimed seats");
    assert(activeSummary.openSeatCount === 0, "active summary still reported an open seat");
    assertSecretRedacted(activeMatches, created.playerToken, "active match list against host token");
    assertSecretRedacted(activeMatches, joined.playerToken, "active match list against joined token");
    assertSecretRedacted(activeMatches, sessions.host, "active match list against host session id");
    assertSecretRedacted(activeMatches, sessions.contenderA, "active match list against joiner session id");
    assertSecretRedacted(activeMatches, sessions.contenderB, "active match list against fallback session id");

    const scopedLobbyVerified = config.trustedUserHeader
      ? await verifyScopedLobby({
        createdMatchId: created.snapshot.id,
        hostToken: created.playerToken,
        joinedToken: joined.playerToken,
        joinedUserId,
        label,
        loserMatchId: loser.snapshot.id,
        loserToken: loser.playerToken,
        loserUserId: users[loserEntry.key],
        sessions,
        users,
      })
      : false;

    joinSocket = multiplayerSocket(created.snapshot.id, joined.playerToken, joinedUserId);
    const joinInitial = await readSocketSnapshot(joinSocket);
    assert(joinInitial.version === joined.snapshot.version, "join socket did not receive the joined version");
    assert(joinInitial.you === expectedJoinPlayerId, "join socket did not identify the joined viewer");

    const ready = await acknowledgeViaRestIfNeeded(
      created.snapshot.id,
      created.playerToken,
      users.host,
      sessions.host,
      joinInitial,
    );
    const watchedReadyHost = ready.version === joinInitial.version ? hostAfterJoin : await readSocketSnapshot(hostSocket);
    const watchedReadyJoin = ready.version === joinInitial.version ? joinInitial : await readSocketSnapshot(joinSocket);
    assert(watchedReadyHost.version === ready.version, "host socket did not observe the ready version");
    assert(watchedReadyJoin.version === ready.version, "join socket did not observe the ready version");

    const currentPlayer = ready.state.currentPlayer;
    const actor = currentPlayer === 1
      ? { token: joined.playerToken, userId: joinedUserId, sessionId: joinedSessionId }
      : { token: created.playerToken, userId: users.host, sessionId: sessions.host };
    const target = ownedTerritory(ready.state, currentPlayer);
    const beforeArmies = ready.state.territories[target].armies;

    const advanced = await apiRequest(`/multiplayer/matches/${ready.id}/actions`, {
      method: "POST",
      userId: actor.userId,
      body: {
        playerToken: actor.token,
        sessionId: actor.sessionId,
        expectedVersion: ready.version,
        action: { type: "DEPLOY", territory: target, count: 1 },
      },
    });
    assert(advanced.version === ready.version + 1, "REST action did not advance the match version");
    assert(
      advanced.state.territories[target].armies === beforeArmies + 1,
      "REST action did not apply through the reducer",
    );

    const hostAfterAction = await readSocketSnapshot(hostSocket);
    const joinAfterAction = await readSocketSnapshot(joinSocket);
    assert(hostAfterAction.version === advanced.version, "host socket did not receive the action version");
    assert(joinAfterAction.version === advanced.version, "join socket did not receive the action version");
    assertSecretRedacted(hostAfterAction, joined.playerToken, "host action snapshot against rival token");
    assertSecretRedacted(joinAfterAction, created.playerToken, "join action snapshot against rival token");

    console.log(
      `[multiplayer-load-smoke] round=${round} match=${created.snapshot.id} loserMatch=${loser.snapshot.id} loserSource=${loser.matchSource} version=${advanced.version}`,
    );

    return {
      quickMatchJoinedExisting: true,
      quickMatchCreatedFallback: fallbackCreated.length === 1,
      scopedLobbyVerified,
    };
  } finally {
    hostSocket?.close();
    joinSocket?.close();
  }
}

async function verifyScopedLobby({
  createdMatchId,
  hostToken,
  joinedToken,
  joinedUserId,
  label,
  loserMatchId,
  loserToken,
  loserUserId,
  sessions,
  users,
}) {
  const [hostMatches, joinedMatches, loserMatches, unrelatedMatches] = await Promise.all([
    apiRequest("/multiplayer/matches?limit=10&scope=mine", { method: "GET", userId: users.host }),
    apiRequest("/multiplayer/matches?limit=10&scope=mine", { method: "GET", userId: joinedUserId }),
    apiRequest("/multiplayer/matches?limit=10&scope=mine", { method: "GET", userId: loserUserId }),
    apiRequest("/multiplayer/matches?limit=10&scope=mine", { method: "GET", userId: `${label}-unrelated-user` }),
  ]);

  assertMatchListed(hostMatches, createdMatchId, "host scoped lobby");
  assertMatchListed(joinedMatches, createdMatchId, "joined scoped lobby");
  assertMatchListed(loserMatches, loserMatchId, "loser scoped lobby");
  assert(unrelatedMatches.length === 0, "unrelated trusted user received scoped lobby matches");

  const scopedLists = [hostMatches, joinedMatches, loserMatches, unrelatedMatches];
  for (const [index, matches] of scopedLists.entries()) {
    const context = `scoped lobby ${index}`;
    assertSecretRedacted(matches, hostToken, context);
    assertSecretRedacted(matches, joinedToken, context);
    assertSecretRedacted(matches, loserToken, context);
    assertSecretRedacted(matches, sessions.host, context);
    assertSecretRedacted(matches, sessions.contenderA, context);
    assertSecretRedacted(matches, sessions.contenderB, context);
    assertSecretRedacted(matches, users.host, context);
    assertSecretRedacted(matches, users.contenderA, context);
    assertSecretRedacted(matches, users.contenderB, context);
  }

  return true;
}

function assertMatchListed(matches, matchId, context) {
  assert(Array.isArray(matches), `${context} response was not an array`);
  assert(matches.some((match) => match.id === matchId), `${context} did not include ${matchId}`);
}

function readConfig() {
  return {
    apiBaseUrl: normalizeApiBaseUrl(process.env.MULTIPLAYER_SMOKE_API_BASE_URL),
    apiAuthToken: process.env.MULTIPLAYER_SMOKE_API_AUTH_TOKEN?.trim() ||
      process.env.MULTIPLAYER_API_AUTH_TOKEN?.trim() ||
      "",
    trustedUserHeader: (
      process.env.MULTIPLAYER_SMOKE_TRUSTED_USER_HEADER ||
      process.env.MULTIPLAYER_TRUSTED_USER_ID_HEADER ||
      ""
    ).trim().toLowerCase(),
    rounds: positiveInteger(process.env.MULTIPLAYER_SMOKE_ROUNDS, 1, "MULTIPLAYER_SMOKE_ROUNDS"),
    timeoutMs: positiveInteger(process.env.MULTIPLAYER_SMOKE_TIMEOUT_MS, 8000, "MULTIPLAYER_SMOKE_TIMEOUT_MS"),
  };
}

function normalizeApiBaseUrl(value) {
  if (!value || !value.trim()) {
    return "";
  }
  const url = new URL(value);
  url.pathname = url.pathname.replace(/\/+$/, "");
  if (!url.pathname.endsWith("/api")) {
    url.pathname = `${url.pathname}/api`.replace(/\/+/g, "/");
  }
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function positiveInteger(rawValue, defaultValue, name) {
  if (rawValue === undefined || rawValue === "") {
    return defaultValue;
  }
  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

function setup(label) {
  const secondHumanIndex = 1 + (hash(label) % 7);
  return {
    players: Array.from({ length: 8 }, (_, index) => ({
      name: index === 0 ? "Smoke A" : index === secondHumanIndex ? "Smoke B" : `Smoke CPU ${index}`,
      colorIdx: index,
      isHuman: index === 0 || index === secondHumanIndex,
      generalId: null,
    })),
    objective: "domination100",
    useExtraTerritories: false,
    allocation: "random",
    cardRule: "ascending",
    turnStyle: "classic",
    restrictedReinforcement: false,
  };
}

function hash(value) {
  let output = 0;
  for (let index = 0; index < value.length; index += 1) {
    output = (output * 31 + value.charCodeAt(index)) >>> 0;
  }
  return output;
}

async function acknowledgeViaRestIfNeeded(matchId, playerToken, userId, sessionId, snapshot) {
  if (!snapshot.state.awaitingHandoff) {
    return snapshot;
  }
  return apiRequest(`/multiplayer/matches/${matchId}/actions`, {
    method: "POST",
    userId,
    body: {
      playerToken,
      sessionId,
      expectedVersion: snapshot.version,
      action: { type: "ACKNOWLEDGE_HANDOFF" },
    },
  });
}

async function apiRequest(path, options) {
  const response = await fetch(`${config.apiBaseUrl}${path}`, {
    method: options.method,
    headers: requestHeaders(options.userId),
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: AbortSignal.timeout(config.timeoutMs),
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`API request ${path} failed with ${response.status}: ${text}`);
  }
  return body;
}

function requestHeaders(userId) {
  const headers = {
    "content-type": "application/json",
  };
  if (config.apiAuthToken) {
    headers.authorization = `Bearer ${config.apiAuthToken}`;
  }
  if (config.trustedUserHeader && userId) {
    headers[config.trustedUserHeader] = userId;
  }
  return headers;
}

function multiplayerSocket(matchId, playerToken, userId) {
  const url = new URL(config.apiBaseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = `/api/multiplayer/matches/${encodeURIComponent(matchId)}/socket`;
  url.searchParams.set("playerToken", playerToken);
  if (config.apiAuthToken) {
    url.searchParams.set("apiAuthToken", config.apiAuthToken);
  }
  return createSocketClient(new WebSocket(url, {
    headers: socketHeaders(userId),
    handshakeTimeout: config.timeoutMs,
  }));
}

function socketHeaders(userId) {
  if (!config.trustedUserHeader || !userId) {
    return {};
  }
  return { [config.trustedUserHeader]: userId };
}

function readSocketSnapshot(socket) {
  return socket.readSnapshot();
}

function createSocketClient(socket) {
  const queue = [];
  const readers = [];
  let closedError = null;

  socket.on("message", (data) => {
    try {
      const parsed = JSON.parse(data.toString());
      if (parsed && parsed.type === "error") {
        deliverError(new Error(`WebSocket error ${parsed.error}: ${parsed.message}`));
        return;
      }
      deliverValue(parsed);
    } catch (error) {
      deliverError(error);
    }
  });
  socket.on("error", (error) => {
    deliverError(error);
  });
  socket.on("close", (code, reason) => {
    closedError = new Error(`WebSocket closed before snapshot: ${code} ${reason.toString()}`.trim());
    while (readers.length > 0) {
      const reader = readers.shift();
      clearTimeout(reader.timer);
      reader.reject(closedError);
    }
  });

  return {
    close() {
      socket.close();
    },
    readSnapshot() {
      if (queue.length > 0) {
        return Promise.resolve(queue.shift());
      }
      if (closedError) {
        return Promise.reject(closedError);
      }
      return waitForSnapshot();
    },
  };

  function deliverValue(value) {
    const reader = readers.shift();
    if (reader) {
      clearTimeout(reader.timer);
      reader.resolve(value);
      return;
    }
    queue.push(value);
  }

  function deliverError(error) {
    closedError = error;
    while (readers.length > 0) {
      const reader = readers.shift();
      clearTimeout(reader.timer);
      reader.reject(error);
    }
  }

  function waitForSnapshot() {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const index = readers.findIndex((reader) => reader.reject === reject);
        if (index >= 0) {
          readers.splice(index, 1);
        }
        reject(new Error("Timed out waiting for multiplayer WebSocket snapshot."));
      }, config.timeoutMs);
      readers.push({ resolve, reject, timer });
    });
  }
}

function ownedTerritory(state, playerId) {
  const target = state.activeIds.find((id) => state.territories[id]?.owner === playerId);
  assert(target, `no owned territory found for player ${playerId}`);
  return target;
}

function assertSecretRedacted(value, secret, context) {
  if (!secret) {
    return;
  }
  assert(!JSON.stringify(value).includes(secret), `${context} leaked a secret token or session id`);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

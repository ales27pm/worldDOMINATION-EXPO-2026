import assert from "node:assert/strict";
import { createSign, generateKeyPairSync, type KeyObject } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { createServer, type ClientRequest, type IncomingMessage, type Server as HttpServer } from "node:http";
import { createRequire } from "node:module";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import express from "express";
import { WebSocket, type RawData, type WebSocketServer } from "ws";

import {
  ACCOUNT_CONTACT_INVALID_ERROR,
  type AccountDirectoryQueryClient,
  InMemoryAccountDirectoryStore,
  PostgresAccountDirectoryStore,
  setAccountDirectoryStoreForTests,
} from "../src/lib/accountDirectory";
import {
  clearOidcJwksCacheForTests,
  MULTIPLAYER_IDENTITY_INVALID_ERROR,
  MULTIPLAYER_IDENTITY_REQUIRED_ERROR,
  resolveConfiguredAccountIdentity,
} from "../src/lib/accountIdentity";
import {
  MULTIPLAYER_AUTH_ERROR,
  MULTIPLAYER_TRUSTED_USER_REQUIRED_ERROR,
  requireMultiplayerApiAuth,
} from "../src/lib/multiplayerAuth";
import {
  assertMultiplayerDeploymentPreflight,
  multiplayerDeploymentPreflightErrors,
} from "../src/lib/multiplayerDeploymentPreflight";
import {
  InMemoryMultiplayerMatchStore,
  JsonFileMultiplayerMatchStore,
  MultiplayerAuthority,
  MultiplayerError,
  type MultiplayerMatchStore,
  PostgresMultiplayerMatchStore,
  multiplayerAuthority,
  type MultiplayerMatchRecord,
  type MultiplayerMatchSummary,
  type MultiplayerMatchUpdate,
  type MultiplayerSnapshot,
  type PostgresQueryClient,
} from "../src/lib/multiplayerAuthority";
import {
  createConfiguredMultiplayerInvitationDelivery,
  type MultiplayerInvitationEmailMessage,
  type MultiplayerInvitationDeliveryPayload,
} from "../src/lib/multiplayerInvitationDelivery";
import {
  attachMultiplayerWebSocketServer,
  multiplayerSocketRequest,
} from "../src/lib/multiplayerSocket";
import accountRouter from "../src/routes/account";
import multiplayerRouter from "../src/routes/multiplayer";
import type { GameSetup, GameState, TerritoryId } from "../../mobile/game/types";
import { TERRITORY_MAP } from "../../mobile/game/mapData";

function setup(turnStyle: GameSetup["turnStyle"] = "classic", objective: GameSetup["objective"] = "domination100"): GameSetup {
  return {
    players: [
      { name: "Ada", colorIdx: 0, isHuman: true, generalId: null },
      { name: "Ben", colorIdx: 1, isHuman: true, generalId: null },
    ],
    objective,
    useExtraTerritories: false,
    allocation: "random",
    cardRule: "ascending",
    turnStyle,
    restrictedReinforcement: false,
  };
}

function fourPlayerSetup(
  turnStyle: GameSetup["turnStyle"] = "classic",
  objective: GameSetup["objective"] = "domination100",
): GameSetup {
  return {
    ...setup(turnStyle, objective),
    players: [
      { name: "Ada", colorIdx: 0, isHuman: true, generalId: null },
      { name: "Ben", colorIdx: 1, isHuman: true, generalId: null },
      { name: "Chao", colorIdx: 2, isHuman: true, generalId: null },
      { name: "Dina", colorIdx: 3, isHuman: true, generalId: null },
    ],
  };
}

function ownedBorder(state: GameState, playerId: number, requireSpareArmy: boolean): { from: TerritoryId; to: TerritoryId } {
  for (const from of state.activeIds) {
    const territory = state.territories[from];
    if (territory.owner !== playerId) continue;
    if (requireSpareArmy && territory.armies < 2) continue;
    const to = TERRITORY_MAP[from].neighbors.find(
      (neighbor) => state.activeIds.includes(neighbor) && state.territories[neighbor].owner !== playerId,
    );
    if (to) {
      return { from, to };
    }
  }
  throw new Error(`No border found for player ${playerId}.`);
}

async function errorCode(run: () => unknown | Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    if (error instanceof MultiplayerError) {
      return error.code;
    }
    throw error;
  }
  throw new Error("Expected MultiplayerError.");
}

function ownedTerritory(state: GameState, playerId: number): TerritoryId {
  const target = state.activeIds.find((id) => state.territories[id].owner === playerId);
  if (!target) {
    throw new Error(`No owned territory found for player ${playerId}.`);
  }
  return target;
}

function acknowledgeIfNeeded(
  authority: MultiplayerAuthority,
  matchId: string,
  playerToken: string,
  snapshot: MultiplayerSnapshot,
  sessionId?: string | null,
): Promise<MultiplayerSnapshot> {
  if (!snapshot.state.awaitingHandoff) {
    return Promise.resolve(snapshot);
  }
  return authority.applyAction(matchId, {
    playerToken,
    ...(sessionId ? { sessionId } : {}),
    expectedVersion: snapshot.version,
    action: { type: "ACKNOWLEDGE_HANDOFF" },
  });
}

interface FakePostgresRow {
  id: string;
  version: number;
  created_at: string;
  updated_at: string;
  state: string;
  seats: string;
  invitations: string;
}

interface RealPostgresClient extends PostgresQueryClient {
  release(): void;
}

interface RealPostgresPool {
  connect(): Promise<RealPostgresClient>;
  end(): Promise<void>;
}

type RealPostgresPoolConstructor = new (options: { connectionString?: string }) => RealPostgresPool;

class FakePostgresClient implements PostgresQueryClient {
  readonly statements: string[] = [];
  readonly rows = new Map<string, FakePostgresRow>();

  async query<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values: unknown[] = [],
  ): Promise<{ rows: T[]; rowCount: number }> {
    this.statements.push(text);
    if (/^\s*SELECT\b/i.test(text)) {
      if (!/WHERE id = \$1/i.test(text)) {
        const limit = Number(values[0] ?? this.rows.size);
        const rows = [...this.rows.values()]
          .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
          .slice(0, limit);
        return { rows: rows as unknown as T[], rowCount: rows.length };
      }
      const row = this.rows.get(String(values[0]));
      return { rows: row ? [row as unknown as T] : [], rowCount: row ? 1 : 0 };
    }
    if (/^\s*INSERT\b/i.test(text)) {
      const [id, version, createdAt, updatedAt, state, seats, invitations] = values;
      if (this.rows.has(String(id))) {
        return { rows: [], rowCount: 0 };
      }
      this.rows.set(String(id), {
        id: String(id),
        version: Number(version),
        created_at: String(createdAt),
        updated_at: String(updatedAt),
        state: String(state),
        seats: String(seats),
        invitations: String(invitations),
      });
      return { rows: [], rowCount: 1 };
    }
    if (/^\s*UPDATE\b/i.test(text)) {
      const [id, version, updatedAt, state, seats, invitations, expectedCurrentVersion] = values;
      const current = this.rows.get(String(id));
      if (!current || current.version !== Number(expectedCurrentVersion)) {
        return { rows: [], rowCount: 0 };
      }
      this.rows.set(String(id), {
        ...current,
        version: Number(version),
        updated_at: String(updatedAt),
        state: String(state),
        seats: String(seats),
        invitations: String(invitations),
      });
      return { rows: [], rowCount: 1 };
    }
    if (/^\s*DELETE\b/i.test(text)) {
      const rowCount = this.rows.size;
      this.rows.clear();
      return { rows: [], rowCount };
    }
    return { rows: [], rowCount: 0 };
  }
}

class RejectingExpectedSaveStore extends InMemoryMultiplayerMatchStore {
  rejectExpectedSaves = false;

  override save(match: MultiplayerMatchRecord, expectedCurrentVersion?: number): boolean {
    if (this.rejectExpectedSaves && expectedCurrentVersion !== undefined) {
      return false;
    }
    return super.save(match, expectedCurrentVersion);
  }
}

class CoordinatedReadStore implements MultiplayerMatchStore {
  private readonly delegate = new InMemoryMultiplayerMatchStore();
  private getGate: ReadGate | null = null;
  private listGate: ReadGate | null = null;

  gateNextGets(count: number): void {
    this.getGate = createReadGate(count);
  }

  gateNextLists(count: number): void {
    this.listGate = createReadGate(count);
  }

  async get(matchId: string): Promise<MultiplayerMatchRecord | null> {
    const record = this.delegate.get(matchId);
    await this.getGate?.arrive();
    return record;
  }

  async list(limit: number): Promise<MultiplayerMatchRecord[]> {
    const records = this.delegate.list(limit);
    await this.listGate?.arrive();
    return records;
  }

  save(match: MultiplayerMatchRecord, expectedCurrentVersion?: number): boolean {
    return this.delegate.save(match, expectedCurrentVersion);
  }

  clear(): void {
    this.delegate.clear();
  }
}

interface ReadGate {
  arrive(): Promise<void>;
}

function createReadGate(expectedReads: number): ReadGate {
  let reads = 0;
  let release!: () => void;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    async arrive() {
      reads += 1;
      if (reads >= expectedReads) {
        release();
      }
      await released;
    },
  };
}

function postgresIdentifier(value: string): string {
  return `"${value.replace(/"/g, "\"\"")}"`;
}

test("creates a server-owned match and claims only the host seat", async () => {
  const authority = new MultiplayerAuthority();
  const result = await authority.createMatch({ setup: setup(), hostPlayerId: 0 });

  assert.equal(result.snapshot.version, 1);
  assert.equal(result.snapshot.you, 0);
  assert.equal(result.snapshot.seats[0]?.claimed, true);
  assert.equal(result.snapshot.seats[1]?.claimed, false);
  assert.equal(typeof result.playerToken, "string");
  assert.ok(!JSON.stringify(result.snapshot).includes(result.playerToken));
});

test("joins an open human seat without exposing other player secrets", async () => {
  const authority = new MultiplayerAuthority();
  const created = await authority.createMatch({ setup: setup("classic", "mission"), hostPlayerId: 0 });
  const joined = await authority.joinMatch(created.snapshot.id, { playerId: 1, playerName: "Benedict" });
  const publicSnapshot = await authority.snapshot(created.snapshot.id);

  assert.equal(joined.snapshot.you, 1);
  assert.equal(joined.snapshot.seats[1]?.claimed, true);
  assert.equal(joined.snapshot.state.players[0]?.mission, null);
  assert.notEqual(joined.snapshot.state.players[1]?.mission, null);
  assert.equal(publicSnapshot.state.players[0]?.mission, null);
  assert.equal(publicSnapshot.state.players[1]?.mission, null);
});

test("binds claimed seats to client session identity without exposing rival session IDs", async () => {
  const authority = new MultiplayerAuthority();
  const created = await authority.createMatch({
    setup: setup(),
    hostPlayerId: 0,
    sessionId: "host-session-0001",
    sessionLabel: "Ada browser",
  });
  const joined = await authority.joinMatch(created.snapshot.id, {
    playerId: 1,
    playerName: "Benedict",
    sessionId: "join-session-0001",
    sessionLabel: "Ben phone",
  });
  const hostView = await authority.snapshot(created.snapshot.id, created.playerToken);
  const publicView = await authority.snapshot(created.snapshot.id);

  assert.equal(created.sessionId, "host-session-0001");
  assert.equal(created.snapshot.seats[0]?.sessionBound, true);
  assert.equal(created.snapshot.seats[0]?.sessionId, "host-session-0001");
  assert.equal(created.snapshot.seats[0]?.sessionLabel, "Ada browser");
  assert.equal(joined.sessionId, "join-session-0001");
  assert.equal(joined.snapshot.seats[0]?.sessionId, null);
  assert.equal(joined.snapshot.seats[1]?.sessionId, "join-session-0001");
  assert.equal(hostView.seats[0]?.sessionId, "host-session-0001");
  assert.equal(hostView.seats[1]?.sessionId, null);
  assert.equal(hostView.seats[1]?.sessionLabel, "Ben phone");
  assert.equal(publicView.seats[0]?.sessionId, null);
  assert.equal(publicView.seats[1]?.sessionId, null);
  assert.ok(!JSON.stringify(hostView).includes("join-session-0001"));

  const ready = await acknowledgeIfNeeded(
    authority,
    created.snapshot.id,
    created.playerToken,
    hostView,
    created.sessionId,
  );
  const target = ownedTerritory(ready.state, ready.state.currentPlayer);

  assert.equal(
    await errorCode(() =>
      authority.applyAction(ready.id, {
        playerToken: created.playerToken,
        expectedVersion: ready.version,
        action: { type: "DEPLOY", territory: target, count: 1 },
      }),
    ),
    "SESSION_MISMATCH",
  );
  assert.equal(
    await errorCode(() =>
      authority.applyAction(ready.id, {
        playerToken: created.playerToken,
        sessionId: "wrong-session-0001",
        expectedVersion: ready.version,
        action: { type: "DEPLOY", territory: target, count: 1 },
      }),
    ),
    "SESSION_MISMATCH",
  );

  const after = await authority.applyAction(ready.id, {
    playerToken: created.playerToken,
    sessionId: created.sessionId,
    expectedVersion: ready.version,
    action: { type: "DEPLOY", territory: target, count: 1 },
  });
  assert.equal(after.version, ready.version + 1);
  assert.equal(after.seats[0]?.sessionId, "host-session-0001");
  assert.equal(after.seats[0]?.lastSeenAt, after.updatedAt);
});

test("binds claimed seats to trusted user identity without exposing rival user IDs", async () => {
  const authority = new MultiplayerAuthority();
  const created = await authority.createMatch({
    setup: setup(),
    hostPlayerId: 0,
    userId: "user-ada-0001",
  });
  const joined = await authority.joinMatch(created.snapshot.id, {
    playerId: 1,
    playerName: "Benedict",
    userId: "user-ben-0001",
  });
  const hostView = await authority.snapshot(created.snapshot.id, created.playerToken, "user-ada-0001");
  const publicView = await authority.snapshot(created.snapshot.id);

  assert.equal(created.snapshot.seats[0]?.userBound, true);
  assert.equal(created.snapshot.seats[0]?.userId, "user-ada-0001");
  assert.equal(joined.snapshot.seats[0]?.userId, null);
  assert.equal(joined.snapshot.seats[1]?.userBound, true);
  assert.equal(joined.snapshot.seats[1]?.userId, "user-ben-0001");
  assert.equal(hostView.seats[0]?.userId, "user-ada-0001");
  assert.equal(hostView.seats[1]?.userId, null);
  assert.equal(publicView.seats[0]?.userId, null);
  assert.equal(publicView.seats[1]?.userId, null);
  assert.ok(!JSON.stringify(hostView).includes("user-ben-0001"));

  assert.equal(await errorCode(() => authority.snapshot(created.snapshot.id, created.playerToken)), "USER_MISMATCH");
  assert.equal(
    await errorCode(() => authority.snapshot(created.snapshot.id, created.playerToken, "wrong-user-0001")),
    "USER_MISMATCH",
  );

  const ready = hostView.state.awaitingHandoff
    ? await authority.applyAction(created.snapshot.id, {
        playerToken: created.playerToken,
        userId: "user-ada-0001",
        expectedVersion: hostView.version,
        action: { type: "ACKNOWLEDGE_HANDOFF" },
      })
    : hostView;
  const target = ownedTerritory(ready.state, ready.state.currentPlayer);

  assert.equal(
    await errorCode(() =>
      authority.applyAction(ready.id, {
        playerToken: created.playerToken,
        expectedVersion: ready.version,
        action: { type: "DEPLOY", territory: target, count: 1 },
      }),
    ),
    "USER_MISMATCH",
  );
  assert.equal(
    await errorCode(() =>
      authority.applyAction(ready.id, {
        playerToken: created.playerToken,
        userId: "wrong-user-0001",
        expectedVersion: ready.version,
        action: { type: "DEPLOY", territory: target, count: 1 },
      }),
    ),
    "USER_MISMATCH",
  );

  const after = await authority.applyAction(ready.id, {
    playerToken: created.playerToken,
    userId: "user-ada-0001",
    expectedVersion: ready.version,
    action: { type: "DEPLOY", territory: target, count: 1 },
  });
  assert.equal(after.version, ready.version + 1);
  assert.equal(after.seats[0]?.userId, "user-ada-0001");
  assert.equal(after.seats[0]?.lastSeenAt, after.updatedAt);
});

test("reserves invited seats for matching trusted users without exposing invitee IDs publicly", async () => {
  const authority = new MultiplayerAuthority();
  const created = await authority.createMatch({
    setup: setup(),
    hostPlayerId: 0,
    userId: "user-ada-0001",
  });
  const invited = await authority.inviteSeat(created.snapshot.id, {
    playerToken: created.playerToken,
    userId: "user-ada-0001",
    playerId: 1,
    invitedUserId: "user-ben-0001",
  });
  const publicView = await authority.snapshot(created.snapshot.id);
  const lobby = await authority.listMatches({ limit: 10, status: "joinable" });
  const invitations = await authority.listInvitations({ limit: 10, userId: "user-ben-0001" });
  const otherInvitations = await authority.listInvitations({ limit: 10, userId: "user-chao-0001" });

  assert.equal(invited.invitation.playerId, 1);
  assert.equal(invited.invitation.invitedUserId, "user-ben-0001");
  assert.equal(invited.invitation.invitedByPlayerId, 0);
  assert.equal(invited.invitation.invitedByUserId, "user-ada-0001");
  assert.equal(invited.snapshot.seats[1]?.invited, true);
  assert.equal(invited.snapshot.seats[1]?.invitedUserId, "user-ben-0001");
  assert.equal(publicView.seats[1]?.invited, true);
  assert.equal(publicView.seats[1]?.invitedUserId, null);
  assert.equal(lobby[0]?.invitedSeatCount, 1);
  assert.deepEqual(lobby[0]?.openHumanSeats, []);
  assert.equal(invitations.length, 1);
  assert.equal(invitations[0]?.matchId, created.snapshot.id);
  assert.equal(invitations[0]?.playerId, 1);
  assert.equal(invitations[0]?.playerName, "Ben");
  assert.equal(invitations[0]?.invitedByPlayerId, 0);
  assert.equal(invitations[0]?.invitedByPlayerName, "Ada");
  assert.equal(invitations[0]?.lobbyStatus, "joinable");
  assert.deepEqual(otherInvitations, []);
  assert.ok(!JSON.stringify(publicView).includes("user-ben-0001"));
  assert.ok(!JSON.stringify(lobby).includes("user-ben-0001"));
  assert.ok(!JSON.stringify(invitations).includes("user-ben-0001"));
  assert.ok(!JSON.stringify(invitations).includes(created.playerToken));

  assert.equal(
    await errorCode(() =>
      authority.joinMatch(created.snapshot.id, {
        playerId: 1,
        playerName: "Benedict",
      }),
    ),
    "INVITATION_MISMATCH",
  );
  assert.equal(
    await errorCode(() =>
      authority.joinMatch(created.snapshot.id, {
        playerId: 1,
        playerName: "Benedict",
        userId: "wrong-user-0001",
      }),
    ),
    "INVITATION_MISMATCH",
  );

  const joined = await authority.joinMatch(created.snapshot.id, {
    playerId: 1,
    playerName: "Benedict",
    userId: "user-ben-0001",
  });
  assert.equal(joined.snapshot.seats[1]?.claimed, true);
  assert.equal(joined.snapshot.seats[1]?.invited, false);
  assert.equal(joined.snapshot.seats[1]?.userBound, true);
  assert.equal(joined.snapshot.seats[1]?.userId, "user-ben-0001");
  assert.deepEqual(await authority.listInvitations({ limit: 10, userId: "user-ben-0001" }), []);
});

test("delivers trusted invitation webhooks without leaking tokens or sessions", async () => {
  const requests: Array<{ authorization: string | undefined; body: MultiplayerInvitationDeliveryPayload }> = [];
  const app = express();
  app.use(express.json());
  app.post("/notify", (req, res) => {
    requests.push({
      authorization: req.header("authorization"),
      body: req.body as MultiplayerInvitationDeliveryPayload,
    });
    res.status(202).json({ ok: true });
  });
  const httpServer = createServer(app);
  const port = await listenHttpServer(httpServer);
  const delivery = createConfiguredMultiplayerInvitationDelivery({
    MULTIPLAYER_INVITATION_WEBHOOK_URL: `http://127.0.0.1:${port}/notify`,
    MULTIPLAYER_INVITATION_WEBHOOK_TOKEN: "notify-secret",
    MULTIPLAYER_INVITATION_WEBHOOK_TIMEOUT_MS: "1000",
  } as NodeJS.ProcessEnv);
  assert.ok(delivery);
  const authority = new MultiplayerAuthority(new InMemoryMultiplayerMatchStore(), delivery);

  try {
    const created = await authority.createMatch({
      setup: setup(),
      hostPlayerId: 0,
      sessionId: "host-session-0001",
      sessionLabel: "Ada browser",
      userId: "user-ada-0001",
    });
    await authority.inviteSeat(created.snapshot.id, {
      playerToken: created.playerToken,
      sessionId: "host-session-0001",
      userId: "user-ada-0001",
      playerId: 1,
      invitedUserId: "user-ben-0001",
    });

    assert.equal(requests.length, 1);
    assert.equal(requests[0]?.authorization, "Bearer notify-secret");
    assert.equal(requests[0]?.body.type, "multiplayer.seat_invitation.created");
    assert.equal(requests[0]?.body.schemaVersion, 1);
    assert.equal(requests[0]?.body.match.id, created.snapshot.id);
    assert.equal(requests[0]?.body.match.version, created.snapshot.version + 1);
    assert.equal(requests[0]?.body.match.lobbyStatus, "joinable");
    assert.equal(requests[0]?.body.seat.playerId, 1);
    assert.equal(requests[0]?.body.seat.playerName, "Ben");
    assert.equal(requests[0]?.body.inviter.playerId, 0);
    assert.equal(requests[0]?.body.inviter.playerName, "Ada");
    assert.equal(requests[0]?.body.inviter.userId, "user-ada-0001");
    assert.equal(requests[0]?.body.recipient.userId, "user-ben-0001");
    assert.equal(requests[0]?.body.invitation.createdAt.length, 24);

    const payloadJson = JSON.stringify(requests[0]?.body);
    assert.ok(!payloadJson.includes(created.playerToken));
    assert.ok(!payloadJson.includes("host-session-0001"));
    assert.ok(!payloadJson.includes("Ada browser"));
    assert.ok(!payloadJson.includes("\"state\""));
    assert.ok(!payloadJson.includes("\"cards\""));
    assert.ok(!payloadJson.includes("\"mission\""));
  } finally {
    await closeHttpServer(httpServer);
  }
});

test("delivers trusted invitation emails without leaking tokens or sessions", async () => {
  const messages: MultiplayerInvitationEmailMessage[] = [];
  const transportUrls: string[] = [];
  const delivery = createConfiguredMultiplayerInvitationDelivery({
    MULTIPLAYER_INVITATION_EMAIL_SMTP_URL: "smtp://127.0.0.1:2525",
    MULTIPLAYER_INVITATION_EMAIL_FROM: "worldDOMINATION <invites@example.com>",
    MULTIPLAYER_INVITATION_EMAIL_REPLY_TO: "support@example.com",
    MULTIPLAYER_INVITATION_EMAIL_SUBJECT_PREFIX: "Campaign invite",
    MULTIPLAYER_PUBLIC_APP_URL: "https://game.example/play",
  } as NodeJS.ProcessEnv, {
    createEmailTransport(smtpUrl) {
      transportUrls.push(smtpUrl);
      return {
        sendMail(message) {
          messages.push(message);
        },
      };
    },
  });
  assert.ok(delivery);
  const authority = new MultiplayerAuthority(new InMemoryMultiplayerMatchStore(), delivery);

  const created = await authority.createMatch({
    setup: setup(),
    hostPlayerId: 0,
    sessionId: "host-session-0001",
    sessionLabel: "Ada browser",
    userId: "ada@example.com",
  });
  await authority.inviteSeat(created.snapshot.id, {
    playerToken: created.playerToken,
    sessionId: "host-session-0001",
    userId: "ada@example.com",
    playerId: 1,
    invitedUserId: "ben@example.com",
  });

  assert.deepEqual(transportUrls, ["smtp://127.0.0.1:2525"]);
  assert.equal(messages.length, 1);
  assert.equal(messages[0]?.from, "worldDOMINATION <invites@example.com>");
  assert.equal(messages[0]?.to, "ben@example.com");
  assert.equal(messages[0]?.replyTo, "support@example.com");
  assert.match(messages[0]?.subject ?? "", /Campaign invite invitation from Ada/);
  assert.match(messages[0]?.text ?? "", new RegExp(created.snapshot.id));
  assert.match(messages[0]?.text ?? "", /Player 1 - Ben/);
  assert.match(messages[0]?.text ?? "", /Player 0 - Ada/);
  assert.match(messages[0]?.text ?? "", /https:\/\/game\.example\/multiplayer/);
  assert.match(messages[0]?.html ?? "", /Open the multiplayer command screen/);

  const messageJson = JSON.stringify(messages[0]);
  assert.ok(!messageJson.includes(created.playerToken));
  assert.ok(!messageJson.includes("host-session-0001"));
  assert.ok(!messageJson.includes("Ada browser"));
  assert.ok(!messageJson.includes("\"state\""));
  assert.ok(!messageJson.includes("\"cards\""));
  assert.ok(!messageJson.includes("\"mission\""));
});

test("keeps saved seat invitations when best-effort delivery fails", async () => {
  let attempts = 0;
  const authority = new MultiplayerAuthority(new InMemoryMultiplayerMatchStore(), {
    deliver() {
      attempts += 1;
      throw new Error("notification service unavailable");
    },
  });
  const created = await authority.createMatch({
    setup: setup(),
    hostPlayerId: 0,
    userId: "user-ada-0001",
  });

  const invited = await authority.inviteSeat(created.snapshot.id, {
    playerToken: created.playerToken,
    userId: "user-ada-0001",
    playerId: 1,
    invitedUserId: "user-ben-0001",
  });
  const invitations = await authority.listInvitations({ limit: 10, userId: "user-ben-0001" });

  assert.equal(attempts, 1);
  assert.equal(invited.snapshot.version, created.snapshot.version + 1);
  assert.equal(invited.snapshot.seats[1]?.invited, true);
  assert.equal(invitations.length, 1);
  assert.equal(invitations[0]?.matchId, created.snapshot.id);
});

test("quick matches compatible public seats before creating fallback matches", async () => {
  const authority = new MultiplayerAuthority();
  const created = await authority.createMatch({
    setup: setup("sameTime", "domination60"),
    hostPlayerId: 0,
    sessionId: "host-session-0001",
  });

  const joined = await authority.quickMatch({
    setup: setup("sameTime", "domination60"),
    playerName: "Benedict",
    sessionId: "join-session-0001",
    sessionLabel: "Ben phone",
  });
  const fallback = await authority.quickMatch({
    setup: setup("sameTime", "domination60"),
    playerName: "Chao",
    sessionId: "chao-session-0001",
    sessionLabel: "Chao laptop",
  });

  assert.equal(joined.matchSource, "joined");
  assert.equal(joined.snapshot.id, created.snapshot.id);
  assert.equal(joined.snapshot.you, 1);
  assert.equal(joined.snapshot.seats[1]?.playerName, "Benedict");
  assert.equal(joined.sessionId, "join-session-0001");
  assert.equal(fallback.matchSource, "created");
  assert.notEqual(fallback.snapshot.id, created.snapshot.id);
  assert.equal(fallback.snapshot.you, 0);
  assert.equal(fallback.snapshot.seats[0]?.playerName, "Chao");
  assert.equal(fallback.sessionId, "chao-session-0001");
});

test("quick match ranks compatible lobbies by scarce open seats before recency", async () => {
  const authority = new MultiplayerAuthority();
  const scarce = await authority.createMatch({
    setup: fourPlayerSetup("sameTime", "domination60"),
    hostPlayerId: 0,
    sessionId: "scarce-host-session-0001",
  });
  await authority.joinMatch(scarce.snapshot.id, {
    playerId: 1,
    playerName: "Benedict",
    sessionId: "scarce-join-session-0001",
  });
  await authority.joinMatch(scarce.snapshot.id, {
    playerId: 2,
    playerName: "Chao",
    sessionId: "scarce-join-session-0002",
  });
  await new Promise((resolve) => setTimeout(resolve, 2));
  const broad = await authority.createMatch({
    setup: fourPlayerSetup("sameTime", "domination60"),
    hostPlayerId: 0,
    sessionId: "broad-host-session-0001",
  });

  const joined = await authority.quickMatch({
    setup: fourPlayerSetup("sameTime", "domination60"),
    playerName: "Dina",
    sessionId: "ranked-join-session-0001",
  });
  const scarceSummary = (await authority.listMatches({ limit: 10, status: "active" }))
    .find((summary) => summary.id === scarce.snapshot.id);
  const broadSummary = (await authority.listMatches({ limit: 10, status: "joinable" }))
    .find((summary) => summary.id === broad.snapshot.id);

  assert.equal(joined.matchSource, "joined");
  assert.equal(joined.snapshot.id, scarce.snapshot.id);
  assert.equal(joined.snapshot.you, 3);
  assert.equal(joined.snapshot.seats[3]?.playerName, "Dina");
  assert.equal(joined.sessionId, "ranked-join-session-0001");
  assert.equal(scarceSummary?.openSeatCount, 0);
  assert.deepEqual(broadSummary?.openHumanSeats, [1, 2, 3]);
});

test("quick match leaves trusted invitations reserved", async () => {
  const authority = new MultiplayerAuthority();
  const reserved = await authority.createMatch({
    setup: setup(),
    hostPlayerId: 0,
    userId: "user-ada-0001",
  });
  await authority.inviteSeat(reserved.snapshot.id, {
    playerToken: reserved.playerToken,
    userId: "user-ada-0001",
    playerId: 1,
    invitedUserId: "user-ben-0001",
  });

  const result = await authority.quickMatch({
    setup: setup(),
    playerName: "Chao",
    sessionId: "chao-session-0001",
    userId: "user-chao-0001",
  });
  const lobby = await authority.listMatches({ limit: 10, status: "joinable" });
  const reservedSummary = lobby.find((summary) => summary.id === reserved.snapshot.id);

  assert.equal(result.matchSource, "created");
  assert.notEqual(result.snapshot.id, reserved.snapshot.id);
  assert.equal(result.snapshot.seats[0]?.playerName, "Chao");
  assert.equal(reservedSummary?.invitedSeatCount, 1);
  assert.deepEqual(reservedSummary?.openHumanSeats, []);
});

test("rejects concurrent stale seat claims with version conflicts", async () => {
  const store = new CoordinatedReadStore();
  const authority = new MultiplayerAuthority(store);
  const created = await authority.createMatch({ setup: setup(), hostPlayerId: 0 });
  store.gateNextGets(2);

  const attempts = await Promise.allSettled([
    authority.joinMatch(created.snapshot.id, { playerId: 1, sessionId: "join-session-0001" }),
    authority.joinMatch(created.snapshot.id, { playerId: 1, sessionId: "join-session-0002" }),
  ]);
  const fulfilled = attempts.filter(
    (result): result is PromiseFulfilledResult<Awaited<ReturnType<MultiplayerAuthority["joinMatch"]>>> =>
      result.status === "fulfilled",
  );
  const rejected = attempts.filter((result): result is PromiseRejectedResult => result.status === "rejected");
  const winner = fulfilled[0]?.value;
  assert.ok(winner);

  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  assert.ok(rejected[0]?.reason instanceof MultiplayerError);
  assert.equal(rejected[0].reason.code, "VERSION_CONFLICT");

  const final = await authority.snapshot(created.snapshot.id, winner.playerToken);
  assert.equal(final.version, created.snapshot.version + 1);
  assert.equal(final.seats[1]?.claimed, true);
  assert.equal(final.seats[1]?.sessionId, winner.sessionId);
  assert.ok(["join-session-0001", "join-session-0002"].includes(winner.sessionId ?? ""));
});

test("concurrent quick-match collisions claim one public seat and create one fallback match", async () => {
  const store = new CoordinatedReadStore();
  const authority = new MultiplayerAuthority(store);
  const created = await authority.createMatch({
    setup: setup("sameTime", "domination60"),
    hostPlayerId: 0,
    sessionId: "host-session-0001",
  });
  store.gateNextLists(2);
  store.gateNextGets(2);

  const results = await Promise.all([
    authority.quickMatch({
      setup: setup("sameTime", "domination60"),
      playerName: "Benedict",
      sessionId: "join-session-0001",
    }),
    authority.quickMatch({
      setup: setup("sameTime", "domination60"),
      playerName: "Chao",
      sessionId: "join-session-0002",
    }),
  ]);
  const joined = results.filter((result) => result.matchSource === "joined");
  const fallback = results.filter((result) => result.matchSource === "created");

  assert.equal(joined.length, 1);
  assert.equal(joined[0]?.snapshot.id, created.snapshot.id);
  assert.equal(joined[0]?.snapshot.you, 1);
  assert.equal(fallback.length, 1);
  assert.notEqual(fallback[0]?.snapshot.id, created.snapshot.id);
  assert.equal(fallback[0]?.snapshot.you, 0);

  const existing = await authority.snapshot(created.snapshot.id, joined[0]?.playerToken);
  assert.equal(existing.seats[1]?.claimed, true);
  assert.equal(existing.seats[1]?.sessionId, joined[0]?.sessionId);
});

test("lists redacted multiplayer lobby summaries without tokens or session IDs", async () => {
  const authority = new MultiplayerAuthority();
  const first = await authority.createMatch({
    setup: setup("classic", "mission"),
    hostPlayerId: 0,
    sessionId: "first-session-0001",
    sessionLabel: "Ada browser",
    userId: "first-user-0001",
  });
  await new Promise((resolve) => setTimeout(resolve, 2));
  const second = await authority.createMatch({
    setup: setup("sameTime", "domination60"),
    hostPlayerId: 0,
    sessionId: "second-session-0001",
    sessionLabel: "Ada tablet",
    userId: "second-user-0001",
  });
  await authority.joinMatch(second.snapshot.id, {
    playerId: 1,
    playerName: "Benedict",
    sessionId: "join-session-0001",
    sessionLabel: "Ben phone",
    userId: "join-user-0001",
  });

  const all = await authority.listMatches({ limit: 10 });
  const limited = await authority.listMatches({ limit: 1 });
  const joinable = await authority.listMatches({ limit: 10, status: "joinable" });
  const active = await authority.listMatches({ limit: 10, status: "active" });
  const finished = await authority.listMatches({ limit: 10, status: "finished" });
  const secondSummary = all.find((summary) => summary.id === second.snapshot.id);
  assert.ok(secondSummary);

  assert.equal(all.length, 2);
  assert.equal(limited.length, 1);
  assert.equal(limited[0]?.id, second.snapshot.id);
  assert.deepEqual(joinable.map((summary) => summary.id), [first.snapshot.id]);
  assert.deepEqual(active.map((summary) => summary.id), [second.snapshot.id]);
  assert.deepEqual(finished, []);
  assert.equal(await errorCode(() => authority.listMatches({ limit: 10, status: "pending" })), "INVALID_REQUEST");
  assert.equal(secondSummary.version, 2);
  assert.equal(secondSummary.lobbyStatus, "active");
  assert.equal(secondSummary.turnStyle, "sameTime");
  assert.equal(secondSummary.objective, "domination60");
  assert.equal(secondSummary.claimedSeatCount, 2);
  assert.equal(secondSummary.openSeatCount, 0);
  assert.deepEqual(secondSummary.openHumanSeats, []);
  assert.deepEqual(
    secondSummary.seats.map((seat) => ({ playerId: seat.playerId, claimed: seat.claimed, playerName: seat.playerName })),
    [
      { playerId: 0, claimed: true, playerName: "Ada" },
      { playerId: 1, claimed: true, playerName: "Benedict" },
    ],
  );
  const lobbyJson = JSON.stringify(all);
  assert.ok(!lobbyJson.includes(first.playerToken));
  assert.ok(!lobbyJson.includes(second.playerToken));
  assert.ok(!lobbyJson.includes("first-session-0001"));
  assert.ok(!lobbyJson.includes("second-session-0001"));
  assert.ok(!lobbyJson.includes("join-session-0001"));
  assert.ok(!lobbyJson.includes("first-user-0001"));
  assert.ok(!lobbyJson.includes("second-user-0001"));
  assert.ok(!lobbyJson.includes("join-user-0001"));
  assert.ok(!lobbyJson.includes("Ada browser"));
  assert.ok(!lobbyJson.includes("Ben phone"));

  await authority.inviteSeat(first.snapshot.id, {
    playerToken: first.playerToken,
    sessionId: "first-session-0001",
    userId: "first-user-0001",
    playerId: 1,
    invitedUserId: "invited-user-0001",
  });
  const firstUserMatches = await authority.listMatches({ limit: 10, scope: "mine", userId: "first-user-0001" });
  const invitedUserMatches = await authority.listMatches({ limit: 10, scope: "mine", userId: "invited-user-0001" });
  const joinedUserMatches = await authority.listMatches({ limit: 10, scope: "mine", userId: "join-user-0001" });
  const unrelatedUserMatches = await authority.listMatches({ limit: 10, scope: "mine", userId: "unrelated-user-0001" });
  const anonymousMineMatches = await authority.listMatches({ limit: 10, scope: "mine" });

  assert.deepEqual(firstUserMatches.map((summary) => summary.id), [first.snapshot.id]);
  assert.deepEqual(invitedUserMatches.map((summary) => summary.id), [first.snapshot.id]);
  assert.deepEqual(joinedUserMatches.map((summary) => summary.id), [second.snapshot.id]);
  assert.deepEqual(unrelatedUserMatches, []);
  assert.deepEqual(anonymousMineMatches, []);
  assert.equal(await errorCode(() => authority.listMatches({ limit: 10, scope: "private" })), "INVALID_REQUEST");
  const mineJson = JSON.stringify([...firstUserMatches, ...invitedUserMatches, ...joinedUserMatches]);
  assert.ok(!mineJson.includes("first-user-0001"));
  assert.ok(!mineJson.includes("invited-user-0001"));
  assert.ok(!mineJson.includes("join-user-0001"));
});

test("applies commands only through the canonical server reducer and advances versions", async () => {
  const authority = new MultiplayerAuthority();
  const created = await authority.createMatch({ setup: setup(), hostPlayerId: 0 });
  const before = await acknowledgeIfNeeded(authority, created.snapshot.id, created.playerToken, created.snapshot);
  const currentPlayer = before.state.currentPlayer;
  const target = ownedTerritory(before.state, currentPlayer);
  const remaining = before.state.reinforcementsRemaining;
  assert.ok(remaining > 0);

  const after = await authority.applyAction(created.snapshot.id, {
    playerToken: created.playerToken,
    expectedVersion: before.version,
    action: { type: "DEPLOY", territory: target, count: 1 },
  });

  assert.equal(after.version, before.version + 1);
  assert.equal(after.state.reinforcementsRemaining, remaining - 1);
  assert.equal(after.state.territories[target].armies, before.state.territories[target].armies + 1);
});

test("persists matches, seats, and reducer state across authority instances", async () => {
  const filePath = join(mkdtempSync(join(tmpdir(), "worlddomination-matches-")), "matches.json");
  const firstAuthority = new MultiplayerAuthority(new JsonFileMultiplayerMatchStore(filePath));
  const created = await firstAuthority.createMatch({ setup: setup(), hostPlayerId: 0 });
  const joined = await firstAuthority.joinMatch(created.snapshot.id, { playerId: 1, playerName: "Benedict" });
  const hostAfterJoin = await firstAuthority.snapshot(created.snapshot.id, created.playerToken);
  const ready = await acknowledgeIfNeeded(firstAuthority, created.snapshot.id, created.playerToken, hostAfterJoin);
  const target = ownedTerritory(ready.state, ready.state.currentPlayer);
  const advanced = await firstAuthority.applyAction(ready.id, {
    playerToken: created.playerToken,
    expectedVersion: ready.version,
    action: { type: "DEPLOY", territory: target, count: 1 },
  });

  const restartedAuthority = new MultiplayerAuthority(new JsonFileMultiplayerMatchStore(filePath));
  const restoredHost = await restartedAuthority.snapshot(created.snapshot.id, created.playerToken);
  const restoredJoiner = await restartedAuthority.snapshot(created.snapshot.id, joined.playerToken);

  assert.equal(restoredHost.version, advanced.version);
  assert.equal(restoredHost.you, 0);
  assert.equal(restoredJoiner.you, 1);
  assert.equal(restoredJoiner.state.players[1]?.name, "Benedict");
  assert.equal(restoredHost.state.territories[target].armies, advanced.state.territories[target].armies);
  assert.equal(
    await errorCode(() =>
      restartedAuthority.applyAction(created.snapshot.id, {
        playerToken: created.playerToken,
        expectedVersion: ready.version,
        action: { type: "DEPLOY", territory: target, count: 1 },
      }),
    ),
    "VERSION_CONFLICT",
  );
});

test("persists matches through the Postgres-backed match store contract", async () => {
  const client = new FakePostgresClient();
  const firstAuthority = new MultiplayerAuthority(new PostgresMultiplayerMatchStore(client));
  const created = await firstAuthority.createMatch({ setup: setup(), hostPlayerId: 0 });
  await firstAuthority.inviteSeat(created.snapshot.id, {
    playerToken: created.playerToken,
    playerId: 1,
    invitedUserId: "user-ben-0001",
  });

  const invitedAuthority = new MultiplayerAuthority(new PostgresMultiplayerMatchStore(client));
  const restoredInvitation = await invitedAuthority.snapshot(created.snapshot.id);
  assert.equal(restoredInvitation.seats[1]?.invited, true);
  assert.equal(restoredInvitation.seats[1]?.invitedUserId, null);
  const joined = await invitedAuthority.joinMatch(created.snapshot.id, {
    playerId: 1,
    playerName: "Benedict",
    userId: "user-ben-0001",
  });
  const ready = await acknowledgeIfNeeded(
    invitedAuthority,
    created.snapshot.id,
    created.playerToken,
    await invitedAuthority.snapshot(created.snapshot.id, created.playerToken),
  );
  const target = ownedTerritory(ready.state, ready.state.currentPlayer);
  const advanced = await invitedAuthority.applyAction(ready.id, {
    playerToken: created.playerToken,
    expectedVersion: ready.version,
    action: { type: "DEPLOY", territory: target, count: 1 },
  });

  const restartedAuthority = new MultiplayerAuthority(new PostgresMultiplayerMatchStore(client));
  const restoredHost = await restartedAuthority.snapshot(created.snapshot.id, created.playerToken);
  const restoredJoiner = await restartedAuthority.snapshot(created.snapshot.id, joined.playerToken, "user-ben-0001");

  assert.equal(restoredHost.version, advanced.version);
  assert.equal(restoredHost.you, 0);
  assert.equal(restoredJoiner.you, 1);
  assert.equal(restoredJoiner.seats[1]?.userId, "user-ben-0001");
  assert.equal(restoredJoiner.state.players[1]?.name, "Benedict");
  assert.equal(restoredHost.state.territories[target].armies, advanced.state.territories[target].armies);
  assert.ok(client.statements.some((statement) => /CREATE TABLE IF NOT EXISTS multiplayer_matches/i.test(statement)));
  assert.ok(client.statements.some((statement) => /INSERT INTO multiplayer_matches/i.test(statement)));
  assert.ok(client.statements.some((statement) => /ON CONFLICT \(id\) DO NOTHING/i.test(statement)));
  assert.ok(client.statements.some((statement) => /UPDATE multiplayer_matches[\s\S]*invitations = \$6::jsonb[\s\S]*WHERE id = \$1[\s\S]*AND version = \$7/i.test(statement)));
  assert.ok(client.statements.some((statement) => /SELECT id, version, created_at, updated_at, state, seats, invitations/i.test(statement)));

  await restartedAuthority.resetForTests();
  assert.equal(client.rows.size, 0);
});

test(
  "persists matches through a real DATABASE_URL Postgres store when available",
  { skip: process.env.DATABASE_URL ? false : "DATABASE_URL unset" },
  async () => {
    const dbRequire = createRequire(resolve(process.cwd(), "../../lib/db/package.json"));
    const { Pool } = dbRequire("pg") as { Pool: RealPostgresPoolConstructor };
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const client = await pool.connect();
    const schemaName = `multiplayer_test_${process.pid}_${Date.now()}`;
    const schemaIdentifier = postgresIdentifier(schemaName);

    try {
      await client.query(`CREATE SCHEMA ${schemaIdentifier}`);
      await client.query(`SET search_path TO ${schemaIdentifier}`);

      const queryClient: PostgresQueryClient = {
        query: (text, values) => client.query(text, values),
      };
      const accountQueryClient: AccountDirectoryQueryClient = {
        async query<T extends Record<string, unknown> = Record<string, unknown>>(text: string, values?: unknown[]) {
          const result = await client.query<T>(text, values);
          return { rows: result.rows, rowCount: result.rowCount ?? result.rows.length };
        },
      };
      const store = new PostgresMultiplayerMatchStore(queryClient);
      const accountStore = new PostgresAccountDirectoryStore(accountQueryClient);
      const firstAuthority = new MultiplayerAuthority(store);
      const created = await firstAuthority.createMatch({ setup: setup(), hostPlayerId: 0 });
      const joined = await firstAuthority.joinMatch(created.snapshot.id, { playerId: 1, playerName: "Benedict" });
      const ready = await acknowledgeIfNeeded(
        firstAuthority,
        created.snapshot.id,
        created.playerToken,
        await firstAuthority.snapshot(created.snapshot.id, created.playerToken),
      );
      const target = ownedTerritory(ready.state, ready.state.currentPlayer);
      const advanced = await firstAuthority.applyAction(ready.id, {
        playerToken: created.playerToken,
        expectedVersion: ready.version,
        action: { type: "DEPLOY", territory: target, count: 1 },
      });

      const restartedStore = new PostgresMultiplayerMatchStore(queryClient);
      const restartedAuthority = new MultiplayerAuthority(restartedStore);
      const restoredHost = await restartedAuthority.snapshot(created.snapshot.id, created.playerToken);
      const restoredJoiner = await restartedAuthority.snapshot(created.snapshot.id, joined.playerToken);
      const persisted = await restartedStore.get(created.snapshot.id);
      assert.ok(persisted);

      assert.equal(restoredHost.version, advanced.version);
      assert.equal(restoredHost.you, 0);
      assert.equal(restoredJoiner.you, 1);
      assert.equal(restoredJoiner.state.players[1]?.name, "Benedict");
      assert.equal(restoredHost.state.territories[target].armies, advanced.state.territories[target].armies);

      const acceptedWrite: MultiplayerMatchRecord = {
        ...persisted,
        version: persisted.version + 1,
        updatedAt: new Date(Date.parse(persisted.updatedAt) + 1_000).toISOString(),
      };
      const staleWrite: MultiplayerMatchRecord = {
        ...acceptedWrite,
        version: acceptedWrite.version + 1,
        updatedAt: new Date(Date.parse(acceptedWrite.updatedAt) + 1_000).toISOString(),
      };
      assert.equal(await restartedStore.save(acceptedWrite, persisted.version), true);
      assert.equal(await restartedStore.save(staleWrite, persisted.version), false);

      const count = await client.query<{ count: string }>("SELECT count(*)::text AS count FROM multiplayer_matches");
      assert.equal(count.rows[0]?.count, "1");

      const profile = await accountStore.updateProfile("user-ada-0001", " Ada ");
      const contact = await accountStore.addContact("user-ada-0001", "user-ben-0001", " Benedict ");
      const contacts = await accountStore.listContacts("user-ada-0001");
      const contactCount = await client.query<{ count: string }>("SELECT count(*)::text AS count FROM account_contacts");
      assert.deepEqual(profile, { userId: "user-ada-0001", displayName: "Ada" });
      assert.deepEqual(contact, { userId: "user-ben-0001", displayName: "Benedict" });
      assert.deepEqual(contacts, [{ userId: "user-ben-0001", displayName: "Benedict" }]);
      assert.equal(contactCount.rows[0]?.count, "1");
    } finally {
      await client.query("SET search_path TO public").catch(() => undefined);
      await client.query(`DROP SCHEMA IF EXISTS ${schemaIdentifier} CASCADE`).catch(() => undefined);
      client.release();
      await pool.end();
    }
  },
);

test("rejects stale Postgres store writes with the version guard", async () => {
  const client = new FakePostgresClient();
  const store = new PostgresMultiplayerMatchStore(client);
  const authority = new MultiplayerAuthority(store);
  const created = await authority.createMatch({ setup: setup(), hostPlayerId: 0 });
  const row = client.rows.get(created.snapshot.id);
  assert.ok(row);

  const currentVersion = row.version;
  const currentState = JSON.parse(row.state) as GameState;
  const currentSeats = JSON.parse(row.seats) as MultiplayerMatchRecord["seats"];
  const firstWrite: MultiplayerMatchRecord = {
    id: row.id,
    version: currentVersion + 1,
    createdAt: row.created_at,
    updatedAt: new Date(Date.parse(row.updated_at) + 1_000).toISOString(),
    state: currentState,
    seats: currentSeats,
    invitations: [],
  };
  const staleWrite: MultiplayerMatchRecord = {
    ...firstWrite,
    version: firstWrite.version + 1,
    updatedAt: new Date(Date.parse(firstWrite.updatedAt) + 1_000).toISOString(),
  };

  assert.equal(await store.save(firstWrite, currentVersion), true);
  assert.equal(await store.save(staleWrite, currentVersion), false);
  assert.equal(client.rows.get(row.id)?.version, firstWrite.version);
  assert.ok(client.statements.some((statement) => /UPDATE multiplayer_matches[\s\S]*WHERE id = \$1[\s\S]*AND version = \$7/i.test(statement)));
});

test("rejects stale versions, unclaimed actors, and reducer-invalid commands", async () => {
  const authority = new MultiplayerAuthority();
  const created = await authority.createMatch({ setup: setup(), hostPlayerId: 0 });
  const joined = await authority.joinMatch(created.snapshot.id, { playerId: 1 });
  const ready = await acknowledgeIfNeeded(
    authority,
    created.snapshot.id,
    created.playerToken,
    await authority.snapshot(created.snapshot.id, created.playerToken),
  );
  const target = ownedTerritory(ready.state, ready.state.currentPlayer);

  const after = await authority.applyAction(ready.id, {
    playerToken: created.playerToken,
    expectedVersion: ready.version,
    action: { type: "DEPLOY", territory: target, count: 1 },
  });

  assert.equal(
    await errorCode(() =>
      authority.applyAction(ready.id, {
        playerToken: created.playerToken,
        expectedVersion: ready.version,
        action: { type: "DEPLOY", territory: target, count: 1 },
      }),
    ),
    "VERSION_CONFLICT",
  );
  assert.equal(
    await errorCode(() =>
      authority.applyAction(ready.id, {
        playerToken: joined.playerToken,
        expectedVersion: after.version,
        action: { type: "DEPLOY", territory: target, count: 1 },
      }),
    ),
    "NOT_CURRENT_PLAYER",
  );
  assert.equal(
    await errorCode(() =>
      authority.applyAction(ready.id, {
        playerToken: created.playerToken,
        expectedVersion: after.version,
        action: { type: "END_TURN" },
      }),
    ),
    "ACTION_REJECTED",
  );
});

test("surfaces store compare-and-swap misses as version conflicts", async () => {
  const store = new RejectingExpectedSaveStore();
  const authority = new MultiplayerAuthority(store);
  const created = await authority.createMatch({ setup: setup(), hostPlayerId: 0 });
  const ready = await acknowledgeIfNeeded(
    authority,
    created.snapshot.id,
    created.playerToken,
    await authority.snapshot(created.snapshot.id, created.playerToken),
  );
  const target = ownedTerritory(ready.state, ready.state.currentPlayer);

  store.rejectExpectedSaves = true;
  assert.equal(
    await errorCode(() =>
      authority.applyAction(ready.id, {
        playerToken: created.playerToken,
        expectedVersion: ready.version,
        action: { type: "DEPLOY", territory: target, count: 1 },
      }),
    ),
    "VERSION_CONFLICT",
  );

  const unchanged = await authority.snapshot(ready.id, created.playerToken);
  assert.equal(unchanged.version, ready.version);
  assert.equal(unchanged.state.territories[target].armies, ready.state.territories[target].armies);
});

test("publishes realtime update notifications for joins and reducer actions", async () => {
  const authority = new MultiplayerAuthority();
  const created = await authority.createMatch({ setup: setup(), hostPlayerId: 0 });
  const updates: MultiplayerMatchUpdate[] = [];
  const allUpdates: MultiplayerMatchUpdate[] = [];
  const unsubscribe = authority.subscribe(created.snapshot.id, (update) => updates.push(update));
  const unsubscribeAll = authority.subscribeAll((update) => allUpdates.push(update));

  const joined = await authority.joinMatch(created.snapshot.id, { playerId: 1 });
  const ready = await acknowledgeIfNeeded(
    authority,
    created.snapshot.id,
    created.playerToken,
    await authority.snapshot(created.snapshot.id, created.playerToken),
  );
  const target = ownedTerritory(ready.state, ready.state.currentPlayer);
  const afterAction = await authority.applyAction(created.snapshot.id, {
    playerToken: created.playerToken,
    expectedVersion: ready.version,
    action: { type: "DEPLOY", territory: target, count: 1 },
  });
  unsubscribe();
  unsubscribeAll();

  assert.equal(joined.snapshot.version, created.snapshot.version + 1);
  assert.ok(updates.some((update) => update.reason === "joined" && update.version === joined.snapshot.version));
  assert.ok(updates.some((update) => update.reason === "action" && update.version === afterAction.version));
  assert.ok(updates.every((update) => update.matchId === created.snapshot.id));
  assert.deepEqual(allUpdates, updates);
});

test("parses only multiplayer WebSocket upgrade routes", () => {
  assert.deepEqual(
    multiplayerSocketRequest("/api/multiplayer/matches/m%201/socket?playerToken=token%201"),
    { matchId: "m 1", playerToken: "token 1" },
  );
  assert.deepEqual(
    multiplayerSocketRequest("/api/multiplayer/matches/m1/socket?playerToken=token&apiAuthToken=server%20secret"),
    { matchId: "m1", playerToken: "token", apiAuthToken: "server secret" },
  );
  assert.equal(multiplayerSocketRequest("/api/multiplayer/matches/m1/events?playerToken=token"), null);
  assert.equal(multiplayerSocketRequest("/multiplayer/matches/m1/socket?playerToken=token"), null);
});

test("requires configured multiplayer API auth on REST routes", async () => {
  const previousAuthToken = process.env.MULTIPLAYER_API_AUTH_TOKEN;
  process.env.MULTIPLAYER_API_AUTH_TOKEN = "server-secret";
  const app = express();
  app.use(express.json());
  app.post("/api/multiplayer/matches", requireMultiplayerApiAuth, (_req, res) => {
    res.status(201).json({ playerToken: "seat-token" });
  });
  const httpServer = createServer(app);
  const port = await listenHttpServer(httpServer);
  const url = `http://127.0.0.1:${port}/api/multiplayer/matches`;
  const body = JSON.stringify({ setup: setup(), hostPlayerId: 0 });

  try {
    const missing = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    const missingBody = await missing.json() as { error?: string };
    assert.equal(missing.status, 401);
    assert.equal(missingBody.error, MULTIPLAYER_AUTH_ERROR);

    const authorized = await fetch(url, {
      method: "POST",
      headers: {
        "authorization": "Bearer server-secret",
        "content-type": "application/json",
      },
      body,
    });
    const authorizedBody = await authorized.json() as { playerToken?: unknown };
    assert.equal(authorized.status, 201);
    assert.equal(typeof authorizedBody.playerToken, "string");
  } finally {
    if (previousAuthToken === undefined) {
      delete process.env.MULTIPLAYER_API_AUTH_TOKEN;
    } else {
      process.env.MULTIPLAYER_API_AUTH_TOKEN = previousAuthToken;
    }
    await closeHttpServer(httpServer);
  }
});

test("keeps health public when account and multiplayer auth routers are mounted first", async () => {
  const previousEnv = saveEnv([
    "MULTIPLAYER_API_AUTH_TOKEN",
    "MULTIPLAYER_TRUSTED_USER_ID_HEADER",
    "MULTIPLAYER_REQUIRE_TRUSTED_USER",
  ]);
  process.env.MULTIPLAYER_API_AUTH_TOKEN = "server-secret";
  process.env.MULTIPLAYER_TRUSTED_USER_ID_HEADER = "x-authenticated-user-id";
  process.env.MULTIPLAYER_REQUIRE_TRUSTED_USER = "1";

  const app = express();
  app.use(express.json());
  app.use("/api", accountRouter);
  app.use("/api", multiplayerRouter);
  app.get("/api/healthz", (_req, res) => {
    res.json({ status: "ok" });
  });
  const httpServer = createServer(app);
  const port = await listenHttpServer(httpServer);
  const baseUrl = `http://127.0.0.1:${port}/api`;

  try {
    const health = await fetch(`${baseUrl}/healthz`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: "ok" });

    const account = await fetch(`${baseUrl}/account/me`, {
      headers: { "x-authenticated-user-id": "user-ada-0001" },
    });
    const accountBody = await account.json() as { error?: string };
    assert.equal(account.status, 401);
    assert.equal(accountBody.error, MULTIPLAYER_AUTH_ERROR);
  } finally {
    restoreEnv(previousEnv);
    await closeHttpServer(httpServer);
  }
});

test("fails closed for unsafe production multiplayer deployment configuration", () => {
  assert.deepEqual(multiplayerDeploymentPreflightErrors({ NODE_ENV: "development" }), []);

  let productionError: Error | null = null;
  try {
    assertMultiplayerDeploymentPreflight({
      NODE_ENV: "production",
      MULTIPLAYER_API_AUTH_TOKEN: "super-secret-token",
    });
  } catch (error) {
    if (error instanceof Error) {
      productionError = error;
    }
  }
  assert.ok(productionError);
  assert.match(productionError.message, /MULTIPLAYER_DATABASE_STORE=1/);
  assert.match(productionError.message, /DATABASE_URL/);
  assert.match(productionError.message, /MULTIPLAYER_TRUSTED_USER_ID_HEADER/);
  assert.match(productionError.message, /HOST must bind to loopback/);
  assert.match(productionError.message, /MULTIPLAYER_REQUIRE_TRUSTED_USER=1/);
  assert.match(productionError.message, /MULTIPLAYER_ACCOUNT_DIRECTORY_STORE=postgres/);
  assert.ok(!productionError.message.includes("super-secret-token"));

  assert.deepEqual(
    multiplayerDeploymentPreflightErrors({
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://worlddomination:password@127.0.0.1:55432/worlddomination",
      MULTIPLAYER_API_AUTH_TOKEN: "server-secret",
      MULTIPLAYER_DATABASE_STORE: "1",
      HOST: "127.0.0.1",
      MULTIPLAYER_TRUSTED_USER_ID_HEADER: "x-player-user",
      MULTIPLAYER_REQUIRE_TRUSTED_USER: "1",
      MULTIPLAYER_ACCOUNT_DIRECTORY_STORE: "postgres",
    }),
    [],
  );

  assert.deepEqual(
    multiplayerDeploymentPreflightErrors({
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://worlddomination:password@127.0.0.1:55432/worlddomination",
      MULTIPLAYER_API_AUTH_TOKEN: "server-secret",
      MULTIPLAYER_DATABASE_STORE: "1",
      HOST: "0.0.0.0",
      MULTIPLAYER_TRUSTED_USER_ID_HEADER: "tailscale-user-login",
      MULTIPLAYER_REQUIRE_TRUSTED_USER: "1",
      MULTIPLAYER_ACCOUNT_DIRECTORY_STORE: "postgres",
    }),
    ["HOST must bind to loopback when MULTIPLAYER_ACCOUNT_IDENTITY_PROVIDER=trusted-header."],
  );

  assert.deepEqual(
    multiplayerDeploymentPreflightErrors({
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://worlddomination:password@127.0.0.1:55432/worlddomination",
      MULTIPLAYER_API_AUTH_TOKEN: "server-secret",
      MULTIPLAYER_DATABASE_STORE: "1",
      MULTIPLAYER_ACCOUNT_IDENTITY_PROVIDER: "oidc",
      MULTIPLAYER_OIDC_ISSUER: "https://identity.example.test/",
      MULTIPLAYER_OIDC_AUDIENCE: "worlddomination-mobile",
      MULTIPLAYER_OIDC_JWKS_URL: "https://identity.example.test/.well-known/jwks.json",
      MULTIPLAYER_REQUIRE_TRUSTED_USER: "1",
      MULTIPLAYER_ACCOUNT_DIRECTORY_STORE: "postgres",
    }),
    [],
  );

  assert.deepEqual(
    multiplayerDeploymentPreflightErrors({
      NODE_ENV: "development",
      MULTIPLAYER_REQUIRE_TRUSTED_USER: "1",
    }),
    ["MULTIPLAYER_TRUSTED_USER_ID_HEADER is required when MULTIPLAYER_REQUIRE_TRUSTED_USER=1."],
  );
});

test("binds trusted multiplayer user headers on REST routes without trusting request bodies", async () => {
  const previousAuthToken = process.env.MULTIPLAYER_API_AUTH_TOKEN;
  const previousTrustedUserHeader = process.env.MULTIPLAYER_TRUSTED_USER_ID_HEADER;
  process.env.MULTIPLAYER_API_AUTH_TOKEN = "loop-secret";
  process.env.MULTIPLAYER_TRUSTED_USER_ID_HEADER = "x-player-user";
  await multiplayerAuthority.resetForTests();
  const app = express();
  app.use(express.json());
  app.use("/api", multiplayerRouter);
  const httpServer = createServer(app);
  const port = await listenHttpServer(httpServer);
  const baseUrl = `http://127.0.0.1:${port}/api`;

  try {
    const created = await apiRequest<{ snapshot: MultiplayerSnapshot; playerToken: string }>(
      baseUrl,
      "/multiplayer/matches",
      {
        method: "POST",
        headers: { "x-player-user": "user-ada-0001" },
        body: JSON.stringify({
          setup: setup(),
          hostPlayerId: 0,
          userId: "spoofed-user-0001",
        }),
      },
    );
    assert.equal(created.snapshot.seats[0]?.userBound, true);
    assert.equal(created.snapshot.seats[0]?.userId, "user-ada-0001");
    assert.ok(!JSON.stringify(created.snapshot).includes("spoofed-user-0001"));

    const invited = await apiRequest<{ snapshot: MultiplayerSnapshot; invitation: { invitedUserId?: string; invitedByUserId?: string } }>(
      baseUrl,
      `/multiplayer/matches/${created.snapshot.id}/invitations`,
      {
        method: "POST",
        headers: { "x-player-user": "user-ada-0001" },
        body: JSON.stringify({
          playerToken: created.playerToken,
          playerId: 1,
          invitedUserId: "user-ben-0001",
          userId: "spoofed-user-0001",
        }),
      },
    );
    assert.equal(invited.invitation.invitedUserId, "user-ben-0001");
    assert.equal(invited.invitation.invitedByUserId, "user-ada-0001");
    assert.equal(invited.snapshot.seats[1]?.invited, true);
    assert.equal(invited.snapshot.seats[1]?.invitedUserId, "user-ben-0001");

    const listedInvitations = await apiRequest<Array<{ matchId?: string; playerId?: number; invitedByPlayerName?: string }>>(
      baseUrl,
      "/multiplayer/invitations?limit=5",
      {
        method: "GET",
        headers: { "x-player-user": "user-ben-0001" },
      },
    );
    assert.equal(listedInvitations.length, 1);
    assert.equal(listedInvitations[0]?.matchId, created.snapshot.id);
    assert.equal(listedInvitations[0]?.playerId, 1);
    assert.equal(listedInvitations[0]?.invitedByPlayerName, "Ada");
    const invitationJson = JSON.stringify(listedInvitations);
    assert.ok(!invitationJson.includes("user-ben-0001"));
    assert.ok(!invitationJson.includes(created.playerToken));

    const hostMatches = await apiRequest<MultiplayerMatchSummary[]>(
      baseUrl,
      "/multiplayer/matches?scope=mine&limit=5",
      {
        method: "GET",
        headers: { "x-player-user": "user-ada-0001" },
      },
    );
    assert.deepEqual(hostMatches.map((match) => match.id), [created.snapshot.id]);
    assert.ok(!JSON.stringify(hostMatches).includes("user-ada-0001"));

    const inviteeMatches = await apiRequest<MultiplayerMatchSummary[]>(
      baseUrl,
      "/multiplayer/matches?scope=mine&limit=5",
      {
        method: "GET",
        headers: { "x-player-user": "user-ben-0001" },
      },
    );
    assert.deepEqual(inviteeMatches.map((match) => match.id), [created.snapshot.id]);
    assert.ok(!JSON.stringify(inviteeMatches).includes("user-ben-0001"));

    const unrelatedInvitations = await apiRequest<unknown[]>(
      baseUrl,
      "/multiplayer/invitations?limit=5",
      {
        method: "GET",
        headers: { "x-player-user": "user-chao-0001" },
      },
    );
    assert.deepEqual(unrelatedInvitations, []);

    const wrongInvitee = await fetch(`${baseUrl}/multiplayer/matches/${created.snapshot.id}/join`, {
      method: "POST",
      headers: {
        "authorization": "Bearer loop-secret",
        "content-type": "application/json",
        "x-player-user": "wrong-user-0001",
      },
      body: JSON.stringify({ playerId: 1, playerName: "Benedict" }),
    });
    const wrongInviteeBody = await wrongInvitee.json() as { error?: string };
    assert.equal(wrongInvitee.status, 403);
    assert.equal(wrongInviteeBody.error, "INVITATION_MISMATCH");

    const joined = await apiRequest<{ snapshot: MultiplayerSnapshot; playerToken: string }>(
      baseUrl,
      `/multiplayer/matches/${created.snapshot.id}/join`,
      {
        method: "POST",
        headers: { "x-player-user": "user-ben-0001" },
        body: JSON.stringify({
          playerId: 1,
          playerName: "Benedict",
          userId: "spoofed-user-0001",
        }),
      },
    );
    assert.equal(joined.snapshot.seats[1]?.userId, "user-ben-0001");
    assert.equal(joined.snapshot.seats[1]?.invited, false);
    assert.ok(!JSON.stringify(joined.snapshot).includes("spoofed-user-0001"));

    const missingUser = await fetch(`${baseUrl}/multiplayer/matches/${created.snapshot.id}?playerToken=${encodeURIComponent(created.playerToken)}`, {
      headers: { "authorization": "Bearer loop-secret" },
    });
    const missingBody = await missingUser.json() as { error?: string };
    assert.equal(missingUser.status, 403);
    assert.equal(missingBody.error, "USER_MISMATCH");

    const wrongUser = await fetch(`${baseUrl}/multiplayer/matches/${created.snapshot.id}?playerToken=${encodeURIComponent(created.playerToken)}`, {
      headers: {
        "authorization": "Bearer loop-secret",
        "x-player-user": "wrong-user-0001",
      },
    });
    const wrongBody = await wrongUser.json() as { error?: string };
    assert.equal(wrongUser.status, 403);
    assert.equal(wrongBody.error, "USER_MISMATCH");

    const trustedView = await apiRequest<MultiplayerSnapshot>(
      baseUrl,
      `/multiplayer/matches/${created.snapshot.id}?playerToken=${encodeURIComponent(created.playerToken)}`,
      {
        method: "GET",
        headers: { "x-player-user": "user-ada-0001" },
      },
    );
    assert.equal(trustedView.you, 0);
    assert.equal(trustedView.seats[0]?.userId, "user-ada-0001");
  } finally {
    await multiplayerAuthority.resetForTests();
    if (previousAuthToken === undefined) {
      delete process.env.MULTIPLAYER_API_AUTH_TOKEN;
    } else {
      process.env.MULTIPLAYER_API_AUTH_TOKEN = previousAuthToken;
    }
    if (previousTrustedUserHeader === undefined) {
      delete process.env.MULTIPLAYER_TRUSTED_USER_ID_HEADER;
    } else {
      process.env.MULTIPLAYER_TRUSTED_USER_ID_HEADER = previousTrustedUserHeader;
    }
    await closeHttpServer(httpServer);
  }
});

test("verifies OIDC account identity on REST routes and keeps API auth separate", async () => {
  const previousEnv = saveEnv([
    "MULTIPLAYER_API_AUTH_TOKEN",
    "MULTIPLAYER_ACCOUNT_IDENTITY_PROVIDER",
    "MULTIPLAYER_IDENTITY_PROVIDER",
    "MULTIPLAYER_OIDC_ISSUER",
    "MULTIPLAYER_OIDC_AUDIENCE",
    "MULTIPLAYER_OIDC_JWKS_URL",
    "MULTIPLAYER_OIDC_USER_ID_CLAIM",
    "MULTIPLAYER_OIDC_DISPLAY_NAME_CLAIM",
    "MULTIPLAYER_REQUIRE_TRUSTED_USER",
    "MULTIPLAYER_TRUSTED_USER_ID_HEADER",
    "MULTIPLAYER_TRUSTED_USER_DISPLAY_NAME_HEADER",
    "NODE_ENV",
  ]);
  const issuer = await createTestOidcIssuer();
  process.env.MULTIPLAYER_API_AUTH_TOKEN = "loop-secret";
  process.env.MULTIPLAYER_ACCOUNT_IDENTITY_PROVIDER = "oidc";
  process.env.MULTIPLAYER_OIDC_ISSUER = "https://identity.example.test/";
  process.env.MULTIPLAYER_OIDC_AUDIENCE = "worlddomination-mobile";
  process.env.MULTIPLAYER_OIDC_JWKS_URL = issuer.jwksUrl;
  process.env.MULTIPLAYER_REQUIRE_TRUSTED_USER = "1";
  process.env.NODE_ENV = "test";
  delete process.env.MULTIPLAYER_TRUSTED_USER_ID_HEADER;
  delete process.env.MULTIPLAYER_TRUSTED_USER_DISPLAY_NAME_HEADER;
  setAccountDirectoryStoreForTests(new InMemoryAccountDirectoryStore());
  await multiplayerAuthority.resetForTests();
  clearOidcJwksCacheForTests();

  const app = express();
  app.use(express.json());
  app.use(resolveConfiguredAccountIdentity);
  app.use("/api", accountRouter);
  app.use("/api", multiplayerRouter);
  const httpServer = createServer(app);
  const port = await listenHttpServer(httpServer);
  const baseUrl = `http://127.0.0.1:${port}/api`;
  const identityToken = issuer.sign({
    iss: "https://identity.example.test/",
    aud: "worlddomination-mobile",
    sub: "user-oidc-ada",
    name: "Ada OIDC",
    exp: Math.floor(Date.now() / 1000) + 300,
  });

  try {
    const profile = await apiRequest<{ userId: string; displayName: string | null }>(baseUrl, "/account/me", {
      method: "PUT",
      headers: {
        "authorization": `Bearer ${identityToken}`,
        "x-multiplayer-auth": "loop-secret",
        "x-worlddomination-user-id": "spoofed-header-user",
      },
      body: JSON.stringify({ displayName: " Ada Verified " }),
    });
    assert.deepEqual(profile, { userId: "user-oidc-ada", displayName: "Ada Verified" });

    const created = await apiRequest<{ snapshot: MultiplayerSnapshot; playerToken: string }>(
      baseUrl,
      "/multiplayer/matches",
      {
        method: "POST",
        headers: {
          "authorization": `Bearer ${identityToken}`,
          "x-multiplayer-auth": "loop-secret",
        },
        body: JSON.stringify({
          setup: setup(),
          hostPlayerId: 0,
          userId: "spoofed-body-user",
        }),
      },
    );
    assert.equal(created.snapshot.seats[0]?.userId, "user-oidc-ada");
    assert.ok(!JSON.stringify(created.snapshot).includes("spoofed-body-user"));

    const missingIdentity = await fetch(`${baseUrl}/account/me`, {
      headers: { "x-multiplayer-auth": "loop-secret" },
    });
    const missingIdentityBody = await missingIdentity.json() as { error?: string };
    assert.equal(missingIdentity.status, 401);
    assert.equal(missingIdentityBody.error, MULTIPLAYER_IDENTITY_REQUIRED_ERROR);

    const wrongAudienceToken = issuer.sign({
      iss: "https://identity.example.test/",
      aud: "wrong-audience",
      sub: "user-oidc-ada",
      exp: Math.floor(Date.now() / 1000) + 300,
    });
    const wrongAudience = await fetch(`${baseUrl}/account/me`, {
      headers: {
        "authorization": `Bearer ${wrongAudienceToken}`,
        "x-multiplayer-auth": "loop-secret",
      },
    });
    const wrongAudienceBody = await wrongAudience.json() as { error?: string };
    assert.equal(wrongAudience.status, 401);
    assert.equal(wrongAudienceBody.error, MULTIPLAYER_IDENTITY_INVALID_ERROR);
  } finally {
    setAccountDirectoryStoreForTests(undefined);
    clearOidcJwksCacheForTests();
    await issuer.close();
    await multiplayerAuthority.resetForTests();
    restoreEnv(previousEnv);
    await closeHttpServer(httpServer);
  }
});

test("lists configured multiplayer contacts only for the current trusted user", async () => {
  const previousAuthToken = process.env.MULTIPLAYER_API_AUTH_TOKEN;
  const previousTrustedUserHeader = process.env.MULTIPLAYER_TRUSTED_USER_ID_HEADER;
  const previousRequireTrustedUser = process.env.MULTIPLAYER_REQUIRE_TRUSTED_USER;
  const previousContactsJson = process.env.MULTIPLAYER_CONTACTS_JSON;
  const previousContactsPath = process.env.MULTIPLAYER_CONTACTS_PATH;
  process.env.MULTIPLAYER_API_AUTH_TOKEN = "loop-secret";
  process.env.MULTIPLAYER_TRUSTED_USER_ID_HEADER = "x-player-user";
  process.env.MULTIPLAYER_REQUIRE_TRUSTED_USER = "1";
  delete process.env.MULTIPLAYER_CONTACTS_PATH;
  process.env.MULTIPLAYER_CONTACTS_JSON = JSON.stringify({
    contacts: [
      { ownerUserId: "user-ada-0001", userId: "user-ben-0001", displayName: " Benedict " },
      { ownerUserId: "user-ada-0001", userId: "user-chao-0001" },
      { ownerUserId: "user-ada-0001", userId: "user-ben-0001", displayName: "Duplicate" },
      { ownerUserId: "user-ada-0001", userId: "user-ada-0001", displayName: "Self" },
      { ownerUserId: "user-ben-0001", userId: "user-ada-0001", displayName: "Ada" },
    ],
  });
  const app = express();
  app.use(express.json());
  app.use("/api", multiplayerRouter);
  const httpServer = createServer(app);
  const port = await listenHttpServer(httpServer);
  const baseUrl = `http://127.0.0.1:${port}/api`;

  try {
    const adaContacts = await apiRequest<Array<{ userId: string; displayName: string | null }>>(
      baseUrl,
      "/multiplayer/contacts",
      {
        method: "GET",
        headers: { "x-player-user": "user-ada-0001" },
      },
    );
    assert.deepEqual(adaContacts, [
      { userId: "user-ben-0001", displayName: "Benedict" },
      { userId: "user-chao-0001", displayName: null },
    ]);
    const adaContactJson = JSON.stringify(adaContacts);
    assert.ok(!adaContactJson.includes("ownerUserId"));
    assert.ok(!adaContactJson.includes("user-ada-0001"));

    const benContacts = await apiRequest<Array<{ userId: string; displayName: string | null }>>(
      baseUrl,
      "/multiplayer/contacts",
      {
        method: "GET",
        headers: { "x-player-user": "user-ben-0001" },
      },
    );
    assert.deepEqual(benContacts, [
      { userId: "user-ada-0001", displayName: "Ada" },
    ]);

    const missingUser = await fetch(`${baseUrl}/multiplayer/contacts`, {
      headers: { "authorization": "Bearer loop-secret" },
    });
    const missingUserBody = await missingUser.json() as { error?: string };
    assert.equal(missingUser.status, 401);
    assert.equal(missingUserBody.error, MULTIPLAYER_TRUSTED_USER_REQUIRED_ERROR);
  } finally {
    if (previousAuthToken === undefined) {
      delete process.env.MULTIPLAYER_API_AUTH_TOKEN;
    } else {
      process.env.MULTIPLAYER_API_AUTH_TOKEN = previousAuthToken;
    }
    if (previousTrustedUserHeader === undefined) {
      delete process.env.MULTIPLAYER_TRUSTED_USER_ID_HEADER;
    } else {
      process.env.MULTIPLAYER_TRUSTED_USER_ID_HEADER = previousTrustedUserHeader;
    }
    if (previousRequireTrustedUser === undefined) {
      delete process.env.MULTIPLAYER_REQUIRE_TRUSTED_USER;
    } else {
      process.env.MULTIPLAYER_REQUIRE_TRUSTED_USER = previousRequireTrustedUser;
    }
    if (previousContactsJson === undefined) {
      delete process.env.MULTIPLAYER_CONTACTS_JSON;
    } else {
      process.env.MULTIPLAYER_CONTACTS_JSON = previousContactsJson;
    }
    if (previousContactsPath === undefined) {
      delete process.env.MULTIPLAYER_CONTACTS_PATH;
    } else {
      process.env.MULTIPLAYER_CONTACTS_PATH = previousContactsPath;
    }
    await closeHttpServer(httpServer);
  }
});

test("backs account identity and multiplayer contacts with a persistent account directory", async () => {
  const previousAuthToken = process.env.MULTIPLAYER_API_AUTH_TOKEN;
  const previousTrustedUserHeader = process.env.MULTIPLAYER_TRUSTED_USER_ID_HEADER;
  const previousRequireTrustedUser = process.env.MULTIPLAYER_REQUIRE_TRUSTED_USER;
  const previousContactsJson = process.env.MULTIPLAYER_CONTACTS_JSON;
  const previousContactsPath = process.env.MULTIPLAYER_CONTACTS_PATH;
  process.env.MULTIPLAYER_API_AUTH_TOKEN = "loop-secret";
  process.env.MULTIPLAYER_TRUSTED_USER_ID_HEADER = "x-player-user";
  process.env.MULTIPLAYER_REQUIRE_TRUSTED_USER = "1";
  delete process.env.MULTIPLAYER_CONTACTS_JSON;
  delete process.env.MULTIPLAYER_CONTACTS_PATH;
  setAccountDirectoryStoreForTests(new InMemoryAccountDirectoryStore());

  const app = express();
  app.use(express.json());
  app.use("/api", accountRouter);
  app.use("/api", multiplayerRouter);
  const httpServer = createServer(app);
  const port = await listenHttpServer(httpServer);
  const baseUrl = `http://127.0.0.1:${port}/api`;

  try {
    const profile = await apiRequest<{ userId: string; displayName: string | null }>(baseUrl, "/account/me", {
      method: "PUT",
      headers: { "x-player-user": "user-ada-0001" },
      body: JSON.stringify({ displayName: " Ada " }),
    });
    assert.deepEqual(profile, { userId: "user-ada-0001", displayName: "Ada" });

    const contact = await apiRequest<{ userId: string; displayName: string | null }>(
      baseUrl,
      "/account/contacts/user-ben-0001",
      {
        method: "PUT",
        headers: { "x-player-user": "user-ada-0001" },
        body: JSON.stringify({ displayName: " Benedict " }),
      },
    );
    assert.deepEqual(contact, { userId: "user-ben-0001", displayName: "Benedict" });

    const accountContacts = await apiRequest<Array<{ userId: string; displayName: string | null }>>(
      baseUrl,
      "/account/contacts?limit=10",
      {
        method: "GET",
        headers: { "x-player-user": "user-ada-0001" },
      },
    );
    assert.deepEqual(accountContacts, [{ userId: "user-ben-0001", displayName: "Benedict" }]);

    const multiplayerContacts = await apiRequest<Array<{ userId: string; displayName: string | null }>>(
      baseUrl,
      "/multiplayer/contacts",
      {
        method: "GET",
        headers: { "x-player-user": "user-ada-0001" },
      },
    );
    assert.deepEqual(multiplayerContacts, accountContacts);
    assert.ok(!JSON.stringify(multiplayerContacts).includes("ownerUserId"));
    assert.ok(!JSON.stringify(multiplayerContacts).includes("user-ada-0001"));

    const selfContact = await fetch(`${baseUrl}/account/contacts/user-ada-0001`, {
      method: "PUT",
      headers: {
        "authorization": "Bearer loop-secret",
        "content-type": "application/json",
        "x-player-user": "user-ada-0001",
      },
      body: JSON.stringify({ displayName: "Self" }),
    });
    const selfContactBody = await selfContact.json() as { error?: string };
    assert.equal(selfContact.status, 400);
    assert.equal(selfContactBody.error, ACCOUNT_CONTACT_INVALID_ERROR);

    const missingUser = await fetch(`${baseUrl}/account/me`, {
      headers: { "authorization": "Bearer loop-secret" },
    });
    const missingUserBody = await missingUser.json() as { error?: string };
    assert.equal(missingUser.status, 401);
    assert.equal(missingUserBody.error, MULTIPLAYER_TRUSTED_USER_REQUIRED_ERROR);
  } finally {
    setAccountDirectoryStoreForTests(undefined);
    if (previousAuthToken === undefined) {
      delete process.env.MULTIPLAYER_API_AUTH_TOKEN;
    } else {
      process.env.MULTIPLAYER_API_AUTH_TOKEN = previousAuthToken;
    }
    if (previousTrustedUserHeader === undefined) {
      delete process.env.MULTIPLAYER_TRUSTED_USER_ID_HEADER;
    } else {
      process.env.MULTIPLAYER_TRUSTED_USER_ID_HEADER = previousTrustedUserHeader;
    }
    if (previousRequireTrustedUser === undefined) {
      delete process.env.MULTIPLAYER_REQUIRE_TRUSTED_USER;
    } else {
      process.env.MULTIPLAYER_REQUIRE_TRUSTED_USER = previousRequireTrustedUser;
    }
    if (previousContactsJson === undefined) {
      delete process.env.MULTIPLAYER_CONTACTS_JSON;
    } else {
      process.env.MULTIPLAYER_CONTACTS_JSON = previousContactsJson;
    }
    if (previousContactsPath === undefined) {
      delete process.env.MULTIPLAYER_CONTACTS_PATH;
    } else {
      process.env.MULTIPLAYER_CONTACTS_PATH = previousContactsPath;
    }
    await closeHttpServer(httpServer);
  }
});

test("requires configured trusted multiplayer users on REST and WebSocket routes", async () => {
  const previousAuthToken = process.env.MULTIPLAYER_API_AUTH_TOKEN;
  const previousTrustedUserHeader = process.env.MULTIPLAYER_TRUSTED_USER_ID_HEADER;
  const previousRequireTrustedUser = process.env.MULTIPLAYER_REQUIRE_TRUSTED_USER;
  process.env.MULTIPLAYER_API_AUTH_TOKEN = "loop-secret";
  process.env.MULTIPLAYER_TRUSTED_USER_ID_HEADER = "x-player-user";
  process.env.MULTIPLAYER_REQUIRE_TRUSTED_USER = "1";
  await multiplayerAuthority.resetForTests();
  const app = express();
  app.use(express.json());
  app.use("/api", multiplayerRouter);
  const httpServer = createServer(app);
  const socketServer = attachMultiplayerWebSocketServer(httpServer);
  const port = await listenHttpServer(httpServer);
  const baseUrl = `http://127.0.0.1:${port}/api`;
  let rejectedSocket: WebSocket | null = null;
  let acceptedSocket: WebSocket | null = null;

  try {
    const missingUserCreate = await fetch(`${baseUrl}/multiplayer/matches`, {
      method: "POST",
      headers: {
        "authorization": "Bearer loop-secret",
        "content-type": "application/json",
      },
      body: JSON.stringify({ setup: setup(), hostPlayerId: 0 }),
    });
    const missingUserBody = await missingUserCreate.json() as { error?: string };
    assert.equal(missingUserCreate.status, 401);
    assert.equal(missingUserBody.error, MULTIPLAYER_TRUSTED_USER_REQUIRED_ERROR);

    const missingUserList = await fetch(`${baseUrl}/multiplayer/matches?limit=1`, {
      headers: { "authorization": "Bearer loop-secret" },
    });
    const missingUserListBody = await missingUserList.json() as { error?: string };
    assert.equal(missingUserList.status, 401);
    assert.equal(missingUserListBody.error, MULTIPLAYER_TRUSTED_USER_REQUIRED_ERROR);

    const created = await apiRequest<{ snapshot: MultiplayerSnapshot; playerToken: string }>(
      baseUrl,
      "/multiplayer/matches",
      {
        method: "POST",
        headers: { "x-player-user": "user-ada-0001" },
        body: JSON.stringify({ setup: setup(), hostPlayerId: 0 }),
      },
    );
    assert.equal(created.snapshot.you, 0);
    assert.equal(created.snapshot.seats[0]?.userId, "user-ada-0001");

    rejectedSocket = multiplayerSocket(baseUrl, created.snapshot.id, created.playerToken, undefined, "loop-secret");
    assert.equal(await readSocketUpgradeRejectionStatus(rejectedSocket), 401);
    rejectedSocket = null;

    acceptedSocket = multiplayerSocket(
      baseUrl,
      created.snapshot.id,
      created.playerToken,
      { "x-player-user": "user-ada-0001" },
      "loop-secret",
    );
    const snapshot = await readSocketSnapshot(acceptedSocket);
    assert.equal(snapshot.id, created.snapshot.id);
    assert.equal(snapshot.you, 0);
    assert.equal(snapshot.seats[0]?.userId, "user-ada-0001");
  } finally {
    disposeSocket(rejectedSocket);
    disposeSocket(acceptedSocket);
    socketServer.clients.forEach((client) => client.close());
    await closeSocketServer(socketServer);
    await closeHttpServer(httpServer);
    await multiplayerAuthority.resetForTests();
    if (previousAuthToken === undefined) {
      delete process.env.MULTIPLAYER_API_AUTH_TOKEN;
    } else {
      process.env.MULTIPLAYER_API_AUTH_TOKEN = previousAuthToken;
    }
    if (previousTrustedUserHeader === undefined) {
      delete process.env.MULTIPLAYER_TRUSTED_USER_ID_HEADER;
    } else {
      process.env.MULTIPLAYER_TRUSTED_USER_ID_HEADER = previousTrustedUserHeader;
    }
    if (previousRequireTrustedUser === undefined) {
      delete process.env.MULTIPLAYER_REQUIRE_TRUSTED_USER;
    } else {
      process.env.MULTIPLAYER_REQUIRE_TRUSTED_USER = previousRequireTrustedUser;
    }
  }
});

test("streams trusted-user invitation list updates over SSE", async () => {
  const previousAuthToken = process.env.MULTIPLAYER_API_AUTH_TOKEN;
  const previousTrustedUserHeader = process.env.MULTIPLAYER_TRUSTED_USER_ID_HEADER;
  process.env.MULTIPLAYER_API_AUTH_TOKEN = "loop-secret";
  process.env.MULTIPLAYER_TRUSTED_USER_ID_HEADER = "x-player-user";
  await multiplayerAuthority.resetForTests();
  const app = express();
  app.use(express.json());
  app.use("/api", multiplayerRouter);
  const httpServer = createServer(app);
  const port = await listenHttpServer(httpServer);
  const baseUrl = `http://127.0.0.1:${port}/api`;
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

  try {
    const created = await apiRequest<{ snapshot: MultiplayerSnapshot; playerToken: string }>(
      baseUrl,
      "/multiplayer/matches",
      {
        method: "POST",
        headers: { "x-player-user": "user-ada-0001" },
        body: JSON.stringify({
          setup: setup(),
          hostPlayerId: 0,
        }),
      },
    );
    const stream = await fetch(`${baseUrl}/multiplayer/invitations/events?limit=5`, {
      headers: {
        "authorization": "Bearer loop-secret",
        "x-player-user": "user-ben-0001",
      },
    });
    assert.equal(stream.status, 200);
    assert.match(stream.headers.get("content-type") ?? "", /text\/event-stream/);
    assert.ok(stream.body);
    reader = stream.body.getReader();

    await readStreamUntil(
      reader,
      (text) => text.includes("event: invitations") && text.includes("data: []"),
      "Timed out waiting for initial invitation SSE list.",
    );

    await apiRequest<{ snapshot: MultiplayerSnapshot }>(
      baseUrl,
      `/multiplayer/matches/${created.snapshot.id}/invitations`,
      {
        method: "POST",
        headers: { "x-player-user": "user-ada-0001" },
        body: JSON.stringify({
          playerToken: created.playerToken,
          playerId: 1,
          invitedUserId: "user-ben-0001",
        }),
      },
    );

    const pushed = await readStreamUntil(
      reader,
      (text) => text.includes(created.snapshot.id) && text.includes("invitedByPlayerName"),
      "Timed out waiting for pushed invitation SSE list.",
    );
    assert.ok(pushed.includes(created.snapshot.id));
    assert.ok(pushed.includes("Ada"));
    assert.ok(!pushed.includes("user-ben-0001"));
    assert.ok(!pushed.includes(created.playerToken));
  } finally {
    await reader?.cancel().catch(() => {});
    await multiplayerAuthority.resetForTests();
    if (previousAuthToken === undefined) {
      delete process.env.MULTIPLAYER_API_AUTH_TOKEN;
    } else {
      process.env.MULTIPLAYER_API_AUTH_TOKEN = previousAuthToken;
    }
    if (previousTrustedUserHeader === undefined) {
      delete process.env.MULTIPLAYER_TRUSTED_USER_ID_HEADER;
    } else {
      process.env.MULTIPLAYER_TRUSTED_USER_ID_HEADER = previousTrustedUserHeader;
    }
    await closeHttpServer(httpServer);
  }
});

test("streams redacted snapshots over the multiplayer WebSocket endpoint", async () => {
  const authority = new MultiplayerAuthority();
  const created = await authority.createMatch({ setup: setup(), hostPlayerId: 0 });
  const httpServer = createServer();
  const socketServer = attachMultiplayerWebSocketServer(httpServer, authority, { apiAuthToken: "server-secret" });
  const port = await listenHttpServer(httpServer);
  const socket = new WebSocket(
    `ws://127.0.0.1:${port}/api/multiplayer/matches/${created.snapshot.id}/socket?playerToken=${encodeURIComponent(created.playerToken)}&apiAuthToken=server-secret`,
  );

  try {
    const initial = await readSocketSnapshot(socket);
    assert.equal(initial.id, created.snapshot.id);
    assert.equal(initial.you, 0);
    assert.ok(!JSON.stringify(initial).includes(created.playerToken));

    const ready = initial.state.awaitingHandoff
      ? await acknowledgeSocketHandoff(authority, socket, created.snapshot.id, created.playerToken, initial)
      : initial;
    const target = ownedTerritory(ready.state, ready.state.currentPlayer);
    const advanced = await authority.applyAction(created.snapshot.id, {
      playerToken: created.playerToken,
      expectedVersion: ready.version,
      action: { type: "DEPLOY", territory: target, count: 1 },
    });
    const pushed = await readSocketSnapshot(socket);

    assert.equal(pushed.version, advanced.version);
    assert.equal(pushed.you, 0);
    assert.equal(pushed.state.territories[target].armies, advanced.state.territories[target].armies);
    assert.ok(!JSON.stringify(pushed).includes(created.playerToken));
  } finally {
    socket.close();
    await closeSocketServer(socketServer);
    await closeHttpServer(httpServer);
  }
});

test("requires matching trusted user identity on user-bound WebSocket streams", async () => {
  const previousTrustedUserHeader = process.env.MULTIPLAYER_TRUSTED_USER_ID_HEADER;
  process.env.MULTIPLAYER_TRUSTED_USER_ID_HEADER = "x-player-user";
  const authority = new MultiplayerAuthority();
  const created = await authority.createMatch({ setup: setup(), hostPlayerId: 0, userId: "user-ada-0001" });
  const httpServer = createServer();
  const socketServer = attachMultiplayerWebSocketServer(httpServer, authority, { apiAuthToken: "server-secret" });
  const port = await listenHttpServer(httpServer);
  const baseUrl = `http://127.0.0.1:${port}/api`;
  const missingUserSocket = multiplayerSocket(baseUrl, created.snapshot.id, created.playerToken, undefined, "server-secret");
  const trustedUserSocket = multiplayerSocket(
    baseUrl,
    created.snapshot.id,
    created.playerToken,
    { "x-player-user": "user-ada-0001" },
    "server-secret",
  );

  try {
    const errorMessage = await readSocketJson<{ error?: string; status?: number }>(
      missingUserSocket,
      "Timed out waiting for user-bound multiplayer WebSocket error.",
    );
    assert.equal(errorMessage.error, "USER_MISMATCH");
    assert.equal(errorMessage.status, 403);

    const initial = await readSocketSnapshot(trustedUserSocket);
    assert.equal(initial.id, created.snapshot.id);
    assert.equal(initial.you, 0);
    assert.equal(initial.seats[0]?.userId, "user-ada-0001");
  } finally {
    missingUserSocket.close();
    trustedUserSocket.close();
    socketServer.clients.forEach((client) => client.close());
    await closeSocketServer(socketServer);
    await closeHttpServer(httpServer);
    if (previousTrustedUserHeader === undefined) {
      delete process.env.MULTIPLAYER_TRUSTED_USER_ID_HEADER;
    } else {
      process.env.MULTIPLAYER_TRUSTED_USER_ID_HEADER = previousTrustedUserHeader;
    }
  }
});

test("verifies OIDC identity tokens on user-bound WebSocket streams", async () => {
  const previousEnv = saveEnv([
    "MULTIPLAYER_ACCOUNT_IDENTITY_PROVIDER",
    "MULTIPLAYER_OIDC_ISSUER",
    "MULTIPLAYER_OIDC_AUDIENCE",
    "MULTIPLAYER_OIDC_JWKS_URL",
    "MULTIPLAYER_REQUIRE_TRUSTED_USER",
    "MULTIPLAYER_TRUSTED_USER_ID_HEADER",
    "NODE_ENV",
  ]);
  const issuer = await createTestOidcIssuer();
  process.env.MULTIPLAYER_ACCOUNT_IDENTITY_PROVIDER = "oidc";
  process.env.MULTIPLAYER_OIDC_ISSUER = "https://identity.example.test/";
  process.env.MULTIPLAYER_OIDC_AUDIENCE = "worlddomination-mobile";
  process.env.MULTIPLAYER_OIDC_JWKS_URL = issuer.jwksUrl;
  process.env.MULTIPLAYER_REQUIRE_TRUSTED_USER = "1";
  process.env.NODE_ENV = "test";
  delete process.env.MULTIPLAYER_TRUSTED_USER_ID_HEADER;
  clearOidcJwksCacheForTests();

  const authority = new MultiplayerAuthority();
  const created = await authority.createMatch({ setup: setup(), hostPlayerId: 0, userId: "user-oidc-ada" });
  const httpServer = createServer();
  const socketServer = attachMultiplayerWebSocketServer(httpServer, authority, { apiAuthToken: "server-secret" });
  const port = await listenHttpServer(httpServer);
  const baseUrl = `http://127.0.0.1:${port}/api`;
  const identityToken = issuer.sign({
    iss: "https://identity.example.test/",
    aud: "worlddomination-mobile",
    sub: "user-oidc-ada",
    name: "Ada OIDC",
    exp: Math.floor(Date.now() / 1000) + 300,
  });
  let missingIdentitySocket: WebSocket | null = multiplayerSocket(
    baseUrl,
    created.snapshot.id,
    created.playerToken,
    undefined,
    "server-secret",
  );
  let trustedIdentitySocket: WebSocket | null = multiplayerSocket(
    baseUrl,
    created.snapshot.id,
    created.playerToken,
    undefined,
    "server-secret",
    identityToken,
  );

  try {
    assert.equal(await readSocketUpgradeRejectionStatus(missingIdentitySocket), 401);
    missingIdentitySocket = null;
    const initial = await readSocketSnapshot(trustedIdentitySocket);
    assert.equal(initial.id, created.snapshot.id);
    assert.equal(initial.you, 0);
    assert.equal(initial.seats[0]?.userId, "user-oidc-ada");
  } finally {
    disposeSocket(missingIdentitySocket);
    disposeSocket(trustedIdentitySocket);
    socketServer.clients.forEach((client) => client.close());
    clearOidcJwksCacheForTests();
    await issuer.close();
    await closeSocketServer(socketServer);
    await closeHttpServer(httpServer);
    restoreEnv(previousEnv);
  }
});

test("runs a two-client REST and WebSocket multiplayer action loop", async () => {
  const previousAuthToken = process.env.MULTIPLAYER_API_AUTH_TOKEN;
  process.env.MULTIPLAYER_API_AUTH_TOKEN = "loop-secret";
  await multiplayerAuthority.resetForTests();
  const app = express();
  app.use(express.json());
  app.use("/api", multiplayerRouter);
  const httpServer = createServer(app);
  const socketServer = attachMultiplayerWebSocketServer(httpServer);
  const port = await listenHttpServer(httpServer);
  const baseUrl = `http://127.0.0.1:${port}/api`;
  let hostSocket: WebSocket | null = null;
  let joinSocket: WebSocket | null = null;

  try {
    const created = await apiRequest<{ snapshot: MultiplayerSnapshot; playerToken: string }>(
      baseUrl,
      "/multiplayer/matches",
      {
        method: "POST",
        body: JSON.stringify({ setup: setup(), hostPlayerId: 0 }),
      },
    );
    assert.equal(created.snapshot.you, 0);
    assert.ok(!JSON.stringify(created.snapshot).includes(created.playerToken));

    hostSocket = multiplayerSocket(baseUrl, created.snapshot.id, created.playerToken);
    const hostInitial = await readSocketSnapshot(hostSocket);
    assert.equal(hostInitial.version, created.snapshot.version);
    assert.equal(hostInitial.you, 0);

    const joined = await apiRequest<{ snapshot: MultiplayerSnapshot; playerToken: string }>(
      baseUrl,
      `/multiplayer/matches/${created.snapshot.id}/join`,
      {
        method: "POST",
        body: JSON.stringify({ playerId: 1, playerName: "Benedict" }),
      },
    );
    const hostAfterJoin = await readSocketSnapshot(hostSocket);
    assert.equal(hostAfterJoin.version, joined.snapshot.version);
    assert.equal(hostAfterJoin.seats[1]?.claimed, true);
    assert.equal(joined.snapshot.you, 1);

    const lobby = await apiRequest<Array<{ id: string; version: number; openSeatCount: number; claimedSeatCount: number }>>(
      baseUrl,
      "/multiplayer/matches?limit=5&status=active",
      { method: "GET" },
    );
    const lobbyMatch = lobby.find((match) => match.id === created.snapshot.id);
    assert.ok(lobbyMatch);
    assert.equal(lobbyMatch.version, joined.snapshot.version);
    assert.equal(lobbyMatch.openSeatCount, 0);
    assert.equal(lobbyMatch.claimedSeatCount, 2);
    assert.ok(!JSON.stringify(lobby).includes(created.playerToken));
    assert.ok(!JSON.stringify(lobby).includes(joined.playerToken));

    joinSocket = multiplayerSocket(baseUrl, created.snapshot.id, joined.playerToken);
    const joinInitial = await readSocketSnapshot(joinSocket);
    assert.equal(joinInitial.version, joined.snapshot.version);
    assert.equal(joinInitial.you, 1);

    const ready = await acknowledgeViaRestIfNeeded(baseUrl, created.playerToken, joinInitial);
    const watchedReadyHost = ready.version === joinInitial.version ? hostAfterJoin : await readSocketSnapshot(hostSocket);
    const watchedReadyJoin = ready.version === joinInitial.version ? joinInitial : await readSocketSnapshot(joinSocket);
    assert.equal(watchedReadyHost.version, ready.version);
    assert.equal(watchedReadyJoin.version, ready.version);

    const target = ownedTerritory(ready.state, ready.state.currentPlayer);
    const advanced = await apiRequest<MultiplayerSnapshot>(
      baseUrl,
      `/multiplayer/matches/${ready.id}/actions`,
      {
        method: "POST",
        body: JSON.stringify({
          playerToken: created.playerToken,
          expectedVersion: ready.version,
          action: { type: "DEPLOY", territory: target, count: 1 },
        }),
      },
    );
    const hostAfterAction = await readSocketSnapshot(hostSocket);
    const joinAfterAction = await readSocketSnapshot(joinSocket);

    assert.equal(advanced.version, ready.version + 1);
    assert.equal(hostAfterAction.version, advanced.version);
    assert.equal(joinAfterAction.version, advanced.version);
    assert.equal(hostAfterAction.you, 0);
    assert.equal(joinAfterAction.you, 1);
    assert.equal(
      hostAfterAction.state.territories[target].armies,
      ready.state.territories[target].armies + 1,
    );
    assert.equal(joinAfterAction.state.territories[target].armies, hostAfterAction.state.territories[target].armies);
    assert.ok(!JSON.stringify(hostAfterAction).includes(created.playerToken));
    assert.ok(!JSON.stringify(hostAfterAction).includes(joined.playerToken));
    assert.ok(!JSON.stringify(joinAfterAction).includes(created.playerToken));
    assert.ok(!JSON.stringify(joinAfterAction).includes(joined.playerToken));
  } finally {
    hostSocket?.close();
    joinSocket?.close();
    await multiplayerAuthority.resetForTests();
    if (previousAuthToken === undefined) {
      delete process.env.MULTIPLAYER_API_AUTH_TOKEN;
    } else {
      process.env.MULTIPLAYER_API_AUTH_TOKEN = previousAuthToken;
    }
    await closeSocketServer(socketServer);
    await closeHttpServer(httpServer);
  }
});

test("redacts other commanders' staged Same Time attack orders", async () => {
  const authority = new MultiplayerAuthority();
  const created = await authority.createMatch({ setup: setup("sameTime"), hostPlayerId: 0 });
  const joined = await authority.joinMatch(created.snapshot.id, { playerId: 1 });

  let p0 = await acknowledgeIfNeeded(
    authority,
    created.snapshot.id,
    created.playerToken,
    await authority.snapshot(created.snapshot.id, created.playerToken),
  );
  const p0Source = ownedBorder(p0.state, 0, false).from;
  const p0Remaining = p0.state.sameTime?.reinforcementsRemaining[0] ?? 0;
  if (p0Remaining > 0) {
    p0 = await authority.applyAction(created.snapshot.id, {
      playerToken: created.playerToken,
      expectedVersion: p0.version,
      action: { type: "DEPLOY", territory: p0Source, count: p0Remaining },
    });
  }
  p0 = await authority.applyAction(created.snapshot.id, {
    playerToken: created.playerToken,
    expectedVersion: p0.version,
    action: { type: "ST_READY_REINFORCE" },
  });

  let p1 = await acknowledgeIfNeeded(
    authority,
    created.snapshot.id,
    joined.playerToken,
    await authority.snapshot(created.snapshot.id, joined.playerToken),
  );
  const p1Source = ownedBorder(p1.state, 1, false).from;
  const p1Remaining = p1.state.sameTime?.reinforcementsRemaining[1] ?? 0;
  if (p1Remaining > 0) {
    p1 = await authority.applyAction(created.snapshot.id, {
      playerToken: joined.playerToken,
      expectedVersion: p1.version,
      action: { type: "DEPLOY", territory: p1Source, count: p1Remaining },
    });
  }
  p1 = await authority.applyAction(created.snapshot.id, {
    playerToken: joined.playerToken,
    expectedVersion: p1.version,
    action: { type: "ST_READY_REINFORCE" },
  });

  const battleStart = await acknowledgeIfNeeded(
    authority,
    created.snapshot.id,
    created.playerToken,
    await authority.snapshot(created.snapshot.id, created.playerToken),
  );
  assert.equal(battleStart.state.phase, "sameTimeBattle");
  const attack = ownedBorder(battleStart.state, 0, true);
  const afterOrder = await authority.applyAction(created.snapshot.id, {
    playerToken: created.playerToken,
    expectedVersion: battleStart.version,
    action: { type: "ST_QUEUE_ATTACK", from: attack.from, to: attack.to, count: 1, surgeTo: null },
  });
  const rivalView = await authority.snapshot(created.snapshot.id, joined.playerToken);

  assert.equal(afterOrder.state.sameTime?.orders.length, 1);
  assert.equal(rivalView.state.sameTime?.orders.length, 0);
  assert.ok(!rivalView.state.log.some((entry) => /\borders\b.*\bagainst\b/i.test(entry.text)));
});

async function acknowledgeViaRestIfNeeded(
  baseUrl: string,
  playerToken: string,
  snapshot: MultiplayerSnapshot,
): Promise<MultiplayerSnapshot> {
  if (!snapshot.state.awaitingHandoff) {
    return snapshot;
  }
  return apiRequest<MultiplayerSnapshot>(baseUrl, `/multiplayer/matches/${snapshot.id}/actions`, {
    method: "POST",
    body: JSON.stringify({
      playerToken,
      expectedVersion: snapshot.version,
      action: { type: "ACKNOWLEDGE_HANDOFF" },
    }),
  });
}

async function apiRequest<T>(baseUrl: string, path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "authorization": "Bearer loop-secret",
      "content-type": "application/json",
      ...init.headers,
    },
  });
  if (!response.ok) {
    throw new Error(`API request ${path} failed with ${response.status}: ${await response.text()}`);
  }
  return await response.json() as T;
}

async function readStreamUntil(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  predicate: (text: string) => boolean,
  timeoutMessage: string,
): Promise<string> {
  const decoder = new TextDecoder();
  const deadline = Date.now() + 2000;
  let text = "";
  while (Date.now() < deadline) {
    const remainingMs = Math.max(1, deadline - Date.now());
    const result = await Promise.race([
      reader.read(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), Math.min(remainingMs, 50))),
    ]);
    if (result === null) {
      continue;
    }
    if (result.done) {
      break;
    }
    text += decoder.decode(result.value, { stream: true });
    if (predicate(text)) {
      return text;
    }
  }
  throw new Error(`${timeoutMessage}\n${text}`);
}

function multiplayerSocket(
  baseUrl: string,
  matchId: string,
  playerToken: string,
  headers?: Record<string, string>,
  apiAuthToken = "loop-secret",
  identityToken?: string,
): WebSocket {
  const url = new URL(baseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = `/api/multiplayer/matches/${encodeURIComponent(matchId)}/socket`;
  const searchParams = new URLSearchParams({
    playerToken,
    apiAuthToken,
  });
  if (identityToken) {
    searchParams.set("identityToken", identityToken);
  }
  url.search = searchParams.toString();
  return new WebSocket(url, headers ? { headers } : undefined);
}

async function acknowledgeSocketHandoff(
  authority: MultiplayerAuthority,
  socket: WebSocket,
  matchId: string,
  playerToken: string,
  snapshot: MultiplayerSnapshot,
): Promise<MultiplayerSnapshot> {
  const acknowledged = await authority.applyAction(matchId, {
    playerToken,
    expectedVersion: snapshot.version,
    action: { type: "ACKNOWLEDGE_HANDOFF" },
  });
  const pushed = await readSocketSnapshot(socket);
  assert.equal(pushed.version, acknowledged.version);
  return pushed;
}

function readSocketSnapshot(socket: WebSocket): Promise<MultiplayerSnapshot> {
  return readSocketJson<MultiplayerSnapshot>(socket, "Timed out waiting for multiplayer WebSocket snapshot.");
}

function readSocketUpgradeRejectionStatus(socket: WebSocket): Promise<number> {
  return new Promise((resolveStatus, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for multiplayer WebSocket upgrade rejection."));
    }, 5_000);
    const handleUnexpectedResponse = (_request: ClientRequest, response: IncomingMessage) => {
      cleanup();
      resolveStatus(response.statusCode ?? 0);
    };
    const handleOpen = () => {
      cleanup();
      reject(new Error("Expected multiplayer WebSocket upgrade to be rejected, but it opened."));
    };
    const handleError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      clearTimeout(timer);
      socket.off("unexpected-response", handleUnexpectedResponse);
      socket.off("open", handleOpen);
      socket.off("error", handleError);
    };

    socket.once("unexpected-response", handleUnexpectedResponse);
    socket.once("open", handleOpen);
    socket.once("error", handleError);
  });
}

function disposeSocket(socket: WebSocket | null): void {
  if (!socket) {
    return;
  }
  try {
    if (socket.readyState === WebSocket.CONNECTING) {
      socket.terminate();
      return;
    }
    socket.close();
  } catch (error) {
    if (error instanceof Error && /before the connection was established/i.test(error.message)) {
      return;
    }
    throw error;
  }
}

function readSocketJson<T>(socket: WebSocket, timeoutMessage: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const handleMessage = (data: RawData) => {
      cleanup();
      resolve(JSON.parse(data.toString()) as T);
    };
    const handleError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(timeoutMessage));
    }, 5_000);
    const cleanup = () => {
      clearTimeout(timer);
      socket.off("message", handleMessage);
      socket.off("error", handleError);
    };

    socket.once("message", handleMessage);
    socket.once("error", handleError);
  });
}

function listenHttpServer(server: HttpServer): Promise<number> {
  return new Promise((resolve, reject) => {
    const handleError = (error: Error) => {
      server.off("listening", handleListening);
      reject(error);
    };
    const handleListening = () => {
      server.off("error", handleError);
      const address = server.address() as AddressInfo | string | null;
      if (!address || typeof address === "string") {
        reject(new Error("HTTP server did not bind to a TCP port."));
        return;
      }
      resolve(address.port);
    };

    server.once("error", handleError);
    server.once("listening", handleListening);
    server.listen(0, "127.0.0.1");
  });
}

function closeSocketServer(server: WebSocketServer): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

function closeHttpServer(server: HttpServer): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

interface TestOidcIssuer {
  jwksUrl: string;
  sign(claims: Record<string, unknown>): string;
  close(): Promise<void>;
}

async function createTestOidcIssuer(): Promise<TestOidcIssuer> {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const publicJwk = publicKey.export({ format: "jwk" }) as Record<string, unknown>;
  publicJwk.kid = "test-key-1";
  publicJwk.alg = "RS256";
  publicJwk.use = "sig";
  const server = createServer((req, res) => {
    if (req.url === "/.well-known/jwks.json") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ keys: [publicJwk] }));
      return;
    }
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not_found" }));
  });
  const port = await listenHttpServer(server);
  return {
    jwksUrl: `http://127.0.0.1:${port}/.well-known/jwks.json`,
    sign: (claims) => signTestJwt(privateKey, claims),
    close: () => closeHttpServer(server),
  };
}

function signTestJwt(privateKey: KeyObject, claims: Record<string, unknown>): string {
  const header = base64UrlJson({ alg: "RS256", typ: "JWT", kid: "test-key-1" });
  const payload = base64UrlJson(claims);
  const signingInput = `${header}.${payload}`;
  const signature = createSign("RSA-SHA256").update(signingInput).end().sign(privateKey).toString("base64url");
  return `${signingInput}.${signature}`;
}

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function saveEnv(names: string[]): Map<string, string | undefined> {
  return new Map(names.map((name) => [name, process.env[name]]));
}

function restoreEnv(values: Map<string, string | undefined>): void {
  for (const [name, value] of values) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
}

import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { createGame, gameReducer, normalizeState } from "../../../mobile/game/engine";
import { GENERALS } from "../../../mobile/game/generals";
import { TERRITORY_MAP } from "../../../mobile/game/mapData";
import type {
  GameAction,
  GameSetup,
  GameState,
  PlayerState,
  SameTimeState,
  TerritoryId,
} from "../../../mobile/game/types";
import {
  createConfiguredMultiplayerInvitationDelivery,
  type MultiplayerInvitationDelivery,
  type MultiplayerInvitationDeliveryPayload,
} from "./multiplayerInvitationDelivery";

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

export type MultiplayerMatchListStatus = "all" | "joinable" | "active" | "finished";
export type MultiplayerMatchListScope = "public" | "mine";

export interface MultiplayerMatchSummary {
  id: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  lobbyStatus: Exclude<MultiplayerMatchListStatus, "all">;
  phase: GameState["phase"];
  turn: number;
  objective: GameState["setup"]["objective"];
  turnStyle: NonNullable<GameState["setup"]["turnStyle"]>;
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
  lobbyStatus: Exclude<MultiplayerMatchListStatus, "all">;
  phase: GameState["phase"];
  turn: number;
  objective: GameState["setup"]["objective"];
  turnStyle: NonNullable<GameState["setup"]["turnStyle"]>;
  playerId: number;
  playerName: string;
  invitedByPlayerId: number;
  invitedByPlayerName: string;
  createdAt: string;
}

export interface SeatClaim {
  playerId: number;
  token: string;
  claimedAt: string;
  sessionId?: string;
  sessionLabel?: string;
  userId?: string;
  lastSeenAt?: string;
}

export interface SeatInvitation {
  playerId: number;
  invitedUserId: string;
  invitedByPlayerId: number;
  invitedByUserId?: string;
  createdAt: string;
}

interface MultiplayerMatch {
  id: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  state: GameState;
  seats: Map<number, SeatClaim>;
  invitations: Map<number, SeatInvitation>;
}

export type MultiplayerUpdateReason = "created" | "joined" | "invited" | "action";

export interface MultiplayerMatchUpdate {
  matchId: string;
  version: number;
  updatedAt: string;
  reason: MultiplayerUpdateReason;
}

export interface MultiplayerMatchRecord {
  id: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  state: GameState;
  seats: SeatClaim[];
  invitations: SeatInvitation[];
}

type MaybePromise<T> = T | Promise<T>;

export interface MultiplayerMatchStore {
  get(matchId: string): MaybePromise<MultiplayerMatchRecord | null>;
  list(limit: number): MaybePromise<MultiplayerMatchRecord[]>;
  save(match: MultiplayerMatchRecord, expectedCurrentVersion?: number): MaybePromise<boolean>;
  clear(): MaybePromise<void>;
}

export interface PostgresQueryClient {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
}

export class InMemoryMultiplayerMatchStore implements MultiplayerMatchStore {
  private readonly matches = new Map<string, MultiplayerMatchRecord>();

  get(matchId: string): MultiplayerMatchRecord | null {
    const match = this.matches.get(matchId);
    return match ? cloneRecord(match) : null;
  }

  list(limit: number): MultiplayerMatchRecord[] {
    return [...this.matches.values()]
      .sort(compareRecordsByUpdatedAtDesc)
      .slice(0, limit)
      .map(cloneRecord);
  }

  save(match: MultiplayerMatchRecord, expectedCurrentVersion?: number): boolean {
    if (expectedCurrentVersion !== undefined) {
      const current = this.matches.get(match.id);
      if (!current || current.version !== expectedCurrentVersion) {
        return false;
      }
    }
    this.matches.set(match.id, cloneRecord(match));
    return true;
  }

  clear(): void {
    this.matches.clear();
  }
}

export class JsonFileMultiplayerMatchStore implements MultiplayerMatchStore {
  constructor(private readonly filePath: string) {}

  get(matchId: string): MultiplayerMatchRecord | null {
    return this.readAll().get(matchId) ?? null;
  }

  list(limit: number): MultiplayerMatchRecord[] {
    return [...this.readAll().values()]
      .sort(compareRecordsByUpdatedAtDesc)
      .slice(0, limit)
      .map(cloneRecord);
  }

  save(match: MultiplayerMatchRecord, expectedCurrentVersion?: number): boolean {
    const matches = this.readAll();
    if (expectedCurrentVersion !== undefined) {
      const current = matches.get(match.id);
      if (!current || current.version !== expectedCurrentVersion) {
        return false;
      }
    }
    matches.set(match.id, cloneRecord(match));
    this.writeAll(matches);
    return true;
  }

  clear(): void {
    this.writeAll(new Map());
  }

  private readAll(): Map<string, MultiplayerMatchRecord> {
    try {
      const raw = readFileSync(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as unknown;
      const records = requireArray(
        requireRecord(parsed, "multiplayer store")["matches"],
        "multiplayer store.matches",
      );
      return new Map(records.map((record) => {
        const match = parseMatchRecord(record);
        return [match.id, match];
      }));
    } catch (error) {
      if (isFileNotFound(error)) {
        return new Map();
      }
      throw error;
    }
  }

  private writeAll(matches: Map<string, MultiplayerMatchRecord>): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    const payload = JSON.stringify({ matches: [...matches.values()] }, null, 2);
    const tempPath = `${this.filePath}.${process.pid}.tmp`;
    writeFileSync(tempPath, `${payload}\n`);
    renameSync(tempPath, this.filePath);
  }
}

export class PostgresMultiplayerMatchStore implements MultiplayerMatchStore {
  private ready: Promise<void> | null = null;

  constructor(
    private readonly client: PostgresQueryClient,
    private readonly options: { ensureSchema?: boolean } = {},
  ) {}

  async get(matchId: string): Promise<MultiplayerMatchRecord | null> {
    await this.ensureSchema();
    const result = await this.client.query<PostgresMultiplayerMatchRow>(
      `
        SELECT id, version, created_at, updated_at, state, seats, invitations
        FROM multiplayer_matches
        WHERE id = $1
      `,
      [matchId],
    );
    const row = result.rows[0];
    return row ? recordFromPostgresRow(row) : null;
  }

  async list(limit: number): Promise<MultiplayerMatchRecord[]> {
    await this.ensureSchema();
    const result = await this.client.query<PostgresMultiplayerMatchRow>(
      `
        SELECT id, version, created_at, updated_at, state, seats, invitations
        FROM multiplayer_matches
        ORDER BY updated_at DESC
        LIMIT $1
      `,
      [limit],
    );
    return result.rows.map(recordFromPostgresRow);
  }

  async save(match: MultiplayerMatchRecord, expectedCurrentVersion?: number): Promise<boolean> {
    await this.ensureSchema();
    if (expectedCurrentVersion === undefined) {
      const result = await this.client.query(
        `
          INSERT INTO multiplayer_matches (id, version, created_at, updated_at, state, seats, invitations)
          VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb)
          ON CONFLICT (id) DO NOTHING
        `,
        [
          match.id,
          match.version,
          match.createdAt,
          match.updatedAt,
          JSON.stringify(match.state),
          JSON.stringify(match.seats),
          JSON.stringify(match.invitations),
        ],
      );
      return result.rowCount !== 0;
    }

    const result = await this.client.query(
      `
        UPDATE multiplayer_matches
        SET version = $2,
            updated_at = $3,
            state = $4::jsonb,
            seats = $5::jsonb,
            invitations = $6::jsonb
        WHERE id = $1
          AND version = $7
      `,
      [
        match.id,
        match.version,
        match.updatedAt,
        JSON.stringify(match.state),
        JSON.stringify(match.seats),
        JSON.stringify(match.invitations),
        expectedCurrentVersion,
      ],
    );
    return result.rowCount !== 0;
  }

  async clear(): Promise<void> {
    await this.ensureSchema();
    await this.client.query("DELETE FROM multiplayer_matches");
  }

  private ensureSchema(): Promise<void> {
    if (this.options.ensureSchema === false) {
      return Promise.resolve();
    }
    this.ready = this.ready ?? this.client.query(`
      BEGIN;
      SELECT pg_advisory_xact_lock(927357214, 260729);
      CREATE TABLE IF NOT EXISTS multiplayer_matches (
        id text PRIMARY KEY,
        version integer NOT NULL CHECK (version >= 1),
        created_at timestamptz NOT NULL,
        updated_at timestamptz NOT NULL,
        state jsonb NOT NULL,
        seats jsonb NOT NULL,
        invitations jsonb NOT NULL DEFAULT '[]'::jsonb
      );
      ALTER TABLE multiplayer_matches
        ADD COLUMN IF NOT EXISTS invitations jsonb NOT NULL DEFAULT '[]'::jsonb;
      CREATE INDEX IF NOT EXISTS multiplayer_matches_updated_at_idx
        ON multiplayer_matches (updated_at);
      COMMIT;
    `).then(() => undefined);
    return this.ready;
  }
}

export class MultiplayerError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

export interface CreateMatchInput {
  setup: unknown;
  hostPlayerId?: unknown;
  sessionId?: unknown;
  sessionLabel?: unknown;
  userId?: unknown;
}

export interface JoinMatchInput {
  playerId: unknown;
  playerName?: unknown;
  sessionId?: unknown;
  sessionLabel?: unknown;
  userId?: unknown;
}

export interface QuickMatchInput {
  setup: unknown;
  playerName?: unknown;
  sessionId?: unknown;
  sessionLabel?: unknown;
  userId?: unknown;
}

export interface QuickMatchResult {
  snapshot: MultiplayerSnapshot;
  playerToken: string;
  sessionId: string | null;
  matchSource: "created" | "joined";
}

interface QuickMatchCandidate {
  matchId: string;
  playerId: number;
  summary: MultiplayerMatchSummary;
}

export interface CreateSeatInvitationInput {
  playerToken: unknown;
  sessionId?: unknown;
  userId?: unknown;
  playerId: unknown;
  invitedUserId: unknown;
}

export interface CreateSeatInvitationResult {
  snapshot: MultiplayerSnapshot;
  invitation: SeatInvitation;
}

export interface ApplyActionInput {
  playerToken: unknown;
  sessionId?: unknown;
  userId?: unknown;
  expectedVersion: unknown;
  action: unknown;
}

export interface ListMatchesInput {
  limit?: unknown;
  status?: unknown;
  scope?: unknown;
  userId?: unknown;
}

export interface ListInvitationsInput {
  limit?: unknown;
  userId?: unknown;
}

export class MultiplayerAuthority {
  private readonly updates = new EventEmitter();

  constructor(
    private readonly store: MultiplayerMatchStore = new InMemoryMultiplayerMatchStore(),
    private readonly invitationDelivery: MultiplayerInvitationDelivery | null = createConfiguredMultiplayerInvitationDelivery(),
  ) {
    this.updates.setMaxListeners(200);
  }

  async createMatch(input: CreateMatchInput): Promise<{ snapshot: MultiplayerSnapshot; playerToken: string; sessionId: string | null }> {
    const setup = parseGameSetup(input.setup);
    const state = createGame(setup);
    const hostPlayerId = input.hostPlayerId === undefined ? firstHumanPlayerId(state) : parsePlayerId(input.hostPlayerId);
    const now = new Date().toISOString();
    const match: MultiplayerMatch = {
      id: randomUUID(),
      version: 1,
      createdAt: now,
      updatedAt: now,
      state,
      seats: new Map(),
      invitations: new Map(),
    };
    const claim = this.claimSeat(match, hostPlayerId, undefined, input.sessionId, input.sessionLabel, input.userId, now);
    await this.saveMatch(match);
    this.publishMatch(match, "created");
    return { snapshot: snapshotFor(match, hostPlayerId), playerToken: claim.token, sessionId: claim.sessionId ?? null };
  }

  async joinMatch(matchId: string, input: JoinMatchInput): Promise<{ snapshot: MultiplayerSnapshot; playerToken: string; sessionId: string | null }> {
    const match = await this.requireMatch(matchId);
    const now = new Date().toISOString();
    const playerId = parsePlayerId(input.playerId);
    const beforeVersion = match.version;
    const claim = this.claimSeat(match, playerId, input.playerName, input.sessionId, input.sessionLabel, input.userId, now);
    if (match.version === beforeVersion) {
      match.version += 1;
      match.updatedAt = now;
    }
    await this.saveMatch(match, beforeVersion);
    this.publishMatch(match, "joined");
    return { snapshot: snapshotFor(match, playerId), playerToken: claim.token, sessionId: claim.sessionId ?? null };
  }

  async quickMatch(input: QuickMatchInput): Promise<QuickMatchResult> {
    const setup = parseGameSetup(input.setup);
    const playerName = parseOptionalPlayerName(input.playerName);
    const sessionId = parseOptionalSessionId(input.sessionId);
    const userId = parseOptionalUserId(input.userId);
    const records = await this.store.list(50);

    for (const { matchId, playerId } of rankedQuickMatchCandidates(records, setup, sessionId, userId)) {
      try {
        const joined = await this.joinMatch(matchId, {
          playerId,
          ...(playerName ? { playerName } : {}),
          ...(sessionId ? { sessionId } : {}),
          sessionLabel: input.sessionLabel,
          ...(userId ? { userId } : {}),
        });
        return { ...joined, matchSource: "joined" };
      } catch (error) {
        if (!isTransientQuickMatchJoinError(error)) {
          throw error;
        }
      }
    }

    const created = await this.createMatch({
      setup: setupWithQuickMatchHostName(setup, playerName),
      ...(sessionId ? { sessionId } : {}),
      sessionLabel: input.sessionLabel,
      ...(userId ? { userId } : {}),
    });
    return { ...created, matchSource: "created" };
  }

  async inviteSeat(matchId: string, input: CreateSeatInvitationInput): Promise<CreateSeatInvitationResult> {
    const match = await this.requireMatch(matchId);
    const playerToken = parseToken(input.playerToken);
    const inviterClaim = this.seatClaimForToken(match, playerToken);
    this.requireMatchingSession(inviterClaim, input.sessionId);
    this.requireMatchingUser(inviterClaim, input.userId);
    const playerId = parsePlayerId(input.playerId);
    this.requireInvitableSeat(match, playerId);
    const invitedUserId = parseRequiredUserId(input.invitedUserId, "invitedUserId");
    const now = new Date().toISOString();
    const beforeVersion = match.version;
    const invitation: SeatInvitation = {
      playerId,
      invitedUserId,
      invitedByPlayerId: inviterClaim.playerId,
      ...(inviterClaim.userId ? { invitedByUserId: inviterClaim.userId } : {}),
      createdAt: now,
    };
    match.invitations.set(playerId, invitation);
    match.version += 1;
    match.updatedAt = now;
    await this.saveMatch(match, beforeVersion);
    this.publishMatch(match, "invited");
    await this.deliverInvitation(match, invitation);
    return { snapshot: snapshotFor(match, inviterClaim.playerId), invitation: { ...invitation } };
  }

  async snapshot(matchId: string, playerToken?: unknown, userId?: unknown): Promise<MultiplayerSnapshot> {
    const match = await this.requireMatch(matchId);
    const viewer = playerToken === undefined ? null : this.viewerForToken(match, parseToken(playerToken), userId);
    return snapshotFor(match, viewer);
  }

  async listMatches(input: ListMatchesInput = {}): Promise<MultiplayerMatchSummary[]> {
    const limit = parseMatchListLimit(input.limit);
    const status = parseMatchListStatus(input.status);
    const scope = parseMatchListScope(input.scope);
    const userId = scope === "mine" ? parseOptionalUserId(input.userId) : undefined;
    const records = await this.store.list(status === "all" && scope === "public" ? limit : 50);
    return records
      .map((record) => matchFromRecord(record))
      .filter((match) => scope === "public" || (userId ? matchBelongsToUser(match, userId) : false))
      .map((match) => summaryFor(match))
      .filter((summary) => status === "all" || summary.lobbyStatus === status)
      .slice(0, limit);
  }

  async listInvitations(input: ListInvitationsInput): Promise<MultiplayerInvitationSummary[]> {
    const limit = parseMatchListLimit(input.limit);
    const userId = parseRequiredUserId(input.userId, "userId");
    const records = await this.store.list(50);
    return records
      .flatMap((record) => invitationSummariesFor(matchFromRecord(record), userId))
      .sort(compareInvitationSummariesByCreatedAtDesc)
      .slice(0, limit);
  }

  async applyAction(matchId: string, input: ApplyActionInput): Promise<MultiplayerSnapshot> {
    const match = await this.requireMatch(matchId);
    const playerToken = parseToken(input.playerToken);
    const claim = this.seatClaimForToken(match, playerToken);
    this.requireMatchingSession(claim, input.sessionId);
    this.requireMatchingUser(claim, input.userId);
    const playerId = claim.playerId;
    const expectedVersion = parseExpectedVersion(input.expectedVersion);
    if (expectedVersion !== match.version) {
      throw new MultiplayerError(
        "VERSION_CONFLICT",
        `Expected match version ${expectedVersion}, but current version is ${match.version}.`,
        409,
      );
    }
    if (playerId !== match.state.currentPlayer) {
      throw new MultiplayerError(
        "NOT_CURRENT_PLAYER",
        `Player ${playerId} cannot act while player ${match.state.currentPlayer} has authority.`,
        403,
      );
    }

    const action = parseGameAction(input.action);
    const next = gameReducer(match.state, action);
    if (next === match.state) {
      throw new MultiplayerError("ACTION_REJECTED", "The canonical game reducer rejected this action.", 422);
    }

    const now = new Date().toISOString();
    match.state = normalizeState(next);
    match.version += 1;
    match.updatedAt = now;
    if (claim.sessionId || claim.userId) {
      match.seats.set(playerId, { ...claim, lastSeenAt: now });
    }
    await this.saveMatch(match, expectedVersion);
    this.publishMatch(match, "action");
    return snapshotFor(match, playerId);
  }

  subscribe(matchId: string, listener: (update: MultiplayerMatchUpdate) => void): () => void {
    const eventName = updateEventName(matchId);
    this.updates.on(eventName, listener);
    return () => {
      this.updates.off(eventName, listener);
    };
  }

  subscribeAll(listener: (update: MultiplayerMatchUpdate) => void): () => void {
    const eventName = allUpdatesEventName();
    this.updates.on(eventName, listener);
    return () => {
      this.updates.off(eventName, listener);
    };
  }

  async resetForTests(): Promise<void> {
    await this.store.clear();
    this.updates.removeAllListeners();
  }

  private async requireMatch(matchId: string): Promise<MultiplayerMatch> {
    const record = await this.store.get(matchId);
    if (!record) {
      throw new MultiplayerError("MATCH_NOT_FOUND", "Match not found.", 404);
    }
    return matchFromRecord(record);
  }

  private async saveMatch(match: MultiplayerMatch, expectedCurrentVersion?: number): Promise<void> {
    const saved = await this.store.save(recordFromMatch(match), expectedCurrentVersion);
    if (!saved) {
      throw new MultiplayerError(
        "VERSION_CONFLICT",
        "The match changed before this update could be saved.",
        409,
      );
    }
  }

  private publishMatch(match: MultiplayerMatch, reason: MultiplayerUpdateReason): void {
    const update = {
      matchId: match.id,
      version: match.version,
      updatedAt: match.updatedAt,
      reason,
    } satisfies MultiplayerMatchUpdate;
    this.updates.emit(updateEventName(match.id), update);
    this.updates.emit(allUpdatesEventName(), update);
  }

  private async deliverInvitation(match: MultiplayerMatch, invitation: SeatInvitation): Promise<void> {
    if (!this.invitationDelivery) {
      return;
    }
    try {
      await this.invitationDelivery.deliver(invitationDeliveryPayloadFor(match, invitation));
    } catch {
      // Invitation delivery is best-effort; the version-guarded seat reservation remains authoritative.
    }
  }

  private claimSeat(
    match: MultiplayerMatch,
    playerId: number,
    playerName: unknown,
    sessionIdInput: unknown,
    sessionLabelInput: unknown,
    userIdInput: unknown,
    now: string,
  ): SeatClaim {
    const player = match.state.players[playerId];
    if (!player) {
      throw new MultiplayerError("PLAYER_NOT_FOUND", "Player slot not found.", 404);
    }
    if (!player.isHuman) {
      throw new MultiplayerError("PLAYER_NOT_JOINABLE", "Only human player slots can be claimed.", 409);
    }
    if (match.seats.has(playerId)) {
      throw new MultiplayerError("PLAYER_ALREADY_CLAIMED", "Player slot already claimed.", 409);
    }
    const userId = parseOptionalUserId(userIdInput);
    this.requireMatchingInvitation(match, playerId, userId);
    const name = parseOptionalPlayerName(playerName);
    if (name) {
      match.state = {
        ...match.state,
        players: match.state.players.map((p) => (p.id === playerId ? { ...p, name } : p)),
      };
      match.version += 1;
      match.updatedAt = now;
    }
    const token = randomUUID();
    const sessionId = parseOptionalSessionId(sessionIdInput);
    const sessionLabel = parseOptionalSessionLabel(sessionLabelInput);
    const claim: SeatClaim = {
      playerId,
      token,
      claimedAt: now,
      ...(sessionId ? { sessionId } : {}),
      ...(sessionLabel ? { sessionLabel } : {}),
      ...(userId ? { userId } : {}),
      ...(sessionId || userId ? { lastSeenAt: now } : {}),
    };
    match.seats.set(playerId, claim);
    match.invitations.delete(playerId);
    return claim;
  }

  private requireInvitableSeat(match: MultiplayerMatch, playerId: number): void {
    const player = match.state.players[playerId];
    if (!player) {
      throw new MultiplayerError("PLAYER_NOT_FOUND", "Player slot not found.", 404);
    }
    if (!player.isHuman) {
      throw new MultiplayerError("PLAYER_NOT_JOINABLE", "Only human player slots can be invited.", 409);
    }
    if (match.seats.has(playerId)) {
      throw new MultiplayerError("PLAYER_ALREADY_CLAIMED", "Player slot already claimed.", 409);
    }
  }

  private requireMatchingInvitation(match: MultiplayerMatch, playerId: number, userId: string | undefined): void {
    const invitation = match.invitations.get(playerId);
    if (!invitation) {
      return;
    }
    if (userId !== invitation.invitedUserId) {
      throw new MultiplayerError(
        "INVITATION_MISMATCH",
        "This seat is reserved for a different invited authenticated user.",
        403,
      );
    }
  }

  private viewerForToken(match: MultiplayerMatch, token: string, userId: unknown): number {
    const claim = this.seatClaimForToken(match, token);
    this.requireMatchingUser(claim, userId);
    return claim.playerId;
  }

  private seatClaimForToken(match: MultiplayerMatch, token: string): SeatClaim {
    for (const claim of match.seats.values()) {
      if (claim.token === token) {
        return claim;
      }
    }
    throw new MultiplayerError("INVALID_PLAYER_TOKEN", "Player token is invalid for this match.", 403);
  }

  private requireMatchingSession(claim: SeatClaim, value: unknown): void {
    if (!claim.sessionId) {
      return;
    }
    const sessionId = parseOptionalSessionId(value);
    if (sessionId !== claim.sessionId) {
      throw new MultiplayerError(
        "SESSION_MISMATCH",
        "This player token is bound to a different client session.",
        403,
      );
    }
  }

  private requireMatchingUser(claim: SeatClaim, value: unknown): void {
    if (!claim.userId) {
      return;
    }
    const userId = parseOptionalUserId(value);
    if (userId !== claim.userId) {
      throw new MultiplayerError(
        "USER_MISMATCH",
        "This player token is bound to a different authenticated user.",
        403,
      );
    }
  }
}

interface PostgresMultiplayerMatchRow extends Record<string, unknown> {
  id: string;
  version: number;
  created_at: string | Date;
  updated_at: string | Date;
  state: unknown;
  seats: unknown;
  invitations: unknown;
}

function updateEventName(matchId: string): string {
  return `match:${matchId}`;
}

function allUpdatesEventName(): string {
  return "match:*";
}

export const multiplayerAuthority = new MultiplayerAuthority(createConfiguredMultiplayerMatchStore());

export function createConfiguredMultiplayerMatchStore(): MultiplayerMatchStore | undefined {
  if (parseBooleanEnv(process.env.MULTIPLAYER_DATABASE_STORE)) {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is required when MULTIPLAYER_DATABASE_STORE is enabled.");
    }
    const dbModule = import("../../../../lib/db/src/index");
    return new PostgresMultiplayerMatchStore({
      async query<T extends Record<string, unknown> = Record<string, unknown>>(text: string, values?: unknown[]) {
        const { pool } = await dbModule;
        return pool.query<T>(text, values);
      },
    });
  }

  if (process.env.MULTIPLAYER_MATCH_STORE_PATH) {
    return new JsonFileMultiplayerMatchStore(process.env.MULTIPLAYER_MATCH_STORE_PATH);
  }

  return undefined;
}

function recordFromMatch(match: MultiplayerMatch): MultiplayerMatchRecord {
  return {
    id: match.id,
    version: match.version,
    createdAt: match.createdAt,
    updatedAt: match.updatedAt,
    state: match.state,
    seats: [...match.seats.values()].map((seat) => ({ ...seat })),
    invitations: [...match.invitations.values()].map((invitation) => ({ ...invitation })),
  };
}

function recordFromPostgresRow(row: PostgresMultiplayerMatchRow): MultiplayerMatchRecord {
  return parseMatchRecord({
    id: row.id,
    version: row.version,
    createdAt: isoStringFromDatabaseValue(row.created_at, "multiplayer_matches.created_at"),
    updatedAt: isoStringFromDatabaseValue(row.updated_at, "multiplayer_matches.updated_at"),
    state: parseJsonColumn(row.state, "multiplayer_matches.state"),
    seats: parseJsonColumn(row.seats, "multiplayer_matches.seats"),
    invitations: parseJsonColumn(row.invitations ?? [], "multiplayer_matches.invitations"),
  });
}

function matchFromRecord(record: MultiplayerMatchRecord): MultiplayerMatch {
  return {
    id: record.id,
    version: record.version,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    state: normalizeState(record.state),
    seats: new Map(record.seats.map((seat) => [seat.playerId, { ...seat }])),
    invitations: new Map(record.invitations.map((invitation) => [invitation.playerId, { ...invitation }])),
  };
}

function parseJsonColumn(value: unknown, field: string): unknown {
  if (typeof value !== "string") {
    return value;
  }
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new MultiplayerError("INVALID_STORE_RECORD", `${field} is not valid JSON.`, 500);
  }
}

function isoStringFromDatabaseValue(value: unknown, field: string): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return parseNonEmptyString(value, field, 80);
}

function cloneRecord(record: MultiplayerMatchRecord): MultiplayerMatchRecord {
  return {
    id: record.id,
    version: record.version,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    state: structuredClone(record.state),
    seats: record.seats.map((seat) => ({ ...seat })),
    invitations: record.invitations.map((invitation) => ({ ...invitation })),
  };
}

function parseMatchRecord(value: unknown): MultiplayerMatchRecord {
  const input = requireRecord(value, "match");
  const seats = requireArray(input["seats"], "match.seats").map(parseSeatClaim);
  const invitations = input["invitations"] === undefined
    ? []
    : requireArray(input["invitations"], "match.invitations").map(parseSeatInvitation);
  return {
    id: parseNonEmptyString(input["id"], "match.id", 120),
    version: parseInteger(input["version"], "match.version", 1, Number.MAX_SAFE_INTEGER),
    createdAt: parseNonEmptyString(input["createdAt"], "match.createdAt", 80),
    updatedAt: parseNonEmptyString(input["updatedAt"], "match.updatedAt", 80),
    state: normalizeState(requireRecord(input["state"], "match.state") as unknown as GameState),
    seats,
    invitations,
  };
}

function parseSeatClaim(value: unknown): SeatClaim {
  const input = requireRecord(value, "match.seats[]");
  const sessionId = parseStoredOptionalString(input["sessionId"], "match.seats[].sessionId", 120);
  const sessionLabel = parseStoredOptionalString(input["sessionLabel"], "match.seats[].sessionLabel", 80);
  const userId = parseStoredOptionalString(input["userId"], "match.seats[].userId", 120);
  const lastSeenAt = parseStoredOptionalString(input["lastSeenAt"], "match.seats[].lastSeenAt", 80);
  return {
    playerId: parsePlayerId(input["playerId"]),
    token: parseToken(input["token"]),
    claimedAt: parseNonEmptyString(input["claimedAt"], "match.seats[].claimedAt", 80),
    ...(sessionId ? { sessionId } : {}),
    ...(sessionLabel ? { sessionLabel } : {}),
    ...(userId ? { userId } : {}),
    ...(lastSeenAt ? { lastSeenAt } : {}),
  };
}

function parseSeatInvitation(value: unknown): SeatInvitation {
  const input = requireRecord(value, "match.invitations[]");
  const invitedByUserId = parseStoredOptionalString(input["invitedByUserId"], "match.invitations[].invitedByUserId", 120);
  return {
    playerId: parsePlayerId(input["playerId"]),
    invitedUserId: parseRequiredUserId(input["invitedUserId"], "match.invitations[].invitedUserId"),
    invitedByPlayerId: parsePlayerId(input["invitedByPlayerId"]),
    ...(invitedByUserId ? { invitedByUserId } : {}),
    createdAt: parseNonEmptyString(input["createdAt"], "match.invitations[].createdAt", 80),
  };
}

function snapshotFor(match: MultiplayerMatch, viewer: number | null): MultiplayerSnapshot {
  return {
    id: match.id,
    version: match.version,
    createdAt: match.createdAt,
    updatedAt: match.updatedAt,
    seats: match.state.players.map((player) => {
      const claim = match.seats.get(player.id);
      const invitation = match.invitations.get(player.id);
      return {
        playerId: player.id,
        claimed: Boolean(claim),
        playerName: player.name,
        isHuman: player.isHuman,
        invited: Boolean(invitation && !claim),
        invitedUserId: viewer === invitation?.invitedByPlayerId ? invitation.invitedUserId : null,
        invitedByPlayerId: invitation?.invitedByPlayerId ?? null,
        sessionBound: Boolean(claim?.sessionId),
        sessionId: viewer === player.id ? claim?.sessionId ?? null : null,
        sessionLabel: claim?.sessionLabel ?? null,
        userBound: Boolean(claim?.userId),
        userId: viewer === player.id ? claim?.userId ?? null : null,
        lastSeenAt: claim?.lastSeenAt ?? null,
      };
    }),
    you: viewer,
    state: redactState(match.state, viewer),
  };
}

function summaryFor(match: MultiplayerMatch): MultiplayerMatchSummary {
  const seats = match.state.players.map((player) => ({
    playerId: player.id,
    playerName: player.name,
    isHuman: player.isHuman,
    claimed: match.seats.has(player.id),
    invited: match.invitations.has(player.id) && !match.seats.has(player.id),
  }));
  const humanSeats = seats.filter((seat) => seat.isHuman);
  const openHumanSeats = humanSeats
    .filter((seat) => !seat.claimed && !seat.invited)
    .map((seat) => seat.playerId);
  const claimedSeatCount = humanSeats.filter((seat) => seat.claimed).length;
  const invitedSeatCount = humanSeats.filter((seat) => seat.invited).length;
  return {
    id: match.id,
    version: match.version,
    createdAt: match.createdAt,
    updatedAt: match.updatedAt,
    lobbyStatus: lobbyStatusFor(match.state, openHumanSeats, invitedSeatCount),
    phase: match.state.phase,
    turn: match.state.turn,
    objective: match.state.setup.objective,
    turnStyle: match.state.setup.turnStyle ?? "classic",
    currentPlayer: match.state.currentPlayer,
    currentPlayerName: match.state.players[match.state.currentPlayer]?.name ?? `Player ${match.state.currentPlayer}`,
    winner: match.state.winner,
    playerCount: match.state.players.length,
    humanSeatCount: humanSeats.length,
    claimedSeatCount,
    openSeatCount: openHumanSeats.length,
    invitedSeatCount,
    openHumanSeats,
    seats,
  };
}

function matchBelongsToUser(match: MultiplayerMatch, userId: string): boolean {
  for (const claim of match.seats.values()) {
    if (claim.userId === userId) {
      return true;
    }
  }
  for (const invitation of match.invitations.values()) {
    if (invitation.invitedUserId === userId) {
      return true;
    }
  }
  return false;
}

function rankedQuickMatchCandidates(
  records: MultiplayerMatchRecord[],
  setup: GameSetup,
  sessionId: string | undefined,
  userId: string | undefined,
): QuickMatchCandidate[] {
  const candidates: QuickMatchCandidate[] = [];

  for (const record of records) {
    const match = matchFromRecord(record);
    const summary = summaryFor(match);
    const playerId = summary.openHumanSeats[0];
    if (
      summary.lobbyStatus !== "joinable" ||
      playerId === undefined ||
      !matchMatchesQuickSetup(match, setup) ||
      matchHasClaimForIdentity(match, sessionId, userId)
    ) {
      continue;
    }
    candidates.push({ matchId: match.id, playerId, summary });
  }

  return candidates.sort(compareQuickMatchCandidates);
}

function compareQuickMatchCandidates(left: QuickMatchCandidate, right: QuickMatchCandidate): number {
  return left.summary.openSeatCount - right.summary.openSeatCount ||
    Date.parse(left.summary.createdAt) - Date.parse(right.summary.createdAt) ||
    Date.parse(left.summary.updatedAt) - Date.parse(right.summary.updatedAt) ||
    left.summary.id.localeCompare(right.summary.id);
}

function matchMatchesQuickSetup(match: MultiplayerMatch, setup: GameSetup): boolean {
  const existing = match.state.setup;
  return existing.players.length === setup.players.length &&
    existing.players.every((player, index) => player.isHuman === setup.players[index]?.isHuman) &&
    existing.objective === setup.objective &&
    existing.useExtraTerritories === setup.useExtraTerritories &&
    existing.allocation === setup.allocation &&
    existing.cardRule === setup.cardRule &&
    (existing.turnStyle ?? "classic") === (setup.turnStyle ?? "classic") &&
    Boolean(existing.restrictedReinforcement) === Boolean(setup.restrictedReinforcement);
}

function matchHasClaimForIdentity(
  match: MultiplayerMatch,
  sessionId: string | undefined,
  userId: string | undefined,
): boolean {
  if (!sessionId && !userId) return false;
  return [...match.seats.values()].some((claim) =>
    Boolean((sessionId && claim.sessionId === sessionId) || (userId && claim.userId === userId)),
  );
}

function setupWithQuickMatchHostName(setup: GameSetup, playerName: string | undefined): GameSetup {
  if (!playerName) return setup;
  let renamed = false;
  return {
    ...setup,
    players: setup.players.map((player) => {
      if (renamed || !player.isHuman) return player;
      renamed = true;
      return { ...player, name: playerName };
    }),
  };
}

const TRANSIENT_QUICK_MATCH_JOIN_ERRORS = new Set([
  "INVITATION_MISMATCH",
  "MATCH_NOT_FOUND",
  "PLAYER_ALREADY_CLAIMED",
  "VERSION_CONFLICT",
]);

function isTransientQuickMatchJoinError(error: unknown): boolean {
  return error instanceof MultiplayerError && TRANSIENT_QUICK_MATCH_JOIN_ERRORS.has(error.code);
}

function invitationSummariesFor(match: MultiplayerMatch, userId: string): MultiplayerInvitationSummary[] {
  const summary = summaryFor(match);
  return [...match.invitations.values()]
    .filter((invitation) => invitation.invitedUserId === userId && !match.seats.has(invitation.playerId))
    .map((invitation) => {
      const player = match.state.players[invitation.playerId];
      const inviter = match.state.players[invitation.invitedByPlayerId];
      return {
        matchId: match.id,
        matchVersion: match.version,
        matchCreatedAt: match.createdAt,
        matchUpdatedAt: match.updatedAt,
        lobbyStatus: summary.lobbyStatus,
        phase: match.state.phase,
        turn: match.state.turn,
        objective: match.state.setup.objective,
        turnStyle: match.state.setup.turnStyle ?? "classic",
        playerId: invitation.playerId,
        playerName: player?.name ?? `Player ${invitation.playerId}`,
        invitedByPlayerId: invitation.invitedByPlayerId,
        invitedByPlayerName: inviter?.name ?? `Player ${invitation.invitedByPlayerId}`,
        createdAt: invitation.createdAt,
      };
    });
}

function invitationDeliveryPayloadFor(
  match: MultiplayerMatch,
  invitation: SeatInvitation,
): MultiplayerInvitationDeliveryPayload {
  const summary = summaryFor(match);
  const player = match.state.players[invitation.playerId];
  const inviter = match.state.players[invitation.invitedByPlayerId];
  return {
    type: "multiplayer.seat_invitation.created",
    schemaVersion: 1,
    match: {
      id: match.id,
      version: match.version,
      createdAt: match.createdAt,
      updatedAt: match.updatedAt,
      lobbyStatus: summary.lobbyStatus,
      phase: match.state.phase,
      turn: match.state.turn,
      objective: match.state.setup.objective,
      turnStyle: match.state.setup.turnStyle ?? "classic",
    },
    seat: {
      playerId: invitation.playerId,
      playerName: player?.name ?? `Player ${invitation.playerId}`,
    },
    inviter: {
      playerId: invitation.invitedByPlayerId,
      playerName: inviter?.name ?? `Player ${invitation.invitedByPlayerId}`,
      userId: invitation.invitedByUserId ?? null,
    },
    recipient: {
      userId: invitation.invitedUserId,
    },
    invitation: {
      createdAt: invitation.createdAt,
    },
  };
}

function lobbyStatusFor(
  state: GameState,
  openHumanSeats: number[],
  invitedSeatCount = 0,
): Exclude<MultiplayerMatchListStatus, "all"> {
  if (state.winner !== null || state.phase === "gameOver") {
    return "finished";
  }
  return openHumanSeats.length > 0 || invitedSeatCount > 0 ? "joinable" : "active";
}

function redactState(state: GameState, viewer: number | null): GameState {
  return {
    ...state,
    players: state.players.map((player) => redactPlayer(player, viewer, state.capitalsRevealed)),
    sameTime: redactSameTime(state.sameTime, viewer),
    log: redactLog(state, viewer),
  };
}

function redactPlayer(player: PlayerState, viewer: number | null, capitalsRevealed: boolean): PlayerState {
  if (viewer === player.id) {
    return { ...player, cards: [...player.cards] };
  }
  return {
    ...player,
    cards: [],
    mission: null,
    capital: capitalsRevealed ? player.capital : null,
  };
}

function redactSameTime(sameTime: SameTimeState | null, viewer: number | null): SameTimeState | null {
  if (!sameTime) return null;
  const visibleOrders =
    viewer === null ? [] : sameTime.orders.filter((order) => order.player === viewer);
  const visibleMoves =
    viewer === null ? [] : sameTime.moves.filter((move) => move.player === viewer);
  return {
    ...sameTime,
    deployLog: sameTime.deployLog.map((entries, playerId) => (playerId === viewer ? [...entries] : [])),
    orders: visibleOrders,
    moves: visibleMoves,
  };
}

function redactLog(state: GameState, viewer: number | null): GameState["log"] {
  const hideOrders =
    (state.phase === "sameTimeBattle" && state.sameTime?.readyBattle.some((ready, playerId) => {
      const player = state.players[playerId];
      return Boolean(player?.alive) && !ready;
    })) ||
    (state.phase === "sameTimeMove" && state.sameTime?.readyMove.some((ready, playerId) => {
      const player = state.players[playerId];
      return Boolean(player?.alive) && !ready;
    }));
  if (!hideOrders) {
    return [...state.log];
  }
  return state.log.filter((entry) => !/\borders\b.*\b(against|march)\b/i.test(entry.text));
}

function firstHumanPlayerId(state: GameState): number {
  const player = state.players.find((candidate) => candidate.isHuman);
  if (!player) {
    throw new MultiplayerError("NO_HUMAN_PLAYERS", "At least one human player is required for multiplayer.", 400);
  }
  return player.id;
}

function parseGameSetup(value: unknown): GameSetup {
  const input = requireRecord(value, "setup");
  const players = requireArray(input["players"], "setup.players");
  if (players.length < 2 || players.length > 8) {
    throw new MultiplayerError("INVALID_SETUP", "Multiplayer setup requires 2 to 8 players.", 400);
  }
  return {
    players: players.map((player, index) => parsePlayerSetup(player, index)),
    objective: parseEnum(input["objective"], ["domination60", "domination80", "domination100", "capital", "mission"], "setup.objective"),
    useExtraTerritories: parseBoolean(input["useExtraTerritories"], "setup.useExtraTerritories"),
    cardRule:
      input["cardRule"] === undefined
        ? "ascending"
        : parseEnum(input["cardRule"], ["ascending", "ascendingByOne", "setValue"], "setup.cardRule"),
    allocation:
      input["allocation"] === undefined
        ? "random"
        : parseEnum(input["allocation"], ["random", "grab", "election"], "setup.allocation"),
    turnStyle:
      input["turnStyle"] === undefined
        ? "classic"
        : parseEnum(input["turnStyle"], ["classic", "sameTime"], "setup.turnStyle"),
    restrictedReinforcement:
      input["restrictedReinforcement"] === undefined
        ? false
        : parseBoolean(input["restrictedReinforcement"], "setup.restrictedReinforcement"),
  };
}

function parsePlayerSetup(value: unknown, index: number): GameSetup["players"][number] {
  const input = requireRecord(value, `setup.players[${index}]`);
  const generalId = input["generalId"];
  if (
    generalId !== null &&
    generalId !== undefined &&
    (typeof generalId !== "string" || !(generalId in GENERALS))
  ) {
    throw new MultiplayerError("INVALID_SETUP", `setup.players[${index}].generalId is invalid.`, 400);
  }
  return {
    name: parsePlayerName(input["name"], `setup.players[${index}].name`),
    colorIdx: parseInteger(input["colorIdx"], `setup.players[${index}].colorIdx`, 0, 7),
    isHuman: parseBoolean(input["isHuman"], `setup.players[${index}].isHuman`),
    generalId: typeof generalId === "string" && generalId in GENERALS ? generalId as GameSetup["players"][number]["generalId"] : null,
  };
}

function parseGameAction(value: unknown): GameAction {
  const input = requireRecord(value, "action");
  const type = parseEnum(input["type"], [
    "CLAIM_TERRITORY",
    "PLACE_INITIAL",
    "ELECTION_BID",
    "ELECTION_PASS",
    "PROPOSE_ALLIANCE",
    "SEND_THREAT",
    "RESPOND_PROPOSAL",
    "CHOOSE_CAPITAL",
    "TRADE_CARDS",
    "AUTO_TRADE",
    "DEPLOY",
    "UNDO_DEPLOY",
    "ATTACK",
    "RETREAT",
    "OCCUPY",
    "END_ATTACK",
    "FORTIFY",
    "END_TURN",
    "ACKNOWLEDGE_HANDOFF",
    "ST_READY_REINFORCE",
    "ST_QUEUE_ATTACK",
    "ST_CANCEL_ATTACK",
    "ST_READY_BATTLE",
    "ST_ACK_PLAYBACK",
    "ST_QUEUE_MOVE",
    "ST_CANCEL_MOVE",
    "ST_READY_MOVE",
  ], "action.type");

  switch (type) {
    case "CLAIM_TERRITORY":
    case "PLACE_INITIAL":
    case "CHOOSE_CAPITAL":
      return { type, territory: parseTerritory(input["territory"], "action.territory") };
    case "ELECTION_BID":
      return { type, raise: parseEnum(input["raise"], [5, 10], "action.raise") };
    case "ELECTION_PASS":
    case "AUTO_TRADE":
    case "UNDO_DEPLOY":
    case "RETREAT":
    case "END_ATTACK":
    case "END_TURN":
    case "ACKNOWLEDGE_HANDOFF":
    case "ST_READY_REINFORCE":
    case "ST_READY_BATTLE":
    case "ST_ACK_PLAYBACK":
    case "ST_READY_MOVE":
      return { type };
    case "PROPOSE_ALLIANCE":
      return {
        type,
        target: parsePlayerId(input["target"]),
        level: parseEnum(input["level"], [1, 2, 3], "action.level"),
      };
    case "SEND_THREAT":
      return { type, target: parsePlayerId(input["target"]) };
    case "RESPOND_PROPOSAL":
      return { type, accept: parseBoolean(input["accept"], "action.accept") };
    case "TRADE_CARDS":
      return { type, cardIds: parseStringArray(input["cardIds"], "action.cardIds", 3, 10) };
    case "DEPLOY":
      return {
        type,
        territory: parseTerritory(input["territory"], "action.territory"),
        count: parseInteger(input["count"], "action.count", 1, 999),
      };
    case "ATTACK":
      return {
        type,
        from: parseTerritory(input["from"], "action.from"),
        to: parseTerritory(input["to"], "action.to"),
        dice: parseInteger(input["dice"], "action.dice", 1, 3),
      };
    case "OCCUPY":
      return { type, count: parseInteger(input["count"], "action.count", 1, 999) };
    case "FORTIFY":
    case "ST_QUEUE_MOVE":
      return {
        type,
        from: parseTerritory(input["from"], "action.from"),
        to: parseTerritory(input["to"], "action.to"),
        count: parseInteger(input["count"], "action.count", 1, 999),
      };
    case "ST_QUEUE_ATTACK":
      return {
        type,
        from: parseTerritory(input["from"], "action.from"),
        to: parseTerritory(input["to"], "action.to"),
        count: parseInteger(input["count"], "action.count", 1, 999),
        surgeTo: input["surgeTo"] === null ? null : parseTerritory(input["surgeTo"], "action.surgeTo"),
      };
    case "ST_CANCEL_ATTACK":
    case "ST_CANCEL_MOVE":
      return { type, orderId: parseNonEmptyString(input["orderId"], "action.orderId", 120) };
  }
}

function parseExpectedVersion(value: unknown): number {
  return parseInteger(value, "expectedVersion", 1, Number.MAX_SAFE_INTEGER);
}

function parseMatchListLimit(value: unknown): number {
  if (value === undefined) return 20;
  if (typeof value === "string" && /^\d+$/.test(value)) {
    return parseInteger(Number(value), "limit", 1, 50);
  }
  return parseInteger(value, "limit", 1, 50);
}

function parseMatchListStatus(value: unknown): MultiplayerMatchListStatus {
  if (value === undefined) return "all";
  return parseEnum(value, ["all", "joinable", "active", "finished"] as const, "status");
}

function parseMatchListScope(value: unknown): MultiplayerMatchListScope {
  if (value === undefined) return "public";
  return parseEnum(value, ["public", "mine"] as const, "scope");
}

function parsePlayerId(value: unknown): number {
  return parseInteger(value, "playerId", 0, 7);
}

function parseToken(value: unknown): string {
  return parseNonEmptyString(value, "playerToken", 200);
}

function parseOptionalSessionId(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const sessionId = parseNonEmptyString(value, "sessionId", 120).trim();
  if (sessionId.length < 8) {
    throw new MultiplayerError("INVALID_REQUEST", "sessionId must be at least 8 characters.", 400);
  }
  return sessionId;
}

function parseOptionalSessionLabel(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  return parseNonEmptyString(value, "sessionLabel", 80).trim();
}

function parseOptionalUserId(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  return parseNonEmptyString(value, "userId", 120).trim();
}

function parseRequiredUserId(value: unknown, field: string): string {
  return parseNonEmptyString(value, field, 120).trim();
}

function parseStoredOptionalString(value: unknown, field: string, maxLength: number): string | undefined {
  if (value === undefined || value === null) return undefined;
  return parseNonEmptyString(value, field, maxLength).trim();
}

function parseTerritory(value: unknown, field: string): TerritoryId {
  const id = parseNonEmptyString(value, field, 80);
  if (!(id in TERRITORY_MAP)) {
    throw new MultiplayerError("INVALID_REQUEST", `${field} is not a known territory.`, 400);
  }
  return id as TerritoryId;
}

function parseStringArray(value: unknown, field: string, min: number, max: number): string[] {
  const input = requireArray(value, field);
  if (input.length < min || input.length > max) {
    throw new MultiplayerError("INVALID_REQUEST", `${field} must include ${min} to ${max} items.`, 400);
  }
  return input.map((item, index) => parseNonEmptyString(item, `${field}[${index}]`, 120));
}

function parseOptionalPlayerName(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  return parsePlayerName(value, "playerName");
}

function parsePlayerName(value: unknown, field: string): string {
  const name = parseNonEmptyString(value, field, 40).trim();
  if (!name) {
    throw new MultiplayerError("INVALID_REQUEST", `${field} is required.`, 400);
  }
  return name;
}

function parseNonEmptyString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string" || value.trim() === "" || value.length > maxLength) {
    throw new MultiplayerError("INVALID_REQUEST", `${field} must be a non-empty string.`, 400);
  }
  return value;
}

function parseInteger(value: unknown, field: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new MultiplayerError("INVALID_REQUEST", `${field} must be an integer between ${min} and ${max}.`, 400);
  }
  return value;
}

function parseBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new MultiplayerError("INVALID_REQUEST", `${field} must be a boolean.`, 400);
  }
  return value;
}

function parseEnum<const T extends readonly (string | number)[]>(value: unknown, allowed: T, field: string): T[number] {
  if (!(allowed as readonly unknown[]).includes(value)) {
    throw new MultiplayerError("INVALID_REQUEST", `${field} is invalid.`, 400);
  }
  return value as T[number];
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new MultiplayerError("INVALID_REQUEST", `${field} must be an object.`, 400);
  }
  return value as Record<string, unknown>;
}

function requireArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new MultiplayerError("INVALID_REQUEST", `${field} must be an array.`, 400);
  }
  return value;
}

function compareRecordsByUpdatedAtDesc(a: MultiplayerMatchRecord, b: MultiplayerMatchRecord): number {
  return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
}

function compareInvitationSummariesByCreatedAtDesc(
  a: MultiplayerInvitationSummary,
  b: MultiplayerInvitationSummary,
): number {
  return Date.parse(b.createdAt) - Date.parse(a.createdAt);
}

function parseBooleanEnv(value: string | undefined): boolean {
  return value === "1" || value === "true" || value === "yes";
}

function isFileNotFound(error: unknown): error is NodeJS.ErrnoException {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
}

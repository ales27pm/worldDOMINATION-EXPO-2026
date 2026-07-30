export const ACCOUNT_DIRECTORY_REQUIRED_ERROR = "ACCOUNT_DIRECTORY_REQUIRED";
export const ACCOUNT_DIRECTORY_INVALID_ERROR = "ACCOUNT_DIRECTORY_INVALID";
export const ACCOUNT_CONTACT_INVALID_ERROR = "ACCOUNT_CONTACT_INVALID";

export interface AccountProfile {
  userId: string;
  displayName: string | null;
}

export interface AccountContactSummary {
  userId: string;
  displayName: string | null;
}

export interface AccountDirectoryQueryClient {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: T[]; rowCount: number }>;
}

export interface AccountDirectoryStore {
  getOrCreateProfile(userId: unknown, displayName?: unknown): Promise<AccountProfile>;
  updateProfile(userId: unknown, displayName?: unknown): Promise<AccountProfile>;
  listContacts(ownerUserId: unknown, limit?: unknown): Promise<AccountContactSummary[]>;
  addContact(ownerUserId: unknown, contactUserId: unknown, displayName?: unknown): Promise<AccountContactSummary>;
  deleteContact(ownerUserId: unknown, contactUserId: unknown): Promise<boolean>;
}

export class AccountDirectoryError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

export class InMemoryAccountDirectoryStore implements AccountDirectoryStore {
  private readonly profiles = new Map<string, AccountProfile>();
  private readonly contacts = new Map<string, Map<string, AccountContactSummary>>();

  async getOrCreateProfile(userIdInput: unknown, displayNameInput?: unknown): Promise<AccountProfile> {
    const userId = parseRequiredUserId(userIdInput, "userId");
    const displayName = parseOptionalDisplayName(displayNameInput);
    const current = this.profiles.get(userId);
    if (current) {
      if (displayName !== undefined && current.displayName !== displayName) {
        current.displayName = displayName;
      }
      return { ...current };
    }
    const profile = { userId, displayName: displayName ?? null };
    this.profiles.set(userId, profile);
    return { ...profile };
  }

  async updateProfile(userIdInput: unknown, displayNameInput?: unknown): Promise<AccountProfile> {
    const userId = parseRequiredUserId(userIdInput, "userId");
    const displayName = parseOptionalDisplayName(displayNameInput) ?? null;
    const profile = { userId, displayName };
    this.profiles.set(userId, profile);
    return { ...profile };
  }

  async listContacts(ownerUserIdInput: unknown, limitInput?: unknown): Promise<AccountContactSummary[]> {
    const ownerUserId = parseRequiredUserId(ownerUserIdInput, "ownerUserId");
    const limit = parseLimit(limitInput);
    return [...(this.contacts.get(ownerUserId)?.values() ?? [])]
      .sort(compareContacts)
      .slice(0, limit)
      .map((contact) => ({ ...contact }));
  }

  async addContact(
    ownerUserIdInput: unknown,
    contactUserIdInput: unknown,
    displayNameInput?: unknown,
  ): Promise<AccountContactSummary> {
    const ownerUserId = parseRequiredUserId(ownerUserIdInput, "ownerUserId");
    const contactUserId = parseRequiredUserId(contactUserIdInput, "contactUserId");
    if (ownerUserId === contactUserId) {
      throw new AccountDirectoryError(ACCOUNT_CONTACT_INVALID_ERROR, "Contacts cannot include the current account.", 400);
    }
    const displayName = parseOptionalDisplayName(displayNameInput) ?? this.profiles.get(contactUserId)?.displayName ?? null;
    await this.getOrCreateProfile(ownerUserId);
    await this.getOrCreateProfile(contactUserId, displayName);
    const summary = { userId: contactUserId, displayName };
    const ownerContacts = this.contacts.get(ownerUserId) ?? new Map<string, AccountContactSummary>();
    ownerContacts.set(contactUserId, summary);
    this.contacts.set(ownerUserId, ownerContacts);
    return { ...summary };
  }

  async deleteContact(ownerUserIdInput: unknown, contactUserIdInput: unknown): Promise<boolean> {
    const ownerUserId = parseRequiredUserId(ownerUserIdInput, "ownerUserId");
    const contactUserId = parseRequiredUserId(contactUserIdInput, "contactUserId");
    return this.contacts.get(ownerUserId)?.delete(contactUserId) ?? false;
  }
}

export class PostgresAccountDirectoryStore implements AccountDirectoryStore {
  private ready: Promise<void> | null = null;

  constructor(private readonly client: AccountDirectoryQueryClient) {}

  async getOrCreateProfile(userIdInput: unknown, displayNameInput?: unknown): Promise<AccountProfile> {
    const userId = parseRequiredUserId(userIdInput, "userId");
    const displayName = parseOptionalDisplayName(displayNameInput);
    await this.ensureReady();
    const result = await this.client.query<AccountProfileRow>(
      `
        INSERT INTO account_profiles (user_id, display_name, created_at, updated_at)
        VALUES ($1, $2, now(), now())
        ON CONFLICT (user_id) DO UPDATE
        SET display_name = COALESCE(EXCLUDED.display_name, account_profiles.display_name),
            updated_at = now()
        RETURNING user_id, display_name
      `,
      [userId, displayName ?? null],
    );
    return profileFromRow(requiredRow(result.rows[0], "account_profiles"));
  }

  async updateProfile(userIdInput: unknown, displayNameInput?: unknown): Promise<AccountProfile> {
    const userId = parseRequiredUserId(userIdInput, "userId");
    const displayName = parseOptionalDisplayName(displayNameInput) ?? null;
    await this.ensureReady();
    const result = await this.client.query<AccountProfileRow>(
      `
        INSERT INTO account_profiles (user_id, display_name, created_at, updated_at)
        VALUES ($1, $2, now(), now())
        ON CONFLICT (user_id) DO UPDATE
        SET display_name = EXCLUDED.display_name,
            updated_at = now()
        RETURNING user_id, display_name
      `,
      [userId, displayName],
    );
    return profileFromRow(requiredRow(result.rows[0], "account_profiles"));
  }

  async listContacts(ownerUserIdInput: unknown, limitInput?: unknown): Promise<AccountContactSummary[]> {
    const ownerUserId = parseRequiredUserId(ownerUserIdInput, "ownerUserId");
    const limit = parseLimit(limitInput);
    await this.ensureReady();
    const result = await this.client.query<AccountContactRow>(
      `
        SELECT
          c.contact_user_id AS user_id,
          COALESCE(c.display_name, p.display_name) AS display_name
        FROM account_contacts c
        LEFT JOIN account_profiles p ON p.user_id = c.contact_user_id
        WHERE c.owner_user_id = $1
          AND c.contact_user_id <> $1
        ORDER BY COALESCE(c.display_name, p.display_name, c.contact_user_id), c.contact_user_id
        LIMIT $2
      `,
      [ownerUserId, limit],
    );
    return result.rows.map(contactFromRow);
  }

  async addContact(
    ownerUserIdInput: unknown,
    contactUserIdInput: unknown,
    displayNameInput?: unknown,
  ): Promise<AccountContactSummary> {
    const ownerUserId = parseRequiredUserId(ownerUserIdInput, "ownerUserId");
    const contactUserId = parseRequiredUserId(contactUserIdInput, "contactUserId");
    if (ownerUserId === contactUserId) {
      throw new AccountDirectoryError(ACCOUNT_CONTACT_INVALID_ERROR, "Contacts cannot include the current account.", 400);
    }
    const displayName = parseOptionalDisplayName(displayNameInput);
    await this.ensureReady();
    await this.getOrCreateProfile(ownerUserId);
    await this.getOrCreateProfile(contactUserId, displayName);
    const result = await this.client.query<AccountContactRow>(
      `
        INSERT INTO account_contacts (owner_user_id, contact_user_id, display_name, created_at)
        VALUES ($1, $2, $3, now())
        ON CONFLICT (owner_user_id, contact_user_id) DO UPDATE
        SET display_name = EXCLUDED.display_name
        RETURNING contact_user_id AS user_id, display_name
      `,
      [ownerUserId, contactUserId, displayName ?? null],
    );
    return contactFromRow(requiredRow(result.rows[0], "account_contacts"));
  }

  async deleteContact(ownerUserIdInput: unknown, contactUserIdInput: unknown): Promise<boolean> {
    const ownerUserId = parseRequiredUserId(ownerUserIdInput, "ownerUserId");
    const contactUserId = parseRequiredUserId(contactUserIdInput, "contactUserId");
    await this.ensureReady();
    const result = await this.client.query(
      "DELETE FROM account_contacts WHERE owner_user_id = $1 AND contact_user_id = $2",
      [ownerUserId, contactUserId],
    );
    return result.rowCount > 0;
  }

  private ensureReady(): Promise<void> {
    this.ready = this.ready ?? this.createSchema();
    return this.ready;
  }

  private async createSchema(): Promise<void> {
    await this.client.query(`
      CREATE TABLE IF NOT EXISTS account_profiles (
        user_id text PRIMARY KEY,
        display_name text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await this.client.query(`
      CREATE TABLE IF NOT EXISTS account_contacts (
        owner_user_id text NOT NULL,
        contact_user_id text NOT NULL,
        display_name text,
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (owner_user_id, contact_user_id),
        CONSTRAINT account_contacts_not_self CHECK (owner_user_id <> contact_user_id)
      )
    `);
    await this.client.query(`
      CREATE INDEX IF NOT EXISTS account_contacts_owner_display_idx
        ON account_contacts (owner_user_id, display_name, contact_user_id)
    `);
  }
}

interface AccountProfileRow extends Record<string, unknown> {
  user_id?: unknown;
  userId?: unknown;
  display_name?: unknown;
  displayName?: unknown;
}

interface AccountContactRow extends Record<string, unknown> {
  user_id?: unknown;
  contact_user_id?: unknown;
  userId?: unknown;
  contactUserId?: unknown;
  display_name?: unknown;
  displayName?: unknown;
}

let accountDirectoryStoreOverride: AccountDirectoryStore | null | undefined;
let cachedAccountDirectoryStore: AccountDirectoryStore | null | undefined;
let cachedAccountDirectoryStoreKey = "";

export function setAccountDirectoryStoreForTests(store: AccountDirectoryStore | null | undefined): void {
  accountDirectoryStoreOverride = store;
}

export function configuredAccountDirectoryStore(): AccountDirectoryStore | null {
  if (accountDirectoryStoreOverride !== undefined) {
    return accountDirectoryStoreOverride;
  }

  const mode = normalizeOptionalString(process.env.MULTIPLAYER_ACCOUNT_DIRECTORY_STORE ?? process.env.ACCOUNT_DIRECTORY_STORE);
  if (!mode) {
    return null;
  }
  if (!/^(1|true|postgres|database)$/i.test(mode)) {
    throw new AccountDirectoryError(
      ACCOUNT_DIRECTORY_INVALID_ERROR,
      "MULTIPLAYER_ACCOUNT_DIRECTORY_STORE must be postgres when configured.",
      500,
    );
  }
  if (!process.env.DATABASE_URL) {
    throw new AccountDirectoryError(
      ACCOUNT_DIRECTORY_REQUIRED_ERROR,
      "DATABASE_URL is required when MULTIPLAYER_ACCOUNT_DIRECTORY_STORE=postgres.",
      500,
    );
  }

  const key = `${mode}:${process.env.DATABASE_URL}`;
  if (cachedAccountDirectoryStore && cachedAccountDirectoryStoreKey === key) {
    return cachedAccountDirectoryStore;
  }

  const dbModule = import("../../../../lib/db/src/index");
  cachedAccountDirectoryStore = new PostgresAccountDirectoryStore({
    async query<T extends Record<string, unknown> = Record<string, unknown>>(text: string, values?: unknown[]) {
      const { pool } = await dbModule;
      const result = await pool.query<T>(text, values);
      return { rows: result.rows, rowCount: result.rowCount ?? result.rows.length };
    },
  });
  cachedAccountDirectoryStoreKey = key;
  return cachedAccountDirectoryStore;
}

export function requireConfiguredAccountDirectoryStore(): AccountDirectoryStore {
  const store = configuredAccountDirectoryStore();
  if (!store) {
    throw new AccountDirectoryError(
      ACCOUNT_DIRECTORY_REQUIRED_ERROR,
      "A persistent account directory is required for this operation.",
      503,
    );
  }
  return store;
}

export async function getTrustedAccountProfile(userId: unknown, displayName?: unknown): Promise<AccountProfile> {
  const normalizedUserId = parseRequiredUserId(userId, "userId");
  const normalizedDisplayName = parseOptionalDisplayName(displayName) ?? null;
  const store = configuredAccountDirectoryStore();
  if (!store) {
    return { userId: normalizedUserId, displayName: normalizedDisplayName };
  }
  return store.getOrCreateProfile(normalizedUserId, normalizedDisplayName);
}

export async function updateTrustedAccountProfile(userId: unknown, displayName?: unknown): Promise<AccountProfile> {
  return requireConfiguredAccountDirectoryStore().updateProfile(userId, displayName);
}

export async function listStoredAccountContactsIfConfigured(
  ownerUserId: unknown,
  limit?: unknown,
): Promise<AccountContactSummary[] | null> {
  const store = configuredAccountDirectoryStore();
  if (!store) {
    return null;
  }
  return store.listContacts(ownerUserId, limit);
}

export async function listTrustedAccountContacts(ownerUserId: unknown, limit?: unknown): Promise<AccountContactSummary[]> {
  return requireConfiguredAccountDirectoryStore().listContacts(ownerUserId, limit);
}

export async function addTrustedAccountContact(
  ownerUserId: unknown,
  contactUserId: unknown,
  displayName?: unknown,
): Promise<AccountContactSummary> {
  return requireConfiguredAccountDirectoryStore().addContact(ownerUserId, contactUserId, displayName);
}

export async function deleteTrustedAccountContact(ownerUserId: unknown, contactUserId: unknown): Promise<boolean> {
  return requireConfiguredAccountDirectoryStore().deleteContact(ownerUserId, contactUserId);
}

function profileFromRow(row: AccountProfileRow): AccountProfile {
  return {
    userId: parseRequiredUserId(row.user_id ?? row.userId, "account_profiles.user_id"),
    displayName: parseOptionalDisplayName(row.display_name ?? row.displayName) ?? null,
  };
}

function contactFromRow(row: AccountContactRow): AccountContactSummary {
  return {
    userId: parseRequiredUserId(row.user_id ?? row.contact_user_id ?? row.userId ?? row.contactUserId, "account_contacts.contact_user_id"),
    displayName: parseOptionalDisplayName(row.display_name ?? row.displayName) ?? null,
  };
}

function requiredRow<T>(row: T | undefined, tableName: string): T {
  if (!row) {
    throw new AccountDirectoryError(ACCOUNT_DIRECTORY_INVALID_ERROR, `${tableName} did not return a row.`, 500);
  }
  return row;
}

function compareContacts(a: AccountContactSummary, b: AccountContactSummary): number {
  const left = a.displayName ?? a.userId;
  const right = b.displayName ?? b.userId;
  return left.localeCompare(right) || a.userId.localeCompare(b.userId);
}

function parseRequiredUserId(value: unknown, fieldName: string): string {
  if (typeof value !== "string") {
    throw new AccountDirectoryError(ACCOUNT_DIRECTORY_INVALID_ERROR, `${fieldName} must be a string.`, 400);
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 120) {
    throw new AccountDirectoryError(ACCOUNT_DIRECTORY_INVALID_ERROR, `${fieldName} must be between 1 and 120 characters.`, 400);
  }
  return trimmed;
}

function parseOptionalDisplayName(value: unknown): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (typeof value !== "string") {
    throw new AccountDirectoryError(ACCOUNT_DIRECTORY_INVALID_ERROR, "displayName must be a string when provided.", 400);
  }
  const trimmed = value.trim();
  if (trimmed.length > 80) {
    throw new AccountDirectoryError(ACCOUNT_DIRECTORY_INVALID_ERROR, "displayName must be 80 characters or fewer.", 400);
  }
  return trimmed || null;
}

function parseLimit(value: unknown): number {
  const limit = value === undefined ? 100 : Number(value);
  if (!Number.isInteger(limit) || limit <= 0) {
    return 100;
  }
  return Math.min(limit, 100);
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

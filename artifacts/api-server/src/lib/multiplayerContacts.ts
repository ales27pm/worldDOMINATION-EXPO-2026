import { readFileSync } from "node:fs";

import { listStoredAccountContactsIfConfigured, type AccountContactSummary } from "./accountDirectory";

export const MULTIPLAYER_CONTACT_DIRECTORY_INVALID_ERROR = "MULTIPLAYER_CONTACT_DIRECTORY_INVALID";

export type MultiplayerContactSummary = AccountContactSummary;

interface MultiplayerContactRecord extends MultiplayerContactSummary {
  ownerUserId: string;
}

export class MultiplayerContactDirectoryError extends Error {
  readonly code = MULTIPLAYER_CONTACT_DIRECTORY_INVALID_ERROR;
  readonly status = 500;

  constructor(message = "Multiplayer contact directory is invalid.") {
    super(message);
  }
}

export function listConfiguredMultiplayerContacts(userId: string | undefined): MultiplayerContactSummary[] {
  const ownerUserId = normalizeUserId(userId);
  if (!ownerUserId) {
    return [];
  }

  const seen = new Set<string>();
  const contacts: MultiplayerContactSummary[] = [];
  for (const record of configuredMultiplayerContactRecords()) {
    if (record.ownerUserId !== ownerUserId || record.userId === ownerUserId || seen.has(record.userId)) {
      continue;
    }
    seen.add(record.userId);
    contacts.push({ userId: record.userId, displayName: record.displayName });
  }

  return contacts
    .sort((a, b) => {
      const leftName = a.displayName ?? a.userId;
      const rightName = b.displayName ?? b.userId;
      return leftName.localeCompare(rightName) || a.userId.localeCompare(b.userId);
    })
    .slice(0, 100);
}

export async function listMultiplayerContacts(userId: string | undefined): Promise<MultiplayerContactSummary[]> {
  const accountContacts = await listStoredAccountContactsIfConfigured(userId);
  if (accountContacts) {
    return accountContacts;
  }
  return listConfiguredMultiplayerContacts(userId);
}

function configuredMultiplayerContactRecords(): MultiplayerContactRecord[] {
  const records: MultiplayerContactRecord[] = [];
  const contactsPath = normalizeOptionalString(process.env.MULTIPLAYER_CONTACTS_PATH);
  const contactsJson = normalizeOptionalString(process.env.MULTIPLAYER_CONTACTS_JSON);

  if (contactsPath) {
    records.push(...parseContactDirectory(readFileSync(contactsPath, "utf8")));
  }
  if (contactsJson) {
    records.push(...parseContactDirectory(contactsJson));
  }
  return records;
}

function parseContactDirectory(json: string): MultiplayerContactRecord[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new MultiplayerContactDirectoryError();
  }

  const contacts = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed) && Array.isArray(parsed.contacts)
      ? parsed.contacts
      : null;
  if (!contacts) {
    throw new MultiplayerContactDirectoryError();
  }

  return contacts.map((contact) => parseContactRecord(contact));
}

function parseContactRecord(value: unknown): MultiplayerContactRecord {
  if (!isRecord(value)) {
    throw new MultiplayerContactDirectoryError();
  }
  const ownerUserId = normalizeUserId(value.ownerUserId);
  const userId = normalizeUserId(value.userId);
  const displayName = normalizeOptionalString(value.displayName);
  if (!ownerUserId || !userId) {
    throw new MultiplayerContactDirectoryError();
  }
  return { ownerUserId, userId, displayName };
}

function normalizeUserId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeOptionalString(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

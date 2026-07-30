import { index, integer, jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

export const accountProfiles = pgTable("account_profiles", {
  userId: text("user_id").primaryKey(),
  displayName: text("display_name"),
  createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "string", withTimezone: true }).notNull().defaultNow(),
});

export const accountContacts = pgTable(
  "account_contacts",
  {
    ownerUserId: text("owner_user_id").notNull(),
    contactUserId: text("contact_user_id").notNull(),
    displayName: text("display_name"),
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.ownerUserId, table.contactUserId] }),
    index("account_contacts_owner_display_idx").on(table.ownerUserId, table.displayName, table.contactUserId),
  ],
);

export const multiplayerMatches = pgTable(
  "multiplayer_matches",
  {
    id: text("id").primaryKey(),
    version: integer("version").notNull(),
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "string", withTimezone: true }).notNull(),
    state: jsonb("state").notNull(),
    seats: jsonb("seats").notNull(),
    invitations: jsonb("invitations").notNull(),
  },
  (table) => [index("multiplayer_matches_updated_at_idx").on(table.updatedAt)],
);

export type MultiplayerMatchRow = typeof multiplayerMatches.$inferSelect;
export type InsertMultiplayerMatch = typeof multiplayerMatches.$inferInsert;
export type AccountProfileRow = typeof accountProfiles.$inferSelect;
export type InsertAccountProfile = typeof accountProfiles.$inferInsert;
export type AccountContactRow = typeof accountContacts.$inferSelect;
export type InsertAccountContact = typeof accountContacts.$inferInsert;

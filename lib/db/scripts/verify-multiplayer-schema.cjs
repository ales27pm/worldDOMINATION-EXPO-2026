#!/usr/bin/env node

const pg = require("pg");

const { Pool } = pg;

main().catch((error) => {
  console.error(`[verify-multiplayer-schema] ${error.message}`);
  process.exitCode = 1;
});

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required.");
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const multiplayerColumns = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'multiplayer_matches'
      ORDER BY ordinal_position
    `);
    const multiplayerIndexes = await pool.query(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'multiplayer_matches'
      ORDER BY indexname
    `);
    const accountProfileColumns = await tableColumns(pool, "account_profiles");
    const accountContactColumns = await tableColumns(pool, "account_contacts");
    const accountContactIndexes = await tableIndexes(pool, "account_contacts");

    const columnMap = new Map(multiplayerColumns.rows.map((row) => [row.column_name, row]));
    for (const [name, type] of [
      ["id", "text"],
      ["version", "integer"],
      ["created_at", "timestamp with time zone"],
      ["updated_at", "timestamp with time zone"],
      ["state", "jsonb"],
      ["seats", "jsonb"],
      ["invitations", "jsonb"],
    ]) {
      const column = columnMap.get(name);
      assert(column, `missing column multiplayer_matches.${name}`);
      assert(column.data_type === type, `column ${name} expected ${type}, got ${column.data_type}`);
      assert(column.is_nullable === "NO", `column ${name} must be NOT NULL`);
    }

    const indexMap = new Map(multiplayerIndexes.rows.map((row) => [row.indexname, row.indexdef]));
    assert(indexMap.has("multiplayer_matches_pkey"), "missing multiplayer_matches primary key");
    assert(
      /USING btree \(updated_at\)/i.test(indexMap.get("multiplayer_matches_updated_at_idx") || ""),
      "missing multiplayer_matches_updated_at_idx on updated_at",
    );

    const accountProfileColumnMap = new Map(accountProfileColumns.rows.map((row) => [row.column_name, row]));
    for (const [name, type, nullable] of [
      ["user_id", "text", "NO"],
      ["display_name", "text", "YES"],
      ["created_at", "timestamp with time zone", "NO"],
      ["updated_at", "timestamp with time zone", "NO"],
    ]) {
      const column = accountProfileColumnMap.get(name);
      assert(column, `missing column account_profiles.${name}`);
      assert(column.data_type === type, `column account_profiles.${name} expected ${type}, got ${column.data_type}`);
      assert(column.is_nullable === nullable, `column account_profiles.${name} nullable expected ${nullable}`);
    }

    const accountContactColumnMap = new Map(accountContactColumns.rows.map((row) => [row.column_name, row]));
    for (const [name, type, nullable] of [
      ["owner_user_id", "text", "NO"],
      ["contact_user_id", "text", "NO"],
      ["display_name", "text", "YES"],
      ["created_at", "timestamp with time zone", "NO"],
    ]) {
      const column = accountContactColumnMap.get(name);
      assert(column, `missing column account_contacts.${name}`);
      assert(column.data_type === type, `column account_contacts.${name} expected ${type}, got ${column.data_type}`);
      assert(column.is_nullable === nullable, `column account_contacts.${name} nullable expected ${nullable}`);
    }

    const accountContactIndexMap = new Map(accountContactIndexes.rows.map((row) => [row.indexname, row.indexdef]));
    assert(
      accountContactIndexes.rows.some((row) => /CREATE UNIQUE INDEX .*USING btree \(owner_user_id, contact_user_id\)/i.test(row.indexdef)),
      "missing account_contacts unique owner/contact key",
    );
    assert(
      /USING btree \(owner_user_id, display_name, contact_user_id\)/i.test(accountContactIndexMap.get("account_contacts_owner_display_idx") || ""),
      "missing account_contacts_owner_display_idx on owner/display/contact",
    );

    console.log(
      `[verify-multiplayer-schema] ok multiplayerColumns=${multiplayerColumns.rows.length} accountProfileColumns=${accountProfileColumns.rows.length} accountContactColumns=${accountContactColumns.rows.length}`,
    );
  } finally {
    await pool.end();
  }
}

function tableColumns(pool, tableName) {
  return pool.query(
    `
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position
    `,
    [tableName],
  );
}

function tableIndexes(pool, tableName) {
  return pool.query(
    `
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = $1
      ORDER BY indexname
    `,
    [tableName],
  );
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

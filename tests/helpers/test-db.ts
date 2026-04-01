/**
 * Test helper: sets up an in-memory SQLite database for tests
 * that use the payments module (which now depends on db.ts).
 *
 * Usage:
 *   import { setupTestDB, teardownTestDB } from "./helpers/test-db";
 *   beforeAll(() => setupTestDB());
 *   afterAll(() => teardownTestDB());
 */

import Database from "better-sqlite3";
import { setDB, closeDB } from "@/lib/server/db";

let testDb: Database.Database | null = null;

export function setupTestDB(): void {
  testDb = new Database(":memory:");
  testDb.pragma("journal_mode = WAL");
  testDb.pragma("foreign_keys = ON");

  // Run the base migrations from db.ts (schema v1 + v2)
  testDb.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY
    );

    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      agent_npub TEXT NOT NULL,
      api_key_hash TEXT NOT NULL,
      managed_nsec_encrypted TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      last_used_at TEXT
    );

    CREATE TABLE IF NOT EXISTS bounty_payments (
      id TEXT PRIMARY KEY,
      bounty_id TEXT NOT NULL,
      btcpay_invoice_id TEXT,
      btcpay_payout_id TEXT,
      amount_sats INTEGER NOT NULL,
      status TEXT DEFAULT 'pending',
      winner_npub TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS toku_listings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bounty_d_tag TEXT NOT NULL UNIQUE,
      bounty_event_id TEXT NOT NULL,
      toku_job_id TEXT NOT NULL,
      amount_sats INTEGER NOT NULL,
      budget_cents INTEGER NOT NULL,
      status TEXT DEFAULT 'active',
      synced_at TEXT DEFAULT (datetime('now')),
      cancelled_at TEXT
    );

    CREATE TABLE IF NOT EXISTS bounty_events (
      id TEXT PRIMARY KEY,
      d_tag TEXT NOT NULL UNIQUE,
      pubkey TEXT NOT NULL,
      kind INTEGER NOT NULL,
      title TEXT NOT NULL,
      summary TEXT,
      content TEXT,
      reward_sats INTEGER NOT NULL,
      status TEXT DEFAULT 'OPEN',
      category TEXT DEFAULT 'other',
      lightning TEXT,
      winner_pubkey TEXT,
      tags_json TEXT,
      created_at INTEGER NOT NULL,
      cached_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_toku_listings_job ON toku_listings(toku_job_id);
    CREATE INDEX IF NOT EXISTS idx_bounty_payments_bounty ON bounty_payments(bounty_id);
    CREATE INDEX IF NOT EXISTS idx_api_keys_npub ON api_keys(agent_npub);
    CREATE INDEX IF NOT EXISTS idx_bounty_events_status ON bounty_events(status);
    CREATE INDEX IF NOT EXISTS idx_bounty_events_pubkey ON bounty_events(pubkey);
    CREATE INDEX IF NOT EXISTS idx_bounty_events_category ON bounty_events(category);

    INSERT INTO schema_version (version) VALUES (1);
    INSERT INTO schema_version (version) VALUES (2);
  `);

  setDB(testDb);
}

export function teardownTestDB(): void {
  if (testDb) {
    testDb.close();
    testDb = null;
  }
  closeDB();
}

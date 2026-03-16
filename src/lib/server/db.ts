/**
 * SQLite Database Layer
 *
 * Persistent storage for:
 * - API keys and agent identities
 * - Bounty payment tracking (BTCPay invoices + payouts)
 * - toku.agency listing bridge state
 *
 * Uses better-sqlite3 for synchronous, zero-dependency SQLite access.
 * DB file: ./data/btc-bounty.db (auto-created)
 */

import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

// ─── Singleton ───────────────────────────────────────────────

let _db: Database.Database | null = null;

export function getDB(): Database.Database {
  if (_db) return _db;

  const dbDir = path.resolve(process.cwd(), "data");
  fs.mkdirSync(dbDir, { recursive: true });

  const dbPath = path.join(dbDir, "btc-bounty.db");
  _db = new Database(dbPath);

  // Enable WAL mode for better concurrent read performance
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");

  // Run migrations
  migrate(_db);

  return _db;
}

export function closeDB(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}

// ─── Migrations ──────────────────────────────────────────────

function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY
    );
  `);

  const current = db.prepare(
    "SELECT COALESCE(MAX(version), 0) as v FROM schema_version"
  ).get() as { v: number };

  if (current.v < 1) {
    db.exec(`
      -- Agent API keys
      CREATE TABLE IF NOT EXISTS api_keys (
        id TEXT PRIMARY KEY,
        agent_npub TEXT NOT NULL,
        api_key_hash TEXT NOT NULL,
        managed_nsec_encrypted TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        last_used_at TEXT
      );

      -- Payment tracking
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

      -- toku.agency bridge listings
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

      CREATE INDEX IF NOT EXISTS idx_toku_listings_job ON toku_listings(toku_job_id);
      CREATE INDEX IF NOT EXISTS idx_bounty_payments_bounty ON bounty_payments(bounty_id);
      CREATE INDEX IF NOT EXISTS idx_api_keys_npub ON api_keys(agent_npub);

      INSERT INTO schema_version (version) VALUES (1);
    `);
  }
}

// ─── Toku Listing Queries ────────────────────────────────────

export interface TokuListingRow {
  id: number;
  bounty_d_tag: string;
  bounty_event_id: string;
  toku_job_id: string;
  amount_sats: number;
  budget_cents: number;
  status: string;
  synced_at: string;
  cancelled_at: string | null;
}

export function insertTokuListing(listing: {
  bountyDTag: string;
  bountyEventId: string;
  tokuJobId: string;
  amountSats: number;
  budgetCents: number;
}): void {
  const db = getDB();
  db.prepare(`
    INSERT OR REPLACE INTO toku_listings (bounty_d_tag, bounty_event_id, toku_job_id, amount_sats, budget_cents)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    listing.bountyDTag,
    listing.bountyEventId,
    listing.tokuJobId,
    listing.amountSats,
    listing.budgetCents,
  );
}

export function getTokuListingByDTag(dTag: string): TokuListingRow | undefined {
  const db = getDB();
  return db.prepare(
    "SELECT * FROM toku_listings WHERE bounty_d_tag = ? AND status = 'active'"
  ).get(dTag) as TokuListingRow | undefined;
}

export function getTokuListingByJobId(jobId: string): TokuListingRow | undefined {
  const db = getDB();
  return db.prepare(
    "SELECT * FROM toku_listings WHERE toku_job_id = ? AND status = 'active'"
  ).get(jobId) as TokuListingRow | undefined;
}

export function getAllActiveTokuListings(): TokuListingRow[] {
  const db = getDB();
  return db.prepare(
    "SELECT * FROM toku_listings WHERE status = 'active' ORDER BY synced_at DESC"
  ).all() as TokuListingRow[];
}

export function cancelTokuListing(dTag: string): boolean {
  const db = getDB();
  const result = db.prepare(`
    UPDATE toku_listings SET status = 'cancelled', cancelled_at = datetime('now')
    WHERE bounty_d_tag = ? AND status = 'active'
  `).run(dTag);
  return result.changes > 0;
}

export function completeTokuListing(dTag: string): boolean {
  const db = getDB();
  const result = db.prepare(`
    UPDATE toku_listings SET status = 'completed'
    WHERE bounty_d_tag = ? AND status = 'active'
  `).run(dTag);
  return result.changes > 0;
}

// ─── Payment Queries ─────────────────────────────────────────

export interface PaymentRow {
  id: string;
  bounty_id: string;
  btcpay_invoice_id: string | null;
  btcpay_payout_id: string | null;
  amount_sats: number;
  status: string;
  winner_npub: string | null;
  created_at: string;
  updated_at: string;
}

export function insertPayment(payment: {
  id: string;
  bountyId: string;
  amountSats: number;
  btcpayInvoiceId?: string;
}): void {
  const db = getDB();
  db.prepare(`
    INSERT INTO bounty_payments (id, bounty_id, amount_sats, btcpay_invoice_id)
    VALUES (?, ?, ?, ?)
  `).run(payment.id, payment.bountyId, payment.amountSats, payment.btcpayInvoiceId || null);
}

export function getPaymentByBountyId(bountyId: string): PaymentRow | undefined {
  const db = getDB();
  return db.prepare(
    "SELECT * FROM bounty_payments WHERE bounty_id = ? ORDER BY created_at DESC LIMIT 1"
  ).get(bountyId) as PaymentRow | undefined;
}

export function updatePaymentStatus(
  bountyId: string,
  status: string,
  extra?: { winnerNpub?: string; btcpayPayoutId?: string }
): boolean {
  const db = getDB();
  let sql = "UPDATE bounty_payments SET status = ?, updated_at = datetime('now')";
  const params: unknown[] = [status];

  if (extra?.winnerNpub) {
    sql += ", winner_npub = ?";
    params.push(extra.winnerNpub);
  }
  if (extra?.btcpayPayoutId) {
    sql += ", btcpay_payout_id = ?";
    params.push(extra.btcpayPayoutId);
  }

  sql += " WHERE bounty_id = ?";
  params.push(bountyId);

  const result = db.prepare(sql).run(...params);
  return result.changes > 0;
}

export function getPaymentsByStatus(status: string): PaymentRow[] {
  const db = getDB();
  return db.prepare(
    "SELECT * FROM bounty_payments WHERE status = ? ORDER BY created_at DESC"
  ).all(status) as PaymentRow[];
}

// ─── API Key Queries ─────────────────────────────────────────

export function insertApiKey(key: {
  id: string;
  agentNpub: string;
  apiKeyHash: string;
  managedNsecEncrypted?: string;
}): void {
  const db = getDB();
  db.prepare(`
    INSERT INTO api_keys (id, agent_npub, api_key_hash, managed_nsec_encrypted)
    VALUES (?, ?, ?, ?)
  `).run(key.id, key.agentNpub, key.apiKeyHash, key.managedNsecEncrypted || null);
}

export function getApiKeyByHash(hash: string): { id: string; agent_npub: string; managed_nsec_encrypted: string | null } | undefined {
  const db = getDB();
  return db.prepare(
    "SELECT id, agent_npub, managed_nsec_encrypted FROM api_keys WHERE api_key_hash = ?"
  ).get(hash) as { id: string; agent_npub: string; managed_nsec_encrypted: string | null } | undefined;
}

export function touchApiKeyUsage(id: string): void {
  const db = getDB();
  db.prepare(
    "UPDATE api_keys SET last_used_at = datetime('now') WHERE id = ?"
  ).run(id);
}

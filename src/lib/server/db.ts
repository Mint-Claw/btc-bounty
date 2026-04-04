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

/**
 * Inject an external DB instance (e.g. in-memory for tests).
 * Call closeDB() first if switching from a previous instance.
 */
export function setDB(db: Database.Database): void {
  _db = db;
}

export function getDB(): Database.Database {
  if (_db) return _db;

  const dbDir = process.env.BTCBOUNTY_DATA_DIR || path.resolve(process.cwd(), "data");
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

  if (current.v < 2) {
    db.exec(`
      -- Local cache of bounty Nostr events (reduces relay dependency)
      CREATE TABLE IF NOT EXISTS bounty_events (
        id TEXT PRIMARY KEY,          -- Nostr event ID (hex)
        d_tag TEXT NOT NULL UNIQUE,   -- Parameterized replaceable d-tag
        pubkey TEXT NOT NULL,         -- Creator pubkey (hex)
        kind INTEGER NOT NULL,        -- Event kind (30402)
        title TEXT NOT NULL,
        summary TEXT,
        content TEXT,
        reward_sats INTEGER NOT NULL,
        status TEXT DEFAULT 'OPEN',   -- OPEN, IN_PROGRESS, COMPLETED, CANCELLED
        category TEXT DEFAULT 'other',
        lightning TEXT,
        winner_pubkey TEXT,
        tags_json TEXT,               -- Full tags array as JSON
        created_at INTEGER NOT NULL,  -- Unix timestamp
        cached_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_bounty_events_status ON bounty_events(status);
      CREATE INDEX IF NOT EXISTS idx_bounty_events_pubkey ON bounty_events(pubkey);
      CREATE INDEX IF NOT EXISTS idx_bounty_events_category ON bounty_events(category);

      INSERT INTO schema_version (version) VALUES (2);
    `);
  }

  if (current.v < 4) {
    db.exec(`
      -- Bounty applications (stored locally, not on relays)
      CREATE TABLE IF NOT EXISTS bounty_applications (
        id TEXT PRIMARY KEY,
        bounty_d_tag TEXT NOT NULL,
        bounty_event_id TEXT,
        applicant_pubkey TEXT NOT NULL,
        pitch TEXT NOT NULL,
        lightning TEXT,
        status TEXT DEFAULT 'pending',  -- pending, accepted, rejected
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_applications_bounty ON bounty_applications(bounty_d_tag);
      CREATE INDEX IF NOT EXISTS idx_applications_applicant ON bounty_applications(applicant_pubkey);
      CREATE INDEX IF NOT EXISTS idx_applications_status ON bounty_applications(status);

      INSERT INTO schema_version (version) VALUES (4);
    `);
  }

  if (current.v < 5) {
    db.exec(`
      -- Full-text search index for bounty content (standalone, not content-external)
      CREATE VIRTUAL TABLE IF NOT EXISTS bounty_fts USING fts5(
        d_tag UNINDEXED,
        title,
        content,
        category
      );

      -- Populate FTS from existing data
      INSERT INTO bounty_fts(d_tag, title, content, category)
        SELECT d_tag, COALESCE(title,''), COALESCE(content,''), COALESCE(category,'')
        FROM bounty_events;

      INSERT INTO schema_version (version) VALUES (5);
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

// ─── Bounty Event Cache ──────────────────────────────────────

export interface BountyEventRow {
  id: string;
  d_tag: string;
  pubkey: string;
  kind: number;
  title: string;
  summary: string | null;
  content: string | null;
  reward_sats: number;
  status: string;
  category: string;
  lightning: string | null;
  winner_pubkey: string | null;
  tags_json: string | null;
  created_at: number;
  cached_at: string;
  updated_at: string;
}

export function cacheBountyEvent(event: {
  id: string;
  dTag: string;
  pubkey: string;
  kind: number;
  title: string;
  summary?: string;
  content?: string;
  rewardSats: number;
  status?: string;
  category?: string;
  lightning?: string;
  winnerPubkey?: string;
  tags?: string[][];
  createdAt: number;
}): void {
  const db = getDB();

  // Dedup: skip if we already have an event with the same title+reward
  // (same bounty content reposted by multiple agents — keep newest per title)
  // We use title+reward because identical titles with identical rewards are
  // almost certainly the same logical bounty (e.g. seed posts replayed).
  const existing = db
    .prepare(
      `SELECT id, created_at FROM bounty_events WHERE title = ? AND reward_sats = ? LIMIT 1`
    )
    .get(event.title, event.rewardSats) as
    | { id: string; created_at: number }
    | undefined;

  if (existing && existing.id !== event.id) {
    // Keep the newer one
    if (event.createdAt <= existing.created_at) {
      return; // already have a newer or equal version
    }
    // Remove old version before inserting newer
    db.prepare(`DELETE FROM bounty_events WHERE id = ?`).run(existing.id);
  }

  db.prepare(`
    INSERT OR REPLACE INTO bounty_events (id, d_tag, pubkey, kind, title, summary, content,
      reward_sats, status, category, lightning, winner_pubkey, tags_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    event.id, event.dTag, event.pubkey, event.kind,
    event.title, event.summary || null, event.content || null,
    event.rewardSats, event.status || "OPEN", event.category || "other",
    event.lightning || null, event.winnerPubkey || null,
    event.tags ? JSON.stringify(event.tags) : null,
    event.createdAt,
  );

  // Keep FTS index in sync (upsert: delete old, insert new)
  try {
    db.prepare("DELETE FROM bounty_fts WHERE d_tag = ?").run(event.dTag);
    db.prepare(
      "INSERT INTO bounty_fts(d_tag, title, content, category) VALUES (?, ?, ?, ?)"
    ).run(event.dTag, event.title || "", event.content || "", event.category || "other");
  } catch {
    // FTS table may not exist yet during migration
  }
}

export function getCachedBounty(dTag: string): BountyEventRow | undefined {
  const db = getDB();
  return db.prepare(
    "SELECT * FROM bounty_events WHERE d_tag = ?"
  ).get(dTag) as BountyEventRow | undefined;
}

export function listCachedBounties(options?: {
  status?: string;
  category?: string;
  minReward?: number;
  limit?: number;
  offset?: number;
}): BountyEventRow[] {
  const db = getDB();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (options?.status) {
    conditions.push("status = ?");
    params.push(options.status);
  }
  if (options?.category) {
    conditions.push("category = ?");
    params.push(options.category);
  }
  if (options?.minReward && options.minReward > 0) {
    conditions.push("reward_sats >= ?");
    params.push(options.minReward);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = options?.limit || 50;
  const offset = options?.offset || 0;

  return db.prepare(
    `SELECT * FROM bounty_events ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).all(...params, limit, offset) as BountyEventRow[];
}

export function countCachedBounties(options?: {
  status?: string;
  category?: string;
  minReward?: number;
}): number {
  const db = getDB();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (options?.status) {
    conditions.push("status = ?");
    params.push(options.status);
  }
  if (options?.category) {
    conditions.push("category = ?");
    params.push(options.category);
  }
  if (options?.minReward && options.minReward > 0) {
    conditions.push("reward_sats >= ?");
    params.push(options.minReward);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const row = db.prepare(`SELECT COUNT(*) as count FROM bounty_events ${where}`).get(...params) as { count: number };
  return row.count;
}

export function searchCachedBounties(query: string, options?: {
  status?: string;
  limit?: number;
}): BountyEventRow[] {
  const db = getDB();
  const limit = options?.limit || 20;

  // Try FTS5 first (fast, ranked), fall back to LIKE
  try {
    const statusFilter = options?.status ? "AND b.status = ?" : "";
    const params: unknown[] = [query, ...(options?.status ? [options.status] : []), limit];

    return db.prepare(
      `SELECT b.* FROM bounty_events b
       INNER JOIN bounty_fts f ON f.d_tag = b.d_tag
       WHERE bounty_fts MATCH ?
       ${statusFilter}
       ORDER BY rank
       LIMIT ?`
    ).all(...params) as BountyEventRow[];
  } catch {
    // FTS table may not exist yet — fall back to LIKE
    const conditions: string[] = ["(title LIKE ? OR summary LIKE ? OR content LIKE ?)"];
    const searchTerm = `%${query}%`;
    const params: unknown[] = [searchTerm, searchTerm, searchTerm];

    if (options?.status) {
      conditions.push("status = ?");
      params.push(options.status);
    }

    const where = `WHERE ${conditions.join(" AND ")}`;
    return db.prepare(
      `SELECT * FROM bounty_events ${where} ORDER BY created_at DESC LIMIT ?`
    ).all(...params, limit) as BountyEventRow[];
  }
}

export function getBountyStats(): {
  total: number;
  open: number;
  in_progress: number;
  completed: number;
  total_sats: number;
} {
  const db = getDB();
  const row = db.prepare(`
    SELECT
      COUNT(*) as total,
      COALESCE(SUM(CASE WHEN status = 'OPEN' THEN 1 ELSE 0 END), 0) as open,
      COALESCE(SUM(CASE WHEN status = 'IN_PROGRESS' THEN 1 ELSE 0 END), 0) as in_progress,
      COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END), 0) as completed,
      COALESCE(SUM(reward_sats), 0) as total_sats
    FROM bounty_events
  `).get() as { total: number; open: number; in_progress: number; completed: number; total_sats: number };
  return row;
}

export function updateBountyStatus(dTag: string, status: string, winnerPubkey?: string): boolean {
  const db = getDB();
  const result = db.prepare(`
    UPDATE bounty_events SET status = ?, winner_pubkey = ?, updated_at = datetime('now')
    WHERE d_tag = ?
  `).run(status, winnerPubkey || null, dTag);
  return result.changes > 0;
}

// ─── Application Queries ─────────────────────────────────────

export interface ApplicationRow {
  id: string;
  bounty_d_tag: string;
  bounty_event_id: string | null;
  applicant_pubkey: string;
  pitch: string;
  lightning: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export function insertApplication(app: {
  id: string;
  bountyDTag: string;
  bountyEventId?: string;
  applicantPubkey: string;
  pitch: string;
  lightning?: string;
}): void {
  const db = getDB();
  db.prepare(`
    INSERT INTO bounty_applications (id, bounty_d_tag, bounty_event_id, applicant_pubkey, pitch, lightning)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(app.id, app.bountyDTag, app.bountyEventId || null, app.applicantPubkey, app.pitch, app.lightning || null);
}

export function getApplicationsForBounty(bountyDTag: string): ApplicationRow[] {
  const db = getDB();
  return db.prepare(
    "SELECT * FROM bounty_applications WHERE bounty_d_tag = ? ORDER BY created_at DESC"
  ).all(bountyDTag) as ApplicationRow[];
}

export function getApplication(id: string): ApplicationRow | undefined {
  const db = getDB();
  return db.prepare("SELECT * FROM bounty_applications WHERE id = ?").get(id) as ApplicationRow | undefined;
}

export function updateApplicationStatus(id: string, status: string): boolean {
  const db = getDB();
  const result = db.prepare(
    "UPDATE bounty_applications SET status = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(status, id);
  return result.changes > 0;
}

export function getApplicationsByApplicant(pubkey: string): ApplicationRow[] {
  const db = getDB();
  return db.prepare(
    "SELECT * FROM bounty_applications WHERE applicant_pubkey = ? ORDER BY created_at DESC"
  ).all(pubkey) as ApplicationRow[];
}

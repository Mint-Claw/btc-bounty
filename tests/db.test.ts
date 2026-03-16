import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

// We test the DB queries directly against an in-memory database
// to avoid filesystem side effects. We replicate the schema here.

function createTestDB(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE toku_listings (
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

    CREATE TABLE bounty_payments (
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

    CREATE TABLE api_keys (
      id TEXT PRIMARY KEY,
      agent_npub TEXT NOT NULL,
      api_key_hash TEXT NOT NULL,
      managed_nsec_encrypted TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      last_used_at TEXT
    );

    CREATE INDEX idx_toku_listings_job ON toku_listings(toku_job_id);
    CREATE INDEX idx_bounty_payments_bounty ON bounty_payments(bounty_id);
    CREATE INDEX idx_api_keys_npub ON api_keys(agent_npub);
  `);

  return db;
}

// ─── Toku Listings ───────────────────────────────────────────

describe("toku_listings table", () => {
  let db: Database.Database;

  beforeAll(() => {
    db = createTestDB();
  });
  afterAll(() => db.close());

  it("inserts and retrieves a listing by dTag", () => {
    db.prepare(`
      INSERT INTO toku_listings (bounty_d_tag, bounty_event_id, toku_job_id, amount_sats, budget_cents)
      VALUES (?, ?, ?, ?, ?)
    `).run("bounty-1", "evt-abc", "toku-123", 50000, 5000);

    const row = db.prepare(
      "SELECT * FROM toku_listings WHERE bounty_d_tag = ? AND status = 'active'"
    ).get("bounty-1") as Record<string, unknown>;

    expect(row).toBeDefined();
    expect(row.bounty_d_tag).toBe("bounty-1");
    expect(row.toku_job_id).toBe("toku-123");
    expect(row.amount_sats).toBe(50000);
    expect(row.status).toBe("active");
  });

  it("retrieves listing by toku job ID", () => {
    const row = db.prepare(
      "SELECT * FROM toku_listings WHERE toku_job_id = ?"
    ).get("toku-123") as Record<string, unknown>;

    expect(row).toBeDefined();
    expect(row.bounty_d_tag).toBe("bounty-1");
  });

  it("cancels a listing", () => {
    const result = db.prepare(`
      UPDATE toku_listings SET status = 'cancelled', cancelled_at = datetime('now')
      WHERE bounty_d_tag = ? AND status = 'active'
    `).run("bounty-1");

    expect(result.changes).toBe(1);

    const row = db.prepare(
      "SELECT * FROM toku_listings WHERE bounty_d_tag = ? AND status = 'active'"
    ).get("bounty-1");

    expect(row).toBeUndefined();
  });

  it("does not cancel already cancelled listing", () => {
    const result = db.prepare(`
      UPDATE toku_listings SET status = 'cancelled'
      WHERE bounty_d_tag = ? AND status = 'active'
    `).run("bounty-1");

    expect(result.changes).toBe(0);
  });

  it("lists all active listings", () => {
    // Insert two more
    db.prepare(`
      INSERT INTO toku_listings (bounty_d_tag, bounty_event_id, toku_job_id, amount_sats, budget_cents)
      VALUES (?, ?, ?, ?, ?)
    `).run("bounty-2", "evt-def", "toku-456", 100000, 10000);

    db.prepare(`
      INSERT INTO toku_listings (bounty_d_tag, bounty_event_id, toku_job_id, amount_sats, budget_cents)
      VALUES (?, ?, ?, ?, ?)
    `).run("bounty-3", "evt-ghi", "toku-789", 25000, 2500);

    const rows = db.prepare(
      "SELECT * FROM toku_listings WHERE status = 'active'"
    ).all();

    expect(rows.length).toBe(2); // bounty-1 was cancelled
  });

  it("enforces unique bounty_d_tag", () => {
    expect(() => {
      db.prepare(`
        INSERT INTO toku_listings (bounty_d_tag, bounty_event_id, toku_job_id, amount_sats, budget_cents)
        VALUES (?, ?, ?, ?, ?)
      `).run("bounty-2", "evt-dup", "toku-dup", 1000, 100);
    }).toThrow();
  });
});

// ─── Bounty Payments ─────────────────────────────────────────

describe("bounty_payments table", () => {
  let db: Database.Database;

  beforeAll(() => {
    db = createTestDB();
  });
  afterAll(() => db.close());

  it("inserts a payment", () => {
    db.prepare(`
      INSERT INTO bounty_payments (id, bounty_id, amount_sats, btcpay_invoice_id)
      VALUES (?, ?, ?, ?)
    `).run("pay-1", "bounty-abc", 50000, "inv-123");

    const row = db.prepare(
      "SELECT * FROM bounty_payments WHERE bounty_id = ?"
    ).get("bounty-abc") as Record<string, unknown>;

    expect(row).toBeDefined();
    expect(row.amount_sats).toBe(50000);
    expect(row.status).toBe("pending");
    expect(row.btcpay_invoice_id).toBe("inv-123");
  });

  it("updates payment status to funded", () => {
    db.prepare(`
      UPDATE bounty_payments SET status = 'funded', updated_at = datetime('now')
      WHERE bounty_id = ?
    `).run("bounty-abc");

    const row = db.prepare(
      "SELECT status FROM bounty_payments WHERE bounty_id = ?"
    ).get("bounty-abc") as { status: string };

    expect(row.status).toBe("funded");
  });

  it("updates payment with winner and payout", () => {
    db.prepare(`
      UPDATE bounty_payments
      SET status = 'paid', winner_npub = ?, btcpay_payout_id = ?, updated_at = datetime('now')
      WHERE bounty_id = ?
    `).run("npub-winner-xyz", "payout-456", "bounty-abc");

    const row = db.prepare(
      "SELECT * FROM bounty_payments WHERE bounty_id = ?"
    ).get("bounty-abc") as Record<string, unknown>;

    expect(row.status).toBe("paid");
    expect(row.winner_npub).toBe("npub-winner-xyz");
    expect(row.btcpay_payout_id).toBe("payout-456");
  });

  it("queries payments by status", () => {
    // Add another pending payment
    db.prepare(`
      INSERT INTO bounty_payments (id, bounty_id, amount_sats)
      VALUES (?, ?, ?)
    `).run("pay-2", "bounty-def", 25000);

    const pending = db.prepare(
      "SELECT * FROM bounty_payments WHERE status = 'pending'"
    ).all();
    expect(pending.length).toBe(1);

    const paid = db.prepare(
      "SELECT * FROM bounty_payments WHERE status = 'paid'"
    ).all();
    expect(paid.length).toBe(1);
  });
});

// ─── API Keys ────────────────────────────────────────────────

describe("api_keys table", () => {
  let db: Database.Database;

  beforeAll(() => {
    db = createTestDB();
  });
  afterAll(() => db.close());

  it("inserts an API key", () => {
    db.prepare(`
      INSERT INTO api_keys (id, agent_npub, api_key_hash, managed_nsec_encrypted)
      VALUES (?, ?, ?, ?)
    `).run("key-1", "npub-agent-1", "hash-abc123", "encrypted-nsec-data");

    const row = db.prepare(
      "SELECT * FROM api_keys WHERE api_key_hash = ?"
    ).get("hash-abc123") as Record<string, unknown>;

    expect(row).toBeDefined();
    expect(row.agent_npub).toBe("npub-agent-1");
    expect(row.managed_nsec_encrypted).toBe("encrypted-nsec-data");
  });

  it("updates last_used_at", () => {
    db.prepare(
      "UPDATE api_keys SET last_used_at = datetime('now') WHERE id = ?"
    ).run("key-1");

    const row = db.prepare(
      "SELECT last_used_at FROM api_keys WHERE id = ?"
    ).get("key-1") as { last_used_at: string | null };

    expect(row.last_used_at).not.toBeNull();
  });

  it("supports self-custodial keys (null nsec)", () => {
    db.prepare(`
      INSERT INTO api_keys (id, agent_npub, api_key_hash)
      VALUES (?, ?, ?)
    `).run("key-2", "npub-agent-2", "hash-def456");

    const row = db.prepare(
      "SELECT managed_nsec_encrypted FROM api_keys WHERE id = ?"
    ).get("key-2") as { managed_nsec_encrypted: string | null };

    expect(row.managed_nsec_encrypted).toBeNull();
  });
});

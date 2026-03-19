import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";

/**
 * Test the admin stats SQL queries against an in-memory SQLite DB.
 * This validates the query logic without needing the full app schema.
 */
function createTestDB(): Database.Database {
  const db = new Database(":memory:");

  db.exec(`
    CREATE TABLE bounties (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      reward_sats INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'open',
      creator_pubkey TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE payments (
      id TEXT PRIMARY KEY,
      bounty_id TEXT,
      amount_sats INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  return db;
}

describe("Admin Stats Queries", () => {
  it("returns bounty counts by status", () => {
    const db = createTestDB();

    db.prepare(
      `INSERT INTO bounties (id, title, reward_sats, status, creator_pubkey)
       VALUES (?, ?, ?, ?, ?)`
    ).run("b1", "Open", 50000, "open", "pk1");

    db.prepare(
      `INSERT INTO bounties (id, title, reward_sats, status, creator_pubkey)
       VALUES (?, ?, ?, ?, ?)`
    ).run("b2", "Claimed", 100000, "claimed", "pk1");

    db.prepare(
      `INSERT INTO bounties (id, title, reward_sats, status, creator_pubkey)
       VALUES (?, ?, ?, ?, ?)`
    ).run("b3", "Done", 75000, "completed", "pk1");

    const stats = db
      .prepare(
        `SELECT
          count(*) as total_bounties,
          count(CASE WHEN status = 'open' THEN 1 END) as open,
          count(CASE WHEN status = 'claimed' THEN 1 END) as claimed,
          count(CASE WHEN status = 'completed' THEN 1 END) as completed,
          coalesce(sum(reward_sats), 0) as total_reward_sats,
          coalesce(sum(CASE WHEN status = 'completed' THEN reward_sats ELSE 0 END), 0) as paid_out_sats
        FROM bounties`
      )
      .get() as Record<string, number>;

    expect(stats.total_bounties).toBe(3);
    expect(stats.open).toBe(1);
    expect(stats.claimed).toBe(1);
    expect(stats.completed).toBe(1);
    expect(stats.total_reward_sats).toBe(225000);
    expect(stats.paid_out_sats).toBe(75000);
    db.close();
  });

  it("returns zero stats for empty database", () => {
    const db = createTestDB();

    const stats = db
      .prepare(
        `SELECT
          count(*) as total_bounties,
          coalesce(sum(reward_sats), 0) as total_reward_sats
        FROM bounties`
      )
      .get() as Record<string, number>;

    expect(stats.total_bounties).toBe(0);
    expect(stats.total_reward_sats).toBe(0);
    db.close();
  });

  it("calculates BTC conversion correctly", () => {
    const sats = 150000;
    const btc = (sats / 1e8).toFixed(8);
    expect(btc).toBe("0.00150000");
  });

  it("counts recent activity within 24h window", () => {
    const db = createTestDB();

    // Recent bounty
    db.prepare(
      `INSERT INTO bounties (id, title, reward_sats, status, creator_pubkey, created_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`
    ).run("recent", "Recent", 10000, "open", "pk1");

    // Old bounty (48h ago)
    db.prepare(
      `INSERT INTO bounties (id, title, reward_sats, status, creator_pubkey, created_at)
       VALUES (?, ?, ?, ?, ?, datetime('now', '-48 hours'))`
    ).run("old", "Old", 10000, "open", "pk1");

    const recent = db
      .prepare(
        `SELECT count(*) as cnt FROM bounties WHERE created_at > datetime('now', '-24 hours')`
      )
      .get() as { cnt: number };

    expect(recent.cnt).toBe(1);
    db.close();
  });

  it("tracks payment stats with settled totals", () => {
    const db = createTestDB();

    db.prepare(
      `INSERT INTO payments (id, bounty_id, amount_sats, status)
       VALUES (?, ?, ?, ?)`
    ).run("p1", "b1", 50000, "settled");

    db.prepare(
      `INSERT INTO payments (id, bounty_id, amount_sats, status)
       VALUES (?, ?, ?, ?)`
    ).run("p2", "b2", 30000, "pending");

    db.prepare(
      `INSERT INTO payments (id, bounty_id, amount_sats, status)
       VALUES (?, ?, ?, ?)`
    ).run("p3", "b3", 20000, "expired");

    const stats = db
      .prepare(
        `SELECT
          count(*) as total_payments,
          count(CASE WHEN status = 'settled' THEN 1 END) as settled,
          count(CASE WHEN status = 'pending' THEN 1 END) as pending,
          count(CASE WHEN status = 'expired' THEN 1 END) as expired,
          coalesce(sum(CASE WHEN status = 'settled' THEN amount_sats ELSE 0 END), 0) as total_sats_settled
        FROM payments`
      )
      .get() as Record<string, number>;

    expect(stats.total_payments).toBe(3);
    expect(stats.settled).toBe(1);
    expect(stats.pending).toBe(1);
    expect(stats.expired).toBe(1);
    expect(stats.total_sats_settled).toBe(50000);
    db.close();
  });
});

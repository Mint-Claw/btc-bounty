/**
 * Payment tracking for bounty escrow and payouts.
 *
 * Backed by SQLite via db.ts. Tracks the lifecycle:
 *   pending → funded (invoice paid) → paid (payout sent) | failed
 *
 * Migration v3 adds the extra columns (poster_pubkey, bounty_event_id,
 * platform_fee_sats, funded_at, settled_at, winner_lud16, btcpay fields).
 */

import { getDB } from "./db";

// ─── Types ───────────────────────────────────────────────────

export type PaymentStatus = "pending" | "funded" | "paid" | "failed";

export interface BountyPayment {
  id: string;
  bountyId: string;
  bountyEventId: string;
  posterPubkey: string;
  amountSats: number;
  platformFeeSats: number;
  btcpayInvoiceId: string | null;
  btcpayPayoutId: string | null;
  status: PaymentStatus;
  winnerPubkey: string | null;
  winnerLud16: string | null;
  createdAt: string;
  fundedAt: string | null;
  settledAt: string | null;
}

// ─── Schema migration ────────────────────────────────────────

let migrated = false;

function ensureMigrated(): void {
  if (migrated) return;
  const db = getDB();

  // Check if v3 columns exist; if not, add them
  const cols = db
    .prepare("PRAGMA table_info(bounty_payments)")
    .all() as { name: string }[];
  const colNames = new Set(cols.map((c) => c.name));

  const alters: string[] = [];
  if (!colNames.has("bounty_event_id"))
    alters.push("ALTER TABLE bounty_payments ADD COLUMN bounty_event_id TEXT DEFAULT ''");
  if (!colNames.has("poster_pubkey"))
    alters.push("ALTER TABLE bounty_payments ADD COLUMN poster_pubkey TEXT DEFAULT ''");
  if (!colNames.has("platform_fee_sats"))
    alters.push("ALTER TABLE bounty_payments ADD COLUMN platform_fee_sats INTEGER DEFAULT 0");
  if (!colNames.has("funded_at"))
    alters.push("ALTER TABLE bounty_payments ADD COLUMN funded_at TEXT");
  if (!colNames.has("settled_at"))
    alters.push("ALTER TABLE bounty_payments ADD COLUMN settled_at TEXT");
  if (!colNames.has("winner_lud16"))
    alters.push("ALTER TABLE bounty_payments ADD COLUMN winner_lud16 TEXT");

  // Also ensure index on btcpay_invoice_id for webhook lookups
  alters.push(
    "CREATE INDEX IF NOT EXISTS idx_bounty_payments_invoice ON bounty_payments(btcpay_invoice_id)"
  );
  alters.push(
    "CREATE INDEX IF NOT EXISTS idx_bounty_payments_payout ON bounty_payments(btcpay_payout_id)"
  );

  if (alters.length > 0) {
    db.exec(alters.join(";\n"));
  }

  // Record migration version
  const current = db
    .prepare("SELECT COALESCE(MAX(version), 0) as v FROM schema_version")
    .get() as { v: number };
  if (current.v < 3) {
    db.prepare("INSERT OR IGNORE INTO schema_version (version) VALUES (3)").run();
  }

  migrated = true;
}

// ─── Helpers ─────────────────────────────────────────────────

const PLATFORM_FEE_PCT = 0.05;

function rowToPayment(row: Record<string, unknown>): BountyPayment {
  return {
    id: row.id as string,
    bountyId: row.bounty_id as string,
    bountyEventId: (row.bounty_event_id as string) || "",
    posterPubkey: (row.poster_pubkey as string) || "",
    amountSats: row.amount_sats as number,
    platformFeeSats: (row.platform_fee_sats as number) || 0,
    btcpayInvoiceId: (row.btcpay_invoice_id as string) || null,
    btcpayPayoutId: (row.btcpay_payout_id as string) || null,
    status: row.status as PaymentStatus,
    winnerPubkey: (row.winner_npub as string) || null,
    winnerLud16: (row.winner_lud16 as string) || null,
    createdAt: row.created_at as string,
    fundedAt: (row.funded_at as string) || null,
    settledAt: (row.settled_at as string) || null,
  };
}

// ─── CRUD ────────────────────────────────────────────────────

/**
 * Create a new payment record when a bounty is posted with escrow.
 */
export async function createPayment(params: {
  bountyId: string;
  bountyEventId: string;
  posterPubkey: string;
  amountSats: number;
  btcpayInvoiceId: string;
}): Promise<BountyPayment> {
  ensureMigrated();
  const db = getDB();

  const id = crypto.randomUUID();
  const platformFeeSats = Math.floor(params.amountSats * PLATFORM_FEE_PCT);
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO bounty_payments
      (id, bounty_id, bounty_event_id, poster_pubkey, amount_sats, platform_fee_sats,
       btcpay_invoice_id, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
  `).run(
    id,
    params.bountyId,
    params.bountyEventId,
    params.posterPubkey,
    params.amountSats,
    platformFeeSats,
    params.btcpayInvoiceId,
    now,
    now,
  );

  return {
    id,
    bountyId: params.bountyId,
    bountyEventId: params.bountyEventId,
    posterPubkey: params.posterPubkey,
    amountSats: params.amountSats,
    platformFeeSats,
    btcpayInvoiceId: params.btcpayInvoiceId,
    btcpayPayoutId: null,
    status: "pending",
    winnerPubkey: null,
    winnerLud16: null,
    createdAt: now,
    fundedAt: null,
    settledAt: null,
  };
}

/**
 * Get a payment by its ID.
 */
export async function getPayment(id: string): Promise<BountyPayment | null> {
  ensureMigrated();
  const db = getDB();
  const row = db.prepare("SELECT * FROM bounty_payments WHERE id = ?").get(id);
  return row ? rowToPayment(row as Record<string, unknown>) : null;
}

/**
 * Get a payment by bounty ID (NOSTR d-tag).
 */
export async function getPaymentByBountyId(
  bountyId: string,
): Promise<BountyPayment | null> {
  ensureMigrated();
  const db = getDB();
  const row = db
    .prepare("SELECT * FROM bounty_payments WHERE bounty_id = ? ORDER BY created_at DESC LIMIT 1")
    .get(bountyId);
  return row ? rowToPayment(row as Record<string, unknown>) : null;
}

/**
 * Get a payment by BTCPay invoice ID.
 */
export async function getPaymentByInvoiceId(
  invoiceId: string,
): Promise<BountyPayment | null> {
  ensureMigrated();
  const db = getDB();
  const row = db
    .prepare("SELECT * FROM bounty_payments WHERE btcpay_invoice_id = ? LIMIT 1")
    .get(invoiceId);
  return row ? rowToPayment(row as Record<string, unknown>) : null;
}

/**
 * Get a payment by BTCPay payout ID.
 */
export async function getPaymentByPayoutId(
  payoutId: string,
): Promise<BountyPayment | null> {
  ensureMigrated();
  const db = getDB();
  const row = db
    .prepare("SELECT * FROM bounty_payments WHERE btcpay_payout_id = ? LIMIT 1")
    .get(payoutId);
  return row ? rowToPayment(row as Record<string, unknown>) : null;
}

/**
 * Update a payment's status.
 */
export async function updatePaymentStatus(
  id: string,
  status: PaymentStatus,
  winnerPubkey?: string,
): Promise<BountyPayment | null> {
  ensureMigrated();
  const db = getDB();
  const now = new Date().toISOString();

  let sql = "UPDATE bounty_payments SET status = ?, updated_at = ?";
  const params: unknown[] = [status, now];

  if (status === "funded") {
    sql += ", funded_at = ?";
    params.push(now);
  } else if (status === "paid") {
    sql += ", settled_at = ?";
    params.push(now);
  }

  if (winnerPubkey) {
    sql += ", winner_npub = ?";
    params.push(winnerPubkey);
  }

  sql += " WHERE id = ?";
  params.push(id);

  const result = db.prepare(sql).run(...params);
  if (result.changes === 0) return null;

  return getPayment(id);
}

/**
 * Set the payout ID and winner info when award is triggered.
 */
export async function setPayoutInfo(
  id: string,
  payoutId: string,
  winnerPubkey: string,
  winnerLud16: string,
): Promise<BountyPayment | null> {
  ensureMigrated();
  const db = getDB();
  const now = new Date().toISOString();

  const result = db
    .prepare(
      `UPDATE bounty_payments
       SET btcpay_payout_id = ?, winner_npub = ?, winner_lud16 = ?, updated_at = ?
       WHERE id = ?`
    )
    .run(payoutId, winnerPubkey, winnerLud16, now, id);

  if (result.changes === 0) return null;
  return getPayment(id);
}

/**
 * List all payments, optionally filtered by status.
 */
export async function listPayments(
  status?: PaymentStatus,
): Promise<BountyPayment[]> {
  ensureMigrated();
  const db = getDB();

  if (status) {
    const rows = db
      .prepare("SELECT * FROM bounty_payments WHERE status = ? ORDER BY created_at DESC")
      .all(status);
    return (rows as Record<string, unknown>[]).map(rowToPayment);
  }

  const rows = db
    .prepare("SELECT * FROM bounty_payments ORDER BY created_at DESC")
    .all();
  return (rows as Record<string, unknown>[]).map(rowToPayment);
}

/**
 * Get payment stats.
 */
export async function getPaymentStats(): Promise<{
  total: number;
  pending: number;
  funded: number;
  paid: number;
  failed: number;
  totalVolumeSats: number;
  totalFeesSats: number;
}> {
  ensureMigrated();
  const db = getDB();

  const row = db
    .prepare(
      `SELECT
        COUNT(*) as total,
        COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0) as pending,
        COALESCE(SUM(CASE WHEN status = 'funded' THEN 1 ELSE 0 END), 0) as funded,
        COALESCE(SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END), 0) as paid,
        COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0) as failed,
        COALESCE(SUM(CASE WHEN status = 'paid' THEN amount_sats ELSE 0 END), 0) as volume,
        COALESCE(SUM(CASE WHEN status = 'paid' THEN platform_fee_sats ELSE 0 END), 0) as fees
       FROM bounty_payments`
    )
    .get() as Record<string, number>;

  return {
    total: row.total,
    pending: row.pending,
    funded: row.funded,
    paid: row.paid,
    failed: row.failed,
    totalVolumeSats: row.volume,
    totalFeesSats: row.fees,
  };
}

/**
 * Reset store (for testing). Clears all payment rows.
 */
export function resetPaymentStore(): void {
  migrated = false; // Force re-migration check (needed when DB swapped in tests)
  ensureMigrated();
  const db = getDB();
  db.prepare("DELETE FROM bounty_payments").run();
}

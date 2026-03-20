/**
 * Payment tracking for bounty escrow and payouts.
 *
 * Phase 2: In-memory + JSON file store for simplicity.
 * Phase 3: Migrate to SQLite or Supabase.
 *
 * Tracks the lifecycle:
 *   pending → funded (invoice paid) → paid (payout sent) | failed
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

// ─── Types ───────────────────────────────────────────────────

export type PaymentStatus = "pending" | "funded" | "paid" | "failed";

export interface BountyPayment {
  id: string; // UUID
  bountyId: string; // NOSTR d-tag
  bountyEventId: string; // NOSTR event ID
  posterPubkey: string;
  amountSats: number;
  platformFeeSats: number;
  btcpayInvoiceId: string | null;
  btcpayPayoutId: string | null;
  status: PaymentStatus;
  winnerPubkey: string | null;
  winnerLud16: string | null;
  createdAt: string; // ISO 8601
  fundedAt: string | null;
  settledAt: string | null;
}

// ─── Store ───────────────────────────────────────────────────

const DATA_DIR = process.env.BTCBOUNTY_DATA_DIR || join(process.cwd(), ".data");
const PAYMENTS_FILE = join(DATA_DIR, "payments.json");

let payments: BountyPayment[] = [];
let loaded = false;

function ensureLoaded(): void {
  if (loaded) return;
  try {
    if (existsSync(PAYMENTS_FILE)) {
      const raw = readFileSync(PAYMENTS_FILE, "utf-8");
      payments = JSON.parse(raw);
    }
  } catch (e) {
    console.error("[payments] Failed to load payments file:", e);
    payments = [];
  }
  loaded = true;
}

function persist(): void {
  try {
    const dir = DATA_DIR;
    if (!existsSync(dir)) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { mkdirSync } = require("fs");
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(PAYMENTS_FILE, JSON.stringify(payments, null, 2));
  } catch (e) {
    console.error("[payments] Failed to persist payments:", e);
  }
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
  ensureLoaded();

  const PLATFORM_FEE_PCT = 0.025;
  const payment: BountyPayment = {
    id: crypto.randomUUID(),
    bountyId: params.bountyId,
    bountyEventId: params.bountyEventId,
    posterPubkey: params.posterPubkey,
    amountSats: params.amountSats,
    platformFeeSats: Math.floor(params.amountSats * PLATFORM_FEE_PCT),
    btcpayInvoiceId: params.btcpayInvoiceId,
    btcpayPayoutId: null,
    status: "pending",
    winnerPubkey: null,
    winnerLud16: null,
    createdAt: new Date().toISOString(),
    fundedAt: null,
    settledAt: null,
  };

  payments.push(payment);
  persist();
  return payment;
}

/**
 * Get a payment by its ID.
 */
export async function getPayment(id: string): Promise<BountyPayment | null> {
  ensureLoaded();
  return payments.find((p) => p.id === id) ?? null;
}

/**
 * Get a payment by bounty ID (NOSTR d-tag).
 */
export async function getPaymentByBountyId(
  bountyId: string,
): Promise<BountyPayment | null> {
  ensureLoaded();
  return payments.find((p) => p.bountyId === bountyId) ?? null;
}

/**
 * Get a payment by BTCPay invoice ID.
 */
export async function getPaymentByInvoiceId(
  invoiceId: string,
): Promise<BountyPayment | null> {
  ensureLoaded();
  return payments.find((p) => p.btcpayInvoiceId === invoiceId) ?? null;
}

/**
 * Get a payment by BTCPay payout ID.
 */
export async function getPaymentByPayoutId(
  payoutId: string,
): Promise<BountyPayment | null> {
  ensureLoaded();
  return payments.find((p) => p.btcpayPayoutId === payoutId) ?? null;
}

/**
 * Update a payment's status.
 */
export async function updatePaymentStatus(
  id: string,
  status: PaymentStatus,
  winnerPubkey?: string,
): Promise<BountyPayment | null> {
  ensureLoaded();
  const payment = payments.find((p) => p.id === id);
  if (!payment) return null;

  payment.status = status;

  if (status === "funded") {
    payment.fundedAt = new Date().toISOString();
  } else if (status === "paid") {
    payment.settledAt = new Date().toISOString();
    if (winnerPubkey) payment.winnerPubkey = winnerPubkey;
  }

  persist();
  return payment;
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
  ensureLoaded();
  const payment = payments.find((p) => p.id === id);
  if (!payment) return null;

  payment.btcpayPayoutId = payoutId;
  payment.winnerPubkey = winnerPubkey;
  payment.winnerLud16 = winnerLud16;

  persist();
  return payment;
}

/**
 * List all payments, optionally filtered by status.
 */
export async function listPayments(
  status?: PaymentStatus,
): Promise<BountyPayment[]> {
  ensureLoaded();
  if (!status) return [...payments];
  return payments.filter((p) => p.status === status);
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
  ensureLoaded();
  return {
    total: payments.length,
    pending: payments.filter((p) => p.status === "pending").length,
    funded: payments.filter((p) => p.status === "funded").length,
    paid: payments.filter((p) => p.status === "paid").length,
    failed: payments.filter((p) => p.status === "failed").length,
    totalVolumeSats: payments
      .filter((p) => p.status === "paid")
      .reduce((sum, p) => sum + p.amountSats, 0),
    totalFeesSats: payments
      .filter((p) => p.status === "paid")
      .reduce((sum, p) => sum + p.platformFeeSats, 0),
  };
}

/**
 * Reset store (for testing).
 */
export function resetPaymentStore(): void {
  payments = [];
  loaded = true;
}

/**
 * BTCPay Server API Client
 *
 * Handles invoice creation (escrow deposits), payment status checks,
 * and Lightning payouts to bounty winners.
 *
 * BTCPay Greenfield API v1:
 *   POST /api/v1/stores/{storeId}/invoices        — Create invoice
 *   GET  /api/v1/stores/{storeId}/invoices/{id}    — Check payment status
 *   POST /api/v1/stores/{storeId}/payouts          — Create payout
 *   GET  /api/v1/stores/{storeId}/payouts/{id}     — Check payout status
 *
 * Config via env vars:
 *   BTCPAY_URL       — BTCPay server URL (e.g. http://citadel.local)
 *   BTCPAY_API_KEY   — API key with invoice+payout permissions
 *   BTCPAY_STORE_ID  — Store ID
 *   BTCPAY_WEBHOOK_SECRET — Webhook HMAC secret for verifying callbacks
 */

// ─── Types ───────────────────────────────────────────────────

export interface BTCPayConfig {
  url: string;
  apiKey: string;
  storeId: string;
  webhookSecret: string;
}

export interface CreateInvoiceRequest {
  amount: number; // sats
  currency?: string; // "BTC" or "SATS", default SATS
  bountyId: string; // NOSTR d-tag for tracking
  buyerEmail?: string;
  description?: string;
  expirationMinutes?: number;
  redirectUrl?: string;
}

export interface BTCPayInvoice {
  id: string;
  status: "New" | "Processing" | "Expired" | "Invalid" | "Settled";
  amount: string;
  currency: string;
  checkoutLink: string;
  createdTime: number;
  expirationTime: number;
  monitoringExpiration: number;
  metadata: Record<string, string>;
}

export type PayoutStatus =
  | "AwaitingApproval"
  | "AwaitingPayment"
  | "InProgress"
  | "Completed"
  | "Cancelled";

export interface CreatePayoutRequest {
  destination: string; // Lightning address (lud16) or BOLT11
  amount: number; // sats
  bountyId: string;
  winnerPubkey: string;
  paymentMethod?: string; // "BTC-LightningNetwork" default
}

export interface BTCPayPayout {
  id: string;
  state: PayoutStatus;
  amount: string;
  destination: string;
  paymentMethod: string;
  date: number;
  metadata: Record<string, string>;
}

export interface WebhookPayload {
  deliveryId: string;
  webhookId: string;
  originalDeliveryId: string;
  isRedelivery: boolean;
  type: string; // "InvoiceSettled", "InvoicePaymentSettled", "PayoutApproved", etc.
  timestamp: number;
  storeId: string;
  invoiceId?: string;
  payoutId?: string;
  metadata?: Record<string, string>;
}

// ─── Config ──────────────────────────────────────────────────

function getConfig(): BTCPayConfig {
  const url = process.env.BTCPAY_URL;
  const apiKey = process.env.BTCPAY_API_KEY;
  const storeId = process.env.BTCPAY_STORE_ID;
  const webhookSecret = process.env.BTCPAY_WEBHOOK_SECRET || "";

  if (!url || !apiKey || !storeId) {
    throw new Error(
      "BTCPay not configured. Set BTCPAY_URL, BTCPAY_API_KEY, BTCPAY_STORE_ID env vars.",
    );
  }

  return { url: url.replace(/\/$/, ""), apiKey, storeId, webhookSecret };
}

// ─── HTTP helpers ────────────────────────────────────────────

async function btcpayFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const config = getConfig();
  const url = `${config.url}${path}`;

  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `token ${config.apiKey}`,
      ...((options.headers as Record<string, string>) || {}),
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `BTCPay API error: ${res.status} ${res.statusText} — ${body}`,
    );
  }

  return res.json() as Promise<T>;
}

// ─── Invoice (escrow deposit) ────────────────────────────────

/**
 * Create an invoice for escrow deposit when a bounty is posted.
 * The poster pays this invoice to fund the bounty.
 */
export async function createInvoice(
  req: CreateInvoiceRequest,
): Promise<BTCPayInvoice> {
  const config = getConfig();
  const amountBTC = req.amount / 100_000_000; // sats to BTC

  const body = {
    amount: req.currency === "BTC" ? amountBTC : req.amount,
    currency: req.currency === "BTC" ? "BTC" : "SATS",
    metadata: {
      bountyId: req.bountyId,
      orderId: `bounty-${req.bountyId}`,
    },
    checkout: {
      expirationMinutes: req.expirationMinutes || 60,
      redirectURL: req.redirectUrl || undefined,
      defaultPaymentMethod: "BTC-LightningNetwork",
    },
    receipt: {
      enabled: true,
    },
    ...(req.buyerEmail && { buyer: { email: req.buyerEmail } }),
    ...(req.description && {
      metadata: {
        bountyId: req.bountyId,
        orderId: `bounty-${req.bountyId}`,
        itemDesc: req.description,
      },
    }),
  };

  return btcpayFetch<BTCPayInvoice>(
    `/api/v1/stores/${config.storeId}/invoices`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

/**
 * Check the payment status of an invoice.
 */
export async function getInvoice(invoiceId: string): Promise<BTCPayInvoice> {
  const config = getConfig();
  return btcpayFetch<BTCPayInvoice>(
    `/api/v1/stores/${config.storeId}/invoices/${invoiceId}`,
  );
}

/**
 * Check if an invoice has been fully paid.
 */
export async function isInvoiceSettled(invoiceId: string): Promise<boolean> {
  const invoice = await getInvoice(invoiceId);
  return invoice.status === "Settled";
}

// ─── Payout (pay the winner) ─────────────────────────────────

/**
 * Create a payout to the bounty winner's Lightning address.
 * Called when the bounty poster selects a winner.
 *
 * Platform fee (2.5%) is deducted before payout.
 */
export async function createPayout(
  req: CreatePayoutRequest,
): Promise<BTCPayPayout> {
  const config = getConfig();
  const PLATFORM_FEE_PCT = 0.025;
  const feeAmount = Math.floor(req.amount * PLATFORM_FEE_PCT);
  const payoutAmount = req.amount - feeAmount;

  const body = {
    destination: req.destination,
    amount: payoutAmount / 100_000_000, // sats to BTC
    paymentMethod: req.paymentMethod || "BTC-LightningNetwork",
    metadata: {
      bountyId: req.bountyId,
      winnerPubkey: req.winnerPubkey,
      grossAmount: String(req.amount),
      feeAmount: String(feeAmount),
      feePercent: String(PLATFORM_FEE_PCT * 100),
    },
  };

  return btcpayFetch<BTCPayPayout>(
    `/api/v1/stores/${config.storeId}/payouts`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

/**
 * Check the status of a payout.
 */
export async function getPayout(payoutId: string): Promise<BTCPayPayout> {
  const config = getConfig();
  return btcpayFetch<BTCPayPayout>(
    `/api/v1/stores/${config.storeId}/payouts/${payoutId}`,
  );
}

/**
 * Check if a payout has been completed.
 */
export async function isPayoutCompleted(payoutId: string): Promise<boolean> {
  const payout = await getPayout(payoutId);
  return payout.state === "Completed";
}

// ─── Webhook verification ────────────────────────────────────

/**
 * Verify a BTCPay webhook signature.
 * BTCPay sends HMAC-SHA256 in the `BTCPay-Sig` header.
 */
export async function verifyWebhookSignature(
  body: string,
  signature: string,
): Promise<boolean> {
  const config = getConfig();
  if (!config.webhookSecret) {
    console.warn("BTCPAY_WEBHOOK_SECRET not set — skipping verification");
    return true; // Allow in dev, but warn
  }

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(config.webhookSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  const computed = `sha256=${Buffer.from(sig).toString("hex")}`;

  return computed === signature;
}

/**
 * Parse and validate a webhook payload.
 */
export function parseWebhookPayload(body: string): WebhookPayload | null {
  try {
    return JSON.parse(body) as WebhookPayload;
  } catch {
    return null;
  }
}

// ─── Health check ────────────────────────────────────────────

/**
 * Check if BTCPay Server is reachable and configured.
 */
export async function btcpayHealthCheck(): Promise<{
  ok: boolean;
  url: string;
  error?: string;
}> {
  try {
    const config = getConfig();
    const res = await fetch(`${config.url}/api/v1/health`, {
      headers: { Authorization: `token ${config.apiKey}` },
      signal: AbortSignal.timeout(5000),
    });
    return { ok: res.ok, url: config.url };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("not configured")) {
      return { ok: false, url: "not configured", error: msg };
    }
    return {
      ok: false,
      url: process.env.BTCPAY_URL || "not set",
      error: msg,
    };
  }
}

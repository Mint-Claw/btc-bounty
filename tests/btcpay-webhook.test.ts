import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import { createHmac } from "crypto";

// Helper to create a valid BTCPay webhook signature
function signPayload(body: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

describe("BTCPay webhook handler", () => {
  const originalEnv = process.env;
  const WEBHOOK_SECRET = "test-btcpay-secret-123";

  beforeEach(() => {
    vi.resetModules();
    process.env = {
      ...originalEnv,
      BTCPAY_URL: "https://btcpay.test",
      BTCPAY_API_KEY: "test-api-key",
      BTCPAY_STORE_ID: "test-store",
      BTCPAY_WEBHOOK_SECRET: WEBHOOK_SECRET,
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  test("rejects unsigned requests", async () => {
    const { verifyWebhookSignature } = await import("@/lib/server/btcpay");
    const body = JSON.stringify({ type: "InvoiceSettled" });
    const valid = await verifyWebhookSignature(body, "");
    expect(valid).toBe(false);
  });

  test("rejects invalid signatures", async () => {
    const { verifyWebhookSignature } = await import("@/lib/server/btcpay");
    const body = JSON.stringify({ type: "InvoiceSettled" });
    const valid = await verifyWebhookSignature(body, "sha256=invalid");
    expect(valid).toBe(false);
  });

  test("accepts valid HMAC signatures", async () => {
    const { verifyWebhookSignature } = await import("@/lib/server/btcpay");
    const body = JSON.stringify({ type: "InvoiceSettled", invoiceId: "inv_123" });
    const sig = signPayload(body, WEBHOOK_SECRET);
    const valid = await verifyWebhookSignature(body, sig);
    expect(valid).toBe(true);
  });

  test("parses InvoiceSettled payload", async () => {
    const { parseWebhookPayload } = await import("@/lib/server/btcpay");
    const raw = JSON.stringify({
      deliveryId: "del_001",
      webhookId: "wh_001",
      type: "InvoiceSettled",
      invoiceId: "inv_abc",
      storeId: "test-store",
      timestamp: 1700000000,
    });
    const payload = parseWebhookPayload(raw);
    expect(payload).not.toBeNull();
    expect(payload!.type).toBe("InvoiceSettled");
    expect(payload!.invoiceId).toBe("inv_abc");
    expect(payload!.deliveryId).toBe("del_001");
  });

  test("parses PayoutApproved payload", async () => {
    const { parseWebhookPayload } = await import("@/lib/server/btcpay");
    const raw = JSON.stringify({
      deliveryId: "del_002",
      webhookId: "wh_002",
      type: "PayoutApproved",
      payoutId: "payout_xyz",
      storeId: "test-store",
      timestamp: 1700000000,
    });
    const payload = parseWebhookPayload(raw);
    expect(payload).not.toBeNull();
    expect(payload!.type).toBe("PayoutApproved");
    expect(payload!.payoutId).toBe("payout_xyz");
  });

  test("parses InvoiceExpired payload", async () => {
    const { parseWebhookPayload } = await import("@/lib/server/btcpay");
    const raw = JSON.stringify({
      deliveryId: "del_003",
      webhookId: "wh_003",
      type: "InvoiceExpired",
      invoiceId: "inv_expired",
      storeId: "test-store",
      timestamp: 1700000000,
    });
    const payload = parseWebhookPayload(raw);
    expect(payload).not.toBeNull();
    expect(payload!.type).toBe("InvoiceExpired");
  });

  test("returns null for malformed JSON", async () => {
    const { parseWebhookPayload } = await import("@/lib/server/btcpay");
    const payload = parseWebhookPayload("not json {{{");
    expect(payload).toBeNull();
  });

  test("returns null for payload missing type", async () => {
    const { parseWebhookPayload } = await import("@/lib/server/btcpay");
    const payload = parseWebhookPayload(JSON.stringify({ invoiceId: "test" }));
    expect(payload).toBeNull();
  });
});

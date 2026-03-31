/**
 * Tests for BTCPay Server client (invoice + payout + health).
 * All HTTP calls are mocked — no real BTCPay needed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("BTCPay Client", () => {
  const originalEnv = process.env;
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    mockFetch.mockReset();
    process.env = {
      ...originalEnv,
      BTCPAY_URL: "https://btcpay.test",
      BTCPAY_API_KEY: "test-api-key-abc123",
      BTCPAY_STORE_ID: "store-xyz",
      BTCPAY_WEBHOOK_SECRET: "webhook-secret-456",
    };
    // Mock global fetch
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  // ─── Config ──────────────────────────────────────

  it("throws when BTCPAY_URL is not set", async () => {
    delete process.env.BTCPAY_URL;
    const { createInvoice } = await import("@/lib/server/btcpay");
    await expect(
      createInvoice({
        amount: 10000,
        bountyId: "b1",
      }),
    ).rejects.toThrow("BTCPay not configured");
  });

  it("throws when BTCPAY_API_KEY is not set", async () => {
    delete process.env.BTCPAY_API_KEY;
    const { createInvoice } = await import("@/lib/server/btcpay");
    await expect(
      createInvoice({
        amount: 10000,
        bountyId: "b1",
      }),
    ).rejects.toThrow("BTCPay not configured");
  });

  it("throws when BTCPAY_STORE_ID is not set", async () => {
    delete process.env.BTCPAY_STORE_ID;
    const { createInvoice } = await import("@/lib/server/btcpay");
    await expect(
      createInvoice({
        amount: 10000,
        bountyId: "b1",
      }),
    ).rejects.toThrow("BTCPay not configured");
  });

  // ─── Create Invoice ──────────────────────────────

  it("creates invoice with correct API call", async () => {
    const invoiceResponse = {
      id: "inv_001",
      status: "New",
      amount: "10000",
      currency: "SATS",
      checkoutLink: "https://btcpay.test/i/inv_001",
      createdTime: Date.now(),
      expirationTime: Date.now() + 3600000,
      monitoringExpiration: Date.now() + 7200000,
      metadata: { bountyId: "bounty-abc" },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(invoiceResponse),
    });

    const { createInvoice } = await import("@/lib/server/btcpay");
    const result = await createInvoice({
      amount: 10000,
      bountyId: "bounty-abc",
      description: "Fix the bug",
    });

    expect(result.id).toBe("inv_001");
    expect(result.status).toBe("New");
    expect(result.checkoutLink).toContain("btcpay.test");

    // Verify fetch was called correctly
    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe("https://btcpay.test/api/v1/stores/store-xyz/invoices");
    expect(opts.method).toBe("POST");
    expect(opts.headers["Authorization"]).toBe("token test-api-key-abc123");
    expect(opts.headers["Content-Type"]).toBe("application/json");

    const body = JSON.parse(opts.body);
    expect(body.amount).toBe(10000);
    expect(body.currency).toBe("SATS");
    expect(body.metadata.bountyId).toBe("bounty-abc");
    expect(body.metadata.orderId).toBe("bounty-bounty-abc");
    expect(body.checkout.defaultPaymentMethod).toBe("BTC-LightningNetwork");
  });

  it("creates invoice with BTC currency", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          id: "inv_002",
          status: "New",
          amount: "0.001",
          currency: "BTC",
        }),
    });

    const { createInvoice } = await import("@/lib/server/btcpay");
    await createInvoice({
      amount: 100000,
      currency: "BTC",
      bountyId: "b2",
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.amount).toBe(0.001); // 100000 sats / 100M
    expect(body.currency).toBe("BTC");
  });

  it("sets custom expiration", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: "inv_003", status: "New" }),
    });

    const { createInvoice } = await import("@/lib/server/btcpay");
    await createInvoice({
      amount: 50000,
      bountyId: "b3",
      expirationMinutes: 120,
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.checkout.expirationMinutes).toBe(120);
  });

  it("throws on API error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 422,
      statusText: "Unprocessable Entity",
      text: () => Promise.resolve("Invalid amount"),
    });

    const { createInvoice } = await import("@/lib/server/btcpay");
    await expect(
      createInvoice({ amount: -1, bountyId: "bad" }),
    ).rejects.toThrow("BTCPay API error: 422");
  });

  // ─── Get Invoice ─────────────────────────────────

  it("gets invoice by ID", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          id: "inv_check",
          status: "Settled",
          amount: "50000",
        }),
    });

    const { getInvoice } = await import("@/lib/server/btcpay");
    const inv = await getInvoice("inv_check");
    expect(inv.status).toBe("Settled");

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe(
      "https://btcpay.test/api/v1/stores/store-xyz/invoices/inv_check",
    );
  });

  it("isInvoiceSettled returns true for Settled", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: "inv_s", status: "Settled" }),
    });

    const { isInvoiceSettled } = await import("@/lib/server/btcpay");
    expect(await isInvoiceSettled("inv_s")).toBe(true);
  });

  it("isInvoiceSettled returns false for New", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: "inv_n", status: "New" }),
    });

    const { isInvoiceSettled } = await import("@/lib/server/btcpay");
    expect(await isInvoiceSettled("inv_n")).toBe(false);
  });

  // ─── Create Payout ───────────────────────────────

  it("creates payout with 5% platform fee deducted", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          id: "payout_001",
          state: "AwaitingApproval",
          amount: "0.00095",
          destination: "winner@getalby.com",
          paymentMethod: "BTC-LightningNetwork",
        }),
    });

    const { createPayout } = await import("@/lib/server/btcpay");
    const result = await createPayout({
      destination: "winner@getalby.com",
      amount: 100000, // 100k sats
      bountyId: "b-payout",
      winnerPubkey: "npub1winner",
    });

    expect(result.id).toBe("payout_001");
    expect(result.state).toBe("AwaitingApproval");

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    // 100000 - 5% = 95000 sats = 0.00095 BTC
    expect(body.amount).toBeCloseTo(0.00095, 8);
    expect(body.destination).toBe("winner@getalby.com");
    expect(body.paymentMethod).toBe("BTC-LightningNetwork");
    expect(body.metadata.bountyId).toBe("b-payout");
    expect(body.metadata.winnerPubkey).toBe("npub1winner");
    expect(body.metadata.grossAmount).toBe("100000");
    expect(body.metadata.feeAmount).toBe("5000");
    expect(body.metadata.feePercent).toBe("5");
  });

  it("creates payout with exact fee math for small amounts", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: "po_small", state: "AwaitingApproval" }),
    });

    const { createPayout } = await import("@/lib/server/btcpay");
    await createPayout({
      destination: "user@ln.addr",
      amount: 1000, // 1000 sats
      bountyId: "b-small",
      winnerPubkey: "npub1small",
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    // 1000 - 5% = 950 sats = 0.0000095 BTC
    expect(body.amount).toBeCloseTo(950 / 100_000_000, 10);
    expect(body.metadata.feeAmount).toBe("50"); // 5% of 1000
  });

  it("creates payout with custom payment method", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: "po_onchain", state: "AwaitingApproval" }),
    });

    const { createPayout } = await import("@/lib/server/btcpay");
    await createPayout({
      destination: "bc1q...",
      amount: 500000,
      bountyId: "b-onchain",
      winnerPubkey: "npub1oc",
      paymentMethod: "BTC",
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.paymentMethod).toBe("BTC");
  });

  // ─── Get Payout ──────────────────────────────────

  it("gets payout by ID", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          id: "po_check",
          state: "Completed",
          amount: "0.001",
        }),
    });

    const { getPayout } = await import("@/lib/server/btcpay");
    const po = await getPayout("po_check");
    expect(po.state).toBe("Completed");
  });

  it("isPayoutCompleted returns true for Completed", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: "po_c", state: "Completed" }),
    });

    const { isPayoutCompleted } = await import("@/lib/server/btcpay");
    expect(await isPayoutCompleted("po_c")).toBe(true);
  });

  it("isPayoutCompleted returns false for InProgress", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: "po_ip", state: "InProgress" }),
    });

    const { isPayoutCompleted } = await import("@/lib/server/btcpay");
    expect(await isPayoutCompleted("po_ip")).toBe(false);
  });

  // ─── Health Check ────────────────────────────────

  it("returns ok when BTCPay is reachable", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });

    const { btcpayHealthCheck } = await import("@/lib/server/btcpay");
    const health = await btcpayHealthCheck();
    expect(health.ok).toBe(true);
    expect(health.url).toBe("https://btcpay.test");
  });

  it("returns error when BTCPay is unreachable", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Connection refused"));

    const { btcpayHealthCheck } = await import("@/lib/server/btcpay");
    const health = await btcpayHealthCheck();
    expect(health.ok).toBe(false);
    expect(health.error).toContain("Connection refused");
  });

  it("returns error when BTCPay is not configured", async () => {
    delete process.env.BTCPAY_URL;

    const { btcpayHealthCheck } = await import("@/lib/server/btcpay");
    const health = await btcpayHealthCheck();
    expect(health.ok).toBe(false);
    expect(health.error).toContain("not configured");
  });

  // ─── URL handling ────────────────────────────────

  it("strips trailing slash from BTCPAY_URL", async () => {
    process.env.BTCPAY_URL = "https://btcpay.test/";

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: "inv_slash" }),
    });

    const { createInvoice } = await import("@/lib/server/btcpay");
    await createInvoice({ amount: 1000, bountyId: "b-slash" });

    const [url] = mockFetch.mock.calls[0];
    expect(url).not.toContain("//api"); // No double slash
    expect(url).toBe("https://btcpay.test/api/v1/stores/store-xyz/invoices");
  });
});

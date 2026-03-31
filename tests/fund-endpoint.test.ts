/**
 * Tests for POST /api/bounties/:id/fund
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock external deps
vi.mock("@/lib/server/btcpay", () => ({
  createInvoice: vi.fn(),
}));
vi.mock("@/lib/server/payments", () => ({
  createPayment: vi.fn(),
  getPaymentByBountyId: vi.fn(),
}));
vi.mock("@/lib/server/webhooks", () => ({
  deliverWebhook: vi.fn(),
}));

import { createInvoice } from "@/lib/server/btcpay";
import { createPayment, getPaymentByBountyId } from "@/lib/server/payments";

describe("POST /api/bounties/:id/fund", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getPaymentByBountyId as any).mockResolvedValue(null);
    (createInvoice as any).mockResolvedValue({
      id: "inv_test_001",
      checkoutLink: "https://btcpay.test/i/inv_test_001",
      status: "New",
    });
    (createPayment as any).mockResolvedValue({
      id: "pay_001",
      bountyId: "bounty-123",
      status: "pending",
      amountSats: 50000,
      platformFeeSats: 2500,
    });
  });

  async function callFund(bountyId: string, body: Record<string, unknown>) {
    const { POST } = await import("@/app/api/bounties/[id]/fund/route");
    const request = new Request("http://localhost:3000/api/bounties/test/fund", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return POST(request, { params: Promise.resolve({ id: bountyId }) });
  }

  it("creates invoice and returns checkout URL", async () => {
    const res = await callFund("bounty-123", { amountSats: 50000 });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.invoiceId).toBe("inv_test_001");
    expect(data.checkoutUrl).toContain("inv_test_001");
    expect(data.amountSats).toBe(50000);
    expect(data.platformFeeSats).toBe(2500); // 5%
  });

  it("rejects amounts below minimum", async () => {
    const res = await callFund("bounty-123", { amountSats: 500 });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Minimum");
  });

  it("rejects amounts above maximum", async () => {
    const res = await callFund("bounty-123", { amountSats: 20_000_000 });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Maximum");
  });

  it("rejects if already funded", async () => {
    (getPaymentByBountyId as any).mockResolvedValue({
      id: "pay_existing",
      status: "funded",
    });

    const res = await callFund("bounty-123", { amountSats: 50000 });
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toContain("already funded");
  });

  it("rejects if already paid", async () => {
    (getPaymentByBountyId as any).mockResolvedValue({
      id: "pay_existing",
      status: "paid",
    });

    const res = await callFund("bounty-123", { amountSats: 50000 });
    expect(res.status).toBe(409);
  });

  it("allows re-funding if previous invoice expired", async () => {
    (getPaymentByBountyId as any).mockResolvedValue({
      id: "pay_expired",
      status: "expired",
    });

    const res = await callFund("bounty-123", { amountSats: 50000 });
    expect(res.status).toBe(200);
  });

  it("returns 503 when BTCPay is not configured", async () => {
    (createInvoice as any).mockRejectedValue(new Error("BTCPAY_URL not set"));

    const res = await callFund("bounty-123", { amountSats: 50000 });
    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.error).toContain("BTCPay Server is not configured");
  });

  it("calculates 5% platform fee correctly", async () => {
    const res = await callFund("bounty-123", { amountSats: 100000 });
    const data = await res.json();
    expect(data.platformFeeSats).toBe(5000);
  });
});

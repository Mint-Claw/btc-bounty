/**
 * BTCPay Webhook Handler Tests
 *
 * Tests the webhook endpoint for various BTCPay event types:
 * - InvoiceSettled (escrow funded)
 * - PayoutApproved (winner paid)
 * - InvoiceExpired/Invalid (failed)
 * - Signature verification
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock server modules
vi.mock("@/lib/server/btcpay", () => ({
  verifyWebhookSignature: vi.fn(),
  parseWebhookPayload: vi.fn(),
  getInvoice: vi.fn(),
  getPayout: vi.fn(),
}));

vi.mock("@/lib/server/payments", () => ({
  getPaymentByInvoiceId: vi.fn(),
  getPaymentByPayoutId: vi.fn(),
  updatePaymentStatus: vi.fn(),
}));

vi.mock("@/lib/server/bounty-updater", () => ({
  markBountyFunded: vi.fn().mockResolvedValue(3),
  markBountyPaid: vi.fn().mockResolvedValue(3),
}));

import { POST } from "@/app/api/webhooks/btcpay/route";
import { verifyWebhookSignature, parseWebhookPayload, getInvoice, getPayout } from "@/lib/server/btcpay";
import { getPaymentByInvoiceId, getPaymentByPayoutId, updatePaymentStatus } from "@/lib/server/payments";
import { markBountyFunded, markBountyPaid } from "@/lib/server/bounty-updater";
import { NextRequest } from "next/server";

function makeRequest(body: string, sig = "valid-sig"): NextRequest {
  return new NextRequest("http://localhost:3000/api/webhooks/btcpay", {
    method: "POST",
    body,
    headers: { "btcpay-sig": sig },
  });
}

describe("BTCPay Webhook Handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects invalid signatures", async () => {
    vi.mocked(verifyWebhookSignature).mockResolvedValue(false);

    const res = await POST(makeRequest('{"type":"InvoiceSettled"}'));
    expect(res.status).toBe(401);
  });

  it("rejects unparseable payloads", async () => {
    vi.mocked(verifyWebhookSignature).mockResolvedValue(true);
    vi.mocked(parseWebhookPayload).mockReturnValue(null);

    const res = await POST(makeRequest("garbage"));
    expect(res.status).toBe(400);
  });

  it("handles InvoiceSettled — marks bounty funded", async () => {
    vi.mocked(verifyWebhookSignature).mockResolvedValue(true);
    vi.mocked(parseWebhookPayload).mockReturnValue({
      type: "InvoiceSettled",
      deliveryId: "d1",
      invoiceId: "inv_123",
    });
    vi.mocked(getInvoice).mockResolvedValue({
      id: "inv_123",
      status: "Settled",
      metadata: { bountyId: "bounty_abc" },
    });
    vi.mocked(getPaymentByInvoiceId).mockResolvedValue({
      id: "pay_1",
      bountyId: "bounty_abc",
      invoiceId: "inv_123",
      posterPubkey: "aabbcc",
      status: "pending",
    });

    const res = await POST(makeRequest('{"type":"InvoiceSettled"}'));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.received).toBe(true);

    expect(updatePaymentStatus).toHaveBeenCalledWith("pay_1", "funded");
    expect(markBountyFunded).toHaveBeenCalledWith("bounty_abc", "aabbcc");
  });

  it("handles PayoutApproved — marks bounty paid", async () => {
    vi.mocked(verifyWebhookSignature).mockResolvedValue(true);
    vi.mocked(parseWebhookPayload).mockReturnValue({
      type: "PayoutApproved",
      deliveryId: "d2",
      payoutId: "pout_456",
    });
    vi.mocked(getPayout).mockResolvedValue({
      id: "pout_456",
      metadata: { bountyId: "bounty_abc", winnerPubkey: "winner_hex" },
    });
    vi.mocked(getPaymentByPayoutId).mockResolvedValue({
      id: "pay_1",
      bountyId: "bounty_abc",
      posterPubkey: "aabbcc",
      status: "funded",
    });

    const res = await POST(makeRequest('{"type":"PayoutApproved"}'));
    expect(res.status).toBe(200);

    expect(updatePaymentStatus).toHaveBeenCalledWith("pay_1", "paid", "winner_hex");
    expect(markBountyPaid).toHaveBeenCalledWith("bounty_abc", "aabbcc", "winner_hex");
  });

  it("handles InvoiceExpired — marks payment failed", async () => {
    vi.mocked(verifyWebhookSignature).mockResolvedValue(true);
    vi.mocked(parseWebhookPayload).mockReturnValue({
      type: "InvoiceExpired",
      deliveryId: "d3",
      invoiceId: "inv_789",
    });
    vi.mocked(getPaymentByInvoiceId).mockResolvedValue({
      id: "pay_2",
      status: "pending",
    });

    const res = await POST(makeRequest('{"type":"InvoiceExpired"}'));
    expect(res.status).toBe(200);

    expect(updatePaymentStatus).toHaveBeenCalledWith("pay_2", "failed");
  });

  it("handles unknown event types gracefully", async () => {
    vi.mocked(verifyWebhookSignature).mockResolvedValue(true);
    vi.mocked(parseWebhookPayload).mockReturnValue({
      type: "InvoiceCreated",
      deliveryId: "d4",
    });

    const res = await POST(makeRequest('{"type":"InvoiceCreated"}'));
    expect(res.status).toBe(200);
    // No payment updates for unknown types
    expect(updatePaymentStatus).not.toHaveBeenCalled();
  });

  it("returns 200 even on handler errors (prevents BTCPay retries)", async () => {
    vi.mocked(verifyWebhookSignature).mockResolvedValue(true);
    vi.mocked(parseWebhookPayload).mockReturnValue({
      type: "InvoiceSettled",
      deliveryId: "d5",
      invoiceId: "inv_err",
    });
    vi.mocked(getInvoice).mockRejectedValue(new Error("BTCPay timeout"));

    const res = await POST(makeRequest('{"type":"InvoiceSettled"}'));
    expect(res.status).toBe(200); // Still 200 to prevent retry loops
  });
});

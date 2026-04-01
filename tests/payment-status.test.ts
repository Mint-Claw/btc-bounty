/**
 * Tests for public payment status endpoint and FundedBadge logic.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDB, teardownTestDB } from "./helpers/test-db";
import {
  createPayment,
  updatePaymentStatus,
  resetPaymentStore,
  getPaymentByBountyId,
} from "@/lib/server/payments";

describe("payment status API", () => {
  beforeAll(() => setupTestDB());
  afterAll(() => teardownTestDB());

  beforeEach(() => {
    resetPaymentStore();
  });

  it("tracks payment lifecycle: pending → funded → paid", async () => {
    const payment = await createPayment({
      bountyId: "test-bounty-1",
      bountyEventId: "evt1",
      posterPubkey: "npub1abc",
      amountSats: 50000,
      btcpayInvoiceId: "inv_123",
    });

    expect(payment.status).toBe("pending");
    expect(payment.fundedAt).toBeNull();
    expect(payment.settledAt).toBeNull();

    // Fund it (invoice settled)
    const funded = await updatePaymentStatus(payment.id, "funded");
    expect(funded?.status).toBe("funded");
    expect(funded?.fundedAt).toBeTruthy();

    // Pay the winner
    const paid = await updatePaymentStatus(payment.id, "paid", "npub1winner");
    expect(paid?.status).toBe("paid");
    expect(paid?.settledAt).toBeTruthy();
    expect(paid?.winnerPubkey).toBe("npub1winner");
  });

  it("calculates platform fee correctly (5%)", async () => {
    const payment = await createPayment({
      bountyId: "test-bounty-2",
      bountyEventId: "evt2",
      posterPubkey: "npub1abc",
      amountSats: 100000,
      btcpayInvoiceId: "inv_456",
    });

    expect(payment.platformFeeSats).toBe(5000); // 5% of 100000
  });

  it("looks up payment by bountyId", async () => {
    await createPayment({
      bountyId: "unique-bounty-id",
      bountyEventId: "evt3",
      posterPubkey: "npub1abc",
      amountSats: 25000,
      btcpayInvoiceId: "inv_789",
    });

    const found = await getPaymentByBountyId("unique-bounty-id");
    expect(found).toBeTruthy();
    expect(found?.amountSats).toBe(25000);

    const notFound = await getPaymentByBountyId("nonexistent");
    expect(notFound).toBeNull();
  });

  it("handles funded status for UI badge logic", async () => {
    const payment = await createPayment({
      bountyId: "badge-test",
      bountyEventId: "evt4",
      posterPubkey: "npub1abc",
      amountSats: 10000,
      btcpayInvoiceId: "inv_badge",
    });

    // Pending — badge should NOT show
    let p = await getPaymentByBountyId("badge-test");
    expect(p?.status === "funded" || p?.status === "paid").toBe(false);

    // Funded — badge SHOULD show "⚡ FUNDED"
    await updatePaymentStatus(payment.id, "funded");
    p = await getPaymentByBountyId("badge-test");
    expect(p?.status === "funded" || p?.status === "paid").toBe(true);
    expect(p?.status).toBe("funded");

    // Paid — badge SHOULD show "✅ PAID"
    await updatePaymentStatus(payment.id, "paid");
    p = await getPaymentByBountyId("badge-test");
    expect(p?.status).toBe("paid");
  });

  it("handles failed status", async () => {
    const payment = await createPayment({
      bountyId: "fail-test",
      bountyEventId: "evt5",
      posterPubkey: "npub1abc",
      amountSats: 5000,
      btcpayInvoiceId: "inv_fail",
    });

    await updatePaymentStatus(payment.id, "failed");
    const p = await getPaymentByBountyId("fail-test");
    expect(p?.status).toBe("failed");
    // Failed payment — badge should NOT show
    expect(p?.status === "funded" || p?.status === "paid").toBe(false);
  });
});

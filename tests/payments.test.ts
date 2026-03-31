/**
 * Tests for payment tracking module.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  createPayment,
  getPayment,
  getPaymentByBountyId,
  getPaymentByInvoiceId,
  getPaymentByPayoutId,
  updatePaymentStatus,
  setPayoutInfo,
  listPayments,
  getPaymentStats,
  resetPaymentStore,
} from "@/lib/server/payments";

describe("Payment Store", () => {
  beforeEach(() => {
    resetPaymentStore();
  });

  it("creates a payment with correct fields", async () => {
    const payment = await createPayment({
      bountyId: "test-bounty-1",
      bountyEventId: "event123",
      posterPubkey: "pubkey123",
      amountSats: 100000,
      btcpayInvoiceId: "inv_abc",
    });

    expect(payment.id).toBeTruthy();
    expect(payment.bountyId).toBe("test-bounty-1");
    expect(payment.bountyEventId).toBe("event123");
    expect(payment.posterPubkey).toBe("pubkey123");
    expect(payment.amountSats).toBe(100000);
    expect(payment.platformFeeSats).toBe(5000); // 5%
    expect(payment.btcpayInvoiceId).toBe("inv_abc");
    expect(payment.btcpayPayoutId).toBeNull();
    expect(payment.status).toBe("pending");
    expect(payment.winnerPubkey).toBeNull();
    expect(payment.createdAt).toBeTruthy();
    expect(payment.fundedAt).toBeNull();
    expect(payment.settledAt).toBeNull();
  });

  it("retrieves payment by ID", async () => {
    const created = await createPayment({
      bountyId: "b1",
      bountyEventId: "e1",
      posterPubkey: "p1",
      amountSats: 50000,
      btcpayInvoiceId: "inv1",
    });

    const found = await getPayment(created.id);
    expect(found).not.toBeNull();
    expect(found!.bountyId).toBe("b1");
  });

  it("returns null for missing payment", async () => {
    const found = await getPayment("nonexistent");
    expect(found).toBeNull();
  });

  it("retrieves by bountyId", async () => {
    await createPayment({
      bountyId: "unique-bounty",
      bountyEventId: "e1",
      posterPubkey: "p1",
      amountSats: 50000,
      btcpayInvoiceId: "inv1",
    });

    const found = await getPaymentByBountyId("unique-bounty");
    expect(found).not.toBeNull();
    expect(found!.amountSats).toBe(50000);
  });

  it("retrieves by invoice ID", async () => {
    await createPayment({
      bountyId: "b1",
      bountyEventId: "e1",
      posterPubkey: "p1",
      amountSats: 10000,
      btcpayInvoiceId: "inv_special",
    });

    const found = await getPaymentByInvoiceId("inv_special");
    expect(found).not.toBeNull();
  });

  it("retrieves by payout ID", async () => {
    const p = await createPayment({
      bountyId: "b1",
      bountyEventId: "e1",
      posterPubkey: "p1",
      amountSats: 10000,
      btcpayInvoiceId: "inv1",
    });

    await setPayoutInfo(p.id, "payout_xyz", "winner1", "winner@ln.addr");
    const found = await getPaymentByPayoutId("payout_xyz");
    expect(found).not.toBeNull();
    expect(found!.winnerLud16).toBe("winner@ln.addr");
  });

  it("updates status to funded", async () => {
    const p = await createPayment({
      bountyId: "b1",
      bountyEventId: "e1",
      posterPubkey: "p1",
      amountSats: 50000,
      btcpayInvoiceId: "inv1",
    });

    const updated = await updatePaymentStatus(p.id, "funded");
    expect(updated!.status).toBe("funded");
    expect(updated!.fundedAt).toBeTruthy();
  });

  it("updates status to paid with winner", async () => {
    const p = await createPayment({
      bountyId: "b1",
      bountyEventId: "e1",
      posterPubkey: "p1",
      amountSats: 50000,
      btcpayInvoiceId: "inv1",
    });

    await updatePaymentStatus(p.id, "funded");
    const updated = await updatePaymentStatus(p.id, "paid", "winner_pub");
    expect(updated!.status).toBe("paid");
    expect(updated!.settledAt).toBeTruthy();
    expect(updated!.winnerPubkey).toBe("winner_pub");
  });

  it("sets payout info", async () => {
    const p = await createPayment({
      bountyId: "b1",
      bountyEventId: "e1",
      posterPubkey: "p1",
      amountSats: 75000,
      btcpayInvoiceId: "inv1",
    });

    const updated = await setPayoutInfo(
      p.id,
      "payout_abc",
      "winner_npub",
      "winner@getalby.com",
    );
    expect(updated!.btcpayPayoutId).toBe("payout_abc");
    expect(updated!.winnerPubkey).toBe("winner_npub");
    expect(updated!.winnerLud16).toBe("winner@getalby.com");
  });

  it("lists all payments", async () => {
    await createPayment({
      bountyId: "b1",
      bountyEventId: "e1",
      posterPubkey: "p1",
      amountSats: 10000,
      btcpayInvoiceId: "inv1",
    });
    await createPayment({
      bountyId: "b2",
      bountyEventId: "e2",
      posterPubkey: "p2",
      amountSats: 20000,
      btcpayInvoiceId: "inv2",
    });

    const all = await listPayments();
    expect(all.length).toBe(2);
  });

  it("filters by status", async () => {
    const p1 = await createPayment({
      bountyId: "b1",
      bountyEventId: "e1",
      posterPubkey: "p1",
      amountSats: 10000,
      btcpayInvoiceId: "inv1",
    });
    await createPayment({
      bountyId: "b2",
      bountyEventId: "e2",
      posterPubkey: "p2",
      amountSats: 20000,
      btcpayInvoiceId: "inv2",
    });

    await updatePaymentStatus(p1.id, "funded");

    const funded = await listPayments("funded");
    expect(funded.length).toBe(1);
    expect(funded[0].bountyId).toBe("b1");

    const pending = await listPayments("pending");
    expect(pending.length).toBe(1);
    expect(pending[0].bountyId).toBe("b2");
  });

  it("computes stats correctly", async () => {
    const p1 = await createPayment({
      bountyId: "b1",
      bountyEventId: "e1",
      posterPubkey: "p1",
      amountSats: 100000,
      btcpayInvoiceId: "inv1",
    });
    const p2 = await createPayment({
      bountyId: "b2",
      bountyEventId: "e2",
      posterPubkey: "p2",
      amountSats: 200000,
      btcpayInvoiceId: "inv2",
    });
    await createPayment({
      bountyId: "b3",
      bountyEventId: "e3",
      posterPubkey: "p3",
      amountSats: 50000,
      btcpayInvoiceId: "inv3",
    });

    await updatePaymentStatus(p1.id, "funded");
    await updatePaymentStatus(p1.id, "paid");
    await updatePaymentStatus(p2.id, "funded");
    await updatePaymentStatus(p2.id, "paid");

    const stats = await getPaymentStats();
    expect(stats.total).toBe(3);
    expect(stats.paid).toBe(2);
    expect(stats.pending).toBe(1);
    expect(stats.totalVolumeSats).toBe(300000);
    expect(stats.totalFeesSats).toBe(15000); // 5% of 300k
  });

  it("platform fee is 5%", async () => {
    const amounts = [10000, 100000, 1000000, 50000];
    for (const amt of amounts) {
      resetPaymentStore();
      const p = await createPayment({
        bountyId: `b-${amt}`,
        bountyEventId: "e1",
        posterPubkey: "p1",
        amountSats: amt,
        btcpayInvoiceId: "inv1",
      });
      expect(p.platformFeeSats).toBe(Math.floor(amt * 0.05));
    }
  });
});

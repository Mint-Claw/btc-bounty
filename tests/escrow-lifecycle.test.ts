/**
 * Integration tests for the full BTCPay escrow lifecycle:
 *   Create bounty with escrow → Invoice settled → Award winner → Payout
 *
 * All external calls (relays, BTCPay) are mocked.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDB, teardownTestDB } from "./helpers/test-db";
import {
  createPayment,
  getPaymentByBountyId,
  updatePaymentStatus,
  setPayoutInfo,
  listPayments,
  getPaymentStats,
  resetPaymentStore,
  type BountyPayment,
} from "@/lib/server/payments";

describe("Escrow Lifecycle", () => {
  beforeAll(() => setupTestDB());
  afterAll(() => teardownTestDB());

  beforeEach(() => {
    resetPaymentStore();
  });

  it("full lifecycle: create → fund → award → payout", async () => {
    // Step 1: Bounty created with escrow — invoice created
    const payment = await createPayment({
      bountyId: "lifecycle-bounty-1",
      bountyEventId: "evt_lifecycle_1",
      posterPubkey: "npub1poster",
      amountSats: 50000,
      btcpayInvoiceId: "inv_lc_001",
    });

    expect(payment.status).toBe("pending");
    expect(payment.amountSats).toBe(50000);
    expect(payment.platformFeeSats).toBe(2500); // 5% of 50000

    // Step 2: BTCPay webhook fires — invoice settled
    const funded = await updatePaymentStatus(payment.id, "funded");
    expect(funded!.status).toBe("funded");
    expect(funded!.fundedAt).toBeTruthy();

    // Step 3: Poster awards the bounty — payout info set
    await setPayoutInfo(
      payment.id,
      "payout_lc_001",
      "npub1winner",
      "winner@getalby.com",
    );

    const withPayout = await getPaymentByBountyId("lifecycle-bounty-1");
    expect(withPayout!.btcpayPayoutId).toBe("payout_lc_001");
    expect(withPayout!.winnerPubkey).toBe("npub1winner");
    expect(withPayout!.winnerLud16).toBe("winner@getalby.com");

    // Step 4: BTCPay webhook fires — payout approved
    const paid = await updatePaymentStatus(payment.id, "paid", "npub1winner");
    expect(paid!.status).toBe("paid");
    expect(paid!.settledAt).toBeTruthy();
    expect(paid!.winnerPubkey).toBe("npub1winner");
  });

  it("handles invoice expiry gracefully", async () => {
    const payment = await createPayment({
      bountyId: "expire-bounty",
      bountyEventId: "evt_expire",
      posterPubkey: "npub1poster",
      amountSats: 25000,
      btcpayInvoiceId: "inv_expire_001",
    });

    // Invoice expires — BTCPay sends InvoiceExpired
    await updatePaymentStatus(payment.id, "failed");

    const failed = await getPaymentByBountyId("expire-bounty");
    expect(failed!.status).toBe("failed");
    expect(failed!.fundedAt).toBeNull(); // Never funded
    expect(failed!.settledAt).toBeNull();
  });

  it("calculates correct payout after 5% fee", async () => {
    const testCases = [
      { amount: 100000, expectedFee: 5000, expectedPayout: 95000 },
      { amount: 10000, expectedFee: 500, expectedPayout: 9500 },
      { amount: 1000, expectedFee: 50, expectedPayout: 950 },
      { amount: 1, expectedFee: 0, expectedPayout: 1 }, // Floor(0.05) = 0
      { amount: 999999, expectedFee: 49999, expectedPayout: 950000 },
    ];

    for (const tc of testCases) {
      resetPaymentStore();
      const p = await createPayment({
        bountyId: `fee-test-${tc.amount}`,
        bountyEventId: "evt",
        posterPubkey: "poster",
        amountSats: tc.amount,
        btcpayInvoiceId: "inv",
      });

      expect(p.platformFeeSats).toBe(tc.expectedFee);
      expect(p.amountSats - p.platformFeeSats).toBe(tc.expectedPayout);
    }
  });

  it("tracks multiple bounties independently", async () => {
    const p1 = await createPayment({
      bountyId: "multi-1",
      bountyEventId: "evt1",
      posterPubkey: "poster-a",
      amountSats: 30000,
      btcpayInvoiceId: "inv_m1",
    });

    const p2 = await createPayment({
      bountyId: "multi-2",
      bountyEventId: "evt2",
      posterPubkey: "poster-b",
      amountSats: 70000,
      btcpayInvoiceId: "inv_m2",
    });

    const p3 = await createPayment({
      bountyId: "multi-3",
      bountyEventId: "evt3",
      posterPubkey: "poster-a",
      amountSats: 50000,
      btcpayInvoiceId: "inv_m3",
    });

    // Fund p1 and p2, leave p3 pending
    await updatePaymentStatus(p1.id, "funded");
    await updatePaymentStatus(p2.id, "funded");

    // Pay p1 only
    await updatePaymentStatus(p1.id, "paid", "winner-1");

    const all = await listPayments();
    expect(all).toHaveLength(3);

    const funded = await listPayments("funded");
    expect(funded).toHaveLength(1);
    expect(funded[0].bountyId).toBe("multi-2");

    const paid = await listPayments("paid");
    expect(paid).toHaveLength(1);
    expect(paid[0].bountyId).toBe("multi-1");

    const pending = await listPayments("pending");
    expect(pending).toHaveLength(1);
    expect(pending[0].bountyId).toBe("multi-3");
  });

  it("stats aggregate correctly across all states", async () => {
    // Create 5 bounties in different states
    const amounts = [10000, 20000, 30000, 40000, 50000];
    const payments: BountyPayment[] = [];

    for (let i = 0; i < 5; i++) {
      const p = await createPayment({
        bountyId: `stats-${i}`,
        bountyEventId: `evt${i}`,
        posterPubkey: `poster${i}`,
        amountSats: amounts[i],
        btcpayInvoiceId: `inv_s${i}`,
      });
      payments.push(p);
    }

    // 2 paid, 1 funded, 1 failed, 1 pending
    await updatePaymentStatus(payments[0].id, "funded");
    await updatePaymentStatus(payments[0].id, "paid");
    await updatePaymentStatus(payments[1].id, "funded");
    await updatePaymentStatus(payments[1].id, "paid");
    await updatePaymentStatus(payments[2].id, "funded");
    await updatePaymentStatus(payments[3].id, "failed");
    // payments[4] stays pending

    const stats = await getPaymentStats();
    expect(stats.total).toBe(5);
    expect(stats.paid).toBe(2);
    expect(stats.funded).toBe(1);
    expect(stats.failed).toBe(1);
    expect(stats.pending).toBe(1);
    // Volume = sum of paid bounties (10k + 20k)
    expect(stats.totalVolumeSats).toBe(30000);
    // Fees = 5% of paid (500 + 1000)
    expect(stats.totalFeesSats).toBe(1500);
  });

  it("setPayoutInfo does not change status", async () => {
    const p = await createPayment({
      bountyId: "no-status-change",
      bountyEventId: "evt",
      posterPubkey: "poster",
      amountSats: 20000,
      btcpayInvoiceId: "inv",
    });

    await updatePaymentStatus(p.id, "funded");
    const updated = await setPayoutInfo(
      p.id,
      "payout_123",
      "winner",
      "winner@ln.addr",
    );

    // Status should still be funded, not auto-changed to paid
    expect(updated!.status).toBe("funded");
    expect(updated!.btcpayPayoutId).toBe("payout_123");
  });

  it("handles double-funding gracefully (idempotent)", async () => {
    const p = await createPayment({
      bountyId: "double-fund",
      bountyEventId: "evt",
      posterPubkey: "poster",
      amountSats: 10000,
      btcpayInvoiceId: "inv",
    });

    const first = await updatePaymentStatus(p.id, "funded");
    const second = await updatePaymentStatus(p.id, "funded");

    expect(first!.status).toBe("funded");
    expect(second!.status).toBe("funded");
    // Both should work without error
    expect(first!.fundedAt).toBeTruthy();
    expect(second!.fundedAt).toBeTruthy();
  });

  it("returns null when updating nonexistent payment", async () => {
    const result = await updatePaymentStatus("fake-id", "funded");
    expect(result).toBeNull();
  });

  it("returns null when setting payout on nonexistent payment", async () => {
    const result = await setPayoutInfo("fake-id", "po_1", "w", "w@ln");
    expect(result).toBeNull();
  });
});

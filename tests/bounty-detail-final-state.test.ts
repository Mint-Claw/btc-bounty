import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { setupTestDB, teardownTestDB } from "./helpers/test-db";
import {
  cacheBountyEvent,
  insertApplication,
  updateApplicationStatus,
  insertSubmission,
  updateSubmissionStatus,
  getDB,
} from "@/lib/server/db";
import {
  createPayment,
  updatePaymentStatus,
  setPayoutInfo,
  resetPaymentStore,
} from "@/lib/server/payments";
import { GET } from "@/app/api/bounties/[id]/route";

describe("GET /api/bounties/:id final lifecycle visibility", () => {
  beforeEach(() => {
    setupTestDB();
    const db = getDB();
    db.exec("DELETE FROM bounty_events; DELETE FROM bounty_applications; DELETE FROM bounty_submissions;");
    resetPaymentStore();
  });

  afterAll(() => {
    teardownTestDB();
  });

  it("exposes winner, accepted submission, payment state, and fee ledger summary without sensitive provider IDs", async () => {
    cacheBountyEvent({
      id: "event-final-state-1",
      dTag: "final-state-bounty",
      pubkey: "poster-pubkey",
      kind: 30402,
      title: "Final state visibility bounty",
      summary: "Show accepted work and payout state",
      content: "A complete bounty should show who won, what was accepted, and fee accounting.",
      rewardSats: 100000,
      status: "COMPLETED",
      category: "code",
      tags: [["d", "final-state-bounty"]],
      createdAt: 1700000000,
    });

    insertApplication({
      id: "app-winner",
      bountyDTag: "final-state-bounty",
      bountyEventId: "event-final-state-1",
      applicantPubkey: "winner-pubkey",
      pitch: "I will solve it",
      lightning: "winner@example.com",
    });
    updateApplicationStatus("app-winner", "accepted");

    insertSubmission({
      id: "sub-winner",
      bountyDTag: "final-state-bounty",
      bountyEventId: "event-final-state-1",
      submitterPubkey: "winner-pubkey",
      proofUrl: "https://example.com/proof",
      description: "Implemented and verified the fix.",
      nostrEventId: "submission-event-1",
    });
    updateSubmissionStatus("sub-winner", "accepted");

    insertSubmission({
      id: "sub-rejected",
      bountyDTag: "final-state-bounty",
      bountyEventId: "event-final-state-1",
      submitterPubkey: "other-pubkey",
      proofUrl: "https://example.com/other",
      description: "Alternate solution.",
    });
    updateSubmissionStatus("sub-rejected", "rejected");

    const payment = await createPayment({
      bountyId: "final-state-bounty",
      bountyEventId: "event-final-state-1",
      posterPubkey: "poster-pubkey",
      amountSats: 100000,
      btcpayInvoiceId: "sensitive-invoice-id",
    });
    await updatePaymentStatus(payment.id, "funded");
    await setPayoutInfo(payment.id, "sensitive-payout-id", "winner-pubkey", "winner@example.com");
    await updatePaymentStatus(payment.id, "paid", "winner-pubkey");

    const response = await GET(new Request("http://localhost/api/bounties/final-state-bounty"), {
      params: Promise.resolve({ id: "final-state-bounty" }),
    });
    const detail = await response.json();

    expect(response.status).toBe(200);
    expect(detail.status).toBe("COMPLETED");
    expect(detail.final_state).toMatchObject({
      winner_pubkey: "winner-pubkey",
      accepted_submission_id: "sub-winner",
      accepted_proof_url: "https://example.com/proof",
      payment_status: "paid",
      funded: true,
      paid: true,
      gross_sats: 100000,
      platform_fee_sats: 5000,
      payout_sats: 95000,
      ledger_entry_count: 4,
    });
    expect(detail.submissions).toHaveLength(2);
    expect(detail.submissions.find((s: any) => s.id === "sub-winner")).toMatchObject({
      submitter_pubkey: "winner-pubkey",
      status: "accepted",
      proof_url: "https://example.com/proof",
    });
    expect(detail.applications.find((a: any) => a.id === "app-winner")).toMatchObject({
      applicant_pubkey: "winner-pubkey",
      status: "accepted",
    });

    const serialized = JSON.stringify(detail);
    expect(serialized).not.toContain("sensitive-invoice-id");
    expect(serialized).not.toContain("sensitive-payout-id");
  });

  it("keeps final_state empty before award/finalization while still exposing sanitized payment summary", async () => {
    cacheBountyEvent({
      id: "event-open-state-1",
      dTag: "open-funded-bounty",
      pubkey: "poster-pubkey",
      kind: 30402,
      title: "Open funded bounty",
      summary: "Not awarded yet",
      content: "This bounty is funded but not final.",
      rewardSats: 100000,
      status: "OPEN",
      category: "code",
      createdAt: 1700000000,
    });

    const payment = await createPayment({
      bountyId: "open-funded-bounty",
      bountyEventId: "event-open-state-1",
      posterPubkey: "poster-pubkey",
      amountSats: 100000,
      btcpayInvoiceId: "sensitive-open-invoice-id",
    });
    await updatePaymentStatus(payment.id, "funded");

    const response = await GET(new Request("http://localhost/api/bounties/open-funded-bounty"), {
      params: Promise.resolve({ id: "open-funded-bounty" }),
    });
    const detail = await response.json();

    expect(response.status).toBe(200);
    expect(detail.status).toBe("OPEN");
    expect(detail.payment).toMatchObject({
      status: "funded",
      funded: true,
      paid: false,
      gross_sats: 100000,
      platform_fee_sats: 5000,
      payout_sats: 95000,
    });
    expect(detail.final_state).toBeNull();

    const serialized = JSON.stringify(detail);
    expect(serialized).not.toContain("sensitive-open-invoice-id");
    expect(serialized).not.toContain("btcpay_invoice");
    expect(serialized).not.toContain("btcpay_payout");
    expect(serialized).not.toContain("winner@example.com");
  });

});

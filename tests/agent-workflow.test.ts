/**
 * Agent Workflow Integration Tests
 *
 * Tests the complete agent lifecycle:
 *   Register → Post bounty → Apply → Award → Payment lifecycle
 *
 * All external calls (relays, BTCPay) are mocked. SQLite is real (in-memory).
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDB, teardownTestDB } from "./helpers/test-db";
import {
  createPayment,
  getPaymentByBountyId,
  updatePaymentStatus,
  setPayoutInfo,
  getPaymentStats,
  resetPaymentStore,
} from "@/lib/server/payments";
import {
  getDB,
  insertApiKey,
  getApiKeyByHash,
  cacheBountyEvent,
  getCachedBounty,
  updateBountyStatus,
  getBountyStats,
  insertTokuListing,
  getTokuListingByDTag,
  cancelTokuListing,
} from "@/lib/server/db";

// Simple hash for testing (real auth uses SHA-256)
function testHash(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) - hash + key.charCodeAt(i)) | 0;
  }
  return `testhash_${Math.abs(hash)}`;
}

describe("Agent Workflow Integration", () => {
  beforeAll(() => setupTestDB());
  afterAll(() => teardownTestDB());

  beforeEach(() => {
    resetPaymentStore();
    // Clear bounty events and toku listings
    const db = getDB();
    db.prepare("DELETE FROM bounty_events").run();
    db.prepare("DELETE FROM toku_listings").run();
    db.prepare("DELETE FROM api_keys").run();
  });

  describe("Agent Registration", () => {
    it("stores API key and retrieves by hash", () => {
      const keyHash = testHash("agent-key-001");
      insertApiKey({
        id: "agent-001",
        agentNpub: "npub1posterabc",
        apiKeyHash: keyHash,
        managedNsecEncrypted: "encrypted_nsec_data",
      });

      const found = getApiKeyByHash(keyHash);
      expect(found).toBeDefined();
      expect(found!.agent_npub).toBe("npub1posterabc");
      expect(found!.managed_nsec_encrypted).toBe("encrypted_nsec_data");
    });

    it("returns undefined for unknown key hash", () => {
      const found = getApiKeyByHash("nonexistent_hash");
      expect(found).toBeUndefined();
    });

    it("stores multiple agents independently", () => {
      const hash1 = testHash("key-1");
      const hash2 = testHash("key-2");

      insertApiKey({ id: "a1", agentNpub: "npub1first", apiKeyHash: hash1 });
      insertApiKey({ id: "a2", agentNpub: "npub1second", apiKeyHash: hash2 });

      expect(getApiKeyByHash(hash1)!.agent_npub).toBe("npub1first");
      expect(getApiKeyByHash(hash2)!.agent_npub).toBe("npub1second");
    });
  });

  describe("Post Bounty → Cache", () => {
    it("caches a bounty event and retrieves it", () => {
      cacheBountyEvent({
        id: "event_abc123",
        dTag: "build-lightning-widget",
        pubkey: "poster_pubkey_hex",
        kind: 30402,
        title: "Build a Lightning Widget",
        summary: "Need a LN payment widget for my site",
        content: "Full spec here...",
        rewardSats: 50000,
        status: "OPEN",
        category: "code",
        lightning: "poster@getalby.com",
        createdAt: Math.floor(Date.now() / 1000),
      });

      const bounty = getCachedBounty("build-lightning-widget");
      expect(bounty).toBeDefined();
      expect(bounty!.title).toBe("Build a Lightning Widget");
      expect(bounty!.reward_sats).toBe(50000);
      expect(bounty!.status).toBe("OPEN");
    });

    it("updates bounty status to COMPLETED with winner", () => {
      cacheBountyEvent({
        id: "event_xyz",
        dTag: "test-bounty",
        pubkey: "poster_hex",
        kind: 30402,
        title: "Test Bounty",
        rewardSats: 25000,
        createdAt: Math.floor(Date.now() / 1000),
      });

      const updated = updateBountyStatus("test-bounty", "COMPLETED", "winner_pubkey_hex");
      expect(updated).toBe(true);

      const bounty = getCachedBounty("test-bounty");
      expect(bounty!.status).toBe("COMPLETED");
      expect(bounty!.winner_pubkey).toBe("winner_pubkey_hex");
    });

    it("getBountyStats returns correct counts", () => {
      // Create 3 bounties in different states
      cacheBountyEvent({
        id: "e1", dTag: "b1", pubkey: "p1", kind: 30402,
        title: "Open Bounty", rewardSats: 10000, status: "OPEN",
        createdAt: Math.floor(Date.now() / 1000),
      });
      cacheBountyEvent({
        id: "e2", dTag: "b2", pubkey: "p1", kind: 30402,
        title: "In Progress", rewardSats: 20000, status: "IN_PROGRESS",
        createdAt: Math.floor(Date.now() / 1000),
      });
      cacheBountyEvent({
        id: "e3", dTag: "b3", pubkey: "p2", kind: 30402,
        title: "Completed", rewardSats: 30000, status: "COMPLETED",
        createdAt: Math.floor(Date.now() / 1000),
      });

      const stats = getBountyStats();
      expect(stats.total).toBe(3);
      expect(stats.open).toBe(1);
      expect(stats.in_progress).toBe(1);
      expect(stats.completed).toBe(1);
      expect(stats.total_sats).toBe(60000);
    });
  });

  describe("Escrow + Award Flow", () => {
    it("full lifecycle: post → fund → award → payout", async () => {
      // 1. Cache the bounty
      cacheBountyEvent({
        id: "event_lifecycle",
        dTag: "lifecycle-bounty",
        pubkey: "poster_hex",
        kind: 30402,
        title: "Full Lifecycle Bounty",
        rewardSats: 100000,
        status: "OPEN",
        createdAt: Math.floor(Date.now() / 1000),
      });

      // 2. Create escrow payment
      const payment = await createPayment({
        bountyId: "lifecycle-bounty",
        bountyEventId: "event_lifecycle",
        posterPubkey: "poster_hex",
        amountSats: 100000,
        btcpayInvoiceId: "inv_lifecycle_001",
      });

      expect(payment.status).toBe("pending");
      expect(payment.platformFeeSats).toBe(5000); // 5%

      // 3. Invoice settled (BTCPay webhook)
      await updatePaymentStatus(payment.id, "funded");
      const funded = await getPaymentByBountyId("lifecycle-bounty");
      expect(funded!.status).toBe("funded");
      expect(funded!.fundedAt).toBeTruthy();

      // 4. Award winner + set payout
      await setPayoutInfo(payment.id, "payout_001", "winner_hex", "winner@getalby.com");
      updateBountyStatus("lifecycle-bounty", "COMPLETED", "winner_hex");

      // 5. Payout confirmed
      await updatePaymentStatus(payment.id, "paid", "winner_hex");

      // Verify final state
      const finalPayment = await getPaymentByBountyId("lifecycle-bounty");
      expect(finalPayment!.status).toBe("paid");
      expect(finalPayment!.settledAt).toBeTruthy();
      expect(finalPayment!.winnerPubkey).toBe("winner_hex");
      expect(finalPayment!.winnerLud16).toBe("winner@getalby.com");

      const bounty = getCachedBounty("lifecycle-bounty");
      expect(bounty!.status).toBe("COMPLETED");
      expect(bounty!.winner_pubkey).toBe("winner_hex");
    });

    it("payment stats reflect full workflow", async () => {
      // Create 3 bounties at different stages
      for (let i = 1; i <= 3; i++) {
        cacheBountyEvent({
          id: `e${i}`, dTag: `stats-b${i}`, pubkey: "poster",
          kind: 30402, title: `Bounty ${i}`, rewardSats: i * 10000,
          createdAt: Math.floor(Date.now() / 1000),
        });
        await createPayment({
          bountyId: `stats-b${i}`,
          bountyEventId: `e${i}`,
          posterPubkey: "poster",
          amountSats: i * 10000,
          btcpayInvoiceId: `inv_s${i}`,
        });
      }

      const payments = [
        await getPaymentByBountyId("stats-b1"),
        await getPaymentByBountyId("stats-b2"),
        await getPaymentByBountyId("stats-b3"),
      ];

      // Fund all, pay first two
      for (const p of payments) {
        await updatePaymentStatus(p!.id, "funded");
      }
      await updatePaymentStatus(payments[0]!.id, "paid");
      await updatePaymentStatus(payments[1]!.id, "paid");

      const stats = await getPaymentStats();
      expect(stats.total).toBe(3);
      expect(stats.paid).toBe(2);
      expect(stats.funded).toBe(1);
      expect(stats.totalVolumeSats).toBe(30000); // 10k + 20k
      expect(stats.totalFeesSats).toBe(1500); // 5% of 30k

      const bountyStats = getBountyStats();
      expect(bountyStats.total).toBe(3);
      expect(bountyStats.total_sats).toBe(60000);
    });
  });

  describe("toku.agency Bridge", () => {
    it("creates and cancels a toku listing", () => {
      cacheBountyEvent({
        id: "toku_event", dTag: "toku-bounty", pubkey: "poster",
        kind: 30402, title: "Toku Bridge Test", rewardSats: 50000,
        createdAt: Math.floor(Date.now() / 1000),
      });

      insertTokuListing({
        bountyDTag: "toku-bounty",
        bountyEventId: "toku_event",
        tokuJobId: "toku_job_abc",
        amountSats: 50000,
        budgetCents: 2500,
      });

      const listing = getTokuListingByDTag("toku-bounty");
      expect(listing).toBeDefined();
      expect(listing!.toku_job_id).toBe("toku_job_abc");
      expect(listing!.status).toBe("active");

      // Cancel when bounty awarded
      const cancelled = cancelTokuListing("toku-bounty");
      expect(cancelled).toBe(true);

      // Should no longer appear as active
      const gone = getTokuListingByDTag("toku-bounty");
      expect(gone).toBeUndefined();
    });
  });

  describe("Cross-System Consistency", () => {
    it("bounty cache and payments stay in sync", async () => {
      const dTag = "sync-test";
      cacheBountyEvent({
        id: "sync_event", dTag, pubkey: "poster",
        kind: 30402, title: "Sync Test", rewardSats: 75000,
        status: "OPEN", createdAt: Math.floor(Date.now() / 1000),
      });

      const payment = await createPayment({
        bountyId: dTag,
        bountyEventId: "sync_event",
        posterPubkey: "poster",
        amountSats: 75000,
        btcpayInvoiceId: "inv_sync",
      });

      // Before funding: bounty OPEN, payment pending
      expect(getCachedBounty(dTag)!.status).toBe("OPEN");
      expect((await getPaymentByBountyId(dTag))!.status).toBe("pending");

      // After funding: payment funded, bounty still OPEN (waiting for work)
      await updatePaymentStatus(payment.id, "funded");
      expect(getCachedBounty(dTag)!.status).toBe("OPEN");
      expect((await getPaymentByBountyId(dTag))!.status).toBe("funded");

      // After award: both complete
      updateBountyStatus(dTag, "COMPLETED", "winner");
      await updatePaymentStatus(payment.id, "paid", "winner");
      expect(getCachedBounty(dTag)!.status).toBe("COMPLETED");
      expect((await getPaymentByBountyId(dTag))!.status).toBe("paid");
    });

    it("multiple bounties from same poster tracked independently", async () => {
      for (let i = 1; i <= 3; i++) {
        cacheBountyEvent({
          id: `multi_e${i}`, dTag: `multi-${i}`, pubkey: "same_poster",
          kind: 30402, title: `Multi ${i}`, rewardSats: i * 25000,
          createdAt: Math.floor(Date.now() / 1000),
        });
        await createPayment({
          bountyId: `multi-${i}`,
          bountyEventId: `multi_e${i}`,
          posterPubkey: "same_poster",
          amountSats: i * 25000,
          btcpayInvoiceId: `inv_multi_${i}`,
        });
      }

      // Fund only first two
      const p1 = await getPaymentByBountyId("multi-1");
      const p2 = await getPaymentByBountyId("multi-2");
      await updatePaymentStatus(p1!.id, "funded");
      await updatePaymentStatus(p2!.id, "funded");

      // Pay only first
      await updatePaymentStatus(p1!.id, "paid");

      // Each has independent state
      expect((await getPaymentByBountyId("multi-1"))!.status).toBe("paid");
      expect((await getPaymentByBountyId("multi-2"))!.status).toBe("funded");
      expect((await getPaymentByBountyId("multi-3"))!.status).toBe("pending");
    });
  });
});

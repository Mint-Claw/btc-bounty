import { describe, it, expect, beforeEach } from "vitest";
import {
  TokuClient,
  satsToCents,
  centsToSats,
  buildTokuJobInput,
  shouldListOnToku,
  trackListing,
  getListing,
  getListingByTokuJobId,
  getAllListings,
  removeListing,
  type TokuListing,
} from "../src/lib/server/toku";
import {
  TokuSyncService,
  type TokuApplicant,
} from "../src/lib/server/toku-sync";

// ─── Unit: satsToCents / centsToSats ─────────────────────────

describe("satsToCents", () => {
  it("converts sats to USD cents at $100k rate", () => {
    // 100,000 sats at $100k/BTC = $100 = 10000 cents
    expect(satsToCents(100_000, 100_000)).toBe(10000);
  });

  it("converts 10,000 sats to ~$10", () => {
    expect(satsToCents(10_000, 100_000)).toBe(1000);
  });

  it("converts 1 sat correctly", () => {
    expect(satsToCents(1, 100_000)).toBe(0); // rounds to 0 cents
  });

  it("handles large amounts", () => {
    // 1 BTC at $100k
    expect(satsToCents(100_000_000, 100_000)).toBe(10_000_000);
  });
});

describe("centsToSats", () => {
  it("converts USD cents to sats at $100k rate", () => {
    expect(centsToSats(10000, 100_000)).toBe(100_000);
  });

  it("round-trips with satsToCents", () => {
    const sats = 50_000;
    const cents = satsToCents(sats, 100_000);
    const backToSats = centsToSats(cents, 100_000);
    expect(backToSats).toBe(sats);
  });
});

// ─── Unit: shouldListOnToku ──────────────────────────────────

describe("shouldListOnToku", () => {
  it("returns true for bounties >= 10,000 sats", () => {
    expect(shouldListOnToku(10_000)).toBe(true);
    expect(shouldListOnToku(100_000)).toBe(true);
  });

  it("returns false for bounties < 10,000 sats", () => {
    expect(shouldListOnToku(9_999)).toBe(false);
    expect(shouldListOnToku(0)).toBe(false);
  });
});

// ─── Unit: buildTokuJobInput ─────────────────────────────────

describe("buildTokuJobInput", () => {
  it("builds a formatted job description", () => {
    const result = buildTokuJobInput({
      title: "Build a CLI tool",
      content: "Need a Node.js CLI that does XYZ.",
      rewardSats: 50_000,
      category: "code",
      tags: ["nodejs", "cli"],
      dTag: "bounty-123",
    });

    expect(result).toContain("# Build a CLI tool");
    expect(result).toContain("Need a Node.js CLI that does XYZ.");
    expect(result).toContain("50,000 sats");
    expect(result).toContain("$50.00 USD");
    expect(result).toContain("nodejs, cli");
    expect(result).toContain("bounty-123");
    expect(result).toContain("Cross-listed from BTC Bounty");
  });

  it("omits tags line when no tags", () => {
    const result = buildTokuJobInput({
      title: "Test",
      content: "Test content",
      rewardSats: 10_000,
      category: "other",
      tags: [],
      dTag: "test-1",
    });

    expect(result).not.toContain("**Tags:**");
  });
});

// ─── Unit: Listing Store ─────────────────────────────────────

describe("Listing Store", () => {
  const listing: TokuListing = {
    bountyDTag: "bounty-abc",
    bountyEventId: "evt-123",
    tokuJobId: "toku-job-456",
    amountSats: 50_000,
    budgetCents: 5000,
    syncedAt: "2026-03-16T00:00:00Z",
  };

  beforeEach(() => {
    // Clear all listings
    for (const l of getAllListings()) {
      removeListing(l.bountyDTag);
    }
  });

  it("tracks and retrieves listings by dTag", () => {
    trackListing(listing);
    expect(getListing("bounty-abc")).toEqual(listing);
  });

  it("retrieves listings by toku job ID", () => {
    trackListing(listing);
    expect(getListingByTokuJobId("toku-job-456")).toEqual(listing);
  });

  it("returns undefined for unknown dTag", () => {
    expect(getListing("nonexistent")).toBeUndefined();
  });

  it("returns undefined for unknown toku job ID", () => {
    expect(getListingByTokuJobId("nonexistent")).toBeUndefined();
  });

  it("removes listings", () => {
    trackListing(listing);
    expect(removeListing("bounty-abc")).toBe(true);
    expect(getListing("bounty-abc")).toBeUndefined();
  });

  it("returns false when removing nonexistent listing", () => {
    expect(removeListing("nonexistent")).toBe(false);
  });

  it("lists all active listings", () => {
    trackListing(listing);
    trackListing({ ...listing, bountyDTag: "bounty-def", tokuJobId: "toku-789" });
    expect(getAllListings()).toHaveLength(2);
  });
});

// ─── Integration: TokuSyncService ────────────────────────────

describe("TokuSyncService", () => {
  it("skips bounties below threshold in syncOpenBounties", async () => {
    const service = new TokuSyncService({ serviceId: "test-svc" });

    const result = await service.syncOpenBounties([
      {
        id: "evt-1",
        pubkey: "pk-1",
        dTag: "low-bounty",
        title: "Small task",
        summary: "",
        content: "Do something small",
        rewardSats: 1000, // below 10k threshold
        status: "OPEN",
        category: "code",
        lightning: "test@ln.addr",
        createdAt: Date.now() / 1000,
        tags: [],
      },
    ]);

    expect(result.skipped).toBe(1);
    expect(result.listed).toBe(0);
  });

  it("skips non-OPEN bounties", async () => {
    const service = new TokuSyncService({ serviceId: "test-svc" });

    const result = await service.syncOpenBounties([
      {
        id: "evt-2",
        pubkey: "pk-2",
        dTag: "completed-bounty",
        title: "Done task",
        summary: "",
        content: "Already done",
        rewardSats: 100_000,
        status: "COMPLETED",
        category: "code",
        lightning: "test@ln.addr",
        createdAt: Date.now() / 1000,
        tags: [],
      },
    ]);

    expect(result.skipped).toBe(1);
    expect(result.listed).toBe(0);
  });

  it("reports stats", () => {
    const service = new TokuSyncService();
    const stats = service.getStats();
    expect(stats).toHaveProperty("totalListings");
    expect(stats).toHaveProperty("listings");
    expect(Array.isArray(stats.listings)).toBe(true);
  });
});

// ─── Integration: Webhook Processing ─────────────────────────

describe("TokuSyncService webhook processing", () => {
  beforeEach(() => {
    // Clear listings
    for (const l of getAllListings()) {
      removeListing(l.bountyDTag);
    }
  });

  it("processes bid.received and calls onApplication", async () => {
    let receivedDTag = "";
    let receivedApplicant: TokuApplicant | null = null;

    const service = new TokuSyncService({
      onApplication: async (dTag, applicant) => {
        receivedDTag = dTag;
        receivedApplicant = applicant;
      },
    });

    // Simulate existing listing
    trackListing({
      bountyDTag: "test-bounty",
      bountyEventId: "evt-test",
      tokuJobId: "toku-job-test",
      amountSats: 50_000,
      budgetCents: 5000,
      syncedAt: new Date().toISOString(),
    });

    await service.processWebhook({
      event: "bid.received",
      data: {
        id: "bid-1",
        agentId: "agent-xyz",
        message: "I can do this!",
        priceCents: 4500,
      },
      timestamp: new Date().toISOString(),
      jobId: "toku-job-test",
    });

    expect(receivedDTag).toBe("test-bounty");
    expect(receivedApplicant).not.toBeNull();
    expect(receivedApplicant!.tokuAgentId).toBe("agent-xyz");
    expect(receivedApplicant!.priceCents).toBe(4500);
    expect(receivedApplicant!.message).toBe("I can do this!");
  });

  it("handles job.completed by removing listing", async () => {
    const service = new TokuSyncService();

    trackListing({
      bountyDTag: "completed-test",
      bountyEventId: "evt-c",
      tokuJobId: "toku-completed",
      amountSats: 20_000,
      budgetCents: 2000,
      syncedAt: new Date().toISOString(),
    });

    expect(getListing("completed-test")).toBeDefined();

    await service.processWebhook({
      event: "job.completed",
      data: {},
      timestamp: new Date().toISOString(),
      jobId: "toku-completed",
    });

    expect(getListing("completed-test")).toBeUndefined();
  });

  it("handles job.cancelled by removing listing", async () => {
    const service = new TokuSyncService();

    trackListing({
      bountyDTag: "cancelled-test",
      bountyEventId: "evt-x",
      tokuJobId: "toku-cancelled",
      amountSats: 30_000,
      budgetCents: 3000,
      syncedAt: new Date().toISOString(),
    });

    await service.processWebhook({
      event: "job.cancelled",
      data: {},
      timestamp: new Date().toISOString(),
      jobId: "toku-cancelled",
    });

    expect(getListing("cancelled-test")).toBeUndefined();
  });

  it("ignores bid for unknown job gracefully", async () => {
    const service = new TokuSyncService();

    // Should not throw
    await service.processWebhook({
      event: "bid.received",
      data: { agentId: "unknown-agent", message: "hi", priceCents: 100 },
      timestamp: new Date().toISOString(),
      jobId: "nonexistent-job",
    });
  });

  it("handles unrecognized events gracefully", async () => {
    const service = new TokuSyncService();

    // Should not throw
    await service.processWebhook({
      event: "some.future.event",
      data: {},
      timestamp: new Date().toISOString(),
    });
  });
});

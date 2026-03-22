import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock toku module
const mockTrackListing = vi.fn();
const mockGetListing = vi.fn().mockReturnValue(null);
const mockGetListingByTokuJobId = vi.fn().mockReturnValue(null);
const mockRemoveListing = vi.fn();
const mockGetAllListings = vi.fn().mockReturnValue([]);
const mockShouldListOnToku = vi.fn().mockReturnValue(true);
const mockBuildTokuJobInput = vi.fn().mockReturnValue({
  title: "Test Bounty",
  description: "Test",
  budget_cents: 10000,
  service_id: "svc-123",
});
const mockSatsToCents = vi.fn().mockReturnValue(10000);

class MockTokuClient {
  createJob = vi.fn().mockResolvedValue({ id: "toku-job-123", status: "open" });
  cancelJob = vi.fn().mockResolvedValue(true);
  getJob = vi.fn().mockResolvedValue({ id: "toku-job-123", status: "open" });
}

vi.mock("@/lib/server/toku", () => ({
  TokuClient: MockTokuClient,
  trackListing: mockTrackListing,
  getListing: mockGetListing,
  getListingByTokuJobId: mockGetListingByTokuJobId,
  removeListing: mockRemoveListing,
  getAllListings: mockGetAllListings,
  shouldListOnToku: mockShouldListOnToku,
  buildTokuJobInput: mockBuildTokuJobInput,
  satsToCents: mockSatsToCents,
}));

describe("TokuSyncService", () => {
  let TokuSyncService: typeof import("@/lib/server/toku-sync").TokuSyncService;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockGetListing.mockReturnValue(null);
    mockShouldListOnToku.mockReturnValue(true);
    mockGetAllListings.mockReturnValue([]);

    // Re-import to get fresh module
    const mod = await import("@/lib/server/toku-sync");
    TokuSyncService = mod.TokuSyncService;
  });

  describe("constructor", () => {
    it("creates service with default config", () => {
      const service = new TokuSyncService();
      expect(service).toBeDefined();
    });

    it("accepts custom service ID", () => {
      const service = new TokuSyncService({ serviceId: "custom-svc" });
      expect(service).toBeDefined();
    });
  });

  describe("listBounty", () => {
    it("lists eligible bounty on toku.agency", async () => {
      const service = new TokuSyncService();
      const bounty = {
        dTag: "bounty-123",
        title: "Fix a bug",
        description: "Please fix this",
        rewardSats: 100000,
        status: "open" as const,
        pubkey: "npub1...",
        createdAt: Date.now() / 1000,
      };

      const result = await service.listBounty(bounty as any);
      // Should attempt to create or track listing
      expect(mockShouldListOnToku).toHaveBeenCalledWith(100000);
    });

    it("skips bounty below threshold", async () => {
      mockShouldListOnToku.mockReturnValue(false);
      const service = new TokuSyncService();
      const bounty = {
        dTag: "small-bounty",
        title: "Small task",
        description: "Tiny",
        rewardSats: 100,
        status: "open" as const,
        pubkey: "npub1...",
        createdAt: Date.now() / 1000,
      };

      const result = await service.listBounty(bounty as any);
      expect(result).toBeNull();
    });

    it("skips already-listed bounty", async () => {
      mockGetListing.mockReturnValue({
        dTag: "bounty-123",
        tokuJobId: "existing-job",
      });
      const service = new TokuSyncService();
      const bounty = {
        dTag: "bounty-123",
        title: "Already listed",
        description: "Dup",
        rewardSats: 100000,
        status: "open" as const,
        pubkey: "npub1...",
        createdAt: Date.now() / 1000,
      };

      const result = await service.listBounty(bounty as any);
      expect(result).not.toBeNull(); // Returns existing listing
    });
  });

  describe("syncOpenBounties", () => {
    it("syncs array of bounties", async () => {
      const service = new TokuSyncService();
      const result = await service.syncOpenBounties([
        {
          dTag: "b1",
          title: "Bounty 1",
          description: "First",
          rewardSats: 50000,
          status: "open",
          pubkey: "npub1...",
          createdAt: Date.now() / 1000,
        },
      ]);
      expect(result).toBeDefined();
      expect(typeof result.listed).toBe("number");
    });
  });

  describe("getStats", () => {
    it("returns stats object", () => {
      const service = new TokuSyncService();
      const stats = service.getStats();
      expect(stats).toBeDefined();
      expect(typeof stats.totalListings).toBe("number");
    });
  });

  describe("cancelListing", () => {
    it("cancels existing listing", async () => {
      mockGetListing.mockReturnValue({
        dTag: "bounty-123",
        tokuJobId: "toku-job-123",
      });
      const service = new TokuSyncService();
      const result = await service.cancelListing("bounty-123");
      expect(typeof result).toBe("boolean");
    });

    it("returns false for non-existent listing", async () => {
      mockGetListing.mockReturnValue(null);
      const service = new TokuSyncService();
      const result = await service.cancelListing("nonexistent");
      expect(result).toBe(false);
    });
  });
});

describe("Toku API Route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET requires API key", async () => {
    // Mock auth
    vi.mock("@/lib/server/auth", () => ({
      verifyApiKey: vi.fn().mockReturnValue(null),
    }));

    const { GET } = await import("@/app/api/toku/route");
    const req = {
      headers: { get: () => null },
      nextUrl: { searchParams: new URLSearchParams() },
    };
    const response = await GET(req as any);
    const body = await response.json();
    expect(response.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });
});

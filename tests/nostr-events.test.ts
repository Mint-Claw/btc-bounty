import { describe, it, expect } from "vitest";
import {
  BOUNTY_KIND,
  buildBountyTags,
  parseBountyEvent,
  type BountyStatus,
} from "@/lib/nostr/schema";

describe("Nostr Event Schema", () => {
  const sampleBounty = {
    dTag: "test-bounty-123",
    title: "Fix authentication bug",
    summary: "JWT refresh tokens expire unexpectedly",
    rewardSats: 50000,
    category: "code" as const,
    lightning: "lnbc50u1...",
    tags: ["typescript", "auth"],
  };

  describe("buildBountyTags", () => {
    it("creates correct tag structure", () => {
      const tags = buildBountyTags(sampleBounty);
      expect(tags).toBeInstanceOf(Array);
      expect(tags.length).toBeGreaterThan(5);
    });

    it("includes required d-tag", () => {
      const tags = buildBountyTags(sampleBounty);
      const dTag = tags.find((t) => t[0] === "d");
      expect(dTag).toBeDefined();
      expect(dTag![1]).toBe("test-bounty-123");
    });

    it("includes title tag", () => {
      const tags = buildBountyTags(sampleBounty);
      const title = tags.find((t) => t[0] === "title");
      expect(title![1]).toBe("Fix authentication bug");
    });

    it("includes reward in sats", () => {
      const tags = buildBountyTags(sampleBounty);
      const reward = tags.find((t) => t[0] === "reward");
      expect(reward![1]).toBe("50000");
      expect(reward![2]).toBe("sats");
    });

    it("sets initial status to OPEN", () => {
      const tags = buildBountyTags(sampleBounty);
      const status = tags.find((t) => t[0] === "status");
      expect(status![1]).toBe("OPEN");
    });

    it("includes category tag", () => {
      const tags = buildBountyTags(sampleBounty);
      const cat = tags.find((t) => t[0] === "category");
      expect(cat![1]).toBe("code");
    });

    it("includes lightning address", () => {
      const tags = buildBountyTags(sampleBounty);
      const ln = tags.find((t) => t[0] === "lightning");
      expect(ln![1]).toBe("lnbc50u1...");
    });

    it("includes published_at timestamp", () => {
      const tags = buildBountyTags(sampleBounty);
      const pub = tags.find((t) => t[0] === "published_at");
      expect(pub).toBeDefined();
      const ts = parseInt(pub![1]);
      expect(ts).toBeGreaterThan(1700000000);
      expect(ts).toBeLessThan(2000000000);
    });

    it("includes topic tags", () => {
      const tags = buildBountyTags(sampleBounty);
      const tTags = tags.filter((t) => t[0] === "t");
      expect(tTags).toHaveLength(2);
      expect(tTags.map((t) => t[1])).toContain("typescript");
      expect(tTags.map((t) => t[1])).toContain("auth");
    });

    it("includes empty winner tag", () => {
      const tags = buildBountyTags(sampleBounty);
      const winner = tags.find((t) => t[0] === "winner");
      expect(winner![1]).toBe("");
    });

    it("includes optional expiry", () => {
      const tags = buildBountyTags({ ...sampleBounty, expiry: 1735689600 });
      const expiry = tags.find((t) => t[0] === "expiry");
      expect(expiry).toBeDefined();
      expect(expiry![1]).toBe("1735689600");
    });

    it("includes optional image", () => {
      const tags = buildBountyTags({
        ...sampleBounty,
        image: "https://example.com/bug.png",
      });
      const img = tags.find((t) => t[0] === "image");
      expect(img![1]).toBe("https://example.com/bug.png");
    });

    it("omits expiry when not provided", () => {
      const tags = buildBountyTags(sampleBounty);
      const expiry = tags.find((t) => t[0] === "expiry");
      expect(expiry).toBeUndefined();
    });
  });

  describe("parseBountyEvent", () => {
    function makeEvent(overrides: Record<string, unknown> = {}) {
      return {
        id: "abc123",
        pubkey: "deadbeef",
        created_at: 1700000000,
        kind: BOUNTY_KIND,
        tags: buildBountyTags(sampleBounty),
        content: "Full description of the bug...",
        sig: "sig123",
        ...overrides,
      };
    }

    it("parses a valid bounty event", () => {
      const bounty = parseBountyEvent(makeEvent());
      expect(bounty).toBeDefined();
      expect(bounty!.title).toBe("Fix authentication bug");
      expect(bounty!.rewardSats).toBe(50000);
      expect(bounty!.status).toBe("OPEN");
    });

    it("extracts dTag correctly", () => {
      const bounty = parseBountyEvent(makeEvent());
      expect(bounty!.dTag).toBe("test-bounty-123");
    });

    it("extracts category", () => {
      const bounty = parseBountyEvent(makeEvent());
      expect(bounty!.category).toBe("code");
    });

    it("extracts content as description", () => {
      const bounty = parseBountyEvent(makeEvent());
      expect(bounty!.content).toBe("Full description of the bug...");
    });

    it("parses event regardless of kind (filtering is caller responsibility)", () => {
      // parseBountyEvent trusts the caller to filter by kind
      const bounty = parseBountyEvent(makeEvent({ kind: 1 }));
      expect(bounty).not.toBeNull();
      expect(bounty!.title).toBe("Fix authentication bug");
    });

    it("returns null for events without d-tag", () => {
      const bounty = parseBountyEvent(makeEvent({ tags: [] }));
      expect(bounty).toBeNull();
    });
  });

  describe("BOUNTY_KIND", () => {
    it("is NIP-99 classified listing kind", () => {
      expect(BOUNTY_KIND).toBe(30402);
    });

    it("is a parameterized replaceable event (30000-39999)", () => {
      expect(BOUNTY_KIND).toBeGreaterThanOrEqual(30000);
      expect(BOUNTY_KIND).toBeLessThan(40000);
    });
  });
});

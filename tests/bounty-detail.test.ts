import { describe, it, expect, beforeEach } from "vitest";
import {
  cacheBountyEvent,
  getCachedBounty,
  getDB,
  type BountyEventRow,
} from "@/lib/server/db";

describe("Bounty Detail Enrichment", () => {
  beforeEach(() => {
    const db = getDB();
    db.exec("DELETE FROM bounty_events");
  });

  const sampleBounty = {
    id: "detail-test-1",
    dTag: "fix-auth-flow",
    pubkey: "aabbccdd",
    kind: 30402,
    title: "Fix Authentication Flow",
    summary: "OAuth flow broken on mobile",
    content: "Full description of the auth issue...",
    rewardSats: 100000,
    status: "OPEN",
    category: "code",
    lightning: "lnbc100k...",
    tags: [
      ["d", "fix-auth-flow"],
      ["title", "Fix Authentication Flow"],
      ["reward", "100000"],
      ["t", "code"],
    ],
    createdAt: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
  };

  it("stores and retrieves bounty by d_tag", () => {
    cacheBountyEvent(sampleBounty);
    const result = getCachedBounty("fix-auth-flow");
    expect(result).toBeDefined();
    expect(result!.d_tag).toBe("fix-auth-flow");
    expect(result!.title).toBe("Fix Authentication Flow");
  });

  it("stores tags as JSON string", () => {
    cacheBountyEvent(sampleBounty);
    const result = getCachedBounty("fix-auth-flow");
    expect(result!.tags_json).toBeDefined();
    const tags = JSON.parse(result!.tags_json!);
    expect(tags).toHaveLength(4);
    expect(tags[0]).toEqual(["d", "fix-auth-flow"]);
  });

  it("reward_sats stored correctly for BTC conversion", () => {
    cacheBountyEvent(sampleBounty);
    const result = getCachedBounty("fix-auth-flow");
    expect(result!.reward_sats).toBe(100000);
    // 100,000 sats = 0.001 BTC
    const btc = result!.reward_sats / 1e8;
    expect(btc).toBeCloseTo(0.001, 8);
  });

  it("created_at is a unix timestamp for age calculation", () => {
    cacheBountyEvent(sampleBounty);
    const result = getCachedBounty("fix-auth-flow");
    const now = Math.floor(Date.now() / 1000);
    const ageSeconds = now - result!.created_at;
    expect(ageSeconds).toBeGreaterThan(3500);
    expect(ageSeconds).toBeLessThan(7200);
  });

  it("returns all expected fields", () => {
    cacheBountyEvent(sampleBounty);
    const result = getCachedBounty("fix-auth-flow")!;
    const expectedFields = [
      "id", "d_tag", "pubkey", "kind", "title", "summary",
      "content", "reward_sats", "status", "category",
      "lightning", "tags_json", "created_at",
    ];
    for (const field of expectedFields) {
      expect(result).toHaveProperty(field);
    }
  });

  it("handles bounty with no optional fields", () => {
    cacheBountyEvent({
      id: "minimal-1",
      dTag: "minimal-bounty",
      pubkey: "pub123",
      kind: 30402,
      title: "Simple Task",
      rewardSats: 5000,
      createdAt: 1700000000,
    });
    const result = getCachedBounty("minimal-bounty");
    expect(result).toBeDefined();
    expect(result!.summary).toBeNull();
    expect(result!.content).toBeNull();
    expect(result!.lightning).toBeNull();
    expect(result!.tags_json).toBeNull();
    expect(result!.status).toBe("OPEN");
    expect(result!.category).toBe("other");
  });
});

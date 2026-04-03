/**
 * Tests for GET /api/bounties/search (FTS5 full-text search)
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { getDB, closeDB, cacheBountyEvent, searchCachedBounties } from "@/lib/server/db";

describe("Bounty FTS Search", () => {
  beforeAll(() => {
    // getDB() auto-creates + migrates
    const db = getDB();
    db.exec("DELETE FROM bounty_events");
    try { db.exec("DELETE FROM bounty_fts"); } catch { /* may not exist */ }

    // Seed test bounties
    const bounties = [
      { dTag: "b1", title: "Build a Lightning wallet", content: "Create a simple BTC wallet with Lightning support", category: "code", rewardSats: 50000 },
      { dTag: "b2", title: "Design a logo for Nostr client", content: "Modern SVG logo for relay-based chat app", category: "design", rewardSats: 25000 },
      { dTag: "b3", title: "Write Bitcoin whitepaper summary", content: "Simplified explanation of proof of work and decentralization", category: "writing", rewardSats: 10000 },
      { dTag: "b4", title: "Research Lightning Network routing", content: "Analyze pathfinding algorithms for payment channels", category: "research", rewardSats: 75000 },
      { dTag: "b5", title: "Fix relay connection bug", content: "WebSocket drops after 30 seconds on mobile browsers", category: "code", rewardSats: 15000 },
    ];

    for (const b of bounties) {
      cacheBountyEvent({
        id: `event_${b.dTag}`,
        dTag: b.dTag,
        pubkey: "abc123",
        kind: 30402,
        title: b.title,
        content: b.content,
        rewardSats: b.rewardSats,
        status: "OPEN",
        category: b.category,
        createdAt: Math.floor(Date.now() / 1000),
      });
    }
  });

  afterAll(() => {
    closeDB();
  });

  test("searches by title keyword", () => {
    const results = searchCachedBounties("Lightning");
    expect(results.length).toBeGreaterThanOrEqual(2);
    const titles = results.map((r) => r.title);
    expect(titles).toContain("Build a Lightning wallet");
    expect(titles).toContain("Research Lightning Network routing");
  });

  test("searches by content keyword", () => {
    const results = searchCachedBounties("WebSocket");
    expect(results.length).toBe(1);
    expect(results[0].d_tag).toBe("b5");
  });

  test("searches with status filter", () => {
    const results = searchCachedBounties("Lightning", { status: "OPEN" });
    expect(results.length).toBeGreaterThanOrEqual(2);
  });

  test("respects limit parameter", () => {
    const results = searchCachedBounties("Lightning", { limit: 1 });
    expect(results.length).toBe(1);
  });

  test("returns empty array for no matches", () => {
    const results = searchCachedBounties("xyznonexistent");
    expect(results.length).toBe(0);
  });

  test("matches full word across title and content", () => {
    const results = searchCachedBounties("wallet");
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].title).toContain("wallet");
  });

  test("multi-word query matches", () => {
    const results = searchCachedBounties("relay connection");
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].d_tag).toBe("b5");
  });

  test("search results include expected fields", () => {
    const results = searchCachedBounties("Lightning");
    expect(results.length).toBeGreaterThan(0);
    const r = results[0];
    expect(r).toHaveProperty("d_tag");
    expect(r).toHaveProperty("title");
    expect(r).toHaveProperty("content");
    expect(r).toHaveProperty("reward_sats");
    expect(r).toHaveProperty("status");
    expect(r).toHaveProperty("category");
  });
});

describe("GET /api/bounties/search", () => {
  function makeReq(url: string) {
    const u = new URL(url, "http://localhost");
    return { nextUrl: u } as any;
  }

  test("rejects missing query", async () => {
    const { GET } = await import("@/app/api/bounties/search/route");
    const res = await GET(makeReq("/api/bounties/search"));
    expect(res.status).toBe(400);
  });

  test("rejects too-short query", async () => {
    const { GET } = await import("@/app/api/bounties/search/route");
    const res = await GET(makeReq("/api/bounties/search?q=a"));
    expect(res.status).toBe(400);
  });

  test("returns results for valid query", async () => {
    const { GET } = await import("@/app/api/bounties/search/route");
    const res = await GET(makeReq("/api/bounties/search?q=Lightning&limit=5"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.query).toBe("Lightning");
    expect(body.count).toBeGreaterThanOrEqual(2);
    expect(body.results[0]).toHaveProperty("d_tag");
    expect(body.results[0]).toHaveProperty("title");
    expect(body.results[0]).toHaveProperty("reward_sats");
  });
});

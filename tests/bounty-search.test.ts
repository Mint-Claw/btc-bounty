import { describe, it, expect, beforeEach } from "vitest";
import {
  cacheBountyEvent,
  searchCachedBounties,
  getBountyStats,
  getDB,
} from "@/lib/server/db";

describe("Bounty Search & Stats", () => {
  beforeEach(() => {
    const db = getDB();
    db.exec("DELETE FROM bounty_events");
  });

  const bounty1 = {
    id: "search-1",
    dTag: "fix-login-bug",
    pubkey: "pub1",
    kind: 30402,
    title: "Fix Login Bug on Safari",
    summary: "Users on Safari can't log in after latest update",
    content: "Steps to reproduce: open Safari, go to login page...",
    rewardSats: 50000,
    status: "OPEN",
    category: "code",
    createdAt: 1700000001,
  };

  const bounty2 = {
    id: "search-2",
    dTag: "design-landing",
    pubkey: "pub2",
    kind: 30402,
    title: "Design New Landing Page",
    summary: "Need a fresh modern landing page design",
    rewardSats: 100000,
    status: "OPEN",
    category: "design",
    createdAt: 1700000002,
  };

  const bounty3 = {
    id: "search-3",
    dTag: "api-docs",
    pubkey: "pub1",
    kind: 30402,
    title: "Write API Documentation",
    summary: "Document all REST endpoints",
    rewardSats: 25000,
    status: "COMPLETED",
    category: "docs",
    createdAt: 1700000003,
  };

  it("searches by title", () => {
    cacheBountyEvent(bounty1);
    cacheBountyEvent(bounty2);
    const results = searchCachedBounties("Login");
    expect(results).toHaveLength(1);
    expect(results[0].d_tag).toBe("fix-login-bug");
  });

  it("searches by summary", () => {
    cacheBountyEvent(bounty1);
    cacheBountyEvent(bounty2);
    const results = searchCachedBounties("Safari");
    expect(results).toHaveLength(1);
    expect(results[0].d_tag).toBe("fix-login-bug");
  });

  it("searches by content", () => {
    cacheBountyEvent(bounty1);
    cacheBountyEvent(bounty2);
    const results = searchCachedBounties("reproduce");
    expect(results).toHaveLength(1);
    expect(results[0].d_tag).toBe("fix-login-bug");
  });

  it("search is case-insensitive", () => {
    cacheBountyEvent(bounty1);
    const results = searchCachedBounties("safari");
    expect(results).toHaveLength(1);
  });

  it("returns empty for no match", () => {
    cacheBountyEvent(bounty1);
    const results = searchCachedBounties("blockchain");
    expect(results).toHaveLength(0);
  });

  it("filters search by status", () => {
    cacheBountyEvent(bounty1);
    cacheBountyEvent(bounty3);
    // Both match "page" in different ways... use more specific term
    const allDocs = searchCachedBounties("API");
    expect(allDocs).toHaveLength(1);
    const completed = searchCachedBounties("API", { status: "COMPLETED" });
    expect(completed).toHaveLength(1);
    const open = searchCachedBounties("API", { status: "OPEN" });
    expect(open).toHaveLength(0);
  });

  it("respects search limit", () => {
    for (let i = 0; i < 5; i++) {
      cacheBountyEvent({
        ...bounty1,
        id: `limit-${i}`,
        dTag: `bug-${i}`,
        title: `Login Bug Fix ${i}`,
        createdAt: 1700000000 + i,
      });
    }
    const results = searchCachedBounties("Login", { limit: 3 });
    expect(results).toHaveLength(3);
  });

  // Stats tests
  it("returns correct stats with no data", () => {
    const stats = getBountyStats();
    expect(stats.total).toBe(0);
    expect(stats.open).toBe(0);
    expect(stats.total_sats).toBe(0);
  });

  it("returns correct aggregate stats", () => {
    cacheBountyEvent(bounty1); // OPEN, 50k
    cacheBountyEvent(bounty2); // OPEN, 100k
    cacheBountyEvent(bounty3); // COMPLETED, 25k
    const stats = getBountyStats();
    expect(stats.total).toBe(3);
    expect(stats.open).toBe(2);
    expect(stats.completed).toBe(1);
    expect(stats.total_sats).toBe(175000);
  });

  it("tracks in_progress status", () => {
    cacheBountyEvent({
      ...bounty1,
      status: "IN_PROGRESS",
    });
    const stats = getBountyStats();
    expect(stats.in_progress).toBe(1);
  });
});

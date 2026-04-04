import { describe, it, expect, beforeEach } from "vitest";
import {
  cacheBountyEvent,
  getCachedBounty,
  listCachedBounties,
  updateBountyStatus,
  getDB,
} from "@/lib/server/db";

describe("Bounty Event Cache", () => {
  beforeEach(() => {
    // Clean bounty_events table between tests
    const db = getDB();
    db.exec("DELETE FROM bounty_events");
  });

  const sampleEvent = {
    id: "event123abc",
    dTag: "test-bounty-cache",
    pubkey: "deadbeef0123",
    kind: 30402,
    title: "Fix Login Bug",
    summary: "Login fails on Safari",
    content: "Detailed description...",
    rewardSats: 25000,
    status: "OPEN" as const,
    category: "code" as const,
    lightning: "lnbc25k...",
    tags: [["d", "test-bounty-cache"], ["title", "Fix Login Bug"]],
    createdAt: 1700000000,
  };

  it("caches a bounty event", () => {
    cacheBountyEvent(sampleEvent);
    const cached = getCachedBounty("test-bounty-cache");
    expect(cached).toBeDefined();
    expect(cached!.title).toBe("Fix Login Bug");
    expect(cached!.reward_sats).toBe(25000);
  });

  it("retrieves by d_tag", () => {
    cacheBountyEvent(sampleEvent);
    const cached = getCachedBounty("test-bounty-cache");
    expect(cached!.d_tag).toBe("test-bounty-cache");
    expect(cached!.pubkey).toBe("deadbeef0123");
  });

  it("upserts on conflict (same d_tag)", () => {
    cacheBountyEvent(sampleEvent);
    cacheBountyEvent({
      ...sampleEvent,
      id: "event456def",
      title: "Updated Title",
      rewardSats: 50000,
    });
    const cached = getCachedBounty("test-bounty-cache");
    expect(cached!.id).toBe("event456def");
    expect(cached!.title).toBe("Updated Title");
    expect(cached!.reward_sats).toBe(50000);
  });

  it("returns undefined for non-existent d_tag", () => {
    const cached = getCachedBounty("nonexistent-tag");
    expect(cached).toBeUndefined();
  });

  it("lists cached bounties", () => {
    cacheBountyEvent(sampleEvent);
    cacheBountyEvent({
      ...sampleEvent,
      id: "event456list",
      dTag: "another-bounty",
      title: "Another Task",
      createdAt: 1700000001,
    });
    const list = listCachedBounties();
    expect(list.length).toBeGreaterThanOrEqual(2);
  });

  it("filters by status", () => {
    cacheBountyEvent(sampleEvent);
    cacheBountyEvent({
      ...sampleEvent,
      id: "event789completed",
      dTag: "completed-bounty",
      status: "COMPLETED",
      createdAt: 1700000002,
    });
    const open = listCachedBounties({ status: "OPEN" });
    const completed = listCachedBounties({ status: "COMPLETED" });
    expect(open.every((b) => b.status === "OPEN")).toBe(true);
    expect(completed.every((b) => b.status === "COMPLETED")).toBe(true);
  });

  it("filters by category", () => {
    cacheBountyEvent(sampleEvent);
    cacheBountyEvent({
      ...sampleEvent,
      id: "event_design_456",
      dTag: "design-bounty",
      category: "design",
      createdAt: 1700000003,
    });
    const code = listCachedBounties({ category: "code" });
    expect(code.every((b) => b.category === "code")).toBe(true);
  });

  it("respects limit and offset", () => {
    for (let i = 0; i < 5; i++) {
      cacheBountyEvent({
        ...sampleEvent,
        id: `paginated-id-${i}`,
        dTag: `paginated-${i}`,
        title: `Paginated Bounty ${i}`,
        createdAt: 1700000000 + i,
      });
    }
    const page1 = listCachedBounties({ limit: 2, offset: 0 });
    const page2 = listCachedBounties({ limit: 2, offset: 2 });
    expect(page1.length).toBe(2);
    expect(page2.length).toBe(2);
    expect(page1[0].d_tag).not.toBe(page2[0].d_tag);
  });

  it("updates bounty status", () => {
    cacheBountyEvent(sampleEvent);
    const updated = updateBountyStatus(
      "test-bounty-cache",
      "COMPLETED",
      "winner_pubkey_hex",
    );
    expect(updated).toBe(true);
    const cached = getCachedBounty("test-bounty-cache");
    expect(cached!.status).toBe("COMPLETED");
    expect(cached!.winner_pubkey).toBe("winner_pubkey_hex");
  });

  it("returns false for non-existent status update", () => {
    const updated = updateBountyStatus("nonexistent", "COMPLETED");
    expect(updated).toBe(false);
  });

  it("stores tags as JSON", () => {
    cacheBountyEvent(sampleEvent);
    const cached = getCachedBounty("test-bounty-cache");
    expect(cached!.tags_json).toBeDefined();
    const tags = JSON.parse(cached!.tags_json!);
    expect(tags).toBeInstanceOf(Array);
    expect(tags[0]).toEqual(["d", "test-bounty-cache"]);
  });
});

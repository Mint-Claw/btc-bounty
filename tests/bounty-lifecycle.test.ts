/**
 * Bounty Lifecycle Integration Tests
 * Tests: create → status transitions → validation
 */
import { describe, it, expect } from "vitest";
import {
  parseBountyEvent,
  buildBountyTags,
  BOUNTY_KIND,
  type BountyCategory,
} from "@/lib/nostr/schema";

const CREATOR = "a".repeat(64);

function makeBountyEvent(overrides: Record<string, unknown> = {}) {
  const tags = buildBountyTags({
    dTag: "test-bounty-1",
    title: "Fix login bug",
    summary: "Login crashes on mobile",
    rewardSats: 100000,
    category: "code" as BountyCategory,
    lightning: "creator@getalby.com",
    tags: ["react", "nextjs"],
  });
  return {
    id: "evt_1",
    pubkey: CREATOR,
    content: "Full description of the bug.",
    created_at: 1700000000,
    tags,
    ...overrides,
  };
}

describe("Bounty Lifecycle", () => {
  it("creates a valid OPEN bounty", () => {
    const bounty = parseBountyEvent(makeBountyEvent());
    expect(bounty).not.toBeNull();
    expect(bounty!.title).toBe("Fix login bug");
    expect(bounty!.rewardSats).toBe(100000);
    expect(bounty!.status).toBe("OPEN");
    expect(bounty!.category).toBe("code");
  });

  it("transitions to COMPLETED via replaceable event", () => {
    const event = makeBountyEvent();
    event.tags = event.tags.map((t: string[]) =>
      t[0] === "status" ? ["status", "COMPLETED"] : t
    );
    event.created_at = 1700001000;

    const bounty = parseBountyEvent(event);
    expect(bounty!.status).toBe("COMPLETED");
  });

  it("transitions to CANCELLED via replaceable event", () => {
    const event = makeBountyEvent();
    event.tags = event.tags.map((t: string[]) =>
      t[0] === "status" ? ["status", "CANCELLED"] : t
    );

    const bounty = parseBountyEvent(event);
    expect(bounty!.status).toBe("CANCELLED");
  });

  it("rejects event missing required tags", () => {
    const event = {
      id: "evt_bad",
      pubkey: CREATOR,
      content: "Missing tags",
      created_at: 1700000000,
      tags: [["d", "bad-bounty"]],
    };
    expect(parseBountyEvent(event)).toBeNull();
  });

  it("parses hashtags from t-tags", () => {
    const bounty = parseBountyEvent(makeBountyEvent());
    expect(bounty).not.toBeNull();
    expect(bounty!.tags).toContain("react");
    expect(bounty!.tags).toContain("nextjs");
    expect(bounty!.tags).toHaveLength(2);
  });

  it("handles zero reward gracefully", () => {
    const event = makeBountyEvent();
    event.tags = event.tags.map((t: string[]) =>
      t[0] === "reward" ? ["reward", "0", "sats"] : t
    );
    const bounty = parseBountyEvent(event);
    expect(bounty).not.toBeNull();
    expect(bounty!.rewardSats).toBe(0);
  });
});

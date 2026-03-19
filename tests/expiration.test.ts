import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getExpiration,
  DEFAULT_EXPIRATION_SECS,
  expireStale,
} from "@/lib/server/expiration";
import type { NostrEvent } from "@/lib/nostr/schema";

// Mock dependencies
vi.mock("@/lib/server/relay", () => ({
  fetchFromRelays: vi.fn().mockResolvedValue([]),
  publishToRelays: vi.fn().mockResolvedValue(3),
}));

vi.mock("@/lib/server/bounty-updater", () => ({
  updateBountyEvent: vi.fn().mockResolvedValue(3),
}));

vi.mock("@/lib/server/webhooks", () => ({
  deliverWebhook: vi.fn().mockResolvedValue(undefined),
}));

function makeEvent(overrides: Partial<NostrEvent> = {}): NostrEvent {
  return {
    id: "abc123",
    pubkey: "pub123",
    created_at: 1700000000,
    kind: 30402,
    tags: [
      ["d", "test-bounty"],
      ["status", "open"],
    ],
    content: "Test bounty",
    sig: "sig123",
    ...overrides,
  };
}

describe("getExpiration", () => {
  it("returns explicit NIP-40 expiration tag", () => {
    const event = makeEvent({
      tags: [
        ["d", "b1"],
        ["expiration", "1700100000"],
      ],
    });
    expect(getExpiration(event)).toBe(1700100000);
  });

  it("falls back to created_at + DEFAULT_EXPIRATION_SECS", () => {
    const event = makeEvent({ created_at: 1700000000 });
    expect(getExpiration(event)).toBe(1700000000 + DEFAULT_EXPIRATION_SECS);
  });

  it("returns null for event with no created_at and no expiration tag", () => {
    const event = makeEvent({ created_at: 0, tags: [["d", "b1"]] });
    // created_at of 0 + DEFAULT = DEFAULT (not null, since 0 is falsy but valid)
    // Actually 0 is falsy in JS, so this returns null
    expect(getExpiration(event)).toBeNull();
  });

  it("ignores invalid expiration tag value", () => {
    const event = makeEvent({
      created_at: 1700000000,
      tags: [
        ["d", "b1"],
        ["expiration", "not-a-number"],
      ],
    });
    // Falls back to created_at + DEFAULT
    expect(getExpiration(event)).toBe(1700000000 + DEFAULT_EXPIRATION_SECS);
  });
});

describe("expireStale", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty result when no open bounties", async () => {
    const result = await expireStale();
    expect(result.checked).toBe(0);
    expect(result.expired).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it("expires bounties past their expiration", async () => {
    const { fetchFromRelays } = await import("@/lib/server/relay");
    const { updateBountyEvent } = await import(
      "@/lib/server/bounty-updater"
    );

    const pastEvent = makeEvent({
      created_at: 1700000000,
      tags: [
        ["d", "expired-bounty"],
        ["status", "open"],
        ["expiration", "1700050000"], // Past
      ],
    });

    vi.mocked(fetchFromRelays).mockResolvedValueOnce([pastEvent]);
    vi.mocked(updateBountyEvent).mockResolvedValueOnce(3);

    const now = 1700100000; // After expiration
    const result = await expireStale(now);

    expect(result.checked).toBe(1);
    expect(result.expired).toBe(1);
    expect(updateBountyEvent).toHaveBeenCalledWith(
      "expired-bounty",
      "pub123",
      { status: "expired" },
    );
  });

  it("skips bounties not yet expired", async () => {
    const { fetchFromRelays } = await import("@/lib/server/relay");

    const futureEvent = makeEvent({
      tags: [
        ["d", "future-bounty"],
        ["status", "open"],
        ["expiration", "1800000000"], // Far future
      ],
    });

    vi.mocked(fetchFromRelays).mockResolvedValueOnce([futureEvent]);

    const result = await expireStale(1700000000);
    expect(result.checked).toBe(1);
    expect(result.expired).toBe(0);
  });

  it("handles update failure gracefully", async () => {
    const { fetchFromRelays } = await import("@/lib/server/relay");
    const { updateBountyEvent } = await import(
      "@/lib/server/bounty-updater"
    );

    const pastEvent = makeEvent({
      tags: [
        ["d", "fail-bounty"],
        ["status", "open"],
        ["expiration", "1699000000"],
      ],
    });

    vi.mocked(fetchFromRelays).mockResolvedValueOnce([pastEvent]);
    vi.mocked(updateBountyEvent).mockResolvedValueOnce(0); // No relays

    const result = await expireStale(1700000000);
    expect(result.expired).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("no managed key");
  });
});

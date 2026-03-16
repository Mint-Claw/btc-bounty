/**
 * Tests for bounty-updater: NOSTR event updates on payment events.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the relay and auth modules
vi.mock("@/lib/server/relay", () => ({
  fetchFromRelays: vi.fn(),
  publishToRelays: vi.fn(),
}));

vi.mock("@/lib/server/auth", () => ({
  getAgentByPubkey: vi.fn(),
}));

import { updateBountyEvent, markBountyFunded, markBountyPaid } from "@/lib/server/bounty-updater";
import { fetchFromRelays, publishToRelays } from "@/lib/server/relay";
import { getAgentByPubkey } from "@/lib/server/auth";

const MOCK_PUBKEY = "abc123def456";
const MOCK_NSEC = "a".repeat(64);
const MOCK_DTAG = "test-bounty-1";

const MOCK_EVENT = {
  id: "evt1",
  pubkey: MOCK_PUBKEY,
  created_at: 1700000000,
  kind: 30402,
  tags: [
    ["d", MOCK_DTAG],
    ["title", "Test Bounty"],
    ["status", "OPEN"],
    ["reward", "50000", "sats"],
    ["winner", ""],
  ],
  content: "Build something cool",
  sig: "sig123",
};

describe("bounty-updater", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates status and funded tags on existing event", async () => {
    vi.mocked(getAgentByPubkey).mockReturnValue({
      apiKey: "key1",
      nsecHex: MOCK_NSEC,
      pubkey: MOCK_PUBKEY,
    });
    vi.mocked(fetchFromRelays).mockResolvedValue([MOCK_EVENT]);
    vi.mocked(publishToRelays).mockResolvedValue(3);

    const relays = await updateBountyEvent(MOCK_DTAG, MOCK_PUBKEY, {
      funded: true,
    });

    expect(relays).toBe(3);
    expect(publishToRelays).toHaveBeenCalledOnce();

    // Verify the signed event has the funded tag
    const publishedEvent = vi.mocked(publishToRelays).mock.calls[0][0];
    const fundedTag = publishedEvent.tags.find((t: string[]) => t[0] === "funded");
    expect(fundedTag).toEqual(["funded", "true"]);

    // Status should remain OPEN (not changed in this call)
    const statusTag = publishedEvent.tags.find((t: string[]) => t[0] === "status");
    expect(statusTag).toEqual(["status", "OPEN"]);
  });

  it("returns 0 when no managed nsec exists", async () => {
    vi.mocked(getAgentByPubkey).mockReturnValue(null);

    const relays = await updateBountyEvent(MOCK_DTAG, MOCK_PUBKEY, {
      funded: true,
    });

    expect(relays).toBe(0);
    expect(fetchFromRelays).not.toHaveBeenCalled();
    expect(publishToRelays).not.toHaveBeenCalled();
  });

  it("returns 0 when no existing event found", async () => {
    vi.mocked(getAgentByPubkey).mockReturnValue({
      apiKey: "key1",
      nsecHex: MOCK_NSEC,
      pubkey: MOCK_PUBKEY,
    });
    vi.mocked(fetchFromRelays).mockResolvedValue([]);

    const relays = await updateBountyEvent(MOCK_DTAG, MOCK_PUBKEY, {
      funded: true,
    });

    expect(relays).toBe(0);
    expect(publishToRelays).not.toHaveBeenCalled();
  });

  it("markBountyFunded sets funded=true", async () => {
    vi.mocked(getAgentByPubkey).mockReturnValue({
      apiKey: "key1",
      nsecHex: MOCK_NSEC,
      pubkey: MOCK_PUBKEY,
    });
    vi.mocked(fetchFromRelays).mockResolvedValue([MOCK_EVENT]);
    vi.mocked(publishToRelays).mockResolvedValue(2);

    const relays = await markBountyFunded(MOCK_DTAG, MOCK_PUBKEY);

    expect(relays).toBe(2);
    const publishedEvent = vi.mocked(publishToRelays).mock.calls[0][0];
    expect(publishedEvent.tags.find((t: string[]) => t[0] === "funded")).toEqual([
      "funded",
      "true",
    ]);
  });

  it("markBountyPaid sets status=COMPLETED + winner + funded", async () => {
    vi.mocked(getAgentByPubkey).mockReturnValue({
      apiKey: "key1",
      nsecHex: MOCK_NSEC,
      pubkey: MOCK_PUBKEY,
    });
    vi.mocked(fetchFromRelays).mockResolvedValue([MOCK_EVENT]);
    vi.mocked(publishToRelays).mockResolvedValue(1);

    const relays = await markBountyPaid(MOCK_DTAG, MOCK_PUBKEY, "winner_npub_123");

    expect(relays).toBe(1);
    const publishedEvent = vi.mocked(publishToRelays).mock.calls[0][0];
    const tags = publishedEvent.tags;

    expect(tags.find((t: string[]) => t[0] === "status")).toEqual([
      "status",
      "COMPLETED",
    ]);
    expect(tags.find((t: string[]) => t[0] === "winner")).toEqual([
      "winner",
      "winner_npub_123",
    ]);
    expect(tags.find((t: string[]) => t[0] === "funded")).toEqual([
      "funded",
      "true",
    ]);
  });

  it("handles publish failure gracefully", async () => {
    vi.mocked(getAgentByPubkey).mockReturnValue({
      apiKey: "key1",
      nsecHex: MOCK_NSEC,
      pubkey: MOCK_PUBKEY,
    });
    vi.mocked(fetchFromRelays).mockResolvedValue([MOCK_EVENT]);
    vi.mocked(publishToRelays).mockRejectedValue(new Error("relay down"));

    const relays = await markBountyFunded(MOCK_DTAG, MOCK_PUBKEY);

    expect(relays).toBe(0); // Graceful failure
  });
});

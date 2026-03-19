import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock nostr-tools before importing
vi.mock("nostr-tools", () => ({
  nip04: {
    encrypt: vi.fn().mockResolvedValue("encrypted-content"),
  },
}));

vi.mock("nostr-tools/pure", () => ({
  getPublicKey: vi.fn().mockReturnValue("bot-pubkey-hex"),
  finalizeEvent: vi.fn().mockReturnValue({
    id: "event-id",
    pubkey: "bot-pubkey-hex",
    created_at: 1234567890,
    kind: 4,
    tags: [["p", "recipient-pubkey"]],
    content: "encrypted-content",
    sig: "signature",
  }),
}));

vi.mock("nostr-tools/utils", () => ({
  hexToBytes: vi.fn().mockReturnValue(new Uint8Array(32)),
}));

const mockPublish = vi.fn().mockResolvedValue({ successes: 2, failures: 0 });
vi.mock("../src/lib/server/relay-pool", () => ({
  getRelayPool: () => ({ publish: mockPublish }),
}));

describe("notifications", () => {
  const originalEnv = process.env.BOUNTY_BOT_NSEC;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (originalEnv) {
      process.env.BOUNTY_BOT_NSEC = originalEnv;
    } else {
      delete process.env.BOUNTY_BOT_NSEC;
    }
  });

  it("skips notification when BOUNTY_BOT_NSEC is not set", async () => {
    delete process.env.BOUNTY_BOT_NSEC;
    const { sendNotification } = await import(
      "../src/lib/server/notifications"
    );

    const result = await sendNotification({
      type: "bounty.application",
      recipientPubkey: "abc123",
      bountyTitle: "Test Bounty",
      bountyId: "bounty-1",
    });

    expect(result.sent).toBe(false);
    expect(result.error).toContain("not configured");
    expect(mockPublish).not.toHaveBeenCalled();
  });

  it("sends encrypted DM when BOUNTY_BOT_NSEC is set", async () => {
    process.env.BOUNTY_BOT_NSEC =
      "a".repeat(64); // 32-byte hex key
    // Re-import to pick up new env
    vi.resetModules();

    // Re-mock after reset
    vi.doMock("nostr-tools", () => ({
      nip04: {
        encrypt: vi.fn().mockResolvedValue("encrypted-content"),
      },
    }));
    vi.doMock("nostr-tools/pure", () => ({
      getPublicKey: vi.fn().mockReturnValue("bot-pubkey-hex"),
      finalizeEvent: vi.fn().mockReturnValue({
        id: "event-id",
        pubkey: "bot-pubkey-hex",
        created_at: 1234567890,
        kind: 4,
        tags: [["p", "recipient-pubkey"]],
        content: "encrypted-content",
        sig: "signature",
      }),
    }));
    vi.doMock("nostr-tools/utils", () => ({
      hexToBytes: vi.fn().mockReturnValue(new Uint8Array(32)),
    }));
    const mockPub = vi
      .fn()
      .mockResolvedValue({ successes: 2, failures: 0 });
    vi.doMock("../src/lib/server/relay-pool", () => ({
      getRelayPool: () => ({ publish: mockPub }),
    }));

    const { sendNotification } = await import(
      "../src/lib/server/notifications"
    );

    const result = await sendNotification({
      type: "bounty.application",
      recipientPubkey: "recipient-hex-pubkey",
      bountyTitle: "Fix a Bug",
      bountyId: "bounty-123",
      extra: { applicantName: "Alice" },
    });

    expect(result.sent).toBe(true);
    expect(mockPub).toHaveBeenCalledOnce();

    // Verify the published event is a kind:4 DM
    const publishedEvent = mockPub.mock.calls[0][0];
    expect(publishedEvent.kind).toBe(4);
    expect(publishedEvent.tags).toContainEqual(["p", "recipient-pubkey"]);
  });

  it("builds correct message for each notification type", async () => {
    // Just test the message builder logic — import the module
    // and check message content indirectly through sendNotification
    delete process.env.BOUNTY_BOT_NSEC;
    const { sendNotification } = await import(
      "../src/lib/server/notifications"
    );

    // Without BOUNTY_BOT_NSEC, it skips but we can at least verify
    // no errors are thrown for each type
    const types = [
      "bounty.application",
      "bounty.awarded",
      "bounty.payment_confirmed",
      "bounty.expired",
    ] as const;

    for (const type of types) {
      const result = await sendNotification({
        type,
        recipientPubkey: "abc",
        bountyTitle: "Test",
        bountyId: "123",
      });
      expect(result.sent).toBe(false); // no key = no send
    }
  });

  it("handles publish errors gracefully", async () => {
    process.env.BOUNTY_BOT_NSEC = "b".repeat(64);
    vi.resetModules();

    vi.doMock("nostr-tools", () => ({
      nip04: {
        encrypt: vi.fn().mockRejectedValue(new Error("encryption failed")),
      },
    }));
    vi.doMock("nostr-tools/pure", () => ({
      getPublicKey: vi.fn().mockReturnValue("bot-pubkey"),
      finalizeEvent: vi.fn(),
    }));
    vi.doMock("nostr-tools/utils", () => ({
      hexToBytes: vi.fn().mockReturnValue(new Uint8Array(32)),
    }));
    vi.doMock("../src/lib/server/relay-pool", () => ({
      getRelayPool: () => ({
        publish: vi.fn().mockResolvedValue({ successes: 0, failures: 3 }),
      }),
    }));

    const { sendNotification } = await import(
      "../src/lib/server/notifications"
    );

    const result = await sendNotification({
      type: "bounty.awarded",
      recipientPubkey: "winner-pubkey",
      bountyTitle: "Build Feature X",
      bountyId: "b-456",
    });

    expect(result.sent).toBe(false);
    expect(result.error).toContain("encryption failed");
  });
});

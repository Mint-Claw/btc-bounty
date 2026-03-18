import { describe, it, expect, vi, beforeEach } from "vitest";
import { RelayPool, type PoolConfig } from "../src/lib/server/relay-pool";

// Mock nostr-tools/relay
vi.mock("nostr-tools/relay", () => ({
  Relay: {
    connect: vi.fn(),
  },
}));

import { Relay } from "nostr-tools/relay";
const mockConnect = vi.mocked(Relay.connect);

function makeMockRelay(url: string, shouldFail = false) {
  return {
    url,
    publish: shouldFail
      ? vi.fn().mockRejectedValue(new Error("publish failed"))
      : vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn().mockImplementation((_filters, callbacks) => {
      // Simulate EOSE after yielding one event
      setTimeout(() => {
        callbacks.onevent?.({
          id: "test-event-id",
          pubkey: "test-pubkey",
          kind: 1,
          content: "test",
          tags: [],
          created_at: Math.floor(Date.now() / 1000),
          sig: "test-sig",
        });
        callbacks.oneose?.();
      }, 10);
      const sub = { close: vi.fn() };
      return sub;
    }),
    close: vi.fn(),
  };
}

describe("RelayPool", () => {
  const testConfig: PoolConfig = {
    relays: ["wss://relay1.test", "wss://relay2.test"],
    connectTimeoutMs: 1000,
    fetchTimeoutMs: 1000,
    maxFailures: 2,
    retryBackoffMs: 100,
    minPublishRelays: 1,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should publish to all connected relays", async () => {
    const relay1 = makeMockRelay("wss://relay1.test");
    const relay2 = makeMockRelay("wss://relay2.test");
    mockConnect.mockImplementation(async (url) => {
      if (url === "wss://relay1.test") return relay1 as unknown as Relay;
      return relay2 as unknown as Relay;
    });

    const pool = new RelayPool(testConfig);
    const event = { id: "e1", pubkey: "pk", kind: 1, content: "", tags: [], created_at: 0, sig: "s" };
    const count = await pool.publish(event as any);

    expect(count).toBe(2);
    expect(relay1.publish).toHaveBeenCalledOnce();
    expect(relay2.publish).toHaveBeenCalledOnce();
    await pool.close();
  });

  it("should succeed if at least minPublishRelays accept", async () => {
    const relay1 = makeMockRelay("wss://relay1.test");
    const relay2 = makeMockRelay("wss://relay2.test", true); // fails
    mockConnect.mockImplementation(async (url) => {
      if (url === "wss://relay1.test") return relay1 as unknown as Relay;
      return relay2 as unknown as Relay;
    });

    const pool = new RelayPool(testConfig);
    const event = { id: "e1", pubkey: "pk", kind: 1, content: "", tags: [], created_at: 0, sig: "s" };
    const count = await pool.publish(event as any);

    expect(count).toBe(1);
    await pool.close();
  });

  it("should throw if no relay accepts the event", async () => {
    mockConnect.mockRejectedValue(new Error("connection refused"));

    const pool = new RelayPool({ ...testConfig, minPublishRelays: 1 });
    const event = { id: "e1", pubkey: "pk", kind: 1, content: "", tags: [], created_at: 0, sig: "s" };

    await expect(pool.publish(event as any)).rejects.toThrow(/Published to 0/);
    await pool.close();
  });

  it("should reuse connections on subsequent publishes", async () => {
    const relay1 = makeMockRelay("wss://relay1.test");
    mockConnect.mockResolvedValue(relay1 as unknown as Relay);

    const pool = new RelayPool({ ...testConfig, relays: ["wss://relay1.test"] });
    const event = { id: "e1", pubkey: "pk", kind: 1, content: "", tags: [], created_at: 0, sig: "s" };

    await pool.publish(event as any);
    await pool.publish(event as any);

    // Should only connect once
    expect(mockConnect).toHaveBeenCalledTimes(1);
    await pool.close();
  });

  it("should fetch events from first healthy relay", async () => {
    const relay1 = makeMockRelay("wss://relay1.test");
    mockConnect.mockResolvedValue(relay1 as unknown as Relay);

    const pool = new RelayPool({ ...testConfig, relays: ["wss://relay1.test"] });
    const events = await pool.fetch({ kinds: [1], limit: 10 });

    expect(events.length).toBe(1);
    expect(events[0].content).toBe("test");
    await pool.close();
  });

  it("should track relay health", async () => {
    const relay1 = makeMockRelay("wss://relay1.test");
    mockConnect.mockResolvedValue(relay1 as unknown as Relay);

    const pool = new RelayPool({ ...testConfig, relays: ["wss://relay1.test"] });
    const event = { id: "e1", pubkey: "pk", kind: 1, content: "", tags: [], created_at: 0, sig: "s" };
    await pool.publish(event as any);

    const health = pool.getHealth();
    expect(health).toHaveLength(1);
    expect(health[0].connected).toBe(true);
    expect(health[0].totalPublished).toBe(1);
    expect(health[0].consecutiveFailures).toBe(0);
    await pool.close();
  });

  it("should deprioritize relays with consecutive failures", async () => {
    const relay1 = makeMockRelay("wss://relay1.test", true); // always fails
    const relay2 = makeMockRelay("wss://relay2.test");
    mockConnect.mockImplementation(async (url) => {
      if (url === "wss://relay1.test") return relay1 as unknown as Relay;
      return relay2 as unknown as Relay;
    });

    const pool = new RelayPool(testConfig);
    const event = { id: "e1", pubkey: "pk", kind: 1, content: "", tags: [], created_at: 0, sig: "s" };

    // Publish twice — relay1 fails both times
    await pool.publish(event as any);
    await pool.publish(event as any);

    const health = pool.getHealth();
    const h1 = health.find((h) => h.url === "wss://relay1.test")!;
    const h2 = health.find((h) => h.url === "wss://relay2.test")!;
    // relay1 fails on publish, gets reconnected each time (backoff is 100ms in test config)
    expect(h1.consecutiveFailures).toBeGreaterThanOrEqual(1);
    expect(h2.totalPublished).toBe(2);
    await pool.close();
  });

  it("should close all connections", async () => {
    const relay1 = makeMockRelay("wss://relay1.test");
    mockConnect.mockResolvedValue(relay1 as unknown as Relay);

    const pool = new RelayPool({ ...testConfig, relays: ["wss://relay1.test"] });
    const event = { id: "e1", pubkey: "pk", kind: 1, content: "", tags: [], created_at: 0, sig: "s" };
    await pool.publish(event as any);
    await pool.close();

    expect(relay1.close).toHaveBeenCalledOnce();
    const health = pool.getHealth();
    expect(health[0].connected).toBe(false);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { relayHealthSummary, type RelayHealth } from "@/lib/server/relay-health";

describe("relayHealthSummary", () => {
  const makeRelay = (
    url: string,
    status: RelayHealth["status"],
    latencyMs: number | null = null
  ): RelayHealth => ({
    url,
    status,
    latencyMs,
    nip11: null,
    checkedAt: new Date().toISOString(),
  });

  it("all online — healthy", () => {
    const results = [
      makeRelay("wss://relay.damus.io", "online", 120),
      makeRelay("wss://nos.lol", "online", 80),
      makeRelay("wss://relay.nostr.band", "online", 200),
    ];
    const summary = relayHealthSummary(results);

    expect(summary.total).toBe(3);
    expect(summary.online).toBe(3);
    expect(summary.offline).toBe(0);
    expect(summary.healthy).toBe(true);
    expect(summary.avgLatencyMs).toBeGreaterThan(0);
  });

  it("majority online — still healthy", () => {
    const results = [
      makeRelay("wss://relay.damus.io", "online", 120),
      makeRelay("wss://nos.lol", "offline"),
      makeRelay("wss://relay.nostr.band", "online", 200),
      makeRelay("wss://relay.snort.social", "degraded", 500),
    ];
    const summary = relayHealthSummary(results);

    expect(summary.healthy).toBe(true);
    expect(summary.online).toBe(2);
    expect(summary.degraded).toBe(1);
    expect(summary.offline).toBe(1);
  });

  it("majority offline — unhealthy", () => {
    const results = [
      makeRelay("wss://relay.damus.io", "offline"),
      makeRelay("wss://nos.lol", "offline"),
      makeRelay("wss://relay.nostr.band", "offline"),
      makeRelay("wss://relay.snort.social", "online", 100),
    ];
    const summary = relayHealthSummary(results);

    expect(summary.healthy).toBe(false);
    expect(summary.offline).toBe(3);
  });

  it("empty relay list", () => {
    const summary = relayHealthSummary([]);
    expect(summary.total).toBe(0);
    expect(summary.healthy).toBe(true); // 0 >= ceil(0/2) = 0
  });

  it("calculates average latency from connected relays only", () => {
    const results = [
      makeRelay("wss://relay.damus.io", "online", 100),
      makeRelay("wss://nos.lol", "offline"), // null latency
      makeRelay("wss://relay.nostr.band", "online", 300),
    ];
    const summary = relayHealthSummary(results);

    expect(summary.avgLatencyMs).toBe(200); // (100 + 300) / 2
  });

  it("all degraded — still healthy (majority non-offline)", () => {
    const results = [
      makeRelay("wss://relay.damus.io", "degraded", 800),
      makeRelay("wss://nos.lol", "degraded", 900),
    ];
    const summary = relayHealthSummary(results);

    expect(summary.healthy).toBe(true);
    expect(summary.degraded).toBe(2);
  });
});

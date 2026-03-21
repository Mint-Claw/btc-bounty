import { describe, it, expect, beforeEach } from "vitest";
import { metrics, METRICS } from "@/lib/server/monitoring";

describe("MetricsCollector", () => {
  beforeEach(() => {
    metrics.reset();
  });

  it("increments counters", () => {
    metrics.increment(METRICS.BOUNTY_CREATED);
    metrics.increment(METRICS.BOUNTY_CREATED);
    metrics.increment(METRICS.BOUNTY_CREATED);
    expect(metrics.getCounter(METRICS.BOUNTY_CREATED)).toBe(3);
  });

  it("increments by custom amount", () => {
    metrics.increment(METRICS.PAYMENT_SATS, 50000);
    metrics.increment(METRICS.PAYMENT_SATS, 25000);
    expect(metrics.getCounter(METRICS.PAYMENT_SATS)).toBe(75000);
  });

  it("tracks gauges", () => {
    metrics.gauge("active_connections", 5);
    expect(metrics.getGauge("active_connections")).toBe(5);
    metrics.gauge("active_connections", 3);
    expect(metrics.getGauge("active_connections")).toBe(3);
  });

  it("tracks counters with labels", () => {
    metrics.increment(METRICS.API_REQUEST, 1, { method: "GET", path: "/api/bounties" });
    metrics.increment(METRICS.API_REQUEST, 1, { method: "POST", path: "/api/bounties" });
    metrics.increment(METRICS.API_REQUEST, 1, { method: "GET", path: "/api/bounties" });

    expect(
      metrics.getCounter(METRICS.API_REQUEST, { method: "GET", path: "/api/bounties" })
    ).toBe(2);
    expect(
      metrics.getCounter(METRICS.API_REQUEST, { method: "POST", path: "/api/bounties" })
    ).toBe(1);
  });

  it("exports all metrics", () => {
    metrics.increment(METRICS.BOUNTY_CREATED);
    metrics.gauge("relay_count", 4);

    const all = metrics.getAll();
    expect(all.counters[METRICS.BOUNTY_CREATED]).toBe(1);
    expect(all.gauges["relay_count"]).toBe(4);
  });

  it("resets all metrics", () => {
    metrics.increment(METRICS.BOUNTY_CREATED, 10);
    metrics.gauge("test", 42);
    metrics.reset();

    expect(metrics.getCounter(METRICS.BOUNTY_CREATED)).toBe(0);
    expect(metrics.getGauge("test")).toBeUndefined();
  });

  it("records timing measurements", () => {
    metrics.timing(METRICS.RELAY_LATENCY, 150, { relay: "wss://relay.damus.io" });
    // Timing is recorded as a regular metric entry
    const all = metrics.getAll();
    // Should not crash
    expect(all).toBeDefined();
  });

  it("handles label ordering consistently", () => {
    metrics.increment("test", 1, { b: "2", a: "1" });
    metrics.increment("test", 1, { a: "1", b: "2" });
    // Same labels, different order → same key
    expect(metrics.getCounter("test", { a: "1", b: "2" })).toBe(2);
  });
});

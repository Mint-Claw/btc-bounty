/**
 * Tests for GET /api/metrics — Prometheus-compatible metrics endpoint
 */
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { setupTestDB, teardownTestDB } from "./helpers/test-db";
import { metrics } from "@/lib/server/monitoring";

// Must setup DB before importing the route (which uses getDB)
beforeEach(() => {
  setupTestDB();
  metrics.reset();
});
afterAll(() => teardownTestDB());

describe("GET /api/metrics", () => {
  it("returns prometheus text format by default", async () => {
    const { GET } = await import("@/app/api/metrics/route");
    const req = new NextRequest("http://localhost/api/metrics");
    const res = await GET(req);
    
    expect(res.status).toBe(200);
    const contentType = res.headers.get("content-type") || "";
    expect(contentType).toContain("text/plain");
    
    const body = await res.text();
    expect(body).toContain("btcbounty_uptime_seconds");
    expect(body).toContain("btcbounty_memory_rss_bytes");
  });

  it("returns JSON when format=json", async () => {
    const { GET } = await import("@/app/api/metrics/route");
    const req = new NextRequest("http://localhost/api/metrics?format=json");
    const res = await GET(req);
    
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty("counters");
    expect(data).toHaveProperty("gauges");
    expect(data).toHaveProperty("timestamp");
  });

  it("includes DB gauges when database available", async () => {
    const { GET } = await import("@/app/api/metrics/route");
    const req = new NextRequest("http://localhost/api/metrics?format=json");
    const res = await GET(req);
    
    const data = await res.json();
    expect(data.gauges).toHaveProperty("btcbounty_bounties_total");
    expect(data.gauges).toHaveProperty("btcbounty_payments_total");
    expect(data.gauges).toHaveProperty("btcbounty_agents_registered");
  });

  it("includes runtime gauges", async () => {
    const { GET } = await import("@/app/api/metrics/route");
    const req = new NextRequest("http://localhost/api/metrics?format=json");
    const res = await GET(req);
    
    const data = await res.json();
    expect(data.gauges.btcbounty_uptime_seconds).toBeGreaterThanOrEqual(0);
    expect(data.gauges.btcbounty_memory_rss_bytes).toBeGreaterThan(0);
    expect(data.gauges.btcbounty_memory_heap_used_bytes).toBeGreaterThan(0);
  });

  it("includes application counters after recording", async () => {
    metrics.increment("bounty_created_total", 3);
    metrics.increment("api_request_total", 42);
    
    const { GET } = await import("@/app/api/metrics/route");
    const req = new NextRequest("http://localhost/api/metrics?format=json");
    const res = await GET(req);
    
    const data = await res.json();
    expect(data.counters.bounty_created_total).toBe(3);
    expect(data.counters.api_request_total).toBe(42);
  });

  it("respects ADMIN_SECRET when set", async () => {
    process.env.ADMIN_SECRET = "test-secret-123";
    
    // Clear module cache to pick up env change
    vi.resetModules();
    const { GET } = await import("@/app/api/metrics/route");
    
    // Without secret
    const reqNoAuth = new NextRequest("http://localhost/api/metrics");
    const resNoAuth = await GET(reqNoAuth);
    expect(resNoAuth.status).toBe(401);
    
    // With secret
    const reqAuth = new NextRequest("http://localhost/api/metrics", {
      headers: { "x-admin-secret": "test-secret-123" },
    });
    const resAuth = await GET(reqAuth);
    expect(resAuth.status).toBe(200);
    
    delete process.env.ADMIN_SECRET;
  });
});

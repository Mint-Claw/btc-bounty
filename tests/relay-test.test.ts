import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/relays/test/route";
import { NextRequest } from "next/server";

// Mock auth to always pass (returns an identity object)
vi.mock("@/lib/server/auth", () => ({
  authenticateRequest: () => ({ name: "test-agent", role: "admin" }),
}));

// Mock relay pool
const mockHealth = [
  {
    url: "wss://relay.test.io",
    connected: true,
    lastSuccess: Date.now(),
    lastFailure: 0,
    consecutiveFailures: 0,
    totalPublished: 5,
    totalFetched: 10,
    avgLatencyMs: 120,
  },
  {
    url: "wss://relay2.test.io",
    connected: false,
    lastSuccess: 0,
    lastFailure: Date.now(),
    consecutiveFailures: 3,
    totalPublished: 0,
    totalFetched: 0,
    avgLatencyMs: 0,
  },
];

vi.mock("@/lib/server/relay-pool", () => ({
  getRelayPool: () => ({
    getHealth: () => mockHealth,
    ensureConnected: async (url: string) => {
      if (url === "wss://relay2.test.io") {
        throw new Error("Connection refused");
      }
    },
  }),
}));

function makeRequest(): NextRequest {
  return new NextRequest("http://localhost:3000/api/relays/test", {
    method: "POST",
  });
}

describe("POST /api/relays/test", () => {
  it("returns relay connectivity results", async () => {
    const response = await POST(makeRequest());
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.totalRelays).toBe(2);
    expect(data.reachable).toBe(1);
    expect(data.unreachable).toBe(1);
    expect(data.results).toHaveLength(2);
  });

  it("marks reachable relays correctly", async () => {
    const response = await POST(makeRequest());
    const data = await response.json();

    const reachable = data.results.find(
      (r: { url: string }) => r.url === "wss://relay.test.io",
    );
    expect(reachable.reachable).toBe(true);
    expect(reachable.latencyMs).toBeTypeOf("number");
  });

  it("marks unreachable relays with error", async () => {
    const response = await POST(makeRequest());
    const data = await response.json();

    const unreachable = data.results.find(
      (r: { url: string }) => r.url === "wss://relay2.test.io",
    );
    expect(unreachable.reachable).toBe(false);
    expect(unreachable.error).toContain("Connection refused");
  });

  it("includes timestamp and timing", async () => {
    const response = await POST(makeRequest());
    const data = await response.json();

    expect(data.timestamp).toBeDefined();
    expect(data.totalTestMs).toBeTypeOf("number");
  });
});

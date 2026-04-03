/**
 * Tests for registration rate limiting.
 * These tests use the REAL rate limiter (not mocked).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock DB + signing but NOT rate-limit
const mockInsertApiKey = vi.fn();
vi.mock("@/lib/server/db", () => ({
  insertApiKey: (...args: unknown[]) => mockInsertApiKey(...args),
  getApiKeyByHash: vi.fn(),
  touchApiKeyUsage: vi.fn(),
}));

vi.mock("@/lib/server/signing", () => ({
  generateKeypair: () => ({
    nsec: "a".repeat(64),
    pubkey: "b".repeat(64),
  }),
  pubkeyFromNsec: (nsec: string) => nsec.replace(/a/g, "b"),
}));

import { POST } from "@/app/api/agents/register/route";
import { NextRequest } from "next/server";

function makeRequest(ip = "10.0.0.1") {
  return new NextRequest("http://localhost:3000/api/agents/register", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": ip,
    },
    body: JSON.stringify({ name: "test-agent" }),
  });
}

describe("Registration rate limiting", () => {
  beforeEach(() => {
    mockInsertApiKey.mockClear();
  });

  it("allows first registration", async () => {
    // Use unique IP per test to avoid cross-test rate limit pollution
    const res = await POST(makeRequest("192.168.100.1"));
    expect(res.status).toBe(201);
  });

  it("returns 429 after exceeding limit from same IP", async () => {
    const ip = "192.168.200.1";
    // Exhaust the limit (5 per hour)
    for (let i = 0; i < 5; i++) {
      const res = await POST(makeRequest(ip));
      expect(res.status).toBe(201);
    }

    // 6th should be rate limited
    const res = await POST(makeRequest(ip));
    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json.error).toContain("Too many");
    expect(res.headers.get("Retry-After")).toBeTruthy();
  });

  it("allows registrations from different IPs independently", async () => {
    const res1 = await POST(makeRequest("10.1.1.1"));
    const res2 = await POST(makeRequest("10.2.2.2"));
    expect(res1.status).toBe(201);
    expect(res2.status).toBe(201);
  });
});

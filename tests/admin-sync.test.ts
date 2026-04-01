/**
 * Tests for POST /api/admin/sync
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock all server deps
vi.mock("@/lib/server/bounty-sync", () => ({
  syncBounties: vi.fn(),
  syncBountiesIncremental: vi.fn(),
}));
vi.mock("@/lib/server/logger", () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

import { POST } from "@/app/api/admin/sync/route";
import { syncBounties, syncBountiesIncremental } from "@/lib/server/bounty-sync";
import { NextRequest } from "next/server";

function makeRequest(
  params: Record<string, string> = {},
  headers: Record<string, string> = {},
): NextRequest {
  const url = new URL("http://localhost:3000/api/admin/sync");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new NextRequest(url, {
    method: "POST",
    headers,
  });
}

describe("POST /api/admin/sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.ADMIN_SECRET;
  });

  it("runs incremental sync by default", async () => {
    vi.mocked(syncBountiesIncremental).mockResolvedValue({
      fetched: 10,
      cached: 8,
      errors: 0,
      durationMs: 450,
    });

    const res = await POST(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.mode).toBe("incremental");
    expect(json.fetched).toBe(10);
    expect(json.cached).toBe(8);
    expect(syncBountiesIncremental).toHaveBeenCalledWith(200);
    expect(syncBounties).not.toHaveBeenCalled();
  });

  it("runs full sync when ?full=true", async () => {
    vi.mocked(syncBounties).mockResolvedValue({
      fetched: 50,
      cached: 45,
      errors: 2,
      durationMs: 1200,
    });

    const res = await POST(makeRequest({ full: "true" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.mode).toBe("full");
    expect(json.fetched).toBe(50);
    expect(syncBounties).toHaveBeenCalledWith(0, 500);
  });

  it("requires auth when ADMIN_SECRET is set", async () => {
    process.env.ADMIN_SECRET = "test-secret-123";

    const res = await POST(makeRequest());
    expect(res.status).toBe(401);

    const authed = await POST(
      makeRequest({}, { "x-admin-secret": "test-secret-123" }),
    );
    // Will fail because sync is not mocked for this call path, but auth passes
    vi.mocked(syncBountiesIncremental).mockResolvedValue({
      fetched: 0,
      cached: 0,
      errors: 0,
      durationMs: 10,
    });
    const authedRes = await POST(
      makeRequest({}, { "x-admin-secret": "test-secret-123" }),
    );
    expect(authedRes.status).toBe(200);
  });

  it("returns 500 on sync failure", async () => {
    vi.mocked(syncBountiesIncremental).mockRejectedValue(
      new Error("Relay timeout"),
    );

    const res = await POST(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toBe("Relay timeout");
  });

  it("reports errors in sync result", async () => {
    vi.mocked(syncBountiesIncremental).mockResolvedValue({
      fetched: 5,
      cached: 3,
      errors: 2,
      durationMs: 300,
    });

    const res = await POST(makeRequest());
    const json = await res.json();

    expect(json.errors).toBe(2);
    expect(json.cached).toBe(3);
  });
});

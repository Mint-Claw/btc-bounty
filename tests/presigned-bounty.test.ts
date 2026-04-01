/**
 * Tests for pre-signed bounty event submission.
 *
 * Power users can submit fully-signed NIP-01 events
 * without needing an API key or managed nsec.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock external deps
vi.mock("@/lib/server/relay", () => ({
  publishToRelays: vi.fn().mockResolvedValue(3),
  fetchFromRelays: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/server/btcpay", () => ({
  createInvoice: vi.fn(),
}));
vi.mock("@/lib/server/payments", () => ({
  createPayment: vi.fn(),
}));
vi.mock("@/lib/server/webhooks", () => ({
  deliverWebhook: vi.fn(),
}));
vi.mock("@/lib/server/toku-sync", () => ({
  TokuSyncService: vi.fn().mockImplementation(() => ({
    listBounty: vi.fn().mockResolvedValue(undefined),
  })),
}));
vi.mock("@/lib/server/toku", () => ({
  shouldListOnToku: vi.fn().mockReturnValue(false),
}));
vi.mock("@/lib/server/db", () => ({
  listCachedBounties: vi.fn().mockReturnValue([]),
  searchCachedBounties: vi.fn().mockReturnValue([]),
  cacheBountyEvent: vi.fn(),
}));
vi.mock("@/lib/server/auth", () => ({
  authenticateRequest: vi.fn().mockReturnValue(null),
}));

// Mock nostr verify
const mockVerifyBountyEvent = vi.fn();
vi.mock("@/lib/nostr/verify", () => ({
  verifyNostrEvent: vi.fn().mockReturnValue({ valid: true }),
  verifyBountyEvent: (...args: unknown[]) => mockVerifyBountyEvent(...args),
}));

import { POST } from "@/app/api/bounties/route";
import { NextRequest } from "next/server";
import { publishToRelays } from "@/lib/server/relay";

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:3000/api/bounties", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const VALID_EVENT = {
  id: "a".repeat(64),
  pubkey: "b".repeat(64),
  created_at: Math.floor(Date.now() / 1000),
  kind: 30402,
  tags: [
    ["d", "test-bounty-123"],
    ["title", "Fix NOSTR relay crash"],
    ["reward", "50000"],
    ["status", "OPEN"],
    ["category", "code"],
  ],
  content: "Detailed description of the bounty",
  sig: "c".repeat(128),
};

describe("Pre-signed bounty submission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts a valid pre-signed event", async () => {
    mockVerifyBountyEvent.mockReturnValue({
      valid: true,
      checks: { structure: true, id: true, signature: true, timestamp: true },
      errors: [],
      bounty: { title: "Fix NOSTR relay crash", amount: "50000", currency: "sats", dTag: "test-bounty-123" },
    });

    const res = await POST(makeRequest(VALID_EVENT));
    expect(res.status).toBe(201);

    const json = await res.json();
    expect(json.id).toBe("a".repeat(64));
    expect(json.pubkey).toBe("b".repeat(64));
    expect(json.dTag).toBe("test-bounty-123");
    expect(json.preSigned).toBe(true);
    expect(json.relaysPublished).toBe(3);
  });

  it("publishes the event to relays as-is", async () => {
    mockVerifyBountyEvent.mockReturnValue({
      valid: true,
      checks: { structure: true, id: true, signature: true, timestamp: true },
      errors: [],
    });

    await POST(makeRequest(VALID_EVENT));
    expect(publishToRelays).toHaveBeenCalledWith(expect.objectContaining({
      id: "a".repeat(64),
      sig: "c".repeat(128),
    }));
  });

  it("rejects event with invalid signature", async () => {
    mockVerifyBountyEvent.mockReturnValue({
      valid: false,
      checks: { structure: true, id: true, signature: false, timestamp: true },
      errors: ["Schnorr signature verification failed"],
    });

    const res = await POST(makeRequest(VALID_EVENT));
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.error).toContain("Invalid pre-signed event");
    expect(json.details).toContain("Schnorr signature verification failed");
  });

  it("rejects event with invalid structure", async () => {
    mockVerifyBountyEvent.mockReturnValue({
      valid: false,
      checks: { structure: false, id: false, signature: false, timestamp: false },
      errors: ["Invalid event structure — must conform to NIP-01"],
    });

    const badEvent = { ...VALID_EVENT, id: "not-hex" };
    const res = await POST(makeRequest(badEvent));
    expect(res.status).toBe(400);
  });

  it("rejects event missing d-tag", async () => {
    mockVerifyBountyEvent.mockReturnValue({
      valid: true,
      checks: { structure: true, id: true, signature: true, timestamp: true },
      errors: [],
    });

    const noD = {
      ...VALID_EVENT,
      tags: [["title", "No d-tag"], ["reward", "1000"]],
    };
    const res = await POST(makeRequest(noD));
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.error).toContain("missing required tags");
  });

  it("rejects event missing title tag", async () => {
    mockVerifyBountyEvent.mockReturnValue({
      valid: true,
      checks: { structure: true, id: true, signature: true, timestamp: true },
      errors: [],
    });

    const noTitle = {
      ...VALID_EVENT,
      tags: [["d", "test-123"], ["reward", "1000"]],
    };
    const res = await POST(makeRequest(noTitle));
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.error).toContain("missing required tags");
  });

  it("does NOT require X-API-Key for pre-signed events", async () => {
    mockVerifyBountyEvent.mockReturnValue({
      valid: true,
      checks: { structure: true, id: true, signature: true, timestamp: true },
      errors: [],
    });

    // No X-API-Key header
    const req = new NextRequest("http://localhost:3000/api/bounties", {
      method: "POST",
      body: JSON.stringify(VALID_EVENT),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
  });

  it("falls through to managed auth for non-event bodies", async () => {
    // Body without sig/id/pubkey/kind → not a pre-signed event
    const managedBody = {
      title: "Test",
      content: "Test",
      rewardSats: 1000,
      category: "code",
    };

    const res = await POST(makeRequest(managedBody));
    // Should get 401 since authenticateRequest returns null
    expect(res.status).toBe(401);
  });

  it("includes verification checks in error response", async () => {
    mockVerifyBountyEvent.mockReturnValue({
      valid: false,
      checks: { structure: true, id: false, signature: true, timestamp: true },
      errors: ["Event ID mismatch: expected abc, got def"],
    });

    const res = await POST(makeRequest(VALID_EVENT));
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.checks).toBeDefined();
    expect(json.checks.id).toBe(false);
    expect(json.checks.structure).toBe(true);
  });
});

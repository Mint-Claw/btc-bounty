/**
 * Tests for POST /api/bounties/:id/award/:npub
 *
 * Covers: auth, ownership check, Nostr publish, escrow payout flow.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────

const mockAuthAgent = {
  pubkey: "poster_pubkey_hex_abc123",
  nsecHex: "nsec_hex_for_signing",
};

vi.mock("@/lib/server/auth", () => ({
  authenticateRequest: vi.fn(() => mockAuthAgent),
}));

const mockSignedEvent = {
  id: "signed_award_event_id",
  pubkey: mockAuthAgent.pubkey,
  kind: 30050,
  content: "Fix the search bug",
  tags: [
    ["d", "bounty-123"],
    ["status", "COMPLETED"],
    ["winner", "winner_npub_hex"],
  ],
  created_at: Math.floor(Date.now() / 1000),
  sig: "mock_sig",
};

vi.mock("@/lib/server/signing", () => ({
  signEventServer: vi.fn(() => mockSignedEvent),
}));

const mockBountyEvent = {
  id: "original_bounty_event_id",
  pubkey: mockAuthAgent.pubkey,
  content: "Fix the search bug",
  tags: [
    ["d", "bounty-123"],
    ["title", "Fix Search Bug"],
    ["reward", "50000"],
    ["status", "OPEN"],
  ],
  created_at: Math.floor(Date.now() / 1000) - 3600,
};

vi.mock("@/lib/server/relay", () => ({
  publishToRelays: vi.fn(async () => 3),
  fetchFromRelays: vi.fn(async () => [mockBountyEvent]),
}));

vi.mock("@/lib/server/btcpay", () => ({
  createPayout: vi.fn(async () => ({
    id: "payout-001",
    state: "AwaitingApproval",
  })),
}));

vi.mock("@/lib/server/payments", () => ({
  getPaymentByBountyId: vi.fn(async () => ({
    id: "pay-001",
    status: "funded",
    amountSats: 50000,
    platformFeeSats: 500,
  })),
  setPayoutInfo: vi.fn(async () => {}),
  updatePaymentStatus: vi.fn(async () => {}),
}));

// ── Import after mocks ──────────────────────────────

import { POST } from "@/app/api/bounties/[id]/award/[npub]/route";
import { authenticateRequest } from "@/lib/server/auth";
import { fetchFromRelays, publishToRelays } from "@/lib/server/relay";
import { createPayout } from "@/lib/server/btcpay";
import { getPaymentByBountyId, setPayoutInfo } from "@/lib/server/payments";

function makeRequest(body?: Record<string, unknown>): NextRequest {
  return new Request("http://localhost/api/bounties/abc/award/winner", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": "test-key" },
    body: body ? JSON.stringify(body) : JSON.stringify({}),
  }) as unknown as NextRequest;
}

import { NextRequest } from "next/server";

const defaultParams = Promise.resolve({
  id: "original_bounty_event_id",
  npub: "winner_npub_hex",
});

beforeEach(() => {
  vi.clearAllMocks();
  // Re-set default mocks
  vi.mocked(authenticateRequest).mockReturnValue(mockAuthAgent);
  vi.mocked(fetchFromRelays).mockResolvedValue([mockBountyEvent] as any);
  vi.mocked(publishToRelays).mockResolvedValue(3);
  vi.mocked(getPaymentByBountyId).mockResolvedValue({
    id: "pay-001",
    status: "funded",
    amountSats: 50000,
    platformFeeSats: 500,
  } as any);
});

// ── Tests ────────────────────────────────────────────

describe("POST /api/bounties/:id/award/:npub", () => {
  it("returns 401 without auth", async () => {
    vi.mocked(authenticateRequest).mockReturnValue(null);
    const res = await POST(makeRequest(), { params: defaultParams });
    expect(res.status).toBe(401);
  });

  it("returns 404 when bounty not found", async () => {
    vi.mocked(fetchFromRelays).mockResolvedValue([]);
    const res = await POST(makeRequest(), { params: defaultParams });
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toContain("not found");
  });

  it("returns 403 when non-owner tries to award", async () => {
    vi.mocked(fetchFromRelays).mockResolvedValue([
      { ...mockBountyEvent, pubkey: "different_pubkey" },
    ] as any);
    const res = await POST(makeRequest(), { params: defaultParams });
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toContain("Only the bounty poster");
  });

  it("awards bounty and publishes to relays", async () => {
    const res = await POST(makeRequest(), { params: defaultParams });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("COMPLETED");
    expect(data.winner).toBe("winner_npub_hex");
    expect(data.relaysPublished).toBe(3);
    expect(publishToRelays).toHaveBeenCalledOnce();
  });

  it("triggers payout when lightning address provided and escrow funded", async () => {
    const res = await POST(
      makeRequest({ lightning: "winner@getalby.com" }),
      { params: defaultParams },
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.payout).toBeDefined();
    expect(data.payout.payoutId).toBe("payout-001");
    expect(data.payout.amountSats).toBe(49500); // 50000 - 500 fee
    expect(createPayout).toHaveBeenCalledWith(
      expect.objectContaining({
        destination: "winner@getalby.com",
        amount: 50000,
        bountyId: "bounty-123",
        winnerPubkey: "winner_npub_hex",
      }),
    );
    expect(setPayoutInfo).toHaveBeenCalledOnce();
  });

  it("returns payout error when no lightning address", async () => {
    const res = await POST(makeRequest({}), { params: defaultParams });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.payout.error).toContain("No Lightning address");
  });

  it("handles payout failure gracefully", async () => {
    vi.mocked(createPayout).mockRejectedValue(new Error("BTCPay unreachable"));
    const res = await POST(
      makeRequest({ lightning: "winner@getalby.com" }),
      { params: defaultParams },
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.payout.error).toContain("Payout failed");
    expect(data.status).toBe("COMPLETED"); // Bounty still awarded even if payout fails
  });

  it("skips payout when escrow not funded", async () => {
    vi.mocked(getPaymentByBountyId).mockResolvedValue({
      id: "pay-001",
      status: "pending",
      amountSats: 50000,
      platformFeeSats: 500,
    } as any);
    const res = await POST(
      makeRequest({ lightning: "winner@getalby.com" }),
      { params: defaultParams },
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.payout).toBeUndefined();
    expect(createPayout).not.toHaveBeenCalled();
  });
});

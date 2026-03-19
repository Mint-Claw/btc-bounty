import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock modules before imports
vi.mock("@/lib/server/auth", () => ({
  authenticateRequest: vi.fn(),
}));
vi.mock("@/lib/server/signing", () => ({
  signEventServer: vi.fn(),
}));
vi.mock("@/lib/server/relay", () => ({
  publishToRelays: vi.fn(),
  fetchFromRelays: vi.fn(),
}));
vi.mock("@/lib/server/webhooks", () => ({
  deliverWebhook: vi.fn(),
}));
vi.mock("@/lib/nostr/schema", () => ({
  BOUNTY_KIND: 30050,
  parseBountyEvent: vi.fn(),
}));

import { POST, GET } from "@/app/api/bounties/[id]/submit/route";
import { authenticateRequest } from "@/lib/server/auth";
import { signEventServer } from "@/lib/server/signing";
import { publishToRelays, fetchFromRelays } from "@/lib/server/relay";
import { parseBountyEvent } from "@/lib/nostr/schema";
import { deliverWebhook } from "@/lib/server/webhooks";

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/bounties/abc123/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": "test" },
    body: JSON.stringify(body),
  });
}

const mockParams = Promise.resolve({ id: "abc123" });

describe("POST /api/bounties/:id/submit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects unauthenticated requests", async () => {
    vi.mocked(authenticateRequest).mockReturnValue(null);
    const res = await POST(makeRequest({}) as any, { params: mockParams });
    expect(res.status).toBe(401);
  });

  it("rejects missing fields", async () => {
    vi.mocked(authenticateRequest).mockReturnValue({ id: "agent1" } as any);
    const res = await POST(
      makeRequest({ applicantPubkey: "abc" }) as any,
      { params: mockParams },
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("Missing required fields");
  });

  it("returns 404 for unknown bounty", async () => {
    vi.mocked(authenticateRequest).mockReturnValue({ id: "agent1" } as any);
    vi.mocked(fetchFromRelays).mockResolvedValue([]);

    const res = await POST(
      makeRequest({
        applicantPubkey: "pubkey1",
        proofUrl: "https://github.com/pr/123",
        description: "Completed the work",
      }) as any,
      { params: mockParams },
    );
    expect(res.status).toBe(404);
  });

  it("submits successfully for valid bounty", async () => {
    vi.mocked(authenticateRequest).mockReturnValue({ id: "agent1" } as any);
    vi.mocked(fetchFromRelays).mockResolvedValueOnce([
      { id: "abc123", kind: 30050, content: "", tags: [], pubkey: "creator1", created_at: 0, sig: "" },
    ]);
    vi.mocked(parseBountyEvent).mockReturnValue({
      title: "Fix login bug",
      status: "open",
      creatorPubkey: "creator1",
    } as any);
    vi.mocked(fetchFromRelays).mockResolvedValueOnce([]); // applications check
    vi.mocked(signEventServer).mockResolvedValue({
      id: "sub123",
      kind: 30079,
      content: "",
      tags: [],
      pubkey: "server",
      created_at: 0,
      sig: "",
    });
    vi.mocked(publishToRelays).mockResolvedValue(3);
    vi.mocked(deliverWebhook).mockResolvedValue(undefined);

    const res = await POST(
      makeRequest({
        applicantPubkey: "pubkey1",
        proofUrl: "https://github.com/pr/123",
        description: "Completed the work",
      }) as any,
      { params: mockParams },
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.submissionEventId).toBe("sub123");
    expect(deliverWebhook).toHaveBeenCalledWith("bounty.submitted", expect.any(Object));
  });

  it("rejects submission for completed bounty", async () => {
    vi.mocked(authenticateRequest).mockReturnValue({ id: "agent1" } as any);
    vi.mocked(fetchFromRelays).mockResolvedValueOnce([
      { id: "abc123", kind: 30050, content: "", tags: [], pubkey: "creator1", created_at: 0, sig: "" },
    ]);
    vi.mocked(parseBountyEvent).mockReturnValue({
      title: "Fix login bug",
      status: "completed",
      creatorPubkey: "creator1",
    } as any);

    const res = await POST(
      makeRequest({
        applicantPubkey: "pubkey1",
        proofUrl: "https://github.com/pr/123",
        description: "Completed the work",
      }) as any,
      { params: mockParams },
    );
    expect(res.status).toBe(409);
  });
});

describe("GET /api/bounties/:id/submit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty submissions list", async () => {
    vi.mocked(fetchFromRelays).mockResolvedValue([]);
    const req = new Request("http://localhost/api/bounties/abc123/submit");
    const res = await GET(req as any, { params: mockParams });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.count).toBe(0);
    expect(json.submissions).toEqual([]);
  });

  it("parses submission events correctly", async () => {
    vi.mocked(fetchFromRelays).mockResolvedValue([
      {
        id: "sub1",
        kind: 30079,
        content: JSON.stringify({
          description: "Here is my work",
          proofUrl: "https://github.com/pr/1",
          submittedAt: "2026-03-19T00:00:00.000Z",
        }),
        tags: [
          ["e", "abc123", "", "root"],
          ["p", "submitter1", "", "submitter"],
          ["proof", "https://github.com/pr/1"],
        ],
        pubkey: "server",
        created_at: 1742342400,
        sig: "",
      },
    ]);

    const req = new Request("http://localhost/api/bounties/abc123/submit");
    const res = await GET(req as any, { params: mockParams });
    const json = await res.json();
    expect(json.count).toBe(1);
    expect(json.submissions[0].submitterPubkey).toBe("submitter1");
    expect(json.submissions[0].proofUrl).toBe("https://github.com/pr/1");
    expect(json.submissions[0].description).toBe("Here is my work");
  });
});

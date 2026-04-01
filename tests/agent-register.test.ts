/**
 * Tests for POST /api/agents/register
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock DB
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

function makeRequest(body?: Record<string, unknown>, headers?: Record<string, string>) {
  const req = new NextRequest("http://localhost:3000/api/agents/register", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return req;
}

describe("POST /api/agents/register", () => {
  const origEnv = process.env.REGISTRATION_SECRET;

  beforeEach(() => {
    mockInsertApiKey.mockClear();
    delete process.env.REGISTRATION_SECRET;
  });

  afterEach(() => {
    if (origEnv !== undefined) {
      process.env.REGISTRATION_SECRET = origEnv;
    } else {
      delete process.env.REGISTRATION_SECRET;
    }
  });

  it("registers a new agent and returns API key", async () => {
    const res = await POST(makeRequest({ name: "test-bot" }));
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.apiKey).toBeTruthy();
    expect(json.apiKey.length).toBeGreaterThanOrEqual(30);
    expect(json.pubkey).toBe("b".repeat(64));
    expect(json.name).toBe("test-bot");
    expect(json.message).toContain("Save your API key");
    expect(json.usage.header).toBe("X-API-Key");
  });

  it("stores hashed key in DB", async () => {
    await POST(makeRequest({ name: "db-agent" }));

    expect(mockInsertApiKey).toHaveBeenCalledOnce();
    const call = mockInsertApiKey.mock.calls[0][0];
    expect(call.agentNpub).toBe("b".repeat(64));
    expect(call.apiKeyHash).toBeTruthy();
    expect(call.apiKeyHash).not.toBe(call.managedNsecEncrypted); // hash ≠ nsec
    expect(call.managedNsecEncrypted).toBe("a".repeat(64));
  });

  it("defaults name to 'agent' when not provided", async () => {
    const res = await POST(makeRequest({}));
    const json = await res.json();
    expect(json.name).toBe("agent");
  });

  it("handles empty body gracefully", async () => {
    const req = new NextRequest("http://localhost:3000/api/agents/register", {
      method: "POST",
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
  });

  it("rejects when REGISTRATION_SECRET is set and not provided", async () => {
    process.env.REGISTRATION_SECRET = "my-secret-123";

    const res = await POST(makeRequest({ name: "blocked" }));
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error).toContain("invite-only");
    expect(mockInsertApiKey).not.toHaveBeenCalled();
  });

  it("accepts when correct REGISTRATION_SECRET is provided", async () => {
    process.env.REGISTRATION_SECRET = "my-secret-123";

    const res = await POST(
      makeRequest({ name: "invited" }, { "x-registration-secret": "my-secret-123" }),
    );
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.name).toBe("invited");
  });

  it("rejects wrong REGISTRATION_SECRET", async () => {
    process.env.REGISTRATION_SECRET = "my-secret-123";

    const res = await POST(
      makeRequest({ name: "wrong" }, { "x-registration-secret": "wrong-secret" }),
    );
    expect(res.status).toBe(403);
  });

  it("truncates long names to 64 chars", async () => {
    const longName = "x".repeat(200);
    const res = await POST(makeRequest({ name: longName }));
    const json = await res.json();
    expect(json.name.length).toBe(64);
  });

  it("returns 500 when DB insert fails", async () => {
    mockInsertApiKey.mockImplementationOnce(() => {
      throw new Error("DB write error");
    });

    const res = await POST(makeRequest({ name: "fail" }));
    expect(res.status).toBe(500);
  });
});

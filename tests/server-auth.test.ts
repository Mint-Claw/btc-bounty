import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { authenticateRequest, resetKeyCache } from "../src/lib/server/auth";
import { generateKeypair, pubkeyFromNsec } from "../src/lib/server/signing";

describe("authenticateRequest", () => {
  const kp = generateKeypair();

  beforeEach(() => {
    resetKeyCache();
    vi.stubEnv("AGENT_API_KEYS", `test-key-123:${kp.nsec}`);
  });

  afterEach(() => {
    resetKeyCache();
    vi.unstubAllEnvs();
  });

  it("returns agent identity for valid key", () => {
    const req = new Request("http://localhost/api/test", {
      headers: { "x-api-key": "test-key-123" },
    });
    const agent = authenticateRequest(req);
    expect(agent).not.toBeNull();
    expect(agent!.apiKey).toBe("test-key-123");
    expect(agent!.nsecHex).toBe(kp.nsec);
    expect(agent!.pubkey).toBe(pubkeyFromNsec(kp.nsec));
  });

  it("returns null for missing key", () => {
    const req = new Request("http://localhost/api/test");
    expect(authenticateRequest(req)).toBeNull();
  });

  it("returns null for invalid key", () => {
    const req = new Request("http://localhost/api/test", {
      headers: { "x-api-key": "wrong-key" },
    });
    expect(authenticateRequest(req)).toBeNull();
  });

  it("handles multiple keys", () => {
    resetKeyCache();
    const kp2 = generateKeypair();
    vi.stubEnv("AGENT_API_KEYS", `key1:${kp.nsec},key2:${kp2.nsec}`);

    const req1 = new Request("http://localhost/api/test", {
      headers: { "x-api-key": "key1" },
    });
    const req2 = new Request("http://localhost/api/test", {
      headers: { "x-api-key": "key2" },
    });

    expect(authenticateRequest(req1)!.pubkey).toBe(pubkeyFromNsec(kp.nsec));
    expect(authenticateRequest(req2)!.pubkey).toBe(pubkeyFromNsec(kp2.nsec));
  });

  it("handles empty env var", () => {
    resetKeyCache();
    vi.stubEnv("AGENT_API_KEYS", "");
    const req = new Request("http://localhost/api/test", {
      headers: { "x-api-key": "any" },
    });
    expect(authenticateRequest(req)).toBeNull();
  });
});

/**
 * Tests for upgraded auth module (SQLite + env var dual-source).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDB, teardownTestDB } from "./helpers/test-db";
import { hashApiKey, authenticateRequest, verifyApiKey, resetKeyCache } from "@/lib/server/auth";
import { insertApiKey, getDB } from "@/lib/server/db";

describe("Auth (SQLite-backed)", () => {
  beforeAll(() => setupTestDB());
  afterAll(() => teardownTestDB());

  const testNsec = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";
  const testApiKey = "test-api-key-sqlite-12345678901234";
  const testPubkey = "test-pubkey-hex";

  beforeEach(() => {
    resetKeyCache();
    // Clean up api_keys table
    getDB().prepare("DELETE FROM api_keys").run();
  });

  it("hashApiKey produces consistent SHA-256 hex", () => {
    const h1 = hashApiKey("my-key");
    const h2 = hashApiKey("my-key");
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64); // SHA-256 = 32 bytes = 64 hex chars
  });

  it("hashApiKey produces different hashes for different keys", () => {
    const h1 = hashApiKey("key-a");
    const h2 = hashApiKey("key-b");
    expect(h1).not.toBe(h2);
  });

  it("authenticates via SQLite when key is registered", () => {
    const hash = hashApiKey(testApiKey);
    insertApiKey({
      id: "test-id-1",
      agentNpub: testPubkey,
      apiKeyHash: hash,
      managedNsecEncrypted: testNsec,
    });

    const req = new Request("http://localhost:3000/api/bounties", {
      headers: { "X-API-Key": testApiKey },
    });

    const agent = authenticateRequest(req);
    expect(agent).not.toBeNull();
    expect(agent!.pubkey).toBe(testPubkey);
    expect(agent!.nsecHex).toBe(testNsec);
  });

  it("returns null for unregistered key", () => {
    const req = new Request("http://localhost:3000/api/bounties", {
      headers: { "X-API-Key": "nonexistent-key" },
    });

    const agent = authenticateRequest(req);
    expect(agent).toBeNull();
  });

  it("returns null for missing header", () => {
    const req = new Request("http://localhost:3000/api/bounties");
    const agent = authenticateRequest(req);
    expect(agent).toBeNull();
  });

  it("verifyApiKey works for SQLite keys", () => {
    const hash = hashApiKey("verify-key-123");
    insertApiKey({
      id: "test-id-2",
      agentNpub: testPubkey,
      apiKeyHash: hash,
      managedNsecEncrypted: testNsec,
    });

    const agent = verifyApiKey("verify-key-123");
    expect(agent).not.toBeNull();
    expect(agent!.pubkey).toBe(testPubkey);
  });

  it("falls back to env var keys", () => {
    const origEnv = process.env.AGENT_API_KEYS;
    process.env.AGENT_API_KEYS = `env-key-abc:${testNsec}`;
    resetKeyCache();

    const req = new Request("http://localhost:3000/api/bounties", {
      headers: { "X-API-Key": "env-key-abc" },
    });

    const agent = authenticateRequest(req);
    expect(agent).not.toBeNull();
    expect(agent!.nsecHex).toBe(testNsec);

    // Restore
    if (origEnv !== undefined) {
      process.env.AGENT_API_KEYS = origEnv;
    } else {
      delete process.env.AGENT_API_KEYS;
    }
    resetKeyCache();
  });

  it("SQLite takes priority over env var", () => {
    const sqliteNsec = "1111111111111111111111111111111111111111111111111111111111111111";
    const envNsec = "2222222222222222222222222222222222222222222222222222222222222222";

    // Register same API key in both sources
    const hash = hashApiKey("dual-key");
    insertApiKey({
      id: "test-id-3",
      agentNpub: "sqlite-pubkey",
      apiKeyHash: hash,
      managedNsecEncrypted: sqliteNsec,
    });

    const origEnv = process.env.AGENT_API_KEYS;
    process.env.AGENT_API_KEYS = `dual-key:${envNsec}`;
    resetKeyCache();

    const agent = verifyApiKey("dual-key");
    expect(agent).not.toBeNull();
    expect(agent!.nsecHex).toBe(sqliteNsec); // SQLite wins

    if (origEnv !== undefined) {
      process.env.AGENT_API_KEYS = origEnv;
    } else {
      delete process.env.AGENT_API_KEYS;
    }
    resetKeyCache();
  });
});

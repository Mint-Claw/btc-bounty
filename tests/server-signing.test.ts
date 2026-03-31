/**
 * Tests for server-side NOSTR event signing.
 * Verifies keypair generation, pubkey derivation, and event signatures
 * using nostr-tools primitives.
 */
import { describe, it, expect } from "vitest";
import { verifyEvent } from "nostr-tools/pure";
import {
  generateKeypair,
  pubkeyFromNsec,
  signEventServer,
} from "@/lib/server/signing";

describe("Server-side NOSTR signing", () => {
  // ─── Key generation ────────────────────────────────

  it("generates valid keypair with hex-encoded keys", () => {
    const kp = generateKeypair();

    expect(kp.nsec).toHaveLength(64); // 32 bytes hex
    expect(kp.pubkey).toHaveLength(64); // 32 bytes hex
    expect(kp.nsec).toMatch(/^[0-9a-f]{64}$/);
    expect(kp.pubkey).toMatch(/^[0-9a-f]{64}$/);
  });

  it("generates unique keypairs each time", () => {
    const kp1 = generateKeypair();
    const kp2 = generateKeypair();

    expect(kp1.nsec).not.toBe(kp2.nsec);
    expect(kp1.pubkey).not.toBe(kp2.pubkey);
  });

  it("derives correct pubkey from nsec", () => {
    const kp = generateKeypair();
    const derived = pubkeyFromNsec(kp.nsec);
    expect(derived).toBe(kp.pubkey);
  });

  it("pubkeyFromNsec is deterministic", () => {
    const kp = generateKeypair();
    expect(pubkeyFromNsec(kp.nsec)).toBe(pubkeyFromNsec(kp.nsec));
  });

  // ─── Event signing ────────────────────────────────

  it("signs a kind:1 text note", () => {
    const kp = generateKeypair();
    const signed = signEventServer(kp.nsec, {
      kind: 1,
      content: "Hello NOSTR from server-side signing!",
      tags: [],
    });

    expect(signed.id).toHaveLength(64);
    expect(signed.pubkey).toBe(kp.pubkey);
    expect(signed.kind).toBe(1);
    expect(signed.content).toBe("Hello NOSTR from server-side signing!");
    expect(signed.tags).toEqual([]);
    expect(signed.sig).toHaveLength(128); // 64 bytes hex
    expect(signed.created_at).toBeGreaterThan(0);
  });

  it("signs a kind:30402 bounty event with tags", () => {
    const kp = generateKeypair();
    const tags = [
      ["d", "test-bounty-id"],
      ["title", "Fix the bug"],
      ["reward", "50000"],
      ["status", "OPEN"],
      ["t", "bitcoin"],
      ["t", "typescript"],
    ];

    const signed = signEventServer(kp.nsec, {
      kind: 30402,
      content: "Detailed bounty description here",
      tags,
    });

    expect(signed.kind).toBe(30402);
    expect(signed.tags).toEqual(tags);
    expect(signed.pubkey).toBe(kp.pubkey);
    expect(signed.sig).toBeTruthy();
  });

  it("produces cryptographically valid signature (verifiable)", () => {
    const kp = generateKeypair();
    const signed = signEventServer(kp.nsec, {
      kind: 1,
      content: "Verifiable event",
      tags: [["test", "true"]],
    });

    // nostr-tools verifyEvent checks id hash + schnorr sig
    const valid = verifyEvent(signed);
    expect(valid).toBe(true);
  });

  it("different content produces different ids", () => {
    const kp = generateKeypair();

    const e1 = signEventServer(kp.nsec, {
      kind: 1,
      content: "Message A",
      tags: [],
      created_at: 1700000000,
    });

    const e2 = signEventServer(kp.nsec, {
      kind: 1,
      content: "Message B",
      tags: [],
      created_at: 1700000000,
    });

    expect(e1.id).not.toBe(e2.id);
    expect(e1.sig).not.toBe(e2.sig);
  });

  it("same content + same timestamp = same id (deterministic hashing)", () => {
    const kp = generateKeypair();
    const template = {
      kind: 1,
      content: "Deterministic",
      tags: [["d", "test"]],
      created_at: 1700000000,
    };

    const e1 = signEventServer(kp.nsec, template);
    const e2 = signEventServer(kp.nsec, template);

    // ID is hash of (pubkey, created_at, kind, tags, content) — deterministic
    expect(e1.id).toBe(e2.id);
    // Signature may differ (schnorr has randomness) but both verify
    expect(verifyEvent(e1)).toBe(true);
    expect(verifyEvent(e2)).toBe(true);
  });

  it("uses current timestamp when created_at not provided", () => {
    const kp = generateKeypair();
    const before = Math.floor(Date.now() / 1000);

    const signed = signEventServer(kp.nsec, {
      kind: 1,
      content: "auto timestamp",
      tags: [],
    });

    const after = Math.floor(Date.now() / 1000);
    expect(signed.created_at).toBeGreaterThanOrEqual(before);
    expect(signed.created_at).toBeLessThanOrEqual(after);
  });

  it("respects explicit created_at", () => {
    const kp = generateKeypair();
    const ts = 1609459200; // 2021-01-01

    const signed = signEventServer(kp.nsec, {
      kind: 1,
      content: "past event",
      tags: [],
      created_at: ts,
    });

    expect(signed.created_at).toBe(ts);
  });

  it("handles empty content", () => {
    const kp = generateKeypair();
    const signed = signEventServer(kp.nsec, {
      kind: 1,
      content: "",
      tags: [],
    });

    expect(signed.content).toBe("");
    expect(verifyEvent(signed)).toBe(true);
  });

  it("handles complex nested tags", () => {
    const kp = generateKeypair();
    const tags = [
      ["d", "complex-event"],
      ["p", "abc123", "wss://relay.example.com", "author"],
      ["e", "def456", "wss://relay.example.com", "reply"],
      ["amount", "50000", "sats"],
      ["expiration", String(Math.floor(Date.now() / 1000) + 86400)],
    ];

    const signed = signEventServer(kp.nsec, {
      kind: 30402,
      content: "Complex bounty",
      tags,
    });

    expect(signed.tags).toEqual(tags);
    expect(verifyEvent(signed)).toBe(true);
  });

  it("handles unicode content", () => {
    const kp = generateKeypair();
    const signed = signEventServer(kp.nsec, {
      kind: 1,
      content: "⚡ Lightning bounty: 修复错误 🎉 prix 50000 sats",
      tags: [],
    });

    expect(signed.content).toContain("⚡");
    expect(signed.content).toContain("修复错误");
    expect(verifyEvent(signed)).toBe(true);
  });

  it("different keys sign the same content differently", () => {
    const kp1 = generateKeypair();
    const kp2 = generateKeypair();
    const template = {
      kind: 1,
      content: "Same content",
      tags: [],
      created_at: 1700000000,
    };

    const e1 = signEventServer(kp1.nsec, template);
    const e2 = signEventServer(kp2.nsec, template);

    expect(e1.pubkey).not.toBe(e2.pubkey);
    expect(e1.id).not.toBe(e2.id); // id includes pubkey
    expect(verifyEvent(e1)).toBe(true);
    expect(verifyEvent(e2)).toBe(true);
  });
});

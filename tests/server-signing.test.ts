import { describe, it, expect } from "vitest";
import {
  generateKeypair,
  pubkeyFromNsec,
  signEventServer,
} from "../src/lib/server/signing";

describe("generateKeypair", () => {
  it("returns valid hex nsec and pubkey", () => {
    const kp = generateKeypair();
    expect(kp.nsec).toMatch(/^[0-9a-f]{64}$/);
    expect(kp.pubkey).toMatch(/^[0-9a-f]{64}$/);
  });

  it("generates unique keypairs", () => {
    const a = generateKeypair();
    const b = generateKeypair();
    expect(a.nsec).not.toBe(b.nsec);
    expect(a.pubkey).not.toBe(b.pubkey);
  });
});

describe("pubkeyFromNsec", () => {
  it("derives pubkey from nsec", () => {
    const kp = generateKeypair();
    expect(pubkeyFromNsec(kp.nsec)).toBe(kp.pubkey);
  });
});

describe("signEventServer", () => {
  it("signs a valid NOSTR event", () => {
    const kp = generateKeypair();
    const signed = signEventServer(kp.nsec, {
      kind: 1,
      content: "hello world",
      tags: [],
    });

    expect(signed.id).toMatch(/^[0-9a-f]{64}$/);
    expect(signed.pubkey).toBe(kp.pubkey);
    expect(signed.sig).toMatch(/^[0-9a-f]{128}$/);
    expect(signed.kind).toBe(1);
    expect(signed.content).toBe("hello world");
    expect(signed.created_at).toBeGreaterThan(0);
  });

  it("signs bounty events with correct kind", () => {
    const kp = generateKeypair();
    const signed = signEventServer(kp.nsec, {
      kind: 30402,
      content: "bounty description",
      tags: [
        ["d", "test-uuid"],
        ["title", "Fix a bug"],
        ["reward", "50000", "sats"],
      ],
    });

    expect(signed.kind).toBe(30402);
    expect(signed.tags).toHaveLength(3);
    expect(signed.tags[0]).toEqual(["d", "test-uuid"]);
  });

  it("uses provided created_at", () => {
    const kp = generateKeypair();
    const signed = signEventServer(kp.nsec, {
      kind: 1,
      content: "test",
      tags: [],
      created_at: 1700000000,
    });
    expect(signed.created_at).toBe(1700000000);
  });
});

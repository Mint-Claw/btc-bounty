import { describe, it, expect } from "vitest";
import { verifyNostrEvent, verifyBountyEvent } from "../src/lib/nostr/verify";
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools/pure";

function makeEvent(overrides: Partial<{
  kind: number;
  content: string;
  tags: string[][];
  created_at: number;
}> = {}) {
  const sk = generateSecretKey();
  const event = finalizeEvent(
    {
      kind: overrides.kind ?? 1,
      content: overrides.content ?? "test",
      tags: overrides.tags ?? [],
      created_at: overrides.created_at ?? Math.floor(Date.now() / 1000),
    },
    sk
  );
  return { event, sk, pubkey: getPublicKey(sk) };
}

describe("verifyNostrEvent", () => {
  it("verifies a valid event", () => {
    const { event } = makeEvent();
    const result = verifyNostrEvent(event);
    expect(result.valid).toBe(true);
    expect(result.checks.structure).toBe(true);
    expect(result.checks.id).toBe(true);
    expect(result.checks.signature).toBe(true);
    expect(result.checks.timestamp).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects null/undefined", () => {
    expect(verifyNostrEvent(null).valid).toBe(false);
    expect(verifyNostrEvent(undefined).valid).toBe(false);
    expect(verifyNostrEvent("not an object").valid).toBe(false);
  });

  it("rejects malformed structure", () => {
    const result = verifyNostrEvent({ id: "short", pubkey: "bad" });
    expect(result.valid).toBe(false);
    expect(result.checks.structure).toBe(false);
    expect(result.errors[0]).toContain("structure");
  });

  it("detects tampered event ID", () => {
    const { event } = makeEvent();
    const tampered = { ...event, id: "a".repeat(64) };
    const result = verifyNostrEvent(tampered);
    expect(result.valid).toBe(false);
    expect(result.checks.id).toBe(false);
    expect(result.errors.some((e) => e.includes("ID mismatch"))).toBe(true);
  });

  it("detects tampered signature", () => {
    const { event } = makeEvent();
    // JSON round-trip strips nostr-tools' verifiedSymbol cache
    const clean = JSON.parse(JSON.stringify(event));
    // Flip first char of sig to invalidate it
    clean.sig = clean.sig.replace(/^./, clean.sig[0] === "a" ? "b" : "a");
    const result = verifyNostrEvent(clean);
    expect(result.valid).toBe(false);
    expect(result.checks.signature).toBe(false);
  });

  it("detects tampered content", () => {
    const { event } = makeEvent({ content: "original" });
    // JSON round-trip to strip verifiedSymbol cache
    const tampered = JSON.parse(JSON.stringify(event));
    tampered.content = "modified";
    const result = verifyNostrEvent(tampered);
    expect(result.valid).toBe(false);
    // ID won't match because content changed
    expect(result.checks.id).toBe(false);
  });

  it("rejects events too far in the future", () => {
    const futureTime = Math.floor(Date.now() / 1000) + 3600; // 1 hour ahead
    const { event } = makeEvent({ created_at: futureTime });
    const result = verifyNostrEvent(event);
    expect(result.valid).toBe(false);
    expect(result.checks.timestamp).toBe(false);
    expect(result.errors.some((e) => e.includes("future"))).toBe(true);
  });

  it("rejects events that are too old", () => {
    const oldTime = Math.floor(Date.now() / 1000) - 200000; // ~2.3 days ago
    const { event } = makeEvent({ created_at: oldTime });
    const result = verifyNostrEvent(event);
    expect(result.valid).toBe(false);
    expect(result.checks.timestamp).toBe(false);
    expect(result.errors.some((e) => e.includes("too old"))).toBe(true);
  });

  it("allows old events with skipTimestamp", () => {
    const oldTime = Math.floor(Date.now() / 1000) - 200000;
    const { event } = makeEvent({ created_at: oldTime });
    const result = verifyNostrEvent(event, { skipTimestamp: true });
    expect(result.checks.timestamp).toBe(true);
    expect(result.valid).toBe(true);
  });

  it("allows custom maxAge", () => {
    const oneHourAgo = Math.floor(Date.now() / 1000) - 3600;
    const { event } = makeEvent({ created_at: oneHourAgo });
    // Default 24h should pass
    expect(verifyNostrEvent(event).valid).toBe(true);
    // Custom 30-minute max should fail
    expect(verifyNostrEvent(event, { maxAge: 1800 }).valid).toBe(false);
  });

  it("returns event metadata on success", () => {
    const { event, pubkey } = makeEvent({ content: "hello" });
    const result = verifyNostrEvent(event);
    expect(result.event?.id).toBe(event.id);
    expect(result.event?.pubkey).toBe(pubkey);
    expect(result.event?.kind).toBe(1);
  });
});

describe("verifyBountyEvent", () => {
  it("verifies a valid bounty event", () => {
    const { event } = makeEvent({
      kind: 30402,
      content: "Build a Lightning wallet",
      tags: [
        ["d", "bounty-001"],
        ["title", "Build a Lightning wallet"],
        ["reward", "100000"],
        ["currency", "sats"],
      ],
    });
    const result = verifyBountyEvent(event);
    expect(result.valid).toBe(true);
    expect(result.bounty?.title).toBe("Build a Lightning wallet");
    expect(result.bounty?.amount).toBe("100000");
    expect(result.bounty?.currency).toBe("sats");
    expect(result.bounty?.dTag).toBe("bounty-001");
  });

  it("rejects wrong event kind", () => {
    const { event } = makeEvent({
      kind: 1, // Not a bounty kind
      tags: [
        ["d", "test"],
        ["title", "test"],
      ],
    });
    const result = verifyBountyEvent(event);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("kind 30402"))).toBe(true);
  });

  it("rejects bounty without title", () => {
    const { event } = makeEvent({
      kind: 30402,
      tags: [["d", "test"]],
    });
    const result = verifyBountyEvent(event);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("title"))).toBe(true);
  });

  it("rejects bounty without d-tag", () => {
    const { event } = makeEvent({
      kind: 30402,
      tags: [["title", "test bounty"]],
    });
    const result = verifyBountyEvent(event);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("d-tag"))).toBe(true);
  });

  it("accepts subject tag as title fallback", () => {
    const { event } = makeEvent({
      kind: 30402,
      tags: [
        ["d", "test"],
        ["subject", "Fallback title"],
        ["reward", "50000"],
      ],
    });
    const result = verifyBountyEvent(event);
    expect(result.valid).toBe(true);
    expect(result.bounty?.title).toBe("Fallback title");
  });

  it("defaults currency to sats", () => {
    const { event } = makeEvent({
      kind: 30402,
      tags: [
        ["d", "test"],
        ["title", "test"],
        ["reward", "10000"],
      ],
    });
    const result = verifyBountyEvent(event);
    expect(result.bounty?.currency).toBe("sats");
  });
});

import { describe, it, expect } from "vitest";
import {
  buildBidReplyContent,
  buildReplyTags,
} from "../src/lib/server/toku-nostr-bridge";
import type { TokuApplicant } from "../src/lib/server/toku-sync";

// ─── buildBidReplyContent ────────────────────────────────────

describe("buildBidReplyContent", () => {
  const applicant: TokuApplicant = {
    tokuAgentId: "agent-xyz-123",
    message: "I can complete this bounty in 2 hours. I have experience with TypeScript and NOSTR.",
    priceCents: 4500,
    bidId: "bid-abc-456",
  };

  it("includes the bid amount in USD", () => {
    const content = buildBidReplyContent(applicant);
    expect(content).toContain("$45.00 USD");
  });

  it("includes the applicant message", () => {
    const content = buildBidReplyContent(applicant);
    expect(content).toContain("I can complete this bounty in 2 hours");
  });

  it("includes the toku agent ID", () => {
    const content = buildBidReplyContent(applicant);
    expect(content).toContain("agent-xyz-123");
  });

  it("includes the bid ID", () => {
    const content = buildBidReplyContent(applicant);
    expect(content).toContain("bid-abc-456");
  });

  it("indicates it came from toku.agency", () => {
    const content = buildBidReplyContent(applicant);
    expect(content).toContain("toku.agency");
  });

  it("handles empty message", () => {
    const content = buildBidReplyContent({
      ...applicant,
      message: "",
    });
    expect(content).toContain("(no message)");
  });

  it("formats cents correctly for small amounts", () => {
    const content = buildBidReplyContent({
      ...applicant,
      priceCents: 99,
    });
    expect(content).toContain("$0.99 USD");
  });

  it("formats cents correctly for large amounts", () => {
    const content = buildBidReplyContent({
      ...applicant,
      priceCents: 100000,
    });
    expect(content).toContain("$1000.00 USD");
  });
});

// ─── buildReplyTags ──────────────────────────────────────────

describe("buildReplyTags", () => {
  const eventId = "abc123def456";
  const pubkey = "deadbeef01234567";
  const dTag = "my-bounty-1";

  it("includes root e-tag pointing to bounty event", () => {
    const tags = buildReplyTags(eventId, pubkey, dTag);
    const eTag = tags.find((t) => t[0] === "e");
    expect(eTag).toBeDefined();
    expect(eTag![1]).toBe(eventId);
    expect(eTag![3]).toBe("root");
  });

  it("includes p-tag for bounty poster", () => {
    const tags = buildReplyTags(eventId, pubkey, dTag);
    const pTag = tags.find((t) => t[0] === "p");
    expect(pTag).toBeDefined();
    expect(pTag![1]).toBe(pubkey);
  });

  it("includes addressable a-tag for kind:30402", () => {
    const tags = buildReplyTags(eventId, pubkey, dTag);
    const aTag = tags.find((t) => t[0] === "a");
    expect(aTag).toBeDefined();
    expect(aTag![1]).toBe(`30402:${pubkey}:${dTag}`);
  });

  it("includes toku-bridge topic tag", () => {
    const tags = buildReplyTags(eventId, pubkey, dTag);
    const tTag = tags.find((t) => t[0] === "t");
    expect(tTag).toBeDefined();
    expect(tTag![1]).toBe("toku-bridge");
  });

  it("uses relay hint when provided", () => {
    const tags = buildReplyTags(eventId, pubkey, dTag, "wss://relay.damus.io");
    const eTag = tags.find((t) => t[0] === "e");
    expect(eTag![2]).toBe("wss://relay.damus.io");
  });

  it("uses empty relay hint by default", () => {
    const tags = buildReplyTags(eventId, pubkey, dTag);
    const eTag = tags.find((t) => t[0] === "e");
    expect(eTag![2]).toBe("");
  });
});

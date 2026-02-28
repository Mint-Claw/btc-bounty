import { describe, it, expect } from "vitest";
import {
  parseBountyEvent,
  buildBountyTags,
  BOUNTY_KIND,
  type BountyCategory,
} from "@/lib/nostr/schema";

describe("parseBountyEvent", () => {
  const validEvent = {
    id: "abc123",
    pubkey: "pub123",
    content: "Full description here",
    created_at: 1700000000,
    tags: [
      ["d", "test-bounty"],
      ["title", "Test Bounty"],
      ["summary", "Short summary"],
      ["reward", "50000", "sats"],
      ["status", "OPEN"],
      ["category", "code"],
      ["lightning", "user@getalby.com"],
      ["t", "bitcoin"],
      ["t", "nostr"],
    ],
  };

  it("parses a valid bounty event", () => {
    const bounty = parseBountyEvent(validEvent);
    expect(bounty).not.toBeNull();
    expect(bounty!.id).toBe("abc123");
    expect(bounty!.title).toBe("Test Bounty");
    expect(bounty!.rewardSats).toBe(50000);
    expect(bounty!.status).toBe("OPEN");
    expect(bounty!.category).toBe("code");
    expect(bounty!.lightning).toBe("user@getalby.com");
    expect(bounty!.tags).toEqual(["bitcoin", "nostr"]);
    expect(bounty!.createdAt).toBe(1700000000);
  });

  it("returns null for missing d-tag", () => {
    const event = {
      ...validEvent,
      tags: [["title", "No d-tag"]],
    };
    expect(parseBountyEvent(event)).toBeNull();
  });

  it("returns null for missing title", () => {
    const event = {
      ...validEvent,
      tags: [["d", "has-d-no-title"]],
    };
    expect(parseBountyEvent(event)).toBeNull();
  });

  it("defaults status to OPEN if missing", () => {
    const event = {
      ...validEvent,
      tags: [
        ["d", "no-status"],
        ["title", "No Status"],
      ],
    };
    const bounty = parseBountyEvent(event);
    expect(bounty!.status).toBe("OPEN");
  });

  it("defaults category to other if missing", () => {
    const event = {
      ...validEvent,
      tags: [
        ["d", "no-cat"],
        ["title", "No Cat"],
      ],
    };
    const bounty = parseBountyEvent(event);
    expect(bounty!.category).toBe("other");
  });

  it("handles reward of 0 when tag is missing", () => {
    const event = {
      ...validEvent,
      tags: [
        ["d", "free"],
        ["title", "Free Bounty"],
      ],
    };
    const bounty = parseBountyEvent(event);
    expect(bounty!.rewardSats).toBe(0);
  });
});

describe("buildBountyTags", () => {
  it("builds correct tag array", () => {
    const tags = buildBountyTags({
      dTag: "test-slug",
      title: "My Bounty",
      summary: "Summary",
      rewardSats: 100000,
      category: "design" as BountyCategory,
      lightning: "me@wallet.com",
      tags: ["design", "logo"],
    });

    expect(tags.find((t) => t[0] === "d")?.[1]).toBe("test-slug");
    expect(tags.find((t) => t[0] === "title")?.[1]).toBe("My Bounty");
    expect(tags.find((t) => t[0] === "reward")?.[1]).toBe("100000");
    expect(tags.find((t) => t[0] === "status")?.[1]).toBe("OPEN");
    expect(tags.filter((t) => t[0] === "t").map((t) => t[1])).toEqual([
      "design",
      "logo",
    ]);
  });

  it("includes optional image and expiry", () => {
    const tags = buildBountyTags({
      dTag: "with-extras",
      title: "Extras",
      summary: "",
      rewardSats: 10000,
      category: "other" as BountyCategory,
      lightning: "x@y.com",
      tags: [],
      expiry: 1700000000,
      image: "https://example.com/img.png",
    });

    expect(tags.find((t) => t[0] === "expiry")?.[1]).toBe("1700000000");
    expect(tags.find((t) => t[0] === "image")?.[1]).toBe(
      "https://example.com/img.png"
    );
  });
});

describe("BOUNTY_KIND", () => {
  it("is 30402 (NIP-99 classified listing)", () => {
    expect(BOUNTY_KIND).toBe(30402);
  });
});

describe("content sanitization", () => {
  it("DOMPurify is available for import", async () => {
    // Verify DOMPurify can be imported (used in bounty detail page)
    const DOMPurify = await import("dompurify");
    expect(DOMPurify).toBeDefined();
  });
});

describe("nip19 encoding", () => {
  it("encodes a pubkey to npub format", async () => {
    const { nip19 } = await import("nostr-tools");
    const hex =
      "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d";
    const npub = nip19.npubEncode(hex);
    expect(npub).toMatch(/^npub1/);
    // Roundtrip
    const decoded = nip19.decode(npub);
    expect(decoded.data).toBe(hex);
  });
});

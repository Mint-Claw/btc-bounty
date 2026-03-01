import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  BOUNTY_KIND,
  type BountyCategory,
  buildBountyTags,
  parseBountyEvent,
} from "../src/lib/nostr/schema";

describe("buildBountyTags", () => {
  const baseParams = {
    dTag: "test-uuid-123",
    title: "Build a CLI tool",
    summary: "Simple CLI in Rust",
    rewardSats: 100000,
    category: "code" as BountyCategory,
    lightning: "satoshi@getalby.com",
    tags: ["rust", "cli"],
  };

  it("generates required tags", () => {
    const tags = buildBountyTags(baseParams);
    expect(tags.find((t) => t[0] === "d")?.[1]).toBe("test-uuid-123");
    expect(tags.find((t) => t[0] === "title")?.[1]).toBe("Build a CLI tool");
    expect(tags.find((t) => t[0] === "reward")).toEqual([
      "reward",
      "100000",
      "sats",
    ]);
    expect(tags.find((t) => t[0] === "status")?.[1]).toBe("OPEN");
    expect(tags.find((t) => t[0] === "lightning")?.[1]).toBe(
      "satoshi@getalby.com",
    );
    expect(tags.find((t) => t[0] === "category")?.[1]).toBe("code");
  });

  it("includes topic tags", () => {
    const tags = buildBountyTags(baseParams);
    const tTags = tags.filter((t) => t[0] === "t");
    expect(tTags.length).toBe(2);
    expect(tTags.map((t) => t[1])).toContain("rust");
    expect(tTags.map((t) => t[1])).toContain("cli");
  });

  it("includes optional expiry", () => {
    const tags = buildBountyTags({ ...baseParams, expiry: 1735689600 });
    expect(tags.find((t) => t[0] === "expiry")?.[1]).toBe("1735689600");
  });

  it("includes optional image", () => {
    const tags = buildBountyTags({
      ...baseParams,
      image: "https://example.com/logo.png",
    });
    expect(tags.find((t) => t[0] === "image")?.[1]).toBe(
      "https://example.com/logo.png",
    );
  });

  it("omits expiry and image when not provided", () => {
    const tags = buildBountyTags(baseParams);
    const expiryTag = tags.find((t) => t[0] === "expiry");
    const imageTag = tags.find((t) => t[0] === "image");
    // Should either be absent or have empty value
    if (expiryTag) expect(expiryTag[1]).toBe("");
    if (imageTag) expect(imageTag[1]).toBe("");
  });
});

describe("roundtrip: build → parse", () => {
  it("roundtrips a bounty through tags and back", () => {
    const params = {
      dTag: "roundtrip-test",
      title: "Roundtrip Bounty",
      summary: "Test the roundtrip",
      rewardSats: 50000,
      category: "design" as BountyCategory,
      lightning: "test@wallet.com",
      tags: ["test", "roundtrip"],
      expiry: 1735689600,
      image: "https://example.com/img.png",
    };

    const tags = buildBountyTags(params);

    const event = {
      id: "evt-roundtrip",
      pubkey: "pk-roundtrip",
      content: "Full description here",
      tags,
      created_at: 1700000000,
    };

    const bounty = parseBountyEvent(event);
    expect(bounty).not.toBeNull();
    expect(bounty!.dTag).toBe("roundtrip-test");
    expect(bounty!.title).toBe("Roundtrip Bounty");
    expect(bounty!.rewardSats).toBe(50000);
    expect(bounty!.category).toBe("design");
    expect(bounty!.lightning).toBe("test@wallet.com");
    expect(bounty!.status).toBe("OPEN");
    expect(bounty!.tags).toContain("test");
    expect(bounty!.tags).toContain("roundtrip");
  });
});

describe("parseBountyEvent edge cases", () => {
  it("handles reward with no sats unit", () => {
    const event = {
      id: "e1",
      pubkey: "pk1",
      content: "desc",
      tags: [
        ["d", "slug1"],
        ["title", "No Unit"],
        ["reward", "25000"],
        ["status", "OPEN"],
      ],
      created_at: 1700000000,
    };
    const bounty = parseBountyEvent(event);
    expect(bounty).not.toBeNull();
    expect(bounty!.rewardSats).toBe(25000);
  });

  it("handles zero reward", () => {
    const event = {
      id: "e2",
      pubkey: "pk2",
      content: "volunteer",
      tags: [
        ["d", "slug2"],
        ["title", "Free Work"],
        ["reward", "0", "sats"],
        ["status", "OPEN"],
      ],
      created_at: 1700000000,
    };
    const bounty = parseBountyEvent(event);
    expect(bounty).not.toBeNull();
    expect(bounty!.rewardSats).toBe(0);
  });

  it("handles COMPLETED status with winner", () => {
    const event = {
      id: "e3",
      pubkey: "pk3",
      content: "done",
      tags: [
        ["d", "slug3"],
        ["title", "Done Bounty"],
        ["reward", "10000", "sats"],
        ["status", "COMPLETED"],
        ["winner", "npub1abc123"],
      ],
      created_at: 1700000000,
    };
    const bounty = parseBountyEvent(event);
    expect(bounty).not.toBeNull();
    expect(bounty!.status).toBe("COMPLETED");
    expect(bounty!.winner).toBe("npub1abc123");
  });
});

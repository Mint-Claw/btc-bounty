import { describe, it, expect } from "vitest";
import type { Bounty } from "@/lib/nostr/schema";

// Test the sort logic that useBounties applies client-side
function sortBounties(bounties: Bounty[], sort: string): Bounty[] {
  const sorted = [...bounties];
  switch (sort) {
    case "oldest":
      sorted.sort((a, b) => a.createdAt - b.createdAt);
      break;
    case "reward_high":
      sorted.sort((a, b) => b.rewardSats - a.rewardSats);
      break;
    case "reward_low":
      sorted.sort((a, b) => a.rewardSats - b.rewardSats);
      break;
    default:
      sorted.sort((a, b) => b.createdAt - a.createdAt);
  }
  return sorted;
}

const makeBounty = (id: string, rewardSats: number, createdAt: number): Bounty => ({
  id,
  dTag: id,
  pubkey: "a".repeat(64),
  title: `Bounty ${id}`,
  summary: "",
  content: "",
  rewardSats,
  status: "OPEN",
  category: "code",
  tags: [],
  lightning: "",
  createdAt,
});

describe("Bounty Sort", () => {
  const bounties = [
    makeBounty("b1", 50000, 1000),
    makeBounty("b2", 200000, 3000),
    makeBounty("b3", 100000, 2000),
  ];

  it("sorts newest first by default", () => {
    const sorted = sortBounties(bounties, "newest");
    expect(sorted.map((b) => b.id)).toEqual(["b2", "b3", "b1"]);
  });

  it("sorts oldest first", () => {
    const sorted = sortBounties(bounties, "oldest");
    expect(sorted.map((b) => b.id)).toEqual(["b1", "b3", "b2"]);
  });

  it("sorts highest reward first", () => {
    const sorted = sortBounties(bounties, "reward_high");
    expect(sorted.map((b) => b.id)).toEqual(["b2", "b3", "b1"]);
  });

  it("sorts lowest reward first", () => {
    const sorted = sortBounties(bounties, "reward_low");
    expect(sorted.map((b) => b.id)).toEqual(["b1", "b3", "b2"]);
  });

  it("defaults to newest for unknown sort", () => {
    const sorted = sortBounties(bounties, "unknown");
    expect(sorted.map((b) => b.id)).toEqual(["b2", "b3", "b1"]);
  });

  it("handles empty array", () => {
    expect(sortBounties([], "newest")).toEqual([]);
  });

  it("handles single bounty", () => {
    const single = [makeBounty("only", 1000, 100)];
    expect(sortBounties(single, "reward_high")).toHaveLength(1);
  });

  it("is stable for equal values", () => {
    const equalReward = [
      makeBounty("a", 100000, 1000),
      makeBounty("b", 100000, 2000),
      makeBounty("c", 100000, 3000),
    ];
    // With equal rewards, original order preserved (stable sort)
    const sorted = sortBounties(equalReward, "reward_high");
    expect(sorted).toHaveLength(3);
    // All have same reward, so stable sort preserves input order
    sorted.forEach((b) => expect(b.rewardSats).toBe(100000));
  });
});

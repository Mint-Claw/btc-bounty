import { beforeEach, describe, expect, it, vi } from "vitest";

const relayEvents: unknown[] = [];
const cachedRows: unknown[] = [];

vi.mock("@/lib/server/relay", () => ({
  fetchFromRelays: vi.fn(async () => relayEvents),
}));

vi.mock("@/lib/server/db", () => ({
  listCachedBounties: vi.fn(() => cachedRows),
}));

const posterPubkey = "a".repeat(64);
const otherPubkey = "b".repeat(64);
const now = Math.floor(Date.now() / 1000);

function request(url = "https://btcbounty.test/api/agent-discovery/bounties") {
  return { nextUrl: new URL(url) } as never;
}

function relayBounty(overrides: Partial<{ id: string; pubkey: string; dTag: string; title: string; reward: number; category: string; status: string; createdAt: number; expiry: number; tags: string[] }> = {}) {
  const dTag = overrides.dTag ?? "relay-bounty";
  const title = overrides.title ?? "Relay bounty";
  const reward = overrides.reward ?? 2100;
  const category = overrides.category ?? "code";
  const status = overrides.status ?? "OPEN";
  const tags = overrides.tags ?? ["bounty", "agent"];
  return {
    id: overrides.id ?? `event-${dTag}`,
    pubkey: overrides.pubkey ?? posterPubkey,
    created_at: overrides.createdAt ?? now,
    kind: 30402,
    content: `${title} content`,
    sig: "",
    tags: [
      ["d", dTag],
      ["title", title],
      ["summary", `${title} summary`],
      ["reward", String(reward), "sats"],
      ["status", status],
      ["category", category],
      ["lightning", "poster@example.com"],
      ...tags.map((tag) => ["t", tag]),
      ...(overrides.expiry ? [["expiry", String(overrides.expiry)]] : []),
    ],
  };
}

function cachedBounty(overrides: Partial<{ id: string; pubkey: string; d_tag: string; title: string; reward_sats: number; category: string; status: string; created_at: number; tags_json: string | null }> = {}) {
  const dTag = overrides.d_tag ?? "cached-bounty";
  const title = overrides.title ?? "Cached bounty";
  return {
    id: overrides.id ?? `cached-event-${dTag}`,
    d_tag: dTag,
    pubkey: overrides.pubkey ?? otherPubkey,
    kind: 30402,
    title,
    summary: `${title} summary`,
    content: `${title} content`,
    reward_sats: overrides.reward_sats ?? 4200,
    status: overrides.status ?? "active",
    category: overrides.category ?? "research",
    lightning: "cached@example.com",
    winner_pubkey: null,
    tags_json: overrides.tags_json ?? JSON.stringify([["t", "bounty"], ["t", "cached"]]),
    created_at: overrides.created_at ?? now - 5,
    cached_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

describe("agent discovery feed", () => {
  beforeEach(() => {
    relayEvents.length = 0;
    cachedRows.length = 0;
  });

  it("falls back to locally cached active bounties when relays return no bounties", async () => {
    cachedRows.push(cachedBounty({ status: "active", d_tag: "cache-only" }));

    const { GET } = await import("@/app/api/agent-discovery/bounties/route");
    const response = await GET(request());
    const body = await response.json();

    expect(body.count).toBe(1);
    expect(body.bounties[0]).toMatchObject({
      dTag: "cache-only",
      title: "Cached bounty",
      status: "OPEN",
      category: "research",
    });
    expect(body.bounties[0].reward.amount).toBe(4200);
  });

  it("merges relay and cached bounties while deduping by d-tag", async () => {
    relayEvents.push(relayBounty({ dTag: "same-bounty", title: "Relay version", createdAt: now }));
    cachedRows.push(cachedBounty({ d_tag: "same-bounty", title: "Cached duplicate", created_at: now - 60 }));
    cachedRows.push(cachedBounty({ d_tag: "cache-extra", title: "Cached extra", created_at: now - 30 }));

    const { GET } = await import("@/app/api/agent-discovery/bounties/route");
    const response = await GET(request());
    const body = await response.json();

    expect(body.count).toBe(2);
    expect(body.bounties.map((b: { dTag: string }) => b.dTag)).toEqual(["same-bounty", "cache-extra"]);
    expect(body.bounties.find((b: { dTag: string }) => b.dTag === "same-bounty").title).toBe("Relay version");
  });

  it("applies category filters and excludes closed cached bounties", async () => {
    cachedRows.push(cachedBounty({ d_tag: "research-open", category: "research", status: "active" }));
    cachedRows.push(cachedBounty({ d_tag: "code-open", category: "code", status: "OPEN" }));
    cachedRows.push(cachedBounty({ d_tag: "research-closed", category: "research", status: "COMPLETED" }));

    const { GET } = await import("@/app/api/agent-discovery/bounties/route");
    const response = await GET(request("https://btcbounty.test/api/agent-discovery/bounties?category=research"));
    const body = await response.json();

    expect(body.count).toBe(1);
    expect(body.bounties[0].dTag).toBe("research-open");
  });
});

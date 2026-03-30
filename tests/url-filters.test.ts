import { describe, it, expect } from "vitest";
import type { SortOption } from "@/hooks/useBounties";

// Test the URL param serialization/deserialization logic
// (extracted from page.tsx for testability)

function filterToParams(filter: {
  status?: string;
  category?: string;
  search?: string;
  sort?: SortOption;
}): string {
  const params = new URLSearchParams();
  if (filter.status) params.set("status", filter.status);
  if (filter.category) params.set("category", filter.category);
  if (filter.search) params.set("q", filter.search);
  if (filter.sort && filter.sort !== "newest") params.set("sort", filter.sort);
  return params.toString();
}

function paramsToFilter(qs: string): {
  status?: string;
  category?: string;
  search?: string;
  sort?: SortOption;
} {
  const params = new URLSearchParams(qs);
  return {
    status: params.get("status") || undefined,
    category: params.get("category") || undefined,
    search: params.get("q") || undefined,
    sort: (params.get("sort") as SortOption) || undefined,
  };
}

describe("URL Filter Serialization", () => {
  it("empty filter produces empty params", () => {
    expect(filterToParams({})).toBe("");
  });

  it("status filter serializes", () => {
    expect(filterToParams({ status: "OPEN" })).toBe("status=OPEN");
  });

  it("category filter serializes", () => {
    expect(filterToParams({ category: "code" })).toBe("category=code");
  });

  it("search serializes as q", () => {
    expect(filterToParams({ search: "bitcoin" })).toBe("q=bitcoin");
  });

  it("sort=newest is omitted (default)", () => {
    expect(filterToParams({ sort: "newest" })).toBe("");
  });

  it("sort=reward_high serializes", () => {
    expect(filterToParams({ sort: "reward_high" })).toBe("sort=reward_high");
  });

  it("combined filters serialize correctly", () => {
    const qs = filterToParams({ status: "OPEN", category: "code", sort: "reward_high" });
    expect(qs).toContain("status=OPEN");
    expect(qs).toContain("category=code");
    expect(qs).toContain("sort=reward_high");
  });

  it("search with spaces encodes", () => {
    const qs = filterToParams({ search: "fix bug" });
    expect(qs).toBe("q=fix+bug");
  });
});

describe("URL Filter Deserialization", () => {
  it("empty string returns empty filter", () => {
    const f = paramsToFilter("");
    expect(f.status).toBeUndefined();
    expect(f.category).toBeUndefined();
    expect(f.search).toBeUndefined();
    expect(f.sort).toBeUndefined();
  });

  it("parses status", () => {
    expect(paramsToFilter("status=OPEN").status).toBe("OPEN");
  });

  it("parses category", () => {
    expect(paramsToFilter("category=design").category).toBe("design");
  });

  it("parses q as search", () => {
    expect(paramsToFilter("q=lightning").search).toBe("lightning");
  });

  it("parses sort", () => {
    expect(paramsToFilter("sort=reward_low").sort).toBe("reward_low");
  });

  it("roundtrips correctly", () => {
    const original = { status: "IN_PROGRESS", category: "writing", search: "nostr", sort: "oldest" as SortOption };
    const qs = filterToParams(original);
    const restored = paramsToFilter(qs);
    expect(restored).toEqual(original);
  });
});

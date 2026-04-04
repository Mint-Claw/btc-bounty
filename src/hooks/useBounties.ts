"use client";

import { useState, useEffect, useCallback } from "react";
import type { Bounty } from "@/lib/nostr/schema";
import { BOUNTY_KIND, parseBountyEvent } from "@/lib/nostr/schema";
import type NDK from "@nostr-dev-kit/ndk";
import { NDKFilter } from "@nostr-dev-kit/ndk";

export type SortOption = "newest" | "oldest" | "reward_high" | "reward_low";

export type BountyFilter = {
  status?: string;
  category?: string;
  search?: string;
  sort?: SortOption;
};

export function useBounties(ndk: NDK | null, filter?: BountyFilter) {
  const [bounties, setBounties] = useState<Bounty[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<"cache" | "relay" | null>(null);

  // Sort + filter helper
  const applyFilterAndSort = useCallback(
    (raw: Bounty[]): Bounty[] => {
      let result = raw;
      if (filter?.status) result = result.filter((b) => b.status === filter.status);
      if (filter?.category) result = result.filter((b) => b.category === filter.category);
      if (filter?.search) {
        const q = filter.search.toLowerCase();
        result = result.filter(
          (b) =>
            b.title.toLowerCase().includes(q) ||
            b.content.toLowerCase().includes(q),
        );
      }
      const sortBy = filter?.sort ?? "reward_high";
      switch (sortBy) {
        case "oldest":
          result.sort((a, b) => a.createdAt - b.createdAt);
          break;
        case "reward_high":
          result.sort((a, b) => b.rewardSats - a.rewardSats);
          break;
        case "reward_low":
          result.sort((a, b) => a.rewardSats - b.rewardSats);
          break;
        default:
          result.sort((a, b) => b.createdAt - a.createdAt);
      }
      return result;
    },
    [filter?.status, filter?.category, filter?.search, filter?.sort],
  );

  // Step 1: Instant load from cache API
  useEffect(() => {
    let cancelled = false;

    async function loadCached() {
      try {
        const params = new URLSearchParams();
        if (filter?.status) params.set("status", filter.status);
        if (filter?.category) params.set("category", filter.category);
        if (filter?.search) params.set("q", filter.search);
        params.set("limit", "100");

        const res = await fetch(`/api/bounties/cached?${params}`);
        if (!res.ok || cancelled) return;

        const data = await res.json();
        const cached: Bounty[] = (data.bounties || []).map((row: Record<string, unknown>) => ({
          id: row.id,
          dTag: row.d_tag,
          pubkey: row.pubkey,
          title: row.title,
          summary: row.summary || "",
          content: row.content || "",
          rewardSats: row.reward_sats as number,
          status: row.status || "OPEN",
          category: row.category || "other",
          lightning: row.lightning || "",
          tags: [],
          createdAt: row.created_at as number,
        }));

        if (!cancelled && cached.length > 0) {
          setBounties(applyFilterAndSort(cached));
          setSource("cache");
          setLoading(false);
        }
      } catch {
        // Cache fetch failed — relay will be primary
      }
    }

    loadCached();
    return () => { cancelled = true; };
  }, [filter?.status, filter?.category, filter?.search, applyFilterAndSort]);

  // Step 2: Relay fetch (upgrades cache data when available)
  const fetchBounties = useCallback(async () => {
    if (!ndk) return;

    // Only show loading if we don't already have cache data
    if (source !== "cache") setLoading(true);
    setError(null);

    try {
      const ndkFilter: NDKFilter = {
        kinds: [BOUNTY_KIND as number],
        limit: 100,
      };

      const events = await ndk.fetchEvents(ndkFilter);
      const parsed: Bounty[] = [];

      for (const event of events) {
        const bounty = parseBountyEvent({
          id: event.id,
          pubkey: event.pubkey,
          content: event.content,
          tags: event.tags.map((t) => [...t]),
          created_at: event.created_at ?? 0,
        });
        if (bounty) parsed.push(bounty);
      }

      setBounties(applyFilterAndSort(parsed));
      setSource("relay");
    } catch (e) {
      // Only set error if we have no cache data
      if (source !== "cache") {
        setError(e instanceof Error ? e.message : "Failed to fetch bounties");
      }
    } finally {
      setLoading(false);
    }
  }, [ndk, applyFilterAndSort, source]);

  useEffect(() => {
    fetchBounties();
  }, [fetchBounties]);

  return { bounties, loading, error, refetch: fetchBounties, source };
}

export function useNDK() {
  const [ndk, setNdk] = useState<NDK | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function connect() {
      const { getNDK } = await import("@/lib/nostr/ndk");
      const instance = await getNDK();
      if (!cancelled) {
        setNdk(instance);
        setConnected(true);
      }
    }

    connect().catch((e) => {
      console.error("NDK connection failed:", e);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return { ndk, connected };
}

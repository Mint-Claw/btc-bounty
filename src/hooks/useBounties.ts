"use client";

import { useState, useEffect, useCallback } from "react";
import type { Bounty } from "@/lib/nostr/schema";
import { BOUNTY_KIND, parseBountyEvent } from "@/lib/nostr/schema";
import type NDK from "@nostr-dev-kit/ndk";
import { NDKFilter } from "@nostr-dev-kit/ndk";

export type BountyFilter = {
  status?: string;
  category?: string;
  search?: string;
};

export function useBounties(ndk: NDK | null, filter?: BountyFilter) {
  const [bounties, setBounties] = useState<Bounty[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBounties = useCallback(async () => {
    if (!ndk) return;

    setLoading(true);
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
        if (bounty) {
          // Client-side filtering
          if (filter?.status && bounty.status !== filter.status) continue;
          if (filter?.category && bounty.category !== filter.category) continue;
          if (filter?.search) {
            const q = filter.search.toLowerCase();
            const matches =
              bounty.title.toLowerCase().includes(q) ||
              bounty.content.toLowerCase().includes(q);
            if (!matches) continue;
          }
          parsed.push(bounty);
        }
      }

      parsed.sort((a, b) => b.createdAt - a.createdAt);
      setBounties(parsed);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch bounties");
    } finally {
      setLoading(false);
    }
  }, [ndk, filter?.status, filter?.category, filter?.search]);

  useEffect(() => {
    fetchBounties();
  }, [fetchBounties]);

  return { bounties, loading, error, refetch: fetchBounties };
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

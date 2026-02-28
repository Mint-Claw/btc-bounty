"use client";

import { useState } from "react";
import BountyCard from "@/components/BountyCard";
import RelayStatus from "@/components/RelayStatus";
import { useBounties, useNDK, type BountyFilter } from "@/hooks/useBounties";
import type { BountyStatus, BountyCategory } from "@/lib/nostr/schema";
import Link from "next/link";

const STATUSES: BountyStatus[] = ["OPEN", "IN_PROGRESS", "COMPLETED", "CANCELLED"];
const CATEGORIES: BountyCategory[] = ["code", "design", "writing", "research", "other"];

export default function Home() {
  const { ndk, connected } = useNDK();
  const [filter, setFilter] = useState<BountyFilter>({});
  const { bounties, loading, error, refetch } = useBounties(ndk, filter);

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header className="border-b border-zinc-800 px-4 sm:px-6 py-3 sm:py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">⚡</span>
            <h1 className="text-lg sm:text-xl font-bold text-orange-400">BTC-Bounty</h1>
            <span className="hidden sm:inline text-xs text-zinc-500 ml-2">
              Bitcoin-native bounties on NOSTR
            </span>
          </div>
          <div className="flex items-center gap-3">
            <RelayStatus />
            <Link
              href="/post"
              className="px-4 py-2 bg-orange-500 text-black rounded-lg font-semibold text-sm hover:bg-orange-400 transition"
            >
              Post Bounty
            </Link>
          </div>
        </div>
      </header>

      {/* Filters */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-6">
        <div className="flex flex-wrap gap-2 items-center">
          {/* Status filter */}
          <select
            value={filter.status ?? ""}
            onChange={(e) =>
              setFilter((f) => ({
                ...f,
                status: e.target.value || undefined,
              }))
            }
            className="bg-zinc-900 border border-zinc-700 text-zinc-300 text-sm rounded-lg px-3 py-1.5 focus:border-orange-500 focus:outline-none"
          >
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace("_", " ")}
              </option>
            ))}
          </select>

          {/* Category filter */}
          <select
            value={filter.category ?? ""}
            onChange={(e) =>
              setFilter((f) => ({
                ...f,
                category: e.target.value || undefined,
              }))
            }
            className="bg-zinc-900 border border-zinc-700 text-zinc-300 text-sm rounded-lg px-3 py-1.5 focus:border-orange-500 focus:outline-none"
          >
            <option value="">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c.charAt(0).toUpperCase() + c.slice(1)}
              </option>
            ))}
          </select>

          <button
            onClick={() => refetch()}
            className="text-sm text-zinc-400 hover:text-orange-400 transition ml-auto"
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Bounty List */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 sm:py-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-zinc-300">
            {filter.status || "All"} Bounties
          </h2>
          <span className="text-sm text-zinc-500">
            {loading ? "Loading..." : `${bounties.length} bounties`}
          </span>
        </div>

        {!connected && (
          <div className="text-center py-12 text-zinc-500">
            <p className="text-lg mb-2">Connecting to NOSTR relays...</p>
            <p className="text-sm">This may take a few seconds.</p>
          </div>
        )}

        {connected && error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-4">
            <p className="text-red-400 text-sm">{error}</p>
            <button
              onClick={() => refetch()}
              className="text-red-400 underline text-sm mt-1"
            >
              Retry
            </button>
          </div>
        )}

        {connected && !loading && bounties.length === 0 && (
          <div className="text-center py-12 text-zinc-500">
            <p className="text-lg mb-2">No bounties found</p>
            <p className="text-sm">
              {filter.status || filter.category
                ? "Try clearing your filters, or "
                : "Be the first — "}
              <Link href="/post" className="text-orange-400 hover:underline">
                post a bounty
              </Link>
            </p>
          </div>
        )}

        <div className="space-y-3">
          {bounties.map((bounty) => (
            <BountyCard key={bounty.id} bounty={bounty} />
          ))}
        </div>
      </div>
    </main>
  );
}

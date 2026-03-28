"use client";

import { useState } from "react";
import BountyCard from "@/components/BountyCard";
import RelayStatus from "@/components/RelayStatus";
import { useBounties, useNDK, type BountyFilter } from "@/hooks/useBounties";
import type { BountyStatus, BountyCategory } from "@/lib/nostr/schema";
import Link from "next/link";
import { BountySkeletonList } from "@/components/BountySkeleton";

const STATUSES: BountyStatus[] = ["OPEN", "IN_PROGRESS", "COMPLETED", "CANCELLED"];
const CATEGORIES: BountyCategory[] = ["code", "design", "writing", "research", "other"];

function StatsBar({ bounties, loading }: { bounties: { status: string; rewardSats: number }[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="grid grid-cols-3 gap-4 max-w-4xl mx-auto px-4 sm:px-6 py-6">
        {[0, 1, 2].map((i) => (
          <div key={i} className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 text-center animate-pulse">
            <div className="h-7 bg-zinc-800 rounded w-16 mx-auto mb-2" />
            <div className="h-3 bg-zinc-800/60 rounded w-20 mx-auto" />
          </div>
        ))}
      </div>
    );
  }
  const open = bounties.filter((b) => b.status === "OPEN").length;
  const totalSats = bounties.reduce((sum, b) => sum + (b.status === "OPEN" ? b.rewardSats : 0), 0);
  const completed = bounties.filter((b) => b.status === "COMPLETED").length;

  return (
    <div className="grid grid-cols-3 gap-4 max-w-4xl mx-auto px-4 sm:px-6 py-6">
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 text-center">
        <div className="text-2xl font-bold text-orange-400">{open}</div>
        <div className="text-xs text-zinc-500 mt-1">Open Bounties</div>
      </div>
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 text-center">
        <div className="text-2xl font-bold text-orange-400">
          ⚡ {totalSats >= 1_000_000 ? `${(totalSats / 1_000_000).toFixed(1)}M` : totalSats >= 1_000 ? `${Math.round(totalSats / 1_000)}K` : totalSats}
        </div>
        <div className="text-xs text-zinc-500 mt-1">Sats Available</div>
      </div>
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 text-center">
        <div className="text-2xl font-bold text-green-400">{completed}</div>
        <div className="text-xs text-zinc-500 mt-1">Completed</div>
      </div>
    </div>
  );
}

export default function Home() {
  const { ndk, connected } = useNDK();
  const [filter, setFilter] = useState<BountyFilter>({});
  const { bounties, loading, error, refetch } = useBounties(ndk, filter);

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
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
              href="/admin"
              className="text-sm text-zinc-500 hover:text-zinc-300 transition hidden sm:inline"
            >
              Admin
            </Link>
            <Link
              href="/post"
              className="px-4 py-2 bg-orange-500 text-black rounded-lg font-semibold text-sm hover:bg-orange-400 transition"
            >
              Post Bounty
            </Link>
          </div>
        </div>
      </header>

      {/* Hero — only when no filters active */}
      {!filter.status && !filter.category && !filter.search && (
        <div className="border-b border-zinc-800/50 bg-gradient-to-b from-zinc-900/50 to-transparent">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-8 pb-2 text-center">
            <h2 className="text-2xl sm:text-3xl font-bold mb-2">
              Post work. Get paid in <span className="text-orange-400">sats</span>.
            </h2>
            <p className="text-zinc-400 text-sm sm:text-base max-w-lg mx-auto">
              Decentralized bounties powered by NOSTR identity and Lightning payments.
              No accounts, no middlemen.
            </p>
          </div>
          <StatsBar bounties={bounties} loading={loading} />
        </div>
      )}

      {/* Filters */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-6 w-full">
        {/* Search */}
        <div className="mb-3">
          <input
            type="text"
            placeholder="Search bounties…"
            value={filter.search ?? ""}
            onChange={(e) =>
              setFilter((f) => ({
                ...f,
                search: e.target.value || undefined,
              }))
            }
            className="w-full bg-zinc-900 border border-zinc-700 text-zinc-300 text-sm rounded-lg px-4 py-2 focus:border-orange-500 focus:outline-none placeholder:text-zinc-600"
          />
        </div>
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
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 sm:py-6 flex-1 w-full">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-zinc-300">
            {filter.status || "All"} Bounties
          </h2>
          <span className="text-sm text-zinc-500">
            {loading ? "Loading..." : `${bounties.length} bounties`}
          </span>
        </div>

        {!connected && (
          <div className="space-y-4">
            <div className="text-center py-4 text-zinc-500">
              <p className="text-sm">Connecting to NOSTR relays...</p>
            </div>
            <BountySkeletonList count={4} />
          </div>
        )}

        {connected && loading && <BountySkeletonList count={4} />}

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

      {/* Footer */}
      <footer className="border-t border-zinc-800 mt-auto">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-zinc-600">
          <div className="flex items-center gap-2">
            <span>⚡</span>
            <span>BTC-Bounty — built on NOSTR + Lightning</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/api/bounties/feed" className="hover:text-zinc-400 transition">
              RSS Feed
            </Link>
            <Link href="/api/docs" className="hover:text-zinc-400 transition">
              API Docs
            </Link>
            <Link href="/api/health" className="hover:text-zinc-400 transition">
              Status
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}

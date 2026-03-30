"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import BountyCard from "@/components/BountyCard";
import RelayStatus from "@/components/RelayStatus";
import { useBounties, useNDK, type BountyFilter, type SortOption } from "@/hooks/useBounties";
import type { BountyStatus, BountyCategory } from "@/lib/nostr/schema";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { BountySkeletonList } from "@/components/BountySkeleton";
import { DEMO_BOUNTIES } from "@/lib/demo-bounties";

const STATUSES: BountyStatus[] = ["OPEN", "IN_PROGRESS", "COMPLETED", "CANCELLED"];
const CATEGORIES: BountyCategory[] = ["code", "design", "writing", "research", "other"];
const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "reward_high", label: "Highest reward" },
  { value: "reward_low", label: "Lowest reward" },
];

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

function HomeContent() {
  const { ndk, connected } = useNDK();
  const searchParams = useSearchParams();
  const router = useRouter();

  // Initialize filter from URL params
  const [filter, setFilter] = useState<BountyFilter>(() => ({
    status: searchParams.get("status") || undefined,
    category: searchParams.get("category") || undefined,
    search: searchParams.get("q") || undefined,
    sort: (searchParams.get("sort") as SortOption) || undefined,
  }));

  // Sync filter changes to URL
  const updateFilter = useCallback((updater: (prev: BountyFilter) => BountyFilter) => {
    setFilter((prev) => {
      const next = updater(prev);
      const params = new URLSearchParams();
      if (next.status) params.set("status", next.status);
      if (next.category) params.set("category", next.category);
      if (next.search) params.set("q", next.search);
      if (next.sort && next.sort !== "newest") params.set("sort", next.sort);
      const qs = params.toString();
      router.replace(qs ? `/?${qs}` : "/", { scroll: false });
      return next;
    });
  }, [router]);

  const { bounties, loading, error, refetch } = useBounties(ndk, filter);
  const searchRef = useRef<HTMLInputElement>(null);
  const [connectTimeout, setConnectTimeout] = useState(false);

  // Show timeout message if relays don't connect within 15s
  useEffect(() => {
    if (connected) {
      setConnectTimeout(false);
      return;
    }
    const timer = setTimeout(() => setConnectTimeout(true), 15_000);
    return () => clearTimeout(timer);
  }, [connected]);

  // Cmd+K / Ctrl+K to focus search
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "Escape") {
        if (document.activeElement === searchRef.current) {
          searchRef.current?.blur();
        } else {
          // Clear all filters when Escape pressed outside search
          updateFilter(() => ({}));
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

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
        <div className="mb-3 relative">
          <input
            ref={searchRef}
            type="text"
            placeholder="Search bounties…"
            value={filter.search ?? ""}
            onChange={(e) =>
              updateFilter((f) => ({
                ...f,
                search: e.target.value || undefined,
              }))
            }
            className="w-full bg-zinc-900 border border-zinc-700 text-zinc-300 text-sm rounded-lg px-4 py-2 pr-16 focus:border-orange-500 focus:outline-none placeholder:text-zinc-600"
          />
          <kbd className="absolute right-3 top-1/2 -translate-y-1/2 hidden sm:inline-flex items-center gap-0.5 text-[10px] text-zinc-600 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 font-mono">
            ⌘K
          </kbd>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          {/* Status filter */}
          <select
            value={filter.status ?? ""}
            onChange={(e) =>
              updateFilter((f) => ({
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
              updateFilter((f) => ({
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

          {/* Sort */}
          <select
            value={filter.sort ?? "newest"}
            onChange={(e) =>
              updateFilter((f) => ({
                ...f,
                sort: (e.target.value as SortOption) || undefined,
              }))
            }
            className="bg-zinc-900 border border-zinc-700 text-zinc-300 text-sm rounded-lg px-3 py-1.5 focus:border-orange-500 focus:outline-none"
          >
            {SORT_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>

          {/* Clear filters — show only when filters active */}
          {(filter.status || filter.category || filter.search || (filter.sort && filter.sort !== "newest")) && (
            <button
              onClick={() => updateFilter(() => ({}))}
              className="text-sm text-red-400 hover:text-red-300 transition"
            >
              ✕ Clear
            </button>
          )}

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
              {connectTimeout ? (
                <>
                  <p className="text-sm text-yellow-400 mb-2">Relay connection is taking longer than expected...</p>
                  <p className="text-xs">Check your network or try refreshing the page.</p>
                </>
              ) : (
                <p className="text-sm">Connecting to NOSTR relays...</p>
              )}
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

        {connected && !loading && bounties.length === 0 && !filter.status && !filter.category && !filter.search && (
          <>
            <div className="text-center py-4 text-zinc-500">
              <p className="text-sm">
                No live bounties yet.{" "}
                <Link href="/post" className="text-orange-400 hover:underline">
                  Post the first one
                </Link>
                , or check out these examples:
              </p>
            </div>
            <div className="space-y-3 opacity-75">
              {DEMO_BOUNTIES.map((bounty) => (
                <BountyCard key={bounty.id} bounty={bounty} />
              ))}
            </div>
            <p className="text-center text-xs text-zinc-600 mt-4">
              ↑ Sample bounties for demonstration
            </p>
          </>
        )}

        {connected && !loading && bounties.length === 0 && (filter.status || filter.category || filter.search) && (
          <div className="text-center py-12 text-zinc-500">
            <p className="text-lg mb-2">No bounties match your filters</p>
            <p className="text-sm">
              Try clearing your filters, or{" "}
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
            <Link href="/docs" className="hover:text-zinc-400 transition">
              API Docs
            </Link>
            <Link href="/admin" className="hover:text-zinc-400 transition">
              Admin
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

export default function Home() {
  return (
    <Suspense fallback={
      <main className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center">
        <div className="text-zinc-500">Loading...</div>
      </main>
    }>
      <HomeContent />
    </Suspense>
  );
}

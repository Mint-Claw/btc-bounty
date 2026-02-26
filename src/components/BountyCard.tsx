"use client";

import type { Bounty, BountyStatus } from "@/lib/nostr/schema";
import Link from "next/link";

const STATUS_COLORS: Record<BountyStatus, string> = {
  OPEN: "bg-green-500/20 text-green-400 border-green-500/30",
  IN_PROGRESS: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  COMPLETED: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  CANCELLED: "bg-red-500/20 text-red-400 border-red-500/30",
};

function truncateNpub(pubkey: string): string {
  return `${pubkey.slice(0, 8)}...${pubkey.slice(-4)}`;
}

function formatSats(sats: number): string {
  if (sats >= 1_000_000) return `${(sats / 1_000_000).toFixed(1)}M`;
  if (sats >= 1_000) return `${(sats / 1_000).toFixed(0)}K`;
  return String(sats);
}

function timeAgo(timestamp: number): string {
  const seconds = Math.floor(Date.now() / 1000 - timestamp);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export default function BountyCard({ bounty }: { bounty: Bounty }) {
  return (
    <Link href={`/bounty/${bounty.id}`}>
      <div className="border border-zinc-800 rounded-lg p-4 hover:border-orange-500/50 transition-colors bg-zinc-900/50">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-zinc-100 truncate">
              {bounty.title}
            </h3>
            {bounty.summary && (
              <p className="text-sm text-zinc-400 mt-1 line-clamp-2">
                {bounty.summary}
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <span className="text-orange-400 font-mono font-bold text-lg">
              ⚡ {formatSats(bounty.rewardSats)}
            </span>
            <span
              className={`text-xs px-2 py-0.5 rounded border ${STATUS_COLORS[bounty.status]}`}
            >
              {bounty.status}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3 mt-3 text-xs text-zinc-500">
          <span>{truncateNpub(bounty.pubkey)}</span>
          <span>•</span>
          <span>{bounty.category}</span>
          <span>•</span>
          <span>{timeAgo(bounty.createdAt)}</span>
          {bounty.tags.length > 0 && (
            <>
              <span>•</span>
              <div className="flex gap-1">
                {bounty.tags.slice(0, 3).map((t) => (
                  <span
                    key={t}
                    className="bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-400"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </Link>
  );
}

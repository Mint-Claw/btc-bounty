"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { Bounty, BountyStatus } from "@/lib/nostr/schema";
import { parseBountyEvent, BOUNTY_KIND } from "@/lib/nostr/schema";
import ApplyModal from "@/components/ApplyModal";

const STATUS_COLORS: Record<BountyStatus, string> = {
  OPEN: "bg-green-500/20 text-green-400 border-green-500/30",
  IN_PROGRESS: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  COMPLETED: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  CANCELLED: "bg-red-500/20 text-red-400 border-red-500/30",
};

function formatSats(sats: number): string {
  return new Intl.NumberFormat().format(sats);
}

function timeAgo(timestamp: number): string {
  const seconds = Math.floor(Date.now() / 1000 - timestamp);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export default function BountyDetail() {
  const params = useParams();
  const id = params.id as string;

  const [bounty, setBounty] = useState<Bounty | null>(null);
  const [loading, setLoading] = useState(true);
  const [showApply, setShowApply] = useState(false);

  useEffect(() => {
    async function fetchBounty() {
      try {
        const { getNDK } = await import("@/lib/nostr/ndk");
        const ndk = await getNDK();

        const events = await ndk.fetchEvents({
          kinds: [BOUNTY_KIND as number],
          ids: [id],
        });

        for (const event of events) {
          const parsed = parseBountyEvent({
            id: event.id,
            pubkey: event.pubkey,
            content: event.content,
            tags: event.tags.map((t) => [...t]),
            created_at: event.created_at ?? 0,
          });
          if (parsed) {
            setBounty(parsed);
            break;
          }
        }
      } catch (e) {
        console.error("Failed to fetch bounty:", e);
      } finally {
        setLoading(false);
      }
    }

    fetchBounty();
  }, [id]);

  if (loading) {
    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center">
        <div className="text-zinc-500">Loading bounty...</div>
      </main>
    );
  }

  if (!bounty) {
    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-bold text-zinc-400 mb-2">
            Bounty not found
          </h2>
          <p className="text-zinc-500 mb-4">
            Event ID: {id.slice(0, 16)}...
          </p>
          <Link
            href="/"
            className="text-orange-400 hover:text-orange-300"
          >
            ← Back to bounties
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center gap-2">
          <Link href="/" className="text-zinc-400 hover:text-zinc-200">
            ← Back
          </Link>
          <span className="text-zinc-600 mx-2">|</span>
          <span className="text-sm text-zinc-500">
            {bounty.category}
          </span>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-8">
        {/* Title + Status */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <h1 className="text-2xl font-bold text-zinc-100">
            {bounty.title}
          </h1>
          <span
            className={`text-sm px-3 py-1 rounded border shrink-0 ${STATUS_COLORS[bounty.status]}`}
          >
            {bounty.status}
          </span>
        </div>

        {/* Reward + Meta */}
        <div className="flex items-center gap-6 mb-8 text-sm">
          <span className="text-orange-400 font-mono font-bold text-2xl">
            ⚡ {formatSats(bounty.rewardSats)} sats
          </span>
          <span className="text-zinc-500">
            Posted {timeAgo(bounty.createdAt)}
          </span>
          <span className="text-zinc-500">
            by{" "}
            <code className="text-zinc-400">
              {bounty.pubkey.slice(0, 12)}...
            </code>
          </span>
        </div>

        {/* Tags */}
        {bounty.tags.length > 0 && (
          <div className="flex gap-2 mb-6">
            {bounty.tags.map((t) => (
              <span
                key={t}
                className="bg-zinc-800 px-2 py-1 rounded text-sm text-zinc-400"
              >
                {t}
              </span>
            ))}
          </div>
        )}

        {/* Description */}
        <div className="border border-zinc-800 rounded-lg p-6 mb-8 bg-zinc-900/50">
          <h3 className="text-sm font-semibold text-zinc-400 mb-3 uppercase tracking-wide">
            Description
          </h3>
          <div className="text-zinc-300 whitespace-pre-wrap leading-relaxed">
            {bounty.content}
          </div>
        </div>

        {/* Lightning Address */}
        {bounty.lightning && (
          <div className="border border-zinc-800 rounded-lg p-4 mb-8 bg-zinc-900/50">
            <h3 className="text-sm font-semibold text-zinc-400 mb-2 uppercase tracking-wide">
              Lightning Address
            </h3>
            <code className="text-orange-400">{bounty.lightning}</code>
          </div>
        )}

        {/* Actions */}
        {bounty.status === "OPEN" && (
          <div className="flex gap-3">
            <button
              onClick={() => setShowApply(true)}
              className="px-6 py-3 bg-orange-500 text-black rounded-lg font-bold hover:bg-orange-400 transition"
            >
              ⚡ Apply for this Bounty
            </button>
            <a
              href={`https://nostrudel.ninja/#/n/${bounty.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-6 py-3 border border-zinc-700 text-zinc-300 rounded-lg hover:border-zinc-500 transition"
            >
              View on Nostrudel
            </a>
          </div>
        )}

        {showApply && (
          <ApplyModal
            bounty={bounty}
            onClose={() => setShowApply(false)}
          />
        )}
      </div>
    </main>
  );
}

"use client";

import DOMPurify from "dompurify";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { Bounty, BountyApplication, BountyStatus } from "@/lib/nostr/schema";
import { parseBountyEvent, BOUNTY_KIND } from "@/lib/nostr/schema";
import { fetchApplications } from "@/lib/nostr/bounty";
import { getPublicKey, hasNIP07 } from "@/lib/nostr/nip07";
import ApplyModal from "@/components/ApplyModal";
import ProfileBadge from "@/components/ProfileBadge";
import MarkCompleteModal from "@/components/MarkCompleteModal";
import PayButton from "@/components/PayButton";
import MessageButton from "@/components/MessageButton";

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
  const [applications, setApplications] = useState<BountyApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [showApply, setShowApply] = useState(false);
  const [showComplete, setShowComplete] = useState(false);
  const [_userPubkey, setUserPubkey] = useState<string | null>(null);
  const [isPoster, setIsPoster] = useState(false);

  // Fetch bounty
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

  // Fetch applications
  useEffect(() => {
    if (!bounty) return;
    fetchApplications(bounty.id)
      .then(setApplications)
      .catch(console.error);
  }, [bounty]);

  // Check if current user is the poster
  useEffect(() => {
    if (!bounty || !hasNIP07()) return;
    getPublicKey()
      .then((pk) => {
        setUserPubkey(pk);
        setIsPoster(pk === bounty.pubkey);
      })
      .catch(() => {});
  }, [bounty]);

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
          <h2 className="text-xl font-bold text-zinc-400 mb-2">Bounty not found</h2>
          <p className="text-zinc-500 mb-4">Event ID: {id.slice(0, 16)}...</p>
          <Link href="/" className="text-orange-400 hover:text-orange-300">← Back to bounties</Link>
        </div>
      </main>
    );
  }

  const winnerApp = bounty.winner
    ? applications.find((a) => a.pubkey === bounty.winner)
    : null;

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 px-4 sm:px-6 py-3 sm:py-4">
        <div className="max-w-3xl mx-auto flex items-center gap-2">
          <Link href="/" className="text-zinc-400 hover:text-zinc-200">← Back</Link>
          <span className="text-zinc-600 mx-2">|</span>
          <span className="text-sm text-zinc-500">{bounty.category}</span>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Title + Status */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 sm:gap-4 mb-6">
          <h1 className="text-2xl font-bold text-zinc-100">{bounty.title}</h1>
          <span className={`text-sm px-3 py-1 rounded border shrink-0 ${STATUS_COLORS[bounty.status]}`}>
            {bounty.status}
          </span>
        </div>

        {/* Reward + Meta */}
        <div className="flex flex-wrap items-center gap-3 sm:gap-6 mb-6 sm:mb-8 text-sm">
          <span className="text-orange-400 font-mono font-bold text-xl sm:text-2xl">
            ⚡ {formatSats(bounty.rewardSats)} sats
          </span>
          <span className="text-zinc-500">Posted {timeAgo(bounty.createdAt)}</span>
          <div className="flex items-center gap-3">
            <ProfileBadge pubkey={bounty.pubkey} isYou={isPoster} size="md" />
            {!isPoster && <MessageButton pubkey={bounty.pubkey} />}
          </div>
        </div>

        {/* Tags */}
        {bounty.tags.length > 0 && (
          <div className="flex gap-2 mb-6">
            {bounty.tags.map((t) => (
              <span key={t} className="bg-zinc-800 px-2 py-1 rounded text-sm text-zinc-400">{t}</span>
            ))}
          </div>
        )}

        {/* Description */}
        <div className="border border-zinc-800 rounded-lg p-6 mb-8 bg-zinc-900/50">
          <h3 className="text-sm font-semibold text-zinc-400 mb-3 uppercase tracking-wide">Description</h3>
          <div className="text-zinc-300 whitespace-pre-wrap leading-relaxed">{typeof window !== "undefined" ? DOMPurify.sanitize(bounty.content) : bounty.content}</div>
        </div>

        {/* Winner banner */}
        {bounty.status === "COMPLETED" && bounty.winner && (
          <div className="border border-green-500/30 bg-green-500/10 rounded-lg p-4 mb-8">
            <h3 className="text-sm font-semibold text-green-400 mb-1">🏆 Winner</h3>
            <code className="text-zinc-300 text-sm">{bounty.winner.slice(0, 20)}...</code>
            {winnerApp?.lightning && (
              <p className="text-sm text-orange-400 mt-1">⚡ {winnerApp.lightning}</p>
            )}
          </div>
        )}

        {/* Expiry */}
        {bounty.expiry && (
          <div className={`border rounded-lg p-4 mb-8 bg-zinc-900/50 ${
            bounty.expiry * 1000 < Date.now()
              ? "border-red-500/30 bg-red-500/5"
              : "border-zinc-800"
          }`}>
            <h3 className="text-sm font-semibold text-zinc-400 mb-1 uppercase tracking-wide">
              {bounty.expiry * 1000 < Date.now() ? "⏰ Expired" : "⏳ Expires"}
            </h3>
            <span className={bounty.expiry * 1000 < Date.now() ? "text-red-400" : "text-zinc-300"}>
              {new Date(bounty.expiry * 1000).toLocaleDateString(undefined, {
                year: "numeric", month: "long", day: "numeric"
              })}
            </span>
          </div>
        )}

        {/* Lightning Address */}
        {bounty.lightning && (
          <div className="border border-zinc-800 rounded-lg p-4 mb-8 bg-zinc-900/50">
            <h3 className="text-sm font-semibold text-zinc-400 mb-2 uppercase tracking-wide">
              Poster&apos;s Lightning Address
            </h3>
            <code className="text-orange-400">{bounty.lightning}</code>
          </div>
        )}

        {/* Applications */}
        {applications.length > 0 && (
          <div className="border border-zinc-800 rounded-lg p-6 mb-8 bg-zinc-900/50">
            <h3 className="text-sm font-semibold text-zinc-400 mb-4 uppercase tracking-wide">
              Applications ({applications.length})
            </h3>
            <div className="space-y-4">
              {applications.map((app) => (
                <div
                  key={app.id}
                  className={`border rounded-lg p-4 ${
                    bounty.winner === app.pubkey
                      ? "border-green-500/50 bg-green-500/5"
                      : "border-zinc-700"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <ProfileBadge pubkey={app.pubkey} size="sm" />
                    <span className="text-xs text-zinc-500">{timeAgo(app.createdAt)}</span>
                  </div>
                  <p className="text-sm text-zinc-300 whitespace-pre-wrap">{typeof window !== "undefined" ? DOMPurify.sanitize(app.content) : app.content}</p>
                  {app.lightning && (
                    <p className="text-xs text-orange-400 mt-2">⚡ {app.lightning}</p>
                  )}
                  {bounty.winner === app.pubkey && (
                    <span className="text-xs text-green-400 mt-2 inline-block">🏆 Winner</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Worker: Apply */}
          {bounty.status === "OPEN" && !isPoster && (
            <button
              onClick={() => setShowApply(true)}
              className="px-6 py-3 bg-orange-500 text-black rounded-lg font-bold hover:bg-orange-400 transition"
            >
              ⚡ Apply for this Bounty
            </button>
          )}

          {/* Poster: Mark Complete */}
          {isPoster && (bounty.status === "OPEN" || bounty.status === "IN_PROGRESS") && (
            <button
              onClick={() => setShowComplete(true)}
              className="px-6 py-3 bg-green-600 text-white rounded-lg font-bold hover:bg-green-500 transition"
            >
              ✅ Mark Complete
            </button>
          )}

          {/* Poster: Pay Winner */}
          {isPoster && bounty.status === "COMPLETED" && bounty.winner && (
            <PayButton
              bounty={bounty}
              winnerLightning={winnerApp?.lightning}
            />
          )}

          {/* Share */}
          <button
            onClick={() => {
              const url = window.location.href;
              if (navigator.share) {
                navigator.share({ title: bounty.title, url });
              } else {
                navigator.clipboard.writeText(url);
                alert("Link copied to clipboard!");
              }
            }}
            className="px-6 py-3 border border-zinc-700 text-zinc-300 rounded-lg hover:border-zinc-500 transition"
          >
            📋 Share
          </button>

          {/* Nostrudel link */}
          <a
            href={`https://nostrudel.ninja/#/n/${bounty.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-6 py-3 border border-zinc-700 text-zinc-300 rounded-lg hover:border-zinc-500 transition"
          >
            View on Nostrudel
          </a>
        </div>

        {/* Modals */}
        {showApply && (
          <ApplyModal bounty={bounty} onClose={() => setShowApply(false)} />
        )}

        {showComplete && (
          <MarkCompleteModal
            bounty={bounty}
            applications={applications}
            onClose={() => setShowComplete(false)}
            onComplete={() => {
              setShowComplete(false);
              window.location.reload();
            }}
          />
        )}
      </div>
    </main>
  );
}

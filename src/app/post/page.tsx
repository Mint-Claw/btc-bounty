"use client";

import { useState } from "react";
import Link from "next/link";
import NIP07Guard from "@/components/NIP07Guard";
import type { BountyCategory } from "@/lib/nostr/schema";

const CATEGORIES: BountyCategory[] = [
  "code",
  "design",
  "writing",
  "research",
  "other",
];

export default function PostBounty() {
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [content, setContent] = useState("");
  const [rewardSats, setRewardSats] = useState("");
  const [category, setCategory] = useState<BountyCategory>("code");
  const [lightning, setLightning] = useState("");
  const [tags, setTags] = useState("");
  const [status, setStatus] = useState<
    "idle" | "signing" | "published" | "error"
  >("idle");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("signing");

    try {
      const { publishBounty } = await import("@/lib/nostr/bounty");
      await publishBounty({
        title,
        summary,
        content,
        rewardSats: parseInt(rewardSats, 10),
        category,
        lightning,
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      });
      setStatus("published");
    } catch (err) {
      console.error("Failed to publish bounty:", err);
      setStatus("error");
    }
  };

  if (status === "published") {
    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center">
        <div className="text-center">
          <div className="text-5xl mb-4">⚡</div>
          <h2 className="text-2xl font-bold text-green-400 mb-2">
            Bounty Published!
          </h2>
          <p className="text-zinc-400 mb-6">
            Your bounty is live on NOSTR relays.
          </p>
          <Link
            href="/"
            className="px-4 py-2 bg-orange-500 text-black rounded font-semibold hover:bg-orange-400 transition"
          >
            Back to Bounties
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center gap-2">
          <Link href="/" className="text-zinc-400 hover:text-zinc-200">
            ← Back
          </Link>
          <h1 className="text-xl font-bold text-orange-400 ml-4">
            Post a Bounty
          </h1>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-6 py-8">
        <NIP07Guard>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">
                Title *
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Build a NOSTR relay monitor bot"
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-zinc-100 placeholder-zinc-600 focus:border-orange-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">
                Summary
              </label>
              <input
                type="text"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="One-line description"
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-zinc-100 placeholder-zinc-600 focus:border-orange-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">
                Description *
              </label>
              <textarea
                required
                rows={6}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Full bounty description (markdown supported)..."
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-zinc-100 placeholder-zinc-600 focus:border-orange-500 focus:outline-none resize-y"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">
                  Reward (sats) *
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  value={rewardSats}
                  onChange={(e) => setRewardSats(e.target.value)}
                  placeholder="50000"
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-zinc-100 placeholder-zinc-600 focus:border-orange-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">
                  Category
                </label>
                <select
                  value={category}
                  onChange={(e) =>
                    setCategory(e.target.value as BountyCategory)
                  }
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-zinc-100 focus:border-orange-500 focus:outline-none"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">
                Your Lightning Address *
              </label>
              <input
                type="text"
                required
                value={lightning}
                onChange={(e) => setLightning(e.target.value)}
                placeholder="you@getalby.com"
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-zinc-100 placeholder-zinc-600 focus:border-orange-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">
                Tags (comma-separated)
              </label>
              <input
                type="text"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="bitcoin, code, nostr"
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-zinc-100 placeholder-zinc-600 focus:border-orange-500 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={status === "signing"}
              className="w-full py-3 bg-orange-500 text-black rounded-lg font-bold text-lg hover:bg-orange-400 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {status === "signing"
                ? "Signing with NIP-07..."
                : "⚡ Post Bounty"}
            </button>

            {status === "error" && (
              <p className="text-red-400 text-sm text-center">
                Failed to publish. Check console for details.
              </p>
            )}
          </form>
        </NIP07Guard>
      </div>
    </main>
  );
}

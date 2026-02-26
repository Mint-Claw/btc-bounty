import BountyCard from "@/components/BountyCard";
import type { Bounty } from "@/lib/nostr/schema";
import Link from "next/link";

// Mock data — replaced by NDK subscription in Sprint 2
const MOCK_BOUNTIES: Bounty[] = [
  {
    id: "mock1",
    pubkey: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
    dTag: "logo-design",
    title: "Design a logo for BTC-Bounty",
    summary: "Clean, minimal logo. Bitcoin orange + lightning bolt motif.",
    content: "Looking for a professional logo...",
    rewardSats: 50000,
    status: "OPEN",
    category: "design",
    lightning: "poster@getalby.com",
    createdAt: Math.floor(Date.now() / 1000) - 3600,
    tags: ["design", "bitcoin", "logo"],
  },
  {
    id: "mock2",
    pubkey: "b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3",
    dTag: "nostr-bot",
    title: "Build a NOSTR relay monitor bot",
    summary: "Monitor relay health, post status updates as kind:1 notes.",
    content: "Need a lightweight bot that monitors relay uptime...",
    rewardSats: 150000,
    status: "OPEN",
    category: "code",
    lightning: "dev@wallet.com",
    createdAt: Math.floor(Date.now() / 1000) - 7200,
    tags: ["code", "nostr", "bot"],
  },
  {
    id: "mock3",
    pubkey: "c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
    dTag: "whitepaper-review",
    title: "Review and edit a Bitcoin DeFi whitepaper",
    summary: "10-page whitepaper needs technical review and copyediting.",
    content: "Technical whitepaper on Bitcoin-native DeFi...",
    rewardSats: 75000,
    status: "IN_PROGRESS",
    category: "writing",
    lightning: "writer@ln.tips",
    createdAt: Math.floor(Date.now() / 1000) - 86400,
    tags: ["writing", "bitcoin", "defi"],
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header className="border-b border-zinc-800 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">⚡</span>
            <h1 className="text-xl font-bold text-orange-400">BTC-Bounty</h1>
            <span className="text-xs text-zinc-500 ml-2">
              Bitcoin-native bounties on NOSTR
            </span>
          </div>
          <Link
            href="/post"
            className="px-4 py-2 bg-orange-500 text-black rounded-lg font-semibold text-sm hover:bg-orange-400 transition"
          >
            Post Bounty
          </Link>
        </div>
      </header>

      {/* Bounty List */}
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-zinc-300">
            Open Bounties
          </h2>
          <span className="text-sm text-zinc-500">
            {MOCK_BOUNTIES.length} bounties
          </span>
        </div>

        <div className="space-y-3">
          {MOCK_BOUNTIES.map((bounty) => (
            <BountyCard key={bounty.id} bounty={bounty} />
          ))}
        </div>

        <p className="text-center text-zinc-600 text-sm mt-8">
          Mock data — live relay subscriptions coming in Sprint 2
        </p>
      </div>
    </main>
  );
}

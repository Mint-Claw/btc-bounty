import type { Metadata } from "next";
import { getCachedBounty } from "@/lib/server/db";

interface Props {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
}

/**
 * Dynamic metadata for individual bounty pages.
 * Reads directly from SQLite cache — no HTTP round-trip needed.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;

  try {
    const bounty = getCachedBounty(id);

    if (bounty && bounty.title) {
      const sats = bounty.reward_sats || 0;
      const title = `${bounty.title} — ⚡${Number(sats).toLocaleString()} sats`;
      const description = bounty.content?.slice(0, 160) || "View this bounty on BTC-Bounty";

      return {
        title,
        description,
        openGraph: {
          title,
          description,
          type: "article",
          siteName: "BTC-Bounty",
        },
        twitter: {
          card: "summary_large_image",
          title,
          description,
        },
      };
    }
  } catch {
    // Fall through to defaults
  }

  return {
    title: `Bounty ${id.slice(0, 8)}… — BTC-Bounty`,
    description: "View this bounty on BTC-Bounty — Bitcoin-native bounties on NOSTR",
  };
}

export default function BountyLayout({ children }: Props) {
  return <>{children}</>;
}

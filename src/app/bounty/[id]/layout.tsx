import type { Metadata } from "next";

interface Props {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
}

/**
 * Dynamic metadata for individual bounty pages.
 * Fetches bounty info from the cached API to generate OG tags.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;

  // Try to fetch bounty from our cached API
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  try {
    const res = await fetch(`${appUrl}/api/bounties/${id}`, {
      next: { revalidate: 300 }, // Cache for 5 min
    });

    if (res.ok) {
      const bounty = await res.json();

      if (bounty && bounty.title) {
        const sats = bounty.reward_sats || 0;
        const title = `${bounty.title} — ⚡${Number(sats).toLocaleString()} sats`;
        const description = bounty.summary || bounty.content?.slice(0, 160) || "View this bounty on BTC-Bounty";

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

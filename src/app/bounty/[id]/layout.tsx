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

export default async function BountyLayout({ params, children }: Props) {
  const { id } = await params;
  let jsonLd = null;

  try {
    const bounty = getCachedBounty(id);
    if (bounty?.title) {
      const baseUrl = process.env.APP_URL
        || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
        || "https://btc-bounty.io";

      jsonLd = {
        "@context": "https://schema.org",
        "@type": "CreativeWork",
        name: bounty.title,
        description: bounty.content?.slice(0, 300) || "",
        url: `${baseUrl}/bounty/${id}`,
        dateCreated: bounty.created_at,
        author: { "@type": "Person", identifier: bounty.pubkey },
        ...(bounty.status === "OPEN" && {
          offers: {
            "@type": "Offer",
            price: String(bounty.reward_sats || 0),
            priceCurrency: "SAT",
            availability: "https://schema.org/InStock",
          },
        }),
        keywords: bounty.category || "code",
      };
    }
  } catch {
    // Silently skip JSON-LD if DB read fails
  }

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      {children}
    </>
  );
}

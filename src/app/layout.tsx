import type { Metadata } from "next";
import "./globals.css";

// Use APP_URL env, Vercel URL, or fallback domain for OG image URLs
const baseUrl = process.env.APP_URL
  || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
  || "https://btc-bounty.io";

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: "BTCBOUNTY — Bitcoin bounties for humans and agents",
  description:
    "Post Bitcoin bounties for agents or humans. Solve bounties as an agent or human. Discover work through Nostr, MOLTBOOK-oriented metadata, and agent-readable feeds.",
  openGraph: {
    title: "BTCBOUNTY — Bitcoin bounties for humans and agents",
    description:
      "A Nostr-native BTC bounty board where people and agents post, fund, discover, and solve bounties. Public alpha now open.",
    type: "website",
    siteName: "BTCBOUNTY",
  },
  twitter: {
    card: "summary_large_image",
    title: "BTCBOUNTY",
    description: "Post BTC bounties for agents or humans. Solve bounties as an agent or human.",
  },
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <meta name="theme-color" content="#f97316" />
        <link rel="manifest" href="/manifest.json" />
        <link
          rel="alternate"
          type="application/rss+xml"
          title="BTC Bounty — Open Bounties"
          href="/api/bounties/feed"
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebApplication",
              name: "BTCBOUNTY",
              description: "Bitcoin-native bounty board on NOSTR for human and agent bounty posters and solvers.",
              url: baseUrl,
              applicationCategory: "Freelance Platform",
              operatingSystem: "Web",
              offers: {
                "@type": "Offer",
                price: "0",
                priceCurrency: "BTC",
                description: "Free to browse bounties. BTCBOUNTY takes a small platform cut from bounty flow.",
              },
              potentialAction: {
                "@type": "SearchAction",
                target: `${baseUrl}/?q={search_term}`,
                "query-input": "required name=search_term",
              },
            }),
          }}
        />
      </head>
      <body className="bg-zinc-950 text-zinc-100 antialiased">{children}</body>
    </html>
  );
}

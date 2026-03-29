import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BTC-Bounty — Bitcoin-native bounties on NOSTR",
  description:
    "Post work, get paid in sats. A decentralized bounty platform built on NOSTR with Lightning payments.",
  openGraph: {
    title: "BTC-Bounty — Bitcoin-native bounties on NOSTR",
    description:
      "Post work, get paid in sats. Decentralized bounties with Lightning payments.",
    type: "website",
    siteName: "BTC-Bounty",
  },
  twitter: {
    card: "summary_large_image",
    title: "BTC-Bounty",
    description: "Bitcoin-native bounties on NOSTR. Post work, get paid in sats.",
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
      </head>
      <body className="bg-zinc-950 text-zinc-100 antialiased">{children}</body>
    </html>
  );
}

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
    card: "summary",
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
        <meta name="theme-color" content="#09090b" />
      </head>
      <body className="bg-zinc-950 text-zinc-100 antialiased">{children}</body>
    </html>
  );
}

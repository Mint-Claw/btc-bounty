import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BTC-Bounty — Bitcoin-native bounties on NOSTR",
  description:
    "Post work, get paid in sats. A decentralized bounty platform built on NOSTR with Lightning payments.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="bg-zinc-950 text-zinc-100 antialiased">{children}</body>
    </html>
  );
}

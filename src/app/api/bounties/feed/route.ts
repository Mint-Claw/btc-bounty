import { NextRequest, NextResponse } from "next/server";
import { listCachedBounties, type BountyEventRow } from "@/lib/server/db";

/**
 * GET /api/bounties/feed — RSS 2.0 feed of open bounties
 *
 * Returns an RSS feed for aggregators, search engines, and Nostr clients.
 * Reads from local SQLite cache — instant, no relay calls.
 * Run POST /api/admin/sync to populate/refresh the cache.
 */

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET(request: NextRequest) {
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    `${request.nextUrl.protocol}//${request.headers.get("host") || "localhost:3457"}`;

  let bounties: BountyEventRow[] = [];
  try {
    bounties = listCachedBounties({ status: "OPEN", limit: 30 });
  } catch (e) {
    console.error("[feed] Failed to read bounty cache:", e);
  }

  const items = bounties
    .map((b) => {
      const rewardStr = b.reward_sats ? ` — ${b.reward_sats.toLocaleString()} sats` : "";
      const pubDate = new Date(b.created_at * 1000).toUTCString();
      const link = `${appUrl}/bounty/${b.id}`;
      const description = b.content
        ? escapeXml(b.content.slice(0, 500))
        : b.summary
          ? escapeXml(b.summary.slice(0, 500))
          : "No description";

      return `    <item>
      <title>${escapeXml(b.title)}${escapeXml(rewardStr)}</title>
      <link>${escapeXml(link)}</link>
      <guid isPermaLink="true">${escapeXml(link)}</guid>
      <pubDate>${pubDate}</pubDate>
      <description>${description}</description>
      <category>${escapeXml(b.category || "bounty")}</category>
    </item>`;
    })
    .join("\n");

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>BTC Bounty — Open Bounties</title>
    <link>${escapeXml(appUrl)}</link>
    <description>Bitcoin-native bounty board built on Nostr. Pay via Lightning.</description>
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${escapeXml(appUrl)}/api/bounties/feed" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>`;

  return new NextResponse(rss, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=600",
    },
  });
}

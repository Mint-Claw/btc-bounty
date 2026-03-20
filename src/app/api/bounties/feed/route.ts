import { NextResponse } from "next/server";

/**
 * GET /api/bounties/feed — RSS 2.0 feed of open bounties
 *
 * Returns an RSS feed for aggregators, search engines, and Nostr clients
 * that want to discover available bounties.
 */

interface BountyEvent {
  id: string;
  pubkey: string;
  created_at: number;
  tags: string[][];
  content: string;
}

function getTag(event: BountyEvent, name: string): string | undefined {
  return event.tags.find((t) => t[0] === name)?.[1];
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET() {
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const relays = (
    process.env.NEXT_PUBLIC_RELAYS ||
    "wss://relay.damus.io,wss://nos.lol"
  ).split(",");

  // Fetch open bounties from relays
  const bounties: BountyEvent[] = [];

  for (const relayUrl of relays.slice(0, 2)) {
    try {
      const ws = await connectRelay(relayUrl);
      if (!ws) continue;

      const events = await queryRelay(ws, {
        kinds: [30402],
        limit: 50,
        "#t": ["bounty"],
      });

      for (const event of events) {
        const status = getTag(event, "status");
        if (!status || status.toUpperCase() === "OPEN") {
          bounties.push(event);
        }
      }

      ws.close();
      break; // Got results from first working relay
    } catch {
      continue;
    }
  }

  // Deduplicate by event id
  const seen = new Set<string>();
  const unique = bounties.filter((b) => {
    if (seen.has(b.id)) return false;
    seen.add(b.id);
    return true;
  });

  // Sort by creation date (newest first)
  unique.sort((a, b) => b.created_at - a.created_at);

  // Build RSS XML
  const items = unique
    .slice(0, 30)
    .map((b) => {
      const title = getTag(b, "title") || getTag(b, "subject") || "Untitled Bounty";
      const reward = getTag(b, "reward") || getTag(b, "price");
      const rewardStr = reward ? ` — ${reward} sats` : "";
      const pubDate = new Date(b.created_at * 1000).toUTCString();
      const link = `${appUrl}/bounty/${b.id}`;
      const description = b.content
        ? escapeXml(b.content.slice(0, 500))
        : "No description";

      return `    <item>
      <title>${escapeXml(title)}${escapeXml(rewardStr)}</title>
      <link>${escapeXml(link)}</link>
      <guid isPermaLink="true">${escapeXml(link)}</guid>
      <pubDate>${pubDate}</pubDate>
      <description>${description}</description>
      <category>bounty</category>
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

// Minimal WebSocket relay helpers (avoid importing full NDK for a feed endpoint)

function connectRelay(url: string): Promise<WebSocket | null> {
  return new Promise((resolve) => {
    try {
      const ws = new WebSocket(url);
      const timeout = setTimeout(() => {
        ws.close();
        resolve(null);
      }, 5000);

      ws.onopen = () => {
        clearTimeout(timeout);
        resolve(ws);
      };
      ws.onerror = () => {
        clearTimeout(timeout);
        resolve(null);
      };
    } catch {
      resolve(null);
    }
  });
}

function queryRelay(
  ws: WebSocket,
  filter: Record<string, unknown>,
): Promise<BountyEvent[]> {
  return new Promise((resolve) => {
    const events: BountyEvent[] = [];
    const subId = `feed-${Date.now()}`;
    const timeout = setTimeout(() => {
      ws.close();
      resolve(events);
    }, 8000);

    ws.onmessage = (msg) => {
      try {
        const data = JSON.parse(String(msg.data));
        if (data[0] === "EVENT" && data[1] === subId) {
          events.push(data[2] as BountyEvent);
        } else if (data[0] === "EOSE" && data[1] === subId) {
          clearTimeout(timeout);
          resolve(events);
        }
      } catch {
        // ignore parse errors
      }
    };

    ws.send(JSON.stringify(["REQ", subId, filter]));
  });
}

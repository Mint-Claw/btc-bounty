/**
 * GET /api/nostr/nip89 — NIP-89 App Handler Discovery
 *
 * Returns app metadata for Nostr client discovery.
 * Clients use this to discover BTC-Bounty as a handler for bounty events.
 *
 * @see https://github.com/nostr-protocol/nips/blob/master/89.md
 */

import { NextResponse } from "next/server";
import { BOUNTY_KIND } from "@/lib/nostr/schema";
import { APP_NAME, DOMAIN } from "@/constants/relays";

export async function GET() {
  const appMeta = {
    name: APP_NAME,
    display_name: "BTC Bounty",
    description:
      "Bitcoin-native bounty platform powered by Nostr. Create, fund, and complete bounties with Lightning payments.",
    website: `https://${DOMAIN}`,
    picture: `https://${DOMAIN}/icon-512.png`,

    // NIP-89 handler info
    kinds: [BOUNTY_KIND],
    nip89: {
      handler_type: "web",
      handler_url: `https://${DOMAIN}/bounty/{d_tag}`,
      categories: [
        "code",
        "design",
        "writing",
        "research",
        "testing",
        "devops",
        "security",
        "other",
      ],
    },

    // API info
    api: {
      base_url: `https://${DOMAIN}/api`,
      docs_url: `https://${DOMAIN}/api/docs`,
      version: "0.2.0",
    },

    // Supported NIPs
    supported_nips: [1, 11, 57, 89],
  };

  return NextResponse.json(appMeta, {
    headers: {
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

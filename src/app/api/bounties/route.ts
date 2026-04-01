/**
 * Agent REST API — Bounty endpoints
 * 
 * POST /api/bounties — Create a new bounty (requires X-API-Key)
 *   Optional: set escrow=true to create a BTCPay invoice for escrow deposit.
 * GET  /api/bounties — List open bounties (public)
 */

import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/server/auth";
import { signEventServer } from "@/lib/server/signing";
import { publishToRelays, fetchFromRelays } from "@/lib/server/relay";
import {
  BOUNTY_KIND,
  buildBountyTags,
  parseBountyEvent,
  type BountyCategory,
} from "@/lib/nostr/schema";
import { createInvoice } from "@/lib/server/btcpay";
import { createPayment } from "@/lib/server/payments";
import { verifyNostrEvent } from "@/lib/nostr/verify";
import { deliverWebhook } from "@/lib/server/webhooks";
import { CreateBountySchema, validateBody } from "@/lib/validation";
import { TokuSyncService } from "@/lib/server/toku-sync";
import { shouldListOnToku } from "@/lib/server/toku";
import {
  listCachedBounties,
  searchCachedBounties,
  cacheBountyEvent,
  type BountyEventRow,
} from "@/lib/server/db";

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // ── Mode 1: Pre-signed event (power users with own NOSTR keys) ──
  // Submit a fully signed NIP-01 event directly. No X-API-Key needed.
  if (body.sig && body.id && body.pubkey && body.kind) {
    return handlePreSignedBounty(body);
  }

  // ── Mode 2: Managed signing (agent API key) ──
  const agent = authenticateRequest(request);
  if (!agent) {
    return NextResponse.json(
      { error: "Unauthorized. Provide X-API-Key header or submit a pre-signed event." },
      { status: 401 },
    );
  }

  const validation = validateBody(CreateBountySchema, body);
  if (validation.error) {
    return NextResponse.json(
      { error: validation.error, details: validation.details },
      { status: 400 },
    );
  }

  const data = validation.data!;
  const { title, summary, content, rewardSats, category, lightning, tags, expiry, image, escrow } =
    data;

  const dTag = crypto.randomUUID();
  const eventTags = buildBountyTags({
    dTag,
    title,
    summary: summary || "",
    rewardSats,
    category: (category as BountyCategory) || "other",
    lightning,
    tags: tags || [],
    expiry,
    image,
  });

  const signed = signEventServer(agent.nsecHex, {
    kind: BOUNTY_KIND,
    content,
    tags: eventTags,
  });

  try {
    const relayCount = await publishToRelays(signed);

    // If escrow requested, create a BTCPay invoice for the bounty amount
    let escrowInvoice = null;
    if (escrow) {
      try {
        const invoice = await createInvoice({
          amount: rewardSats,
          bountyId: dTag,
          description: `Bounty escrow: ${title}`,
          expirationMinutes: 120,
        });

        // Track payment
        await createPayment({
          bountyId: dTag,
          bountyEventId: signed.id,
          posterPubkey: signed.pubkey,
          amountSats: rewardSats,
          btcpayInvoiceId: invoice.id,
        });

        escrowInvoice = {
          invoiceId: invoice.id,
          checkoutLink: invoice.checkoutLink,
          status: invoice.status,
          expiresAt: invoice.expirationTime,
        };
      } catch (e) {
        // Non-fatal: bounty is posted but escrow creation failed
        console.error("[bounty] Escrow invoice creation failed:", e);
        escrowInvoice = {
          error: `Escrow creation failed: ${(e as Error).message}`,
        };
      }
    }

    // Cross-list on toku.agency if above threshold (async, non-blocking)
    if (shouldListOnToku(rewardSats)) {
      const tokuSync = new TokuSyncService();
      tokuSync.listBounty({
        id: signed.id,
        pubkey: signed.pubkey,
        dTag,
        title,
        content,
        rewardSats,
        category: (category as string) || "other",
        tags: tags || [],
        status: "OPEN",
        createdAt: signed.created_at,
      } as any).catch((e: Error) => {
        console.error("[bounty] toku.agency listing failed:", e.message);
      });
    }

    // Fire webhook notification (async, non-blocking)
    deliverWebhook("bounty.created", {
      id: signed.id,
      pubkey: signed.pubkey,
      dTag,
      title: body.title,
      reward_sats: body.reward_sats,
      category: body.category,
    });

    return NextResponse.json(
      {
        id: signed.id,
        pubkey: signed.pubkey,
        dTag,
        relaysPublished: relayCount,
        ...(escrowInvoice && { escrow: escrowInvoice }),
      },
      { status: 201 },
    );
  } catch (e) {
    return NextResponse.json(
      { error: `Failed to publish: ${(e as Error).message}` },
      { status: 502 },
    );
  }
}

/**
 * GET /api/bounties — List open bounties
 *
 * Strategy: cache-first (SQLite) with relay fallback.
 *   ?source=relay  → force relay fetch (bypasses cache)
 *   ?source=cache  → cache only (no relay fallback)
 *   default        → try cache first, fall back to relay if empty
 *
 * Also backfills the cache when fetching from relays.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const status = searchParams.get("status") || "OPEN";
  const category = searchParams.get("category");
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
  const offset = parseInt(searchParams.get("offset") || "0");
  const search = searchParams.get("q")?.toLowerCase();
  const tag = searchParams.get("tag")?.toLowerCase();
  const minReward = parseInt(searchParams.get("min_reward") || "0");
  const maxReward = parseInt(searchParams.get("max_reward") || "0") || Infinity;
  const since = searchParams.get("since"); // ISO date or unix timestamp
  const sortBy = searchParams.get("sort") || "newest"; // newest, reward, expiring
  const source = searchParams.get("source") || "auto"; // auto, cache, relay

  const filters = {
    status,
    ...(category && { category }),
    ...(search && { q: search }),
    ...(tag && { tag }),
    ...(minReward > 0 && { min_reward: minReward }),
    ...(maxReward < Infinity && { max_reward: maxReward }),
    sort: sortBy,
    source,
  };

  // ── Try cache first (unless forced relay) ──
  if (source !== "relay") {
    try {
      const cached = search
        ? searchCachedBounties(search, { status, limit: limit * 2 })
        : listCachedBounties({
            status,
            category: category || undefined,
            limit: limit * 2,
            offset,
          });

      if (cached.length > 0 || source === "cache") {
        let results = cached
          .filter((b) => b.reward_sats >= minReward && b.reward_sats <= (maxReward === Infinity ? Number.MAX_SAFE_INTEGER : maxReward));

        // Tag filter (check tags_json)
        if (tag) {
          results = results.filter((b) => {
            if (!b.tags_json) return false;
            try {
              const tags = JSON.parse(b.tags_json) as string[][];
              return tags.some(
                (t) => t[0] === "t" && t[1]?.toLowerCase() === tag,
              );
            } catch {
              return false;
            }
          });
        }

        // Sort
        results = sortCachedBounties(results, sortBy);
        results = results.slice(0, limit);

        return NextResponse.json({
          bounties: results.map(cachedRowToResponse),
          count: results.length,
          source: "cache",
          filters,
        });
      }
    } catch (e) {
      console.error("[bounties] Cache read failed, falling back to relay:", e);
    }
  }

  // ── Relay fetch (fallback or forced) ──
  try {
    const filter: Record<string, unknown> = {
      kinds: [BOUNTY_KIND],
      limit: limit * 2,
    };

    if (since) {
      const sinceTs = since.includes("-")
        ? Math.floor(new Date(since).getTime() / 1000)
        : parseInt(since);
      if (!isNaN(sinceTs)) filter.since = sinceTs;
    }

    const events = await fetchFromRelays(filter);

    // Backfill cache (async, non-blocking)
    for (const e of events) {
      const parsed = parseBountyEvent({
        id: e.id, pubkey: e.pubkey, content: e.content,
        tags: e.tags, created_at: e.created_at,
      });
      if (parsed) {
        try {
          cacheBountyEvent({
            id: e.id, dTag: parsed.dTag, pubkey: e.pubkey,
            kind: BOUNTY_KIND, title: parsed.title,
            summary: parsed.summary, content: parsed.content,
            rewardSats: parsed.rewardSats, status: parsed.status,
            category: parsed.category, lightning: parsed.lightning,
            tags: e.tags, createdAt: e.created_at,
          });
        } catch { /* ignore cache write errors */ }
      }
    }

    let bounties = events
      .map((e) => {
        const parsed = parseBountyEvent({
          id: e.id, pubkey: e.pubkey, content: e.content,
          tags: e.tags, created_at: e.created_at,
        });
        if (parsed) {
          const verification = verifyNostrEvent(e, { skipTimestamp: true });
          (parsed as unknown as Record<string, unknown>).verified = verification.valid;
        }
        return parsed;
      })
      .filter((b) => b !== null)
      .filter((b) => !status || b.status === status)
      .filter((b) => !category || b.category === category)
      .filter((b) => b.rewardSats >= minReward && b.rewardSats <= maxReward);

    if (search) {
      bounties = bounties.filter(
        (b) =>
          b.title.toLowerCase().includes(search) ||
          b.content?.toLowerCase().includes(search) ||
          b.tags?.some((t: string) => t.toLowerCase().includes(search)),
      );
    }

    if (tag) {
      bounties = bounties.filter(
        (b) => b.tags?.some((t: string) => t.toLowerCase() === tag),
      );
    }

    switch (sortBy) {
      case "reward":
        bounties.sort((a, b) => b.rewardSats - a.rewardSats);
        break;
      case "expiring":
        bounties.sort((a, b) => {
          const aExp = a.expiry ?? Infinity;
          const bExp = b.expiry ?? Infinity;
          return aExp - bExp;
        });
        break;
      case "oldest":
        bounties.sort((a, b) => a.createdAt - b.createdAt);
        break;
      default:
        bounties.sort((a, b) => b.createdAt - a.createdAt);
    }

    bounties = bounties.slice(0, limit);

    return NextResponse.json({
      bounties,
      count: bounties.length,
      source: "relay",
      filters,
    });
  } catch (e) {
    return NextResponse.json(
      { error: `Relay error: ${(e as Error).message}` },
      { status: 502 },
    );
  }
}

// ── Pre-signed event handler ─────────────────────────────────

import { verifyBountyEvent } from "@/lib/nostr/verify";

async function handlePreSignedBounty(
  event: Record<string, unknown>,
): Promise<NextResponse> {
  // Verify the event cryptographically
  const verification = verifyBountyEvent(event);
  if (!verification.valid) {
    return NextResponse.json(
      {
        error: "Invalid pre-signed event",
        details: verification.errors,
        checks: verification.checks,
      },
      { status: 400 },
    );
  }

  // Extract bounty metadata
  const tags = event.tags as string[][];
  const dTag = tags.find((t) => t[0] === "d")?.[1];
  const title = tags.find((t) => t[0] === "title")?.[1] ||
    tags.find((t) => t[0] === "subject")?.[1];
  const rewardStr = tags.find((t) => t[0] === "reward")?.[1];
  const rewardSats = rewardStr ? parseInt(rewardStr) : 0;
  const category = tags.find((t) => t[0] === "category")?.[1] || "other";

  if (!dTag || !title) {
    return NextResponse.json(
      { error: "Event missing required tags: d, title" },
      { status: 400 },
    );
  }

  try {
    // Publish the pre-signed event as-is
    const relayCount = await publishToRelays(event as unknown as Parameters<typeof publishToRelays>[0]);

    // Cache it
    try {
      cacheBountyEvent({
        id: event.id as string,
        dTag,
        pubkey: event.pubkey as string,
        kind: BOUNTY_KIND,
        title,
        summary: tags.find((t) => t[0] === "summary")?.[1],
        content: event.content as string,
        rewardSats,
        status: tags.find((t) => t[0] === "status")?.[1] || "OPEN",
        category,
        tags,
        createdAt: event.created_at as number,
      });
    } catch { /* ignore cache write errors */ }

    // Cross-list on toku.agency if above threshold
    if (shouldListOnToku(rewardSats)) {
      const tokuSync = new TokuSyncService();
      tokuSync.listBounty({
        id: event.id as string,
        pubkey: event.pubkey as string,
        dTag,
        title,
        content: event.content as string,
        rewardSats,
        category,
        tags: tags.filter((t) => t[0] === "t").map((t) => t[1]),
        status: "OPEN",
        createdAt: event.created_at as number,
      } as any).catch((e: Error) => {
        console.error("[bounty] toku.agency listing failed:", e.message);
      });
    }

    // Fire webhook
    deliverWebhook("bounty.created", {
      id: event.id as string,
      pubkey: event.pubkey as string,
      dTag,
      title,
      reward_sats: rewardSats,
      category,
      preSigned: true,
    });

    return NextResponse.json(
      {
        id: event.id as string,
        pubkey: event.pubkey as string,
        dTag,
        relaysPublished: relayCount,
        preSigned: true,
      },
      { status: 201 },
    );
  } catch (e) {
    return NextResponse.json(
      { error: `Failed to publish: ${(e as Error).message}` },
      { status: 502 },
    );
  }
}

// ── Helpers ──────────────────────────────────────────────────

function sortCachedBounties(
  rows: BountyEventRow[],
  sortBy: string,
): BountyEventRow[] {
  switch (sortBy) {
    case "reward":
      return rows.sort((a, b) => b.reward_sats - a.reward_sats);
    case "oldest":
      return rows.sort((a, b) => a.created_at - b.created_at);
    default: // newest
      return rows.sort((a, b) => b.created_at - a.created_at);
  }
}

function cachedRowToResponse(row: BountyEventRow) {
  let tags: string[][] | undefined;
  try {
    tags = row.tags_json ? JSON.parse(row.tags_json) : undefined;
  } catch {
    tags = undefined;
  }

  return {
    id: row.id,
    dTag: row.d_tag,
    pubkey: row.pubkey,
    title: row.title,
    summary: row.summary,
    content: row.content,
    rewardSats: row.reward_sats,
    status: row.status,
    category: row.category,
    lightning: row.lightning,
    winnerPubkey: row.winner_pubkey,
    createdAt: row.created_at,
    tags: tags
      ?.filter((t) => t[0] === "t")
      .map((t) => t[1]) || [],
    verified: true, // Cache entries came from verified relay events
    source: "cache",
  };
}

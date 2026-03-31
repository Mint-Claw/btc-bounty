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

export async function POST(request: NextRequest) {
  const agent = authenticateRequest(request);
  if (!agent) {
    return NextResponse.json(
      { error: "Unauthorized. Provide X-API-Key header." },
      { status: 401 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
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

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const status = searchParams.get("status") || "OPEN";
  const category = searchParams.get("category");
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
  const search = searchParams.get("q")?.toLowerCase();
  const tag = searchParams.get("tag")?.toLowerCase();
  const minReward = parseInt(searchParams.get("min_reward") || "0");
  const maxReward = parseInt(searchParams.get("max_reward") || "0") || Infinity;
  const since = searchParams.get("since"); // ISO date or unix timestamp
  const sortBy = searchParams.get("sort") || "newest"; // newest, reward, expiring

  try {
    const filter: Record<string, unknown> = {
      kinds: [BOUNTY_KIND],
      limit: limit * 2, // Fetch extra to account for client-side filtering
    };

    // Use Nostr since filter if provided
    if (since) {
      const sinceTs = since.includes("-")
        ? Math.floor(new Date(since).getTime() / 1000)
        : parseInt(since);
      if (!isNaN(sinceTs)) filter.since = sinceTs;
    }

    const events = await fetchFromRelays(filter);
    let bounties = events
      .map((e) => {
        const parsed = parseBountyEvent({
          id: e.id,
          pubkey: e.pubkey,
          content: e.content,
          tags: e.tags,
          created_at: e.created_at,
        });
        if (parsed) {
          // Cryptographically verify the event signature (NIP-01)
          const verification = verifyNostrEvent(e, { skipTimestamp: true });
          (parsed as unknown as Record<string, unknown>).verified = verification.valid;
        }
        return parsed;
      })
      .filter((b) => b !== null)
      .filter((b) => !status || b.status === status)
      .filter((b) => !category || b.category === category)
      .filter(
        (b) => b.rewardSats >= minReward && b.rewardSats <= maxReward,
      );

    // Text search across title, content, and tags
    if (search) {
      bounties = bounties.filter(
        (b) =>
          b.title.toLowerCase().includes(search) ||
          b.content?.toLowerCase().includes(search) ||
          b.tags?.some((t: string) => t.toLowerCase().includes(search)),
      );
    }

    // Filter by specific tag
    if (tag) {
      bounties = bounties.filter(
        (b) => b.tags?.some((t: string) => t.toLowerCase() === tag),
      );
    }

    // Sort
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
      default: // newest
        bounties.sort((a, b) => b.createdAt - a.createdAt);
    }

    // Apply limit after filtering
    bounties = bounties.slice(0, limit);

    return NextResponse.json({
      bounties,
      count: bounties.length,
      filters: {
        status,
        ...(category && { category }),
        ...(search && { q: search }),
        ...(tag && { tag }),
        ...(minReward > 0 && { min_reward: minReward }),
        ...(maxReward < Infinity && { max_reward: maxReward }),
        sort: sortBy,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: `Relay error: ${(e as Error).message}` },
      { status: 502 },
    );
  }
}

/**
 * toku.agency Webhook Handler
 *
 * POST /api/webhooks/toku
 *
 * Receives webhook events from toku.agency:
 * - bid.received → Forward application to NOSTR as kind:1 reply
 * - job.accepted/delivered/completed/cancelled → Sync status
 * - dm.received → Log for now
 *
 * Verifies webhook authenticity via TOKU_WEBHOOK_SECRET.
 */

import { NextRequest, NextResponse } from "next/server";
import { TokuSyncService } from "@/lib/server/toku-sync";
import type { TokuWebhookPayload } from "@/lib/server/toku";
import { createHmac } from "crypto";

// ─── Webhook Verification ────────────────────────────────────

function verifyWebhookSignature(
  body: string,
  signature: string | null,
  secret: string
): boolean {
  if (!secret || !signature) {
    // If no secret configured, skip verification (dev mode)
    console.warn("[toku-webhook] No webhook secret configured, skipping verification");
    return !secret; // Only allow if secret is empty (dev mode)
  }

  const expected = createHmac("sha256", secret).update(body).digest("hex");
  return signature === expected || signature === `sha256=${expected}`;
}

// ─── Singleton sync service ──────────────────────────────────

let syncService: TokuSyncService | null = null;

function getSyncService(): TokuSyncService {
  if (!syncService) {
    syncService = new TokuSyncService({
      onApplication: async (bountyDTag, applicant) => {
        // In production, this would publish a kind:1 NOSTR reply
        // using the server-side signing from bounty-updater.ts
        console.log(
          `[toku-webhook] TODO: Forward toku bid to NOSTR reply`,
          `bounty=${bountyDTag} agent=${applicant.tokuAgentId}`,
          `price=$${(applicant.priceCents / 100).toFixed(2)}`,
          `message=${applicant.message.slice(0, 100)}`
        );
      },
    });
  }
  return syncService;
}

// ─── POST Handler ────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.text();
    const secret = process.env.TOKU_WEBHOOK_SECRET || "";
    const signature = req.headers.get("x-toku-signature") ||
      req.headers.get("x-webhook-signature");

    // Verify signature
    if (!verifyWebhookSignature(body, signature, secret)) {
      console.warn("[toku-webhook] Invalid webhook signature");
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 401 }
      );
    }

    // Parse payload
    let payload: TokuWebhookPayload;
    try {
      payload = JSON.parse(body);
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON" },
        { status: 400 }
      );
    }

    if (!payload.event) {
      return NextResponse.json(
        { error: "Missing event field" },
        { status: 400 }
      );
    }

    // Process the webhook
    const service = getSyncService();
    await service.processWebhook(payload);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[toku-webhook] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

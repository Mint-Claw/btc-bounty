/**
 * BTCPay Webhook Handler
 *
 * Receives callbacks from BTCPay Server when:
 *   - InvoiceSettled    → Bounty escrow funded, update NOSTR event
 *   - PayoutApproved    → Winner payout confirmed
 *
 * Webhook URL: https://<domain>/api/webhooks/btcpay
 * Configure in BTCPay Server → Store → Webhooks
 */

import { NextRequest, NextResponse } from "next/server";
import {
  verifyWebhookSignature,
  parseWebhookPayload,
  getInvoice,
  getPayout,
  type WebhookPayload,
} from "@/lib/server/btcpay";
import {
  getPaymentByInvoiceId,
  updatePaymentStatus,
  getPaymentByPayoutId,
} from "@/lib/server/payments";
import { markBountyFunded, markBountyPaid } from "@/lib/server/bounty-updater";
import { sendNotification } from "@/lib/server/notifications";

export async function POST(request: NextRequest) {
  // Read raw body for signature verification
  const rawBody = await request.text();
  const signature = request.headers.get("btcpay-sig") || "";

  // Verify webhook signature
  const valid = await verifyWebhookSignature(rawBody, signature);
  if (!valid) {
    console.error("[webhook] Invalid BTCPay signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // Parse payload
  const payload = parseWebhookPayload(rawBody);
  if (!payload) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  console.log(
    `[webhook] BTCPay event: ${payload.type} (delivery: ${payload.deliveryId})`,
  );

  try {
    switch (payload.type) {
      case "InvoiceSettled":
      case "InvoicePaymentSettled":
        await handleInvoiceSettled(payload);
        break;

      case "PayoutApproved":
        await handlePayoutApproved(payload);
        break;

      case "InvoiceExpired":
      case "InvoiceInvalid":
        await handleInvoiceFailed(payload);
        break;

      default:
        console.log(`[webhook] Unhandled event type: ${payload.type}`);
    }
  } catch (e) {
    console.error(`[webhook] Handler error:`, e);
    // Return 200 anyway so BTCPay doesn't retry
    // (we log the error for investigation)
  }

  return NextResponse.json({ received: true });
}

// ─── Event handlers ──────────────────────────────────────────

async function handleInvoiceSettled(payload: WebhookPayload) {
  if (!payload.invoiceId) {
    console.error("[webhook] InvoiceSettled missing invoiceId");
    return;
  }

  console.log(`[webhook] Invoice settled: ${payload.invoiceId}`);

  // Get full invoice details from BTCPay
  const invoice = await getInvoice(payload.invoiceId);
  const bountyId = invoice.metadata?.bountyId;

  if (!bountyId) {
    console.error(
      `[webhook] Invoice ${payload.invoiceId} has no bountyId in metadata`,
    );
    return;
  }

  // Update payment record
  const payment = await getPaymentByInvoiceId(payload.invoiceId);
  if (payment) {
    await updatePaymentStatus(payment.id, "funded");
    console.log(`[webhook] Bounty ${bountyId} funded via invoice ${payload.invoiceId}`);

    // Update NOSTR event to show funded status
    const relays = await markBountyFunded(bountyId, payment.posterPubkey);
    if (relays > 0) {
      console.log(`[webhook] NOSTR event updated: bounty ${bountyId} marked funded on ${relays} relays`);
    } else {
      console.warn(`[webhook] Could not update NOSTR event for bounty ${bountyId} (no managed nsec or relay error)`);
    }
    // Notify bounty poster that their escrow is funded
    sendNotification({
      type: "bounty.payment_confirmed",
      recipientPubkey: payment.posterPubkey,
      bountyTitle: bountyId,
      bountyId,
      extra: { amount: String(payment.amountSats) },
    }).catch((e) => console.error("[webhook] Notification failed:", e));
  } else {
    console.warn(
      `[webhook] No payment record found for invoice ${payload.invoiceId}`,
    );
  }
}

async function handlePayoutApproved(payload: WebhookPayload) {
  if (!payload.payoutId) {
    console.error("[webhook] PayoutApproved missing payoutId");
    return;
  }

  console.log(`[webhook] Payout approved: ${payload.payoutId}`);

  const payout = await getPayout(payload.payoutId);
  const bountyId = payout.metadata?.bountyId;
  const winnerPubkey = payout.metadata?.winnerPubkey;

  if (!bountyId) {
    console.error(
      `[webhook] Payout ${payload.payoutId} has no bountyId in metadata`,
    );
    return;
  }

  // Update payment record
  const payment = await getPaymentByPayoutId(payload.payoutId);
  if (payment) {
    await updatePaymentStatus(payment.id, "paid", winnerPubkey);
    console.log(
      `[webhook] Bounty ${bountyId} paid to ${winnerPubkey} via payout ${payload.payoutId}`,
    );

    // Update NOSTR event to show completed + winner
    if (winnerPubkey) {
      const relays = await markBountyPaid(bountyId, payment.posterPubkey, winnerPubkey);
      if (relays > 0) {
        console.log(`[webhook] NOSTR event updated: bounty ${bountyId} completed, winner ${winnerPubkey.slice(0, 12)}...`);
      }

      // Notify winner that payment was sent
      sendNotification({
        type: "bounty.payment_confirmed",
        recipientPubkey: winnerPubkey,
        bountyTitle: bountyId,
        bountyId,
        extra: { amount: String(payment.amountSats) },
      }).catch((e) => console.error("[webhook] Winner notification failed:", e));
    }
  }
}

async function handleInvoiceFailed(payload: WebhookPayload) {
  if (!payload.invoiceId) return;

  console.log(
    `[webhook] Invoice ${payload.type}: ${payload.invoiceId}`,
  );

  const payment = await getPaymentByInvoiceId(payload.invoiceId);
  if (payment) {
    await updatePaymentStatus(payment.id, "failed");
  }
}

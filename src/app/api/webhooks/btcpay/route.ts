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
import { log } from "@/lib/server/logger";

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("btcpay-sig") || "";

  const valid = await verifyWebhookSignature(rawBody, signature);
  if (!valid) {
    log.error("Invalid BTCPay webhook signature", { endpoint: "btcpay-webhook" });
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const payload = parseWebhookPayload(rawBody);
  if (!payload) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  log.info("BTCPay webhook received", {
    event: payload.type,
    deliveryId: payload.deliveryId,
    invoiceId: payload.invoiceId,
    payoutId: payload.payoutId,
  });

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
        log.info("Unhandled BTCPay event type", { event: payload.type });
    }
  } catch (e) {
    log.error("BTCPay webhook handler error", {
      event: payload.type,
      error: e instanceof Error ? e.message : String(e),
    });
  }

  return NextResponse.json({ received: true });
}

// ─── Event handlers ──────────────────────────────────────────

async function handleInvoiceSettled(payload: WebhookPayload) {
  if (!payload.invoiceId) {
    log.error("InvoiceSettled missing invoiceId", { payload });
    return;
  }

  const invoice = await getInvoice(payload.invoiceId);
  const bountyId = invoice.metadata?.bountyId;

  if (!bountyId) {
    log.error("Invoice has no bountyId in metadata", { invoiceId: payload.invoiceId });
    return;
  }

  const payment = await getPaymentByInvoiceId(payload.invoiceId);
  if (payment) {
    await updatePaymentStatus(payment.id, "funded");
    log.info("Bounty funded", { bountyId, invoiceId: payload.invoiceId, amountSats: payment.amountSats });

    const relays = await markBountyFunded(bountyId, payment.posterPubkey);
    if (relays > 0) {
      log.info("NOSTR event updated: funded", { bountyId, relays });
    } else {
      log.warn("Could not update NOSTR event", { bountyId, reason: "no managed nsec or relay error" });
    }

    sendNotification({
      type: "bounty.payment_confirmed",
      recipientPubkey: payment.posterPubkey,
      bountyTitle: bountyId,
      bountyId,
      extra: { amount: String(payment.amountSats) },
    }).catch((e) => log.error("Notification failed", { bountyId, error: String(e) }));
  } else {
    log.warn("No payment record for settled invoice", { invoiceId: payload.invoiceId });
  }
}

async function handlePayoutApproved(payload: WebhookPayload) {
  if (!payload.payoutId) {
    log.error("PayoutApproved missing payoutId", { payload });
    return;
  }

  const payout = await getPayout(payload.payoutId);
  const bountyId = payout.metadata?.bountyId;
  const winnerPubkey = payout.metadata?.winnerPubkey;

  if (!bountyId) {
    log.error("Payout has no bountyId in metadata", { payoutId: payload.payoutId });
    return;
  }

  const payment = await getPaymentByPayoutId(payload.payoutId);
  if (payment) {
    await updatePaymentStatus(payment.id, "paid", winnerPubkey);
    log.info("Bounty paid", { bountyId, winnerPubkey: winnerPubkey?.slice(0, 16), payoutId: payload.payoutId });

    if (winnerPubkey) {
      const relays = await markBountyPaid(bountyId, payment.posterPubkey, winnerPubkey);
      if (relays > 0) {
        log.info("NOSTR event updated: completed", { bountyId, winnerPubkey: winnerPubkey.slice(0, 16), relays });
      }

      sendNotification({
        type: "bounty.payment_confirmed",
        recipientPubkey: winnerPubkey,
        bountyTitle: bountyId,
        bountyId,
        extra: { amount: String(payment.amountSats) },
      }).catch((e) => log.error("Winner notification failed", { bountyId, error: String(e) }));
    }
  }
}

async function handleInvoiceFailed(payload: WebhookPayload) {
  if (!payload.invoiceId) return;

  log.info("Invoice failed", { event: payload.type, invoiceId: payload.invoiceId });

  const payment = await getPaymentByInvoiceId(payload.invoiceId);
  if (payment) {
    await updatePaymentStatus(payment.id, "failed");
  }
}

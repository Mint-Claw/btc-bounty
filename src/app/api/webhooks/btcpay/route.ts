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
  } else {
    console.warn(
      `[webhook] No payment record found for invoice ${payload.invoiceId}`,
    );
  }

  // TODO: Update NOSTR bounty event to show "funded" status
  // This requires the bounty poster's nsec, which is stored in the
  // API key mapping. We'll need to look up the agent by bountyId.
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

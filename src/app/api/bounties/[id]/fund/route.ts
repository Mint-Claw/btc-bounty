/**
 * POST /api/bounties/:id/fund — Create a BTCPay escrow invoice
 *
 * Body: { amountSats: number }
 *
 * Returns: { invoiceId, checkoutUrl, amountSats, platformFeeSats }
 */

import { NextRequest, NextResponse } from "next/server";
import { createInvoice } from "@/lib/server/btcpay";
import { createPayment, getPaymentByBountyId } from "@/lib/server/payments";
import { deliverWebhook } from "@/lib/server/webhooks";

const PLATFORM_FEE_RATE = 0.05; // 5%
const MIN_AMOUNT_SATS = 1000;
const MAX_AMOUNT_SATS = 10_000_000; // 10M sats = 0.1 BTC

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id: bountyId } = await params;
    const body = await request.json();
    const amountSats = Number(body.amountSats);

    // Validate amount
    if (!Number.isFinite(amountSats) || !Number.isInteger(amountSats) || amountSats < MIN_AMOUNT_SATS) {
      return NextResponse.json(
        { error: `Minimum amount is ${MIN_AMOUNT_SATS} sats` },
        { status: 400 },
      );
    }

    if (amountSats > MAX_AMOUNT_SATS) {
      return NextResponse.json(
        { error: `Maximum amount is ${MAX_AMOUNT_SATS.toLocaleString()} sats` },
        { status: 400 },
      );
    }

    // Check if already funded
    const existing = await getPaymentByBountyId(bountyId);
    if (existing && (existing.status === "funded" || existing.status === "paid")) {
      return NextResponse.json(
        { error: "This bounty is already funded" },
        { status: 409 },
      );
    }

    const platformFeeSats = Math.round(amountSats * PLATFORM_FEE_RATE);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    // Create BTCPay invoice
    const invoice = await createInvoice({
      amount: amountSats,
      currency: "SATS",
      bountyId,
      description: `BTC Bounty escrow: ${bountyId}`,
      expirationMinutes: 60,
      redirectUrl: `${appUrl}/bounty/${bountyId}?funded=true`,
    });

    // Track payment in our DB
    await createPayment({
      bountyId,
      bountyEventId: bountyId,
      posterPubkey: body.posterPubkey || "unknown",
      amountSats,
      btcpayInvoiceId: invoice.id,
    });

    // Fire webhook (async)
    deliverWebhook("bounty.funded", {
      bountyId,
      amountSats,
      platformFeeSats,
      invoiceId: invoice.id,
    });

    return NextResponse.json({
      invoiceId: invoice.id,
      checkoutUrl: invoice.checkoutLink,
      amountSats,
      platformFeeSats,
    });
  } catch (err) {
    console.error("[fund] Error creating invoice:", err);

    // If BTCPay is not configured, return helpful error
    if (
      err instanceof Error &&
      (err.message.includes("BTCPAY") || err.message.includes("fetch"))
    ) {
      return NextResponse.json(
        { error: "BTCPay Server is not configured. Set BTCPAY_URL, BTCPAY_API_KEY, and BTCPAY_STORE_ID." },
        { status: 503 },
      );
    }

    return NextResponse.json(
      { error: "Failed to create invoice" },
      { status: 500 },
    );
  }
}

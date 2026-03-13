/**
 * Payment tracking endpoints
 *
 * GET /api/payments              — List all payments (authenticated)
 * GET /api/payments?bountyId=xxx — Get payment for a specific bounty
 * GET /api/payments?status=funded — Filter by status
 */

import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/server/auth";
import {
  listPayments,
  getPaymentByBountyId,
  getPaymentStats,
  type PaymentStatus,
} from "@/lib/server/payments";

export async function GET(request: NextRequest) {
  const agent = authenticateRequest(request);
  if (!agent) {
    return NextResponse.json(
      { error: "Unauthorized. Provide X-API-Key header." },
      { status: 401 },
    );
  }

  const { searchParams } = request.nextUrl;
  const bountyId = searchParams.get("bountyId");
  const status = searchParams.get("status") as PaymentStatus | null;
  const includeStats = searchParams.get("stats") === "true";

  // Single bounty lookup
  if (bountyId) {
    const payment = await getPaymentByBountyId(bountyId);
    if (!payment) {
      return NextResponse.json(
        { error: "No payment found for this bounty" },
        { status: 404 },
      );
    }
    return NextResponse.json({ payment });
  }

  // List with optional status filter
  const payments = await listPayments(status || undefined);

  // Only show payments belonging to this agent
  const agentPayments = payments.filter(
    (p) => p.posterPubkey === agent.pubkey,
  );

  const response: Record<string, unknown> = {
    payments: agentPayments,
    count: agentPayments.length,
  };

  if (includeStats) {
    response.stats = await getPaymentStats();
  }

  return NextResponse.json(response);
}

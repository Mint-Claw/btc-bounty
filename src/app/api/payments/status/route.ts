/**
 * Public payment status endpoint
 *
 * GET /api/payments/status?bountyIds=id1,id2,id3
 *
 * Returns funding status for bounties (no auth required).
 * Only exposes the bountyId and funded/paid status — no amounts or details.
 */

import { NextRequest, NextResponse } from "next/server";
import { getPaymentByBountyId } from "@/lib/server/payments";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const bountyIdsParam = searchParams.get("bountyIds");

  if (!bountyIdsParam) {
    return NextResponse.json(
      { error: "Provide bountyIds query param (comma-separated)" },
      { status: 400 },
    );
  }

  const bountyIds = bountyIdsParam.split(",").slice(0, 50); // Cap at 50

  const statuses: Record<string, { funded: boolean; paid: boolean }> = {};

  for (const id of bountyIds) {
    const trimmed = id.trim();
    if (!trimmed) continue;

    const payment = await getPaymentByBountyId(trimmed);
    statuses[trimmed] = {
      funded: payment?.status === "funded" || payment?.status === "paid",
      paid: payment?.status === "paid",
    };
  }

  return NextResponse.json(
    { statuses },
    {
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
      },
    },
  );
}

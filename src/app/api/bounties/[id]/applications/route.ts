/**
 * GET /api/bounties/:id/applications — List applicants for a bounty
 *
 * Reads from SQLite (primary) and optionally merges relay-sourced
 * kind:1 replies for backward compatibility.
 */

import { NextRequest, NextResponse } from "next/server";
import { getApplicationsForBounty } from "@/lib/server/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: bountyId } = await params;

  try {
    const rows = getApplicationsForBounty(bountyId);

    const applications = rows.map((row) => ({
      id: row.id,
      pubkey: row.applicant_pubkey,
      pitch: row.pitch,
      lightning: row.lightning || "",
      status: row.status,
      createdAt: row.created_at,
    }));

    return NextResponse.json({
      applications,
      count: applications.length,
      bountyId,
    });
  } catch (e) {
    return NextResponse.json(
      { error: `Database error: ${(e as Error).message}` },
      { status: 500 },
    );
  }
}

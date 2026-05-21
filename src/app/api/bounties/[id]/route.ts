import { NextResponse } from "next/server";
import {
  getCachedBounty,
  getApplicationsForBounty,
  getSubmissionsForBounty,
  type BountyEventRow,
} from "@/lib/server/db";
import { getPaymentByBountyId, listPaymentLedger } from "@/lib/server/payments";

/**
 * GET /api/bounties/:id
 *
 * Get enriched bounty detail by d-tag (id).
 * Returns cached data with computed fields + payment status.
 */

function enrichBounty(
  row: BountyEventRow,
  payment?: {
    status: string;
    funded: boolean;
    paid: boolean;
    gross_sats?: number;
    platform_fee_sats?: number;
    payout_sats?: number;
  } | null,
  applicationCount?: number,
  applications?: Array<Record<string, unknown>>,
  submissions?: Array<Record<string, unknown>>,
  finalState?: Record<string, unknown> | null,
) {
  const now = Math.floor(Date.now() / 1000);
  const ageSeconds = now - row.created_at;
  const ageHours = Math.floor(ageSeconds / 3600);

  let ageLabel: string;
  if (ageHours < 1) ageLabel = "just now";
  else if (ageHours < 24) ageLabel = `${ageHours}h ago`;
  else if (ageHours < 48) ageLabel = "yesterday";
  else ageLabel = `${Math.floor(ageHours / 24)}d ago`;

  return {
    ...row,
    reward_btc: (row.reward_sats / 1e8).toFixed(8),
    age_hours: ageHours,
    age_label: ageLabel,
    tags: row.tags_json ? JSON.parse(row.tags_json) : null,
    payment: payment || null,
    application_count: applicationCount ?? 0,
    applications: applications || [],
    submissions: submissions || [],
    final_state: finalState || null,
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const bounty = getCachedBounty(id);
    if (!bounty) {
      return NextResponse.json(
        { error: "Bounty not found", d_tag: id },
        { status: 404 },
      );
    }

    // Enrich with payment status (non-blocking — gracefully null if payments table empty)
    let paymentInfo: {
      status: string;
      funded: boolean;
      paid: boolean;
      gross_sats?: number;
      platform_fee_sats?: number;
      payout_sats?: number;
    } | null = null;
    let finalState: Record<string, unknown> | null = null;
    try {
      const payment = await getPaymentByBountyId(id);
      if (payment) {
        const ledger = await listPaymentLedger(payment.id);
        const grossSats = payment.amountSats;
        const platformFeeSats = payment.platformFeeSats;
        const payoutSats = Math.max(grossSats - platformFeeSats, 0);
        paymentInfo = {
          status: payment.status,
          funded:
            payment.status === "funded" || payment.status === "paid",
          paid: payment.status === "paid",
          gross_sats: grossSats,
          platform_fee_sats: platformFeeSats,
          payout_sats: payoutSats,
        };
        if (payment.status === "paid" || bounty.status === "COMPLETED") {
          finalState = {
            winner_pubkey: payment.winnerPubkey || bounty.winner_pubkey || null,
            payment_status: payment.status,
            funded: paymentInfo.funded,
            paid: paymentInfo.paid,
            gross_sats: grossSats,
            platform_fee_sats: platformFeeSats,
            payout_sats: payoutSats,
            ledger_entry_count: ledger.length,
            funded_at: payment.fundedAt,
            settled_at: payment.settledAt,
          };
        }
      }
    } catch {
      // Payment lookup failure shouldn't break bounty detail
    }

    // Get applications and submissions for final-state visibility.
    let applications: Array<Record<string, unknown>> = [];
    let submissions: Array<Record<string, unknown>> = [];
    try {
      applications = getApplicationsForBounty(id).map((app) => ({
        id: app.id,
        applicant_pubkey: app.applicant_pubkey,
        pitch: app.pitch,
        status: app.status,
        created_at: app.created_at,
        updated_at: app.updated_at,
      }));
    } catch {
      // Non-fatal
    }
    try {
      submissions = getSubmissionsForBounty(id).map((submission) => ({
        id: submission.id,
        submitter_pubkey: submission.submitter_pubkey,
        proof_url: submission.proof_url,
        description: submission.description,
        nostr_event_id: submission.nostr_event_id,
        status: submission.status,
        created_at: submission.created_at,
        updated_at: submission.updated_at,
      }));
    } catch {
      // Non-fatal
    }

    const acceptedSubmission = submissions.find(
      (submission) => submission.status === "accepted",
    );
    if (acceptedSubmission) {
      finalState = {
        ...(finalState || {}),
        winner_pubkey:
          finalState?.winner_pubkey || acceptedSubmission.submitter_pubkey || bounty.winner_pubkey || null,
        accepted_submission_id: acceptedSubmission.id,
        accepted_proof_url: acceptedSubmission.proof_url,
      };
    } else if (bounty.winner_pubkey) {
      finalState = {
        ...(finalState || {}),
        winner_pubkey: bounty.winner_pubkey,
      };
    }

    return NextResponse.json(
      enrichBounty(
        bounty,
        paymentInfo,
        applications.length,
        applications,
        submissions,
        finalState,
      ),
    );
  } catch (error) {
    console.error("Failed to get bounty detail:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

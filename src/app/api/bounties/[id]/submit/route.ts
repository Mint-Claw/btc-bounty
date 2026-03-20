/**
 * POST /api/bounties/:id/submit — Submit completed work for a bounty
 *
 * Body: { applicantPubkey: string, proofUrl: string, description: string }
 *
 * Creates a NIP-based submission event that references the bounty.
 * The bounty creator can then review and award.
 */

import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/server/auth";
import { signEventServer } from "@/lib/server/signing";
import { publishToRelays, fetchFromRelays } from "@/lib/server/relay";
import { BOUNTY_KIND, parseBountyEvent } from "@/lib/nostr/schema";
import { deliverWebhook } from "@/lib/server/webhooks";

// Kind 30079 = bounty submission (custom app kind)
const SUBMISSION_KIND = 30079;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const agent = authenticateRequest(request);
  if (!agent) {
    return NextResponse.json(
      { error: "Unauthorized. Provide X-API-Key header." },
      { status: 401 },
    );
  }

  const { id: bountyEventId } = await params;

  let body: { applicantPubkey: string; proofUrl: string; description: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const { applicantPubkey, proofUrl, description } = body;

  if (!applicantPubkey || !proofUrl || !description) {
    return NextResponse.json(
      {
        error:
          "Missing required fields: applicantPubkey, proofUrl, description",
      },
      { status: 400 },
    );
  }

  // Verify the bounty exists and is still open
  const bountyEvents = await fetchFromRelays({
    kinds: [BOUNTY_KIND],
    ids: [bountyEventId],
  });

  if (bountyEvents.length === 0) {
    return NextResponse.json(
      { error: `Bounty ${bountyEventId} not found` },
      { status: 404 },
    );
  }

  const bounty = parseBountyEvent(bountyEvents[0]);
  if (!bounty) {
    return NextResponse.json(
      { error: "Failed to parse bounty event" },
      { status: 500 },
    );
  }

  if (bounty.status === "COMPLETED" || bounty.status === "CANCELLED") {
    return NextResponse.json(
      { error: `Bounty is already ${bounty.status}` },
      { status: 409 },
    );
  }

  // Verify applicant has applied to this bounty
  const _applicationEvents = await fetchFromRelays({
    kinds: [BOUNTY_KIND],
    "#e": [bountyEventId],
    authors: [applicantPubkey],
  });

  // Create submission event
  const submissionEvent = signEventServer(agent.nsecHex, {
    kind: SUBMISSION_KIND,
    content: JSON.stringify({
      description,
      proofUrl,
      submittedAt: new Date().toISOString(),
    }),
    tags: [
      ["e", bountyEventId, "", "root"], // Reference the bounty
      ["p", bounty.pubkey], // Tag the bounty creator
      ["p", applicantPubkey, "", "submitter"], // Tag the submitter
      ["t", "bounty-submission"],
      ["proof", proofUrl],
      ["d", `submission-${bountyEventId}-${applicantPubkey}`],
    ],
  });

  // Publish to relays
  const published = await publishToRelays(submissionEvent);

  // Deliver webhook
  await deliverWebhook("bounty.submitted", {
    bountyId: bountyEventId,
    bountyTitle: bounty.title,
    submitterPubkey: applicantPubkey,
    proofUrl,
    description,
    submissionEventId: submissionEvent.id,
  });

  return NextResponse.json({
    success: true,
    submissionEventId: submissionEvent.id,
    publishedTo: published,
    message: `Submission recorded for bounty "${bounty.title}"`,
  });
}

/**
 * GET /api/bounties/:id/submit — List submissions for a bounty
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: bountyEventId } = await params;

  // Fetch submission events referencing this bounty
  const submissions = await fetchFromRelays({
    kinds: [SUBMISSION_KIND],
    "#e": [bountyEventId],
  });

  const parsed = submissions.map((event) => {
    let content: { description?: string; proofUrl?: string; submittedAt?: string } = {};
    try {
      content = JSON.parse(event.content);
    } catch {
      content = { description: event.content };
    }

    const submitterTag = event.tags.find(
      (t) => t[0] === "p" && t[3] === "submitter",
    );
    const proofTag = event.tags.find((t) => t[0] === "proof");

    return {
      id: event.id,
      submitterPubkey: submitterTag?.[1] || "unknown",
      proofUrl: proofTag?.[1] || content.proofUrl || "",
      description: content.description || "",
      submittedAt: content.submittedAt || new Date(event.created_at * 1000).toISOString(),
      createdAt: event.created_at,
    };
  });

  return NextResponse.json({
    bountyId: bountyEventId,
    submissions: parsed,
    count: parsed.length,
  });
}

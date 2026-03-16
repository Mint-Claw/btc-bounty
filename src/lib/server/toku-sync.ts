/**
 * toku.agency Sync Service
 *
 * Handles:
 * 1. Auto-listing funded bounties on toku.agency
 * 2. Processing incoming bids/applications from toku.agency
 * 3. Syncing status changes (completion, cancellation) back to toku.agency
 */

import {
  TokuClient,
  TokuListing,
  buildTokuJobInput,
  satsToCents,
  shouldListOnToku,
  trackListing,
  getListing,
  getListingByTokuJobId,
  removeListing,
  getAllListings,
  type TokuWebhookPayload,
} from "./toku";
import type { Bounty } from "../nostr/schema";

// ─── Sync Service ────────────────────────────────────────────

export class TokuSyncService {
  private client: TokuClient;
  /** toku.agency service ID for bounty listings (set via TOKU_SERVICE_ID env) */
  private serviceId: string;
  /** Callback for forwarding toku applications to NOSTR */
  private onApplication?: (bountyDTag: string, applicant: TokuApplicant) => Promise<void>;

  constructor(opts?: {
    serviceId?: string;
    onApplication?: (bountyDTag: string, applicant: TokuApplicant) => Promise<void>;
  }) {
    this.client = new TokuClient();
    this.serviceId = opts?.serviceId || process.env.TOKU_SERVICE_ID || "";
    this.onApplication = opts?.onApplication;
  }

  // ─── List a bounty on toku.agency ──────────────────────────

  /**
   * Cross-list a NOSTR bounty on toku.agency.
   * Only lists if reward >= minimum threshold and not already listed.
   */
  async listBounty(bounty: Bounty): Promise<TokuListing | null> {
    // Skip if below threshold
    if (!shouldListOnToku(bounty.rewardSats)) {
      console.log(
        `[toku-sync] Bounty ${bounty.dTag} below threshold (${bounty.rewardSats} sats), skipping`
      );
      return null;
    }

    // Skip if already listed
    const existing = getListing(bounty.dTag);
    if (existing) {
      console.log(
        `[toku-sync] Bounty ${bounty.dTag} already listed as toku job ${existing.tokuJobId}`
      );
      return existing;
    }

    // Skip if no service ID configured
    if (!this.serviceId) {
      console.warn(
        "[toku-sync] TOKU_SERVICE_ID not set, cannot list bounty"
      );
      return null;
    }

    const budgetCents = satsToCents(bounty.rewardSats);
    const input = buildTokuJobInput(bounty);

    try {
      const job = await this.client.postJob({
        serviceId: this.serviceId,
        tierId: "Standard",
        input,
        budgetCents,
        metadata: {
          bountyDTag: bounty.dTag,
          bountyEventId: bounty.id,
          source: "btc-bounty-nostr",
        },
      });

      const listing: TokuListing = {
        bountyDTag: bounty.dTag,
        bountyEventId: bounty.id,
        tokuJobId: job.id,
        amountSats: bounty.rewardSats,
        budgetCents,
        syncedAt: new Date().toISOString(),
      };

      trackListing(listing);
      console.log(
        `[toku-sync] Listed bounty ${bounty.dTag} → toku job ${job.id} ($${(budgetCents / 100).toFixed(2)})`
      );

      return listing;
    } catch (err) {
      console.error(`[toku-sync] Failed to list bounty ${bounty.dTag}:`, err);
      return null;
    }
  }

  // ─── Cancel a toku listing when bounty is cancelled/completed ──

  async cancelListing(bountyDTag: string): Promise<boolean> {
    const listing = getListing(bountyDTag);
    if (!listing) return false;

    try {
      await this.client.cancelJob(listing.tokuJobId);
      removeListing(bountyDTag);
      console.log(
        `[toku-sync] Cancelled toku job ${listing.tokuJobId} for bounty ${bountyDTag}`
      );
      return true;
    } catch (err) {
      console.error(
        `[toku-sync] Failed to cancel toku job ${listing.tokuJobId}:`,
        err
      );
      return false;
    }
  }

  // ─── Process incoming webhook from toku.agency ─────────────

  async processWebhook(payload: TokuWebhookPayload): Promise<void> {
    const { event, data, jobId } = payload;

    console.log(`[toku-sync] Webhook received: ${event} (job: ${jobId})`);

    switch (event) {
      case "bid.received":
        await this.handleBidReceived(data, jobId);
        break;
      case "job.accepted":
        await this.handleJobAccepted(data, jobId);
        break;
      case "job.delivered":
        await this.handleJobDelivered(data, jobId);
        break;
      case "job.completed":
        await this.handleJobCompleted(jobId);
        break;
      case "job.cancelled":
        await this.handleJobCancelled(jobId);
        break;
      case "dm.received":
        console.log(`[toku-sync] DM received:`, data);
        break;
      default:
        console.log(`[toku-sync] Unhandled event: ${event}`);
    }
  }

  private async handleBidReceived(
    data: Record<string, unknown>,
    jobId?: string
  ): Promise<void> {
    if (!jobId) return;

    const listing = getListingByTokuJobId(jobId);
    if (!listing) {
      console.log(`[toku-sync] No listing found for toku job ${jobId}`);
      return;
    }

    const applicant: TokuApplicant = {
      tokuAgentId: (data.agentId as string) || "unknown",
      message: (data.message as string) || "",
      priceCents: (data.priceCents as number) || 0,
      bidId: (data.id as string) || "",
    };

    console.log(
      `[toku-sync] Bid on bounty ${listing.bountyDTag} from ${applicant.tokuAgentId}: $${(applicant.priceCents / 100).toFixed(2)}`
    );

    // Forward to NOSTR as kind:1 reply
    if (this.onApplication) {
      await this.onApplication(listing.bountyDTag, applicant);
    }
  }

  private async handleJobAccepted(
    data: Record<string, unknown>,
    jobId?: string
  ): Promise<void> {
    if (!jobId) return;
    const listing = getListingByTokuJobId(jobId);
    if (listing) {
      console.log(
        `[toku-sync] Job accepted for bounty ${listing.bountyDTag}`
      );
    }
  }

  private async handleJobDelivered(
    data: Record<string, unknown>,
    jobId?: string
  ): Promise<void> {
    if (!jobId) return;
    const listing = getListingByTokuJobId(jobId);
    if (listing) {
      console.log(
        `[toku-sync] Job delivered for bounty ${listing.bountyDTag}: ${(data.output as string)?.slice(0, 100) || "no output"}`
      );
    }
  }

  private async handleJobCompleted(jobId?: string): Promise<void> {
    if (!jobId) return;
    const listing = getListingByTokuJobId(jobId);
    if (listing) {
      removeListing(listing.bountyDTag);
      console.log(
        `[toku-sync] Job completed, removed listing for bounty ${listing.bountyDTag}`
      );
    }
  }

  private async handleJobCancelled(jobId?: string): Promise<void> {
    if (!jobId) return;
    const listing = getListingByTokuJobId(jobId);
    if (listing) {
      removeListing(listing.bountyDTag);
      console.log(
        `[toku-sync] Job cancelled, removed listing for bounty ${listing.bountyDTag}`
      );
    }
  }

  // ─── Sync all open bounties (cron job) ──────────────────────

  /**
   * Sync open bounties to toku.agency. Call this periodically (e.g., hourly).
   * Accepts a list of currently open+funded bounties.
   */
  async syncOpenBounties(bounties: Bounty[]): Promise<{
    listed: number;
    skipped: number;
    errors: number;
  }> {
    let listed = 0;
    let skipped = 0;
    let errors = 0;

    for (const bounty of bounties) {
      if (bounty.status !== "OPEN") {
        skipped++;
        continue;
      }

      try {
        const result = await this.listBounty(bounty);
        if (result) {
          listed++;
        } else {
          skipped++;
        }
      } catch {
        errors++;
      }
    }

    console.log(
      `[toku-sync] Sync complete: ${listed} listed, ${skipped} skipped, ${errors} errors`
    );
    return { listed, skipped, errors };
  }

  // ─── Status ────────────────────────────────────────────────

  getStats(): { totalListings: number; listings: TokuListing[] } {
    const all = getAllListings();
    return { totalListings: all.length, listings: all };
  }
}

// ─── Types ───────────────────────────────────────────────────

export interface TokuApplicant {
  tokuAgentId: string;
  message: string;
  priceCents: number;
  bidId: string;
}

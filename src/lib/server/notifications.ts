/**
 * Nostr notification system for bounty lifecycle events.
 *
 * Sends NIP-04 encrypted DMs to relevant parties when:
 * - Someone applies for a bounty (notify bounty poster)
 * - A bounty is awarded (notify winner)
 * - Payment is confirmed (notify both parties)
 */

import { nip04 } from "nostr-tools";
import { hexToBytes } from "nostr-tools/utils";
import { finalizeEvent, getPublicKey } from "nostr-tools/pure";
import { getRelayPool } from "./relay-pool";

/** Notification types */
export type NotificationType =
  | "bounty.application"
  | "bounty.awarded"
  | "bounty.payment_confirmed"
  | "bounty.expired";

interface NotificationPayload {
  type: NotificationType;
  recipientPubkey: string;
  bountyTitle: string;
  bountyId: string;
  /** Additional context (e.g., applicant name, amount) */
  extra?: Record<string, string>;
}

/**
 * Build a human-readable notification message.
 */
function buildMessage(payload: NotificationPayload): string {
  const { type, bountyTitle, bountyId, extra } = payload;

  switch (type) {
    case "bounty.application":
      return (
        `🎯 New application on your bounty "${bountyTitle}"\n\n` +
        `Applicant: ${extra?.applicantName || "Anonymous"}\n` +
        `Message: ${extra?.message || "(no message)"}\n\n` +
        `View: ${extra?.url || `https://btcbounty.xyz/bounty/${bountyId}`}`
      );

    case "bounty.awarded":
      return (
        `🏆 You've been selected for bounty "${bountyTitle}"!\n\n` +
        `Amount: ${extra?.amount || "?"} sats\n` +
        `Next step: Complete the work and submit for payment.\n\n` +
        `View: ${extra?.url || `https://btcbounty.xyz/bounty/${bountyId}`}`
      );

    case "bounty.payment_confirmed":
      return (
        `⚡ Payment confirmed for "${bountyTitle}"\n\n` +
        `Amount: ${extra?.amount || "?"} sats\n` +
        `Transaction settled via Lightning.`
      );

    case "bounty.expired":
      return (
        `⏰ Your bounty "${bountyTitle}" has expired.\n\n` +
        `No applications were selected. You can re-post or extend it.`
      );

    default:
      return `Notification about bounty "${bountyTitle}"`;
  }
}

/**
 * Send a NIP-04 encrypted DM notification.
 *
 * Requires BOUNTY_BOT_NSEC env var to be set (hex-encoded secret key).
 * If not set, notification is silently skipped (dev mode).
 */
export async function sendNotification(
  payload: NotificationPayload
): Promise<{ sent: boolean; error?: string }> {
  const botNsec = process.env.BOUNTY_BOT_NSEC;
  if (!botNsec) {
    console.log(
      `[notifications] Skipping ${payload.type} DM (BOUNTY_BOT_NSEC not set)`
    );
    return { sent: false, error: "BOUNTY_BOT_NSEC not configured" };
  }

  try {
    const sk = hexToBytes(botNsec);
    const botPubkey = getPublicKey(sk);
    const message = buildMessage(payload);

    // Encrypt with NIP-04
    const encrypted = await nip04.encrypt(sk, payload.recipientPubkey, message);

    // Build kind:4 DM event
    const event = finalizeEvent(
      {
        kind: 4,
        created_at: Math.floor(Date.now() / 1000),
        tags: [["p", payload.recipientPubkey]],
        content: encrypted,
      },
      sk
    );

    // Publish via relay pool
    const pool = getRelayPool();
    const result = await pool.publish(event);

    console.log(
      `[notifications] Sent ${payload.type} DM to ${payload.recipientPubkey.slice(0, 8)}... via ${result.successes}/${result.successes + result.failures} relays`
    );

    return { sent: result.successes > 0 };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[notifications] Failed to send ${payload.type}: ${msg}`);
    return { sent: false, error: msg };
  }
}

/**
 * Notify a bounty poster that someone applied.
 */
export async function notifyBountyApplication(opts: {
  posterPubkey: string;
  bountyTitle: string;
  bountyId: string;
  applicantName?: string;
  message?: string;
}): Promise<void> {
  await sendNotification({
    type: "bounty.application",
    recipientPubkey: opts.posterPubkey,
    bountyTitle: opts.bountyTitle,
    bountyId: opts.bountyId,
    extra: {
      applicantName: opts.applicantName || "Anonymous",
      message: opts.message || "",
    },
  });
}

/**
 * Notify an applicant they've been selected.
 */
export async function notifyBountyAwarded(opts: {
  winnerPubkey: string;
  bountyTitle: string;
  bountyId: string;
  amount?: string;
}): Promise<void> {
  await sendNotification({
    type: "bounty.awarded",
    recipientPubkey: opts.winnerPubkey,
    bountyTitle: opts.bountyTitle,
    bountyId: opts.bountyId,
    extra: { amount: opts.amount || "" },
  });
}

/**
 * Notify that payment was confirmed.
 */
export async function notifyPaymentConfirmed(opts: {
  recipientPubkey: string;
  bountyTitle: string;
  bountyId: string;
  amount?: string;
}): Promise<void> {
  await sendNotification({
    type: "bounty.payment_confirmed",
    recipientPubkey: opts.recipientPubkey,
    bountyTitle: opts.bountyTitle,
    bountyId: opts.bountyId,
    extra: { amount: opts.amount || "" },
  });
}

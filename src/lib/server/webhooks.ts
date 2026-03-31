/**
 * Webhook delivery system for bounty lifecycle events.
 *
 * Sends HTTP POST notifications to registered webhook URLs when
 * bounty events occur (created, assigned, completed, expired, cancelled).
 *
 * Webhook payload format:
 * {
 *   event: "bounty.created" | "bounty.assigned" | "bounty.completed" | ...,
 *   timestamp: ISO 8601,
 *   data: { bounty details },
 *   signature: HMAC-SHA256 of payload (if secret configured)
 * }
 */

import { createHmac } from "crypto";

export type WebhookEvent =
  | "bounty.created"
  | "bounty.applied"
  | "bounty.assigned"
  | "bounty.completed"
  | "bounty.expired"
  | "bounty.cancelled"
  | "bounty.payment_received"
  | "bounty.disputed"
  | "bounty.submitted";

export interface WebhookPayload {
  event: WebhookEvent;
  timestamp: string;
  data: Record<string, unknown>;
}

export interface WebhookConfig {
  url: string;
  secret?: string;
  events?: WebhookEvent[]; // Subscribe to specific events; null = all
  enabled: boolean;
}

/**
 * Get configured webhooks from environment.
 *
 * Format: WEBHOOK_URLS=url1|secret1,url2|secret2
 * Or: WEBHOOK_URL=single_url  WEBHOOK_SECRET=single_secret
 */
function getWebhooks(): WebhookConfig[] {
  const webhooks: WebhookConfig[] = [];

  // Single webhook (simple config)
  const singleUrl = process.env.WEBHOOK_URL;
  if (singleUrl) {
    webhooks.push({
      url: singleUrl,
      secret: process.env.WEBHOOK_SECRET,
      enabled: true,
    });
  }

  // Multiple webhooks (comma-separated)
  const multiUrls = process.env.WEBHOOK_URLS;
  if (multiUrls) {
    for (const entry of multiUrls.split(",")) {
      const [url, secret] = entry.trim().split("|");
      if (url) {
        webhooks.push({ url: url.trim(), secret: secret?.trim(), enabled: true });
      }
    }
  }

  return webhooks;
}

/**
 * Sign a webhook payload with HMAC-SHA256.
 */
function signPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/**
 * Deliver a webhook event to all configured endpoints.
 *
 * Fire-and-forget: failures are logged but don't block the caller.
 * Retries up to 2 times with exponential backoff.
 */
export async function deliverWebhook(
  event: WebhookEvent,
  data: Record<string, unknown>,
): Promise<void> {
  const webhooks = getWebhooks();
  if (webhooks.length === 0) return;

  const payload: WebhookPayload = {
    event,
    timestamp: new Date().toISOString(),
    data,
  };

  const body = JSON.stringify(payload);

  const deliveries = webhooks
    .filter((wh) => wh.enabled)
    .filter((wh) => !wh.events || wh.events.includes(event))
    .map((wh) => deliverToEndpoint(wh, body));

  // Fire-and-forget — don't await in caller context
  Promise.allSettled(deliveries).catch(() => {
    // Silently ignore aggregate errors
  });
}

async function deliverToEndpoint(
  webhook: WebhookConfig,
  body: string,
  attempt = 1,
): Promise<void> {
  const MAX_RETRIES = 2;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "BTC-Bounty-Webhook/1.0",
    "X-Webhook-Event": JSON.parse(body).event,
  };

  if (webhook.secret) {
    headers["X-Webhook-Signature"] = `sha256=${signPayload(body, webhook.secret)}`;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const response = await fetch(webhook.url, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok && attempt <= MAX_RETRIES) {
      // Exponential backoff: 1s, 2s
      await new Promise((r) => setTimeout(r, attempt * 1000));
      return deliverToEndpoint(webhook, body, attempt + 1);
    }

    if (!response.ok) {
      console.error(
        `[webhook] Failed to deliver to ${webhook.url}: ${response.status} (${attempt} attempts)`,
      );
    }
  } catch (error) {
    if (attempt <= MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, attempt * 1000));
      return deliverToEndpoint(webhook, body, attempt + 1);
    }
    console.error(
      `[webhook] Error delivering to ${webhook.url}:`,
      error instanceof Error ? error.message : error,
    );
  }
}

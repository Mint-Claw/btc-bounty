/**
 * toku.agency Listing Bridge
 *
 * Auto-lists high-value BTC Bounty posts on toku.agency for broader
 * agent discovery. Receives applications back via webhook and forwards
 * them as NOSTR kind:1 replies.
 *
 * toku.agency API (Bearer token auth):
 *   POST /api/services          — Register a service listing
 *   POST /api/jobs              — Post a job for bidding
 *   GET  /api/jobs/:id          — Check job status
 *   PATCH /api/jobs/:id         — Update job (complete/cancel)
 *
 * Config via env vars:
 *   TOKU_API_KEY       — toku.agency API key
 *   TOKU_AGENT_ID      — toku.agency agent ID
 *   TOKU_WEBHOOK_SECRET — webhook verification secret
 *   BTC_USD_RATE       — fallback BTC/USD rate (default: 100000)
 */

// ─── Types ───────────────────────────────────────────────────

export interface TokuConfig {
  apiKey: string;
  agentId: string;
  webhookSecret: string;
  baseUrl: string;
}

export interface TokuJobPost {
  /** Service ID on toku.agency to post the job under */
  serviceId: string;
  /** Tier for pricing (Basic/Standard/Premium) */
  tierId: string;
  /** Job description / bounty details */
  input: string;
  /** Budget in cents (USD) */
  budgetCents?: number;
  /** Metadata for tracking */
  metadata?: Record<string, string>;
}

export interface TokuJob {
  id: string;
  status: "REQUESTED" | "ACCEPTED" | "IN_PROGRESS" | "DELIVERED" | "COMPLETED" | "CANCELLED" | "DISPUTED";
  input: string;
  output?: string;
  priceCents: number;
  serviceId: string;
  buyerId: string;
  createdAt: string;
}

export interface TokuBid {
  id: string;
  jobId: string;
  agentId: string;
  priceCents: number;
  message: string;
  status: "PENDING" | "ACCEPTED" | "REJECTED" | "WITHDRAWN" | "DELIVERED" | "COMPLETED" | "DISPUTED";
  createdAt: string;
}

export interface TokuWebhookPayload {
  event: string;
  data: Record<string, unknown>;
  timestamp: string;
  jobId?: string;
  agentId?: string;
}

/** In-memory listing tracker (swap for DB in production) */
export interface TokuListing {
  bountyDTag: string;
  bountyEventId: string;
  tokuJobId: string;
  amountSats: number;
  budgetCents: number;
  syncedAt: string;
}

// ─── Config ──────────────────────────────────────────────────

export function getTokuConfig(): TokuConfig {
  return {
    apiKey: process.env.TOKU_API_KEY || "",
    agentId: process.env.TOKU_AGENT_ID || "",
    webhookSecret: process.env.TOKU_WEBHOOK_SECRET || "",
    baseUrl: "https://www.toku.agency",
  };
}

// ─── API Client ──────────────────────────────────────────────

export class TokuClient {
  private config: TokuConfig;

  constructor(config?: Partial<TokuConfig>) {
    this.config = { ...getTokuConfig(), ...config };
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.config.baseUrl}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.config.apiKey}`,
      "Content-Type": "application/json",
    };

    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new TokuAPIError(
        `toku.agency ${method} ${path} failed: ${res.status} ${res.statusText} — ${text}`,
        res.status
      );
    }

    return res.json() as Promise<T>;
  }

  // ─── Jobs ────────────────────────────────────────────────

  /** Post a job on toku.agency (creates a bounty listing for bidding) */
  async postJob(job: TokuJobPost): Promise<TokuJob> {
    return this.request<TokuJob>("POST", "/api/jobs", job);
  }

  /** Get job details */
  async getJob(jobId: string): Promise<TokuJob> {
    return this.request<TokuJob>("GET", `/api/jobs/${jobId}`);
  }

  /** Cancel a job */
  async cancelJob(jobId: string): Promise<TokuJob> {
    return this.request<TokuJob>("PATCH", `/api/jobs/${jobId}`, {
      action: "cancel",
    });
  }

  /** Complete a job (after winner delivers) */
  async completeJob(jobId: string): Promise<TokuJob> {
    return this.request<TokuJob>("PATCH", `/api/jobs/${jobId}`, {
      action: "complete",
    });
  }

  // ─── Agent Profile ───────────────────────────────────────

  /** Get our agent profile (health check) */
  async getProfile(): Promise<Record<string, unknown>> {
    return this.request("GET", "/api/agents/me");
  }

  // ─── Services ────────────────────────────────────────────

  /** Search for services */
  async searchServices(query: string, category?: string): Promise<unknown[]> {
    const params = new URLSearchParams({ q: query });
    if (category) params.set("category", category);
    return this.request("GET", `/api/services/search?${params.toString()}`);
  }
}

// ─── Bridge Logic ────────────────────────────────────────────

/** Minimum bounty amount in sats to cross-list on toku.agency */
const MIN_SATS_FOR_LISTING = 10_000; // ~$10 at $100k/BTC

/** Convert sats to USD cents using BTC/USD rate */
export function satsToCents(sats: number, btcUsdRate?: number): number {
  const rate = btcUsdRate || parseFloat(process.env.BTC_USD_RATE || "100000");
  // 1 BTC = 100,000,000 sats
  // sats / 100_000_000 * rate = USD
  // USD * 100 = cents
  return Math.round((sats / 100_000_000) * rate * 100);
}

/** Convert USD cents to sats */
export function centsToSats(cents: number, btcUsdRate?: number): number {
  const rate = btcUsdRate || parseFloat(process.env.BTC_USD_RATE || "100000");
  return Math.round((cents / 100) / rate * 100_000_000);
}

/** Build a toku.agency job description from a NOSTR bounty */
export function buildTokuJobInput(bounty: {
  title: string;
  content: string;
  rewardSats: number;
  category: string;
  tags: string[];
  dTag: string;
}): string {
  const cents = satsToCents(bounty.rewardSats);
  const usd = (cents / 100).toFixed(2);

  return [
    `# ${bounty.title}`,
    "",
    bounty.content,
    "",
    "---",
    `**Reward:** ${bounty.rewardSats.toLocaleString()} sats (~$${usd} USD)`,
    `**Category:** ${bounty.category}`,
    bounty.tags.length > 0 ? `**Tags:** ${bounty.tags.join(", ")}` : "",
    "",
    `*Cross-listed from BTC Bounty (NOSTR). Payment in Bitcoin Lightning.*`,
    `*Bounty ID: ${bounty.dTag}*`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Check if a bounty should be listed on toku.agency */
export function shouldListOnToku(rewardSats: number): boolean {
  return rewardSats >= MIN_SATS_FOR_LISTING;
}

// ─── Listing Store (in-memory, swap for DB later) ─────────────

const listings = new Map<string, TokuListing>();

export function trackListing(listing: TokuListing): void {
  listings.set(listing.bountyDTag, listing);
}

export function getListing(bountyDTag: string): TokuListing | undefined {
  return listings.get(bountyDTag);
}

export function getListingByTokuJobId(tokuJobId: string): TokuListing | undefined {
  for (const listing of listings.values()) {
    if (listing.tokuJobId === tokuJobId) return listing;
  }
  return undefined;
}

export function getAllListings(): TokuListing[] {
  return Array.from(listings.values());
}

export function removeListing(bountyDTag: string): boolean {
  return listings.delete(bountyDTag);
}

// ─── Errors ──────────────────────────────────────────────────

export class TokuAPIError extends Error {
  constructor(
    message: string,
    public statusCode: number
  ) {
    super(message);
    this.name = "TokuAPIError";
  }
}

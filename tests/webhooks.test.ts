import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";

describe("webhook delivery", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  test("delivers webhook with correct payload structure", async () => {
    process.env.WEBHOOK_URL = "https://example.com/webhook";
    process.env.WEBHOOK_SECRET = "test-secret";

    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", mockFetch);

    const { deliverWebhook } = await import("@/lib/server/webhooks");
    await deliverWebhook("bounty.created", {
      id: "abc123",
      title: "Fix bug",
      reward_sats: 50000,
    });

    // Allow async delivery
    await new Promise((r) => setTimeout(r, 200));

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe("https://example.com/webhook");
    expect(options.method).toBe("POST");
    expect(options.headers["X-Webhook-Event"]).toBe("bounty.created");
    expect(options.headers["X-Webhook-Signature"]).toMatch(/^sha256=/);

    const body = JSON.parse(options.body);
    expect(body.event).toBe("bounty.created");
    expect(body.data.id).toBe("abc123");
    expect(body.data.title).toBe("Fix bug");
    expect(body.data.reward_sats).toBe(50000);
    expect(body.timestamp).toBeTruthy();
  });

  test("skips delivery when no webhooks configured", async () => {
    delete process.env.WEBHOOK_URL;
    delete process.env.WEBHOOK_URLS;

    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);

    const { deliverWebhook } = await import("@/lib/server/webhooks");
    await deliverWebhook("bounty.completed", { id: "xyz" });

    await new Promise((r) => setTimeout(r, 200));
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("delivers bounty.applied webhook with applicant info", async () => {
    process.env.WEBHOOK_URL = "https://example.com/webhook";

    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", mockFetch);

    const { deliverWebhook } = await import("@/lib/server/webhooks");
    await deliverWebhook("bounty.applied", {
      bountyId: "evt_bounty_123",
      applicantPubkey: "npub1applicant",
      applicationEventId: "evt_app_456",
      pitch: "I can fix this in 2 hours",
      lightning: "dev@getalby.com",
    });

    await new Promise((r) => setTimeout(r, 200));

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.event).toBe("bounty.applied");
    expect(body.data.bountyId).toBe("evt_bounty_123");
    expect(body.data.applicantPubkey).toBe("npub1applicant");
    expect(body.data.pitch).toBe("I can fix this in 2 hours");
    expect(body.data.lightning).toBe("dev@getalby.com");
  });

  test("delivers bounty.completed webhook with winner and payout", async () => {
    process.env.WEBHOOK_URL = "https://example.com/webhook";

    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", mockFetch);

    const { deliverWebhook } = await import("@/lib/server/webhooks");
    await deliverWebhook("bounty.completed", {
      bountyId: "evt_bounty_789",
      bountyTitle: "Build Lightning integration",
      winnerPubkey: "npub1winner",
      rewardSats: 100000,
      payout: { payoutId: "po_001", amountSats: 95000, feeSats: 5000 },
    });

    await new Promise((r) => setTimeout(r, 200));

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.event).toBe("bounty.completed");
    expect(body.data.winnerPubkey).toBe("npub1winner");
    expect(body.data.rewardSats).toBe(100000);
    expect(body.data.payout.feeSats).toBe(5000);
  });

  test("parses multiple webhook URLs from WEBHOOK_URLS", async () => {
    process.env.WEBHOOK_URLS =
      "https://a.com/hook|secret1,https://b.com/hook|secret2";

    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", mockFetch);

    const { deliverWebhook } = await import("@/lib/server/webhooks");
    await deliverWebhook("bounty.assigned", { id: "test" });

    await new Promise((r) => setTimeout(r, 200));
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

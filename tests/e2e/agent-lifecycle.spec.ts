import { test, expect } from "@playwright/test";

/**
 * Full agent lifecycle E2E test:
 * Register poster → Register applicant → Post bounty → Apply → Award → Complete
 *
 * This exercises the complete flow that an AI agent would use.
 */
test.describe("Agent Lifecycle", () => {
  let posterKey: string;
  let posterPubkey: string;
  let applicantKey: string;
  let applicantPubkey: string;
  let bountyDTag: string;

  test("register poster agent", async ({ request }) => {
    const res = await request.post("/api/agents/register", {
      data: { name: `e2e-poster-${Date.now()}` },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.apiKey).toBeTruthy();
    expect(body.pubkey).toBeTruthy();
    posterKey = body.apiKey;
    posterPubkey = body.pubkey;
  });

  test("register applicant agent", async ({ request }) => {
    const res = await request.post("/api/agents/register", {
      data: { name: `e2e-applicant-${Date.now()}` },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    applicantKey = body.apiKey;
    applicantPubkey = body.pubkey;
  });

  test("poster creates bounty", async ({ request }) => {
    const res = await request.post("/api/bounties", {
      headers: { "X-API-Key": posterKey },
      data: {
        title: `E2E Test Bounty ${Date.now()}`,
        content: "This is an automated E2E test bounty for lifecycle validation.",
        rewardSats: 10000,
        category: "code",
        tags: ["e2e", "test"],
        lightning: "test@getalby.com",
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.dTag).toBeTruthy();
    bountyDTag = body.dTag;
  });

  test("bounty appears in cached list", async ({ request }) => {
    const res = await request.get(`/api/bounties/cached?d_tag=${bountyDTag}`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.title).toContain("E2E Test Bounty");
    expect(body.status).toBe("OPEN");
  });

  test("applicant applies to bounty", async ({ request }) => {
    const res = await request.post(`/api/bounties/${bountyDTag}/apply`, {
      headers: { "X-API-Key": applicantKey },
      data: {
        pitch: "I can complete this E2E test task efficiently.",
        lightning: "applicant@getalby.com",
      },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.stored).toBe(true);
  });

  test("applications are visible", async ({ request }) => {
    const res = await request.get(`/api/bounties/${bountyDTag}/applications`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.applications.length).toBeGreaterThanOrEqual(1);
    const app = body.applications.find(
      (a: { pubkey: string }) => a.pubkey === applicantPubkey
    );
    expect(app).toBeTruthy();
    expect(app.pitch).toContain("E2E test task");
  });

  test("poster awards bounty to applicant", async ({ request }) => {
    const res = await request.post(
      `/api/bounties/${bountyDTag}/award/${applicantPubkey}`,
      {
        headers: { "X-API-Key": posterKey },
        data: {},
      }
    );
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.status).toBe("COMPLETED");
  });

  test("bounty shows as completed", async ({ request }) => {
    const res = await request.get(`/api/bounties/cached?d_tag=${bountyDTag}`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.status).toBe("COMPLETED");
    expect(body.winner_pubkey).toBe(applicantPubkey);
  });

  test("stats reflect completed bounty", async ({ request }) => {
    const res = await request.get("/api/bounties/stats");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.completed).toBeGreaterThanOrEqual(1);
  });
});

test.describe("Agent Pagination", () => {
  test("cached endpoint supports limit and offset", async ({ request }) => {
    const res = await request.get("/api/bounties/cached?limit=2&offset=0");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toHaveProperty("total");
    expect(body).toHaveProperty("hasMore");
    expect(body.limit).toBe(2);
    expect(body.offset).toBe(0);
    expect(body.bounties.length).toBeLessThanOrEqual(2);
  });

  test("cached endpoint supports min_reward filter", async ({ request }) => {
    const res = await request.get("/api/bounties/cached?min_reward=1000000");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    // No bounties should have 1M+ sats reward
    expect(body.bounties.length).toBe(0);
    expect(body.total).toBe(0);
  });
});

// NOTE: Rate limit E2E tests removed from this file.
// Running them here would exhaust the IP's registration quota
// and break subsequent lifecycle tests.
// Rate limiting is tested in unit tests: tests/register-rate-limit.test.ts

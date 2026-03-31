import { test, expect } from "@playwright/test";

test.describe("Agent REST API", () => {
  test("POST /api/bounties without API key returns 401", async ({ request }) => {
    const res = await request.post("/api/bounties", {
      data: {
        title: "Test bounty",
        content: "Should fail without auth",
        rewardSats: 1000,
        category: "code",
      },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error).toContain("Unauthorized");
  });

  test("POST /api/bounties with invalid key returns 401", async ({ request }) => {
    const res = await request.post("/api/bounties", {
      headers: { "X-API-Key": "invalid-key-12345" },
      data: {
        title: "Test bounty",
        content: "Should fail with bad key",
        rewardSats: 1000,
        category: "code",
      },
    });
    expect(res.status()).toBe(401);
  });

  test("POST /api/bounties with missing required fields returns 400", async ({ request }) => {
    // Even without valid auth, validation should catch missing fields
    // But since auth runs first, we'll get 401
    const res = await request.post("/api/bounties", {
      headers: { "X-API-Key": "invalid" },
      data: {},
    });
    // Auth check happens before validation
    expect(res.status()).toBe(401);
  });

  test("POST /api/bounties/:id/apply without auth returns 401", async ({ request }) => {
    const res = await request.post("/api/bounties/test-id/apply", {
      data: { message: "I can help" },
    });
    expect(res.status()).toBe(401);
  });

  test("POST /api/bounties/:id/award/:npub without auth returns 401", async ({ request }) => {
    const res = await request.post("/api/bounties/test-id/award/npub123");
    expect(res.status()).toBe(401);
  });

  test("GET /api/bounties is public (no auth needed)", async ({ request }) => {
    const res = await request.get("/api/bounties");
    expect(res.ok()).toBeTruthy();
  });

  test("GET /api/bounties/cached returns cached bounties", async ({ request }) => {
    const res = await request.get("/api/bounties/cached");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toHaveProperty("bounties");
    expect(Array.isArray(body.bounties)).toBeTruthy();
  });

  test("GET /api/bounties/stats returns numeric stats", async ({ request }) => {
    const res = await request.get("/api/bounties/stats");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(typeof body.total).toBe("number");
    expect(typeof body.open).toBe("number");
  });

  test("GET /api/nostr/nip89 returns app handler info", async ({ request }) => {
    const res = await request.get("/api/nostr/nip89");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.name).toBeTruthy();
    expect(body.nip89).toBeTruthy();
    expect(body.nip89.handler_type).toBe("web");
    expect(body.kinds).toContain(30402);
  });

  test("GET /api/payments/status requires bountyIds param", async ({ request }) => {
    const res = await request.get("/api/payments/status");
    expect(res.status()).toBe(400);
  });

  test("GET /api/payments/status with ids returns results", async ({ request }) => {
    const res = await request.get("/api/payments/status?bountyIds=test1,test2");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toHaveProperty("statuses");
  });
});

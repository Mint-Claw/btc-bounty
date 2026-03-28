import { test, expect } from "@playwright/test";

test.describe("API Endpoints", () => {
  test("GET /api/health returns OK", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.status).toBe("ok");
  });

  test("GET /api/version returns version info", async ({ request }) => {
    const res = await request.get("/api/version");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.version).toBeTruthy();
  });

  test("GET /api/bounties returns array", async ({ request }) => {
    const res = await request.get("/api/bounties");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(Array.isArray(body.bounties ?? body)).toBeTruthy();
  });

  test("GET /api/bounties/stats returns stats", async ({ request }) => {
    const res = await request.get("/api/bounties/stats");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(typeof body.total).toBe("number");
  });

  test("GET /api/bounties/feed returns RSS XML", async ({ request }) => {
    const res = await request.get("/api/bounties/feed");
    expect(res.ok()).toBeTruthy();
    const ct = res.headers()["content-type"] ?? "";
    expect(ct).toMatch(/xml|rss/);
  });

  test("GET /api/docs returns documentation", async ({ request }) => {
    const res = await request.get("/api/docs");
    expect(res.ok()).toBeTruthy();
  });

  test("GET /api/relays/status returns relay info", async ({ request }) => {
    const res = await request.get("/api/relays/status");
    expect(res.ok()).toBeTruthy();
  });

  test("GET /api/bounties/nonexistent returns 404", async ({ request }) => {
    const res = await request.get("/api/bounties/nonexistent-id-12345");
    expect(res.status()).toBe(404);
  });
});

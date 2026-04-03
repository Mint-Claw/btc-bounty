import { describe, it, expect } from "vitest";
import { GET } from "@/app/api/docs/route";

describe("GET /api/docs", () => {
  it("returns OpenAPI spec", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.openapi).toBe("3.0.0");
    expect(data.info.title).toBe("BTC Bounty API");
    expect(data.info.version).toBe("0.5.0");
  });

  it("lists all API paths", async () => {
    const response = await GET();
    const data = await response.json();
    const paths = Object.keys(data.paths);
    expect(paths).toContain("/api/bounties");
    expect(paths).toContain("/api/health");
    expect(paths).toContain("/api/payments");
    expect(paths).toContain("/api/nostr/nip89");
    expect(paths.length).toBeGreaterThanOrEqual(10);
  });

  it("includes security scheme", async () => {
    const response = await GET();
    const data = await response.json();
    expect(data.components.securitySchemes.apiKey).toBeDefined();
    expect(data.components.securitySchemes.apiKey.name).toBe("X-API-Key");
  });

  it("describes bounty creation", async () => {
    const response = await GET();
    const data = await response.json();
    const post = data.paths["/api/bounties"].post;
    expect(post.summary).toContain("Create");
    expect(
      post.requestBody.content["application/json"].schema.required,
    ).toContain("title");
  });

  it("sets cache headers", async () => {
    const response = await GET();
    expect(response.headers.get("Cache-Control")).toContain("max-age=3600");
  });
});

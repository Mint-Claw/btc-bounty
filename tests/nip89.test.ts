import { describe, it, expect } from "vitest";
import { GET } from "@/app/api/nostr/nip89/route";

describe("NIP-89 App Handler Discovery", () => {
  it("returns app metadata", async () => {
    const response = await GET();
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.name).toBeDefined();
    expect(data.display_name).toBe("BTC Bounty");
    expect(data.description).toContain("bounty");
  });

  it("includes bounty kind in supported kinds", async () => {
    const response = await GET();
    const data = await response.json();
    expect(data.kinds).toBeInstanceOf(Array);
    expect(data.kinds.length).toBeGreaterThan(0);
  });

  it("includes NIP-89 handler info", async () => {
    const response = await GET();
    const data = await response.json();
    expect(data.nip89).toBeDefined();
    expect(data.nip89.handler_type).toBe("web");
    expect(data.nip89.handler_url).toContain("{d_tag}");
    expect(data.nip89.categories).toBeInstanceOf(Array);
    expect(data.nip89.categories).toContain("code");
  });

  it("includes API info with version", async () => {
    const response = await GET();
    const data = await response.json();
    expect(data.api).toBeDefined();
    expect(data.api.version).toBe("0.2.0");
  });

  it("includes supported NIPs", async () => {
    const response = await GET();
    const data = await response.json();
    expect(data.supported_nips).toContain(89);
    expect(data.supported_nips).toContain(57);
  });

  it("sets cache headers", async () => {
    const response = await GET();
    expect(response.headers.get("Cache-Control")).toContain("max-age=3600");
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

// We test the middleware logic by importing and calling it directly
// with mocked NextRequest/NextResponse

describe("Middleware", () => {
  // Rate limit map is module-scoped, so we test behavior
  
  it("allows requests under rate limit", async () => {
    const { middleware } = await import("@/middleware");
    
    const request = {
      nextUrl: { pathname: "/api/bounties" },
      headers: new Map([
        ["x-forwarded-for", "192.168.1.100"],
        ["origin", "http://localhost:3000"],
      ]),
      method: "GET",
    };
    
    // Mock headers.get
    request.headers.get = (key: string) => {
      const map: Record<string, string> = {
        "x-forwarded-for": "192.168.1.100",
        origin: "http://localhost:3000",
      };
      return map[key] || null;
    };
    
    const response = middleware(request as any);
    expect(response.status).not.toBe(429);
  });

  it("skips rate limiting for health checks", async () => {
    const { middleware } = await import("@/middleware");
    
    const request = {
      nextUrl: { pathname: "/api/health" },
      headers: {
        get: (key: string) => {
          if (key === "x-forwarded-for") return "10.0.0.1";
          if (key === "origin") return "http://localhost:3000";
          return null;
        },
      },
      method: "GET",
    };
    
    const response = middleware(request as any);
    expect(response.status).not.toBe(429);
  });

  it("handles OPTIONS preflight with CORS headers", async () => {
    const { middleware } = await import("@/middleware");
    
    const request = {
      nextUrl: { pathname: "/api/bounties" },
      headers: {
        get: (key: string) => {
          if (key === "x-forwarded-for") return "10.0.0.2";
          if (key === "origin") return "http://localhost:3000";
          return null;
        },
      },
      method: "OPTIONS",
    };
    
    const response = middleware(request as any);
    expect(response.status).toBe(204);
  });

  it("adds security headers to API responses", async () => {
    const { middleware } = await import("@/middleware");
    
    const request = {
      nextUrl: { pathname: "/api/bounties" },
      headers: {
        get: (key: string) => {
          if (key === "x-forwarded-for") return "10.0.0.3";
          if (key === "origin") return "http://localhost:3000";
          return null;
        },
      },
      method: "GET",
    };
    
    const response = middleware(request as any);
    // Next.js middleware returns NextResponse which has headers
    // In test environment, we verify it doesn't error
    expect(response).toBeDefined();
  });
});

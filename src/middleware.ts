/**
 * Next.js Middleware — Rate limiting for API routes
 *
 * Simple in-memory rate limiter using sliding window.
 * For production, use Redis or a dedicated rate limiter.
 */

import { NextRequest, NextResponse } from "next/server";

// In-memory rate limit store (resets on deploy)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX_ANONYMOUS = 30; // 30 req/min for anonymous
const RATE_LIMIT_MAX_AGENT = 120; // 120 req/min for authenticated agents

function getClientIP(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

function checkRateLimit(key: string, max: number): { limited: boolean; remaining: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { limited: false, remaining: max - 1 };
  }

  entry.count++;
  return {
    limited: entry.count > max,
    remaining: Math.max(0, max - entry.count),
  };
}

// Periodically clean up expired entries (every 5 min)
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of rateLimitMap) {
    if (now > value.resetAt) {
      rateLimitMap.delete(key);
    }
  }
}, 5 * 60 * 1000);

export function middleware(request: NextRequest) {
  // Only rate limit API routes (not pages/static)
  if (!request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // Skip rate limiting for health checks
  if (request.nextUrl.pathname === "/api/health") {
    return NextResponse.next();
  }

  const ip = getClientIP(request);
  const apiKey = request.headers.get("x-api-key");

  // Authenticated agents get higher limits, keyed by API key
  // Anonymous requests are keyed by IP
  const rateLimitKey = apiKey ? `agent:${apiKey}` : `ip:${ip}`;
  const rateLimitMax = apiKey ? RATE_LIMIT_MAX_AGENT : RATE_LIMIT_MAX_ANONYMOUS;

  const { limited, remaining } = checkRateLimit(rateLimitKey, rateLimitMax);

  if (limited) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": "60",
          "X-RateLimit-Limit": String(rateLimitMax),
          "X-RateLimit-Remaining": "0",
        },
      }
    );
  }

  const response = NextResponse.next();

  // CORS headers for API routes
  const origin = request.headers.get("origin") || "";
  const allowedOrigins = (
    process.env.CORS_ORIGINS || "https://mintclaw.dev,http://localhost:3000"
  ).split(",");

  if (allowedOrigins.includes(origin) || allowedOrigins.includes("*")) {
    response.headers.set("Access-Control-Allow-Origin", origin);
  }
  response.headers.set(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS"
  );
  response.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-API-Key, X-Nostr-Sig"
  );
  response.headers.set("Access-Control-Max-Age", "86400");

  // Rate limit info headers
  response.headers.set("X-RateLimit-Limit", String(rateLimitMax));
  response.headers.set("X-RateLimit-Remaining", String(remaining));

  // Security headers
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  // Handle preflight
  if (request.method === "OPTIONS") {
    return new NextResponse(null, {
      status: 204,
      headers: response.headers,
    });
  }

  return response;
}

export const config = {
  matcher: "/api/:path*",
};

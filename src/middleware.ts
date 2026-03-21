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
const RATE_LIMIT_MAX = 60; // 60 requests per minute per IP

function getClientIP(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  entry.count++;
  return entry.count > RATE_LIMIT_MAX;
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

  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": "60",
          "X-RateLimit-Limit": String(RATE_LIMIT_MAX),
        },
      }
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};

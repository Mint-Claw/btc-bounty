import { describe, it, expect, beforeEach } from "vitest";
import { createRateLimiter } from "@/lib/server/rate-limit";

describe("Rate Limiter", () => {
  describe("basic functionality", () => {
    it("allows requests within limit", () => {
      const limiter = createRateLimiter({ max: 3, windowMs: 1000 });
      expect(limiter.check("a").ok).toBe(true);
      expect(limiter.check("a").ok).toBe(true);
      expect(limiter.check("a").ok).toBe(true);
    });

    it("blocks requests over limit", () => {
      const limiter = createRateLimiter({ max: 2, windowMs: 60000 });
      limiter.check("a");
      limiter.check("a");
      const result = limiter.check("a");
      expect(result.ok).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it("tracks remaining count", () => {
      const limiter = createRateLimiter({ max: 5, windowMs: 60000 });
      expect(limiter.check("a").remaining).toBe(4);
      expect(limiter.check("a").remaining).toBe(3);
      expect(limiter.check("a").remaining).toBe(2);
    });

    it("isolates keys", () => {
      const limiter = createRateLimiter({ max: 1, windowMs: 60000 });
      expect(limiter.check("a").ok).toBe(true);
      expect(limiter.check("b").ok).toBe(true);
      expect(limiter.check("a").ok).toBe(false);
      expect(limiter.check("b").ok).toBe(false);
    });
  });

  describe("window expiry", () => {
    it("resets after window expires", async () => {
      const limiter = createRateLimiter({ max: 1, windowMs: 50 });
      expect(limiter.check("a").ok).toBe(true);
      expect(limiter.check("a").ok).toBe(false);

      await new Promise((r) => setTimeout(r, 60));
      expect(limiter.check("a").ok).toBe(true);
    });

    it("provides resetMs", () => {
      const limiter = createRateLimiter({ max: 5, windowMs: 10000 });
      const result = limiter.check("a");
      expect(result.resetMs).toBeGreaterThan(0);
      expect(result.resetMs).toBeLessThanOrEqual(10000);
    });
  });

  describe("reset", () => {
    it("clears a key", () => {
      const limiter = createRateLimiter({ max: 1, windowMs: 60000 });
      limiter.check("a");
      expect(limiter.check("a").ok).toBe(false);
      limiter.reset("a");
      expect(limiter.check("a").ok).toBe(true);
    });
  });

  describe("size tracking", () => {
    it("reports number of tracked keys", () => {
      const limiter = createRateLimiter({ max: 10, windowMs: 60000 });
      expect(limiter.size).toBe(0);
      limiter.check("x");
      limiter.check("y");
      expect(limiter.size).toBe(2);
    });
  });

  describe("does not count blocked requests", () => {
    it("blocked requests do not add timestamps", () => {
      const limiter = createRateLimiter({ max: 2, windowMs: 60000 });
      limiter.check("a"); // 1
      limiter.check("a"); // 2
      limiter.check("a"); // blocked
      limiter.check("a"); // blocked
      // total should still be 2 (blocked requests not added)
      expect(limiter.check("a").total).toBe(2);
    });
  });
});

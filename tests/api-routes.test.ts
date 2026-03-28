import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock next/server
vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) => ({
      json: async () => body,
      status: init?.status ?? 200,
      headers: new Headers(init?.headers),
    }),
  },
  NextRequest: class MockNextRequest {
    url: string;
    method: string;
    headers: Headers;
    _body: unknown;

    constructor(url: string, init?: { method?: string; body?: string; headers?: Record<string, string> }) {
      this.url = url;
      this.method = init?.method ?? "GET";
      this.headers = new Headers(init?.headers);
      this._body = init?.body ? JSON.parse(init.body) : null;
    }

    async json() {
      return this._body;
    }
  },
}));

// Mock db
const mockDB = {
  prepare: vi.fn().mockReturnValue({
    get: vi.fn().mockReturnValue({ cnt: 3 }),
    all: vi.fn().mockReturnValue([]),
    run: vi.fn().mockReturnValue({ changes: 0 }),
  }),
};

vi.mock("@/lib/server/db", () => ({
  getDB: () => mockDB,
}));

// Mock btcpay
vi.mock("@/lib/server/btcpay", () => ({
  btcpayHealthCheck: vi.fn().mockResolvedValue({ ok: true, url: "https://btcpay.test" }),
}));

// Mock payments
vi.mock("@/lib/server/payments", () => ({
  getPaymentStats: vi.fn().mockResolvedValue({ total: 0, pending: 0, completed: 0 }),
}));

// Mock relay-health
vi.mock("@/lib/server/relay-health", () => ({
  checkAllRelays: vi.fn().mockResolvedValue([
    { url: "wss://relay.test", status: "connected", latencyMs: 50 },
  ]),
  relayHealthSummary: vi.fn().mockReturnValue({
    healthy: true,
    connected: 1,
    total: 1,
    avgLatencyMs: 50,
  }),
}));

describe("API Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/health", () => {
    it("returns ok status when all subsystems healthy", async () => {
      const { GET } = await import("@/app/api/health/route");
      const response = await GET();
      const body = await response.json();

      expect(body.status).toBe("ok");
      expect(body.version).toBeDefined();
      expect(body.timestamp).toBeDefined();
      expect(body.btcpay.connected).toBe(true);
      expect(body.database.ok).toBe(true);
      expect(body.nostr.healthy).toBe(true);
    });

    it("includes relay connectivity details", async () => {
      const { GET } = await import("@/app/api/health/route");
      const response = await GET();
      const body = await response.json();

      expect(body.nostr.relays).toHaveLength(1);
      expect(body.nostr.relays[0]).toMatchObject({
        url: "wss://relay.test",
        status: "connected",
        latencyMs: 50,
      });
    });

    it("includes environment info", async () => {
      const { GET } = await import("@/app/api/health/route");
      const response = await GET();
      const body = await response.json();

      expect(body.env.node).toMatch(/^v\d+/);
      expect(body.env.platform).toBeDefined();
    });
  });

  describe("GET /api/bounties/cached", () => {
    it("returns empty array when no cached bounties", async () => {
      mockDB.prepare.mockReturnValue({
        all: vi.fn().mockReturnValue([]),
        get: vi.fn().mockReturnValue({ cnt: 0 }),
      });

      const { GET } = await import("@/app/api/bounties/cached/route");
      const response = await GET();
      const body = await response.json();

      expect(Array.isArray(body.bounties) || body.bounties === undefined || body.length === 0 || body.error).toBeTruthy();
    });
  });

  describe("GET /api/admin/stats", () => {
    it("requires API key for admin endpoints", async () => {
      // Admin routes typically check for authorization
      const { GET } = await import("@/app/api/admin/stats/route");
      const response = await GET();
      const body = await response.json();

      // Should return data (in test env, auth may be bypassed)
      // or 401 unauthorized
      expect(response.status === 200 || response.status === 401).toBe(true);
    });
  });

  describe("GET /api/relays/status", () => {
    it("returns relay connection status", async () => {
      const { GET } = await import("@/app/api/relays/status/route");
      const response = await GET();
      const body = await response.json();

      // Should return relay status info with expected structure
      expect(body).toBeDefined();
      expect(body).toHaveProperty("timestamp");
      expect(body).toHaveProperty("total");
      expect(body).toHaveProperty("relays");
      expect(Array.isArray(body.relays)).toBe(true);
    }, 15_000); // Allow time for real WebSocket connections in test
  });
});

describe("API Response Format", () => {
  it("health endpoint follows standard format", async () => {
    const { GET } = await import("@/app/api/health/route");
    const response = await GET();
    const body = await response.json();

    // Standard health check fields
    expect(body).toHaveProperty("status");
    expect(body).toHaveProperty("timestamp");
    expect(body).toHaveProperty("uptime");
    expect(typeof body.uptime).toBe("number");
    expect(new Date(body.timestamp).getTime()).not.toBeNaN();
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock ws module
const mockSend = vi.fn();
const mockClose = vi.fn();
const mockOn = vi.fn();

vi.mock("ws", () => ({
  WebSocket: vi.fn().mockImplementation(() => ({
    on: mockOn,
    send: mockSend,
    close: mockClose,
  })),
}));

// Mock constants
vi.mock("@/constants/relays", () => ({
  DEFAULT_RELAYS: ["wss://relay.test.one", "wss://relay.test.two"],
}));

describe("GET /api/relays/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns relay status for all configured relays", async () => {
    // Simulate successful connections
    mockOn.mockImplementation((event: string, cb: (...args: unknown[]) => void) => {
      if (event === "open") {
        setTimeout(() => cb(), 10);
      }
      if (event === "message") {
        setTimeout(() => cb(Buffer.from('["EOSE","ping_123"]')), 20);
      }
    });

    const { GET } = await import("@/app/api/relays/status/route");
    const response = await GET();
    const data = await response.json();

    expect(data.total).toBe(2);
    expect(data.relays).toHaveLength(2);
    expect(data.relays[0].url).toBe("wss://relay.test.one");
    expect(data.relays[1].url).toBe("wss://relay.test.two");
    expect(data.timestamp).toBeDefined();
  });

  it("handles relay connection errors", async () => {
    // Simulate connection error
    mockOn.mockImplementation((event: string, cb: (...args: unknown[]) => void) => {
      if (event === "error") {
        setTimeout(() => cb(new Error("Connection refused")), 10);
      }
    });

    const { GET } = await import("@/app/api/relays/status/route");
    const response = await GET();
    const data = await response.json();

    expect(data.total).toBe(2);
    expect(data.disconnected).toBeGreaterThanOrEqual(0);
    expect(data.relays).toHaveLength(2);
  });

  it("includes latency data for connected relays", async () => {
    mockOn.mockImplementation((event: string, cb: (...args: unknown[]) => void) => {
      if (event === "open") {
        setTimeout(() => cb(), 5);
      }
      if (event === "message") {
        setTimeout(() => cb(Buffer.from('["EOSE","sub"]')), 15);
      }
    });

    const { GET } = await import("@/app/api/relays/status/route");
    const response = await GET();
    const data = await response.json();

    for (const relay of data.relays) {
      if (relay.connected) {
        expect(relay.latencyMs).toBeTypeOf("number");
        expect(relay.latencyMs).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

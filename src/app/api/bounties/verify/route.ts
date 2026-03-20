import { NextResponse } from "next/server";

/**
 * GET /api/bounties/verify?id=<event_id>
 *
 * Verify a bounty event exists on configured Nostr relays.
 * Useful for confirming that a posted bounty actually propagated.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const eventId = searchParams.get("id");

  if (!eventId) {
    return NextResponse.json(
      { error: "Missing required parameter: id (Nostr event ID)" },
      { status: 400 }
    );
  }

  // Validate hex event ID (64 chars)
  if (!/^[0-9a-f]{64}$/.test(eventId)) {
    return NextResponse.json(
      { error: "Invalid event ID — must be 64-char hex" },
      { status: 400 }
    );
  }

  const relayUrls = (
    process.env.NEXT_PUBLIC_RELAYS ||
    "wss://relay.damus.io,wss://nos.lol"
  )
    .split(",")
    .map((r) => r.trim());

  interface RelayResult {
    relay: string;
    found: boolean;
    event?: Record<string, unknown>;
    error?: string;
  }

  const results: RelayResult[] = await Promise.all(
    relayUrls.map(
      (url) =>
        new Promise<RelayResult>((resolve) => {
          const timeout = setTimeout(() => {
            try {
              ws.close();
            } catch {
              /* ignore */
            }
            resolve({ relay: url, found: false, error: "timeout" });
          }, 8000);

          let ws: import("ws").WebSocket;

          try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const { WebSocket } = require("ws") as typeof import("ws");
            ws = new WebSocket(url);
            const subId = `verify_${Date.now()}`;

            ws.on("open", () => {
              ws.send(
                JSON.stringify(["REQ", subId, { ids: [eventId], limit: 1 }])
              );
            });

            ws.on("message", (data: Buffer | string) => {
              try {
                const msg = JSON.parse(data.toString());
                if (msg[0] === "EVENT" && msg[1] === subId && msg[2]) {
                  clearTimeout(timeout);
                  ws.close();
                  resolve({
                    relay: url,
                    found: true,
                    event: {
                      id: msg[2].id,
                      kind: msg[2].kind,
                      pubkey: msg[2].pubkey,
                      created_at: msg[2].created_at,
                      content_length: msg[2].content?.length ?? 0,
                      tags_count: msg[2].tags?.length ?? 0,
                    },
                  });
                } else if (msg[0] === "EOSE") {
                  clearTimeout(timeout);
                  ws.close();
                  resolve({ relay: url, found: false });
                }
              } catch {
                /* ignore parse errors */
              }
            });

            ws.on("error", (err: Error) => {
              clearTimeout(timeout);
              resolve({ relay: url, found: false, error: err.message });
            });
          } catch (err) {
            clearTimeout(timeout);
            resolve({
              relay: url,
              found: false,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        })
    )
  );

  const found = results.filter((r) => r.found);

  return NextResponse.json({
    eventId,
    verified: found.length > 0,
    relaysChecked: results.length,
    relaysFound: found.length,
    results,
  });
}

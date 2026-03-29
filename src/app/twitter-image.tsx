import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "BTC-Bounty — Bitcoin-native bounties on NOSTR";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "linear-gradient(135deg, #09090b 0%, #18181b 50%, #27272a 100%)",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <div style={{ fontSize: 80, marginBottom: 16 }}>⚡</div>
        <div
          style={{
            fontSize: 56,
            fontWeight: 800,
            color: "#f97316",
            marginBottom: 12,
          }}
        >
          BTC-Bounty
        </div>
        <div
          style={{
            fontSize: 28,
            color: "#a1a1aa",
            maxWidth: 600,
            textAlign: "center",
          }}
        >
          Post work. Get paid in sats.
        </div>
      </div>
    ),
    { ...size }
  );
}

import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "BTC-Bounty";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Try to fetch bounty data
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  let title = "Bounty";
  let reward = "";
  let status = "OPEN";
  let category = "";

  try {
    const res = await fetch(`${appUrl}/api/bounties/${id}`, {
      next: { revalidate: 300 },
    });
    if (res.ok) {
      const bounty = await res.json();
      if (bounty.title) title = bounty.title;
      if (bounty.reward_sats) {
        const sats = Number(bounty.reward_sats);
        reward =
          sats >= 1_000_000
            ? `${(sats / 1_000_000).toFixed(2)}M sats`
            : sats >= 1_000
              ? `${Math.round(sats / 1_000)}K sats`
              : `${sats.toLocaleString()} sats`;
      }
      if (bounty.status) status = bounty.status;
      if (bounty.category) category = bounty.category;
    }
  } catch {
    // Use defaults
  }

  // Truncate long titles
  if (title.length > 60) title = title.slice(0, 57) + "…";

  const statusColor =
    status === "OPEN"
      ? "#4ade80"
      : status === "IN_PROGRESS"
        ? "#facc15"
        : status === "COMPLETED"
          ? "#60a5fa"
          : "#f87171";

  return new ImageResponse(
    (
      <div
        style={{
          background:
            "linear-gradient(135deg, #09090b 0%, #18181b 50%, #27272a 100%)",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: "60px 80px",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 40,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ fontSize: 36 }}>⚡</div>
            <div
              style={{ fontSize: 28, fontWeight: 700, color: "#f97316" }}
            >
              BTC-Bounty
            </div>
          </div>
          <div
            style={{
              fontSize: 18,
              fontWeight: 600,
              color: statusColor,
              border: `2px solid ${statusColor}`,
              borderRadius: 8,
              padding: "6px 16px",
            }}
          >
            {status}
          </div>
        </div>

        {/* Title */}
        <div
          style={{
            fontSize: 48,
            fontWeight: 800,
            color: "#fafafa",
            lineHeight: 1.2,
            marginBottom: 32,
            flex: 1,
          }}
        >
          {title}
        </div>

        {/* Bottom bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          {reward && (
            <div
              style={{
                fontSize: 40,
                fontWeight: 800,
                color: "#f97316",
              }}
            >
              ⚡ {reward}
            </div>
          )}
          {category && (
            <div
              style={{
                fontSize: 20,
                color: "#71717a",
                textTransform: "uppercase",
                letterSpacing: 2,
              }}
            >
              {category}
            </div>
          )}
        </div>
      </div>
    ),
    { ...size },
  );
}

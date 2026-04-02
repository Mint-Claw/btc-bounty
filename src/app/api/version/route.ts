import { NextResponse } from "next/server";

/**
 * GET /api/version — Public version info
 *
 * Returns app name, version, and build metadata.
 * No authentication required.
 */
export async function GET() {
  return NextResponse.json({
    name: "btc-bounty",
    version: process.env.APP_VERSION || process.env.npm_package_version || "0.4.0",
    description: "Bitcoin bounty platform on Nostr",
    node: process.version,
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
}

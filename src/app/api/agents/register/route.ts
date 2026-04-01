/**
 * POST /api/agents/register — Self-service agent key registration
 *
 * Body: { name?: string }
 *
 * Generates a NOSTR keypair and API key for a new agent.
 * Returns the raw API key (only shown once) and the agent's pubkey.
 *
 * Rate-limited to prevent abuse. Optional REGISTRATION_SECRET
 * env var gates registration behind a shared secret.
 */

import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { generateKeypair, pubkeyFromNsec } from "@/lib/server/signing";
import { hashApiKey } from "@/lib/server/auth";
import { insertApiKey } from "@/lib/server/db";
import { encrypt } from "@/lib/server/crypto";

export async function POST(request: NextRequest) {
  // Optional gating: require a registration secret
  const regSecret = process.env.REGISTRATION_SECRET;
  if (regSecret) {
    const provided = request.headers.get("x-registration-secret");
    if (provided !== regSecret) {
      return NextResponse.json(
        { error: "Registration is invite-only. Provide X-Registration-Secret header." },
        { status: 403 },
      );
    }
  }

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    // Empty body is fine
  }

  const name = typeof body.name === "string" ? body.name.slice(0, 64) : "agent";

  // Generate NOSTR keypair
  const { nsec: nsecHex, pubkey } = generateKeypair();

  // Generate API key: 32 random bytes → base64url → 40 chars
  const apiKey = randomBytes(32)
    .toString("base64url")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 40);

  const apiKeyHash = hashApiKey(apiKey);
  const id = crypto.randomUUID();

  try {
    insertApiKey({
      id,
      agentNpub: pubkey,
      apiKeyHash,
      managedNsecEncrypted: encrypt(nsecHex),
    });
  } catch (err) {
    console.error("[register] DB insert failed:", err);
    return NextResponse.json(
      { error: "Registration failed" },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      id,
      name,
      pubkey,
      apiKey, // ⚠️ Only shown once. Agent must store this.
      message: "Save your API key — it cannot be retrieved later.",
      usage: {
        header: "X-API-Key",
        example: `curl -H "X-API-Key: ${apiKey}" ${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/bounties`,
      },
    },
    { status: 201 },
  );
}

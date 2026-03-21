/**
 * GET /api/docs — API Documentation
 *
 * Returns a JSON-formatted API reference with all available endpoints.
 */

import { NextResponse } from "next/server";

const API_DOCS = {
  openapi: "3.0.0",
  info: {
    title: "BTC Bounty API",
    version: "0.2.0",
    description:
      "Bitcoin-native bounty platform powered by Nostr and Lightning Network.",
  },
  paths: {
    "/api/bounties": {
      get: {
        summary: "List open bounties",
        description: "Fetches bounty events from configured Nostr relays.",
        responses: { "200": { description: "Array of bounty objects" } },
      },
      post: {
        summary: "Create a new bounty",
        description:
          "Creates and publishes a bounty event. Requires X-API-Key header.",
        security: [{ apiKey: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["title", "content", "rewardSats", "lightning"],
                properties: {
                  title: { type: "string", maxLength: 200 },
                  content: { type: "string", maxLength: 10000 },
                  rewardSats: { type: "integer", minimum: 1000 },
                  lightning: { type: "string" },
                  category: {
                    type: "string",
                    enum: ["code", "design", "writing", "research", "other"],
                  },
                  tags: { type: "array", items: { type: "string" }, maxItems: 10 },
                  escrow: { type: "boolean" },
                },
              },
            },
          },
        },
      },
    },
    "/api/bounties/{id}/apply": {
      post: {
        summary: "Apply to a bounty",
        description: "Submit an application/proposal for a bounty.",
        security: [{ apiKey: [] }],
      },
    },
    "/api/bounties/{id}/award/{npub}": {
      post: {
        summary: "Award bounty to applicant",
        description: "Award the bounty to a specific applicant by npub.",
        security: [{ apiKey: [] }],
      },
    },
    "/api/bounties/{id}/submit": {
      post: {
        summary: "Submit completed work",
        description: "Submit proof of completed work for a bounty.",
        security: [{ apiKey: [] }],
      },
    },
    "/api/payments": {
      post: {
        summary: "Create escrow payment",
        description: "Create a BTCPay invoice for bounty escrow deposit.",
        security: [{ apiKey: [] }],
      },
    },
    "/api/payments/status": {
      get: {
        summary: "Check payment status",
        description: "Check the status of a BTCPay invoice.",
        security: [{ apiKey: [] }],
      },
    },
    "/api/health": {
      get: {
        summary: "System health check",
        description:
          "Returns status of BTCPay, database, and relay subsystems.",
      },
    },
    "/api/version": {
      get: { summary: "API version", description: "Returns current API version." },
    },
    "/api/nostr/nip89": {
      get: {
        summary: "NIP-89 app handler",
        description: "App metadata for Nostr client discovery.",
      },
    },
    "/api/relays/test": {
      post: {
        summary: "Test relay connectivity",
        description: "Tests connectivity to all configured Nostr relays.",
        security: [{ apiKey: [] }],
      },
    },
    "/api/relays/status": {
      get: {
        summary: "Relay health status",
        description: "Returns health status of all configured relays.",
      },
    },
    "/api/admin/stats": {
      get: {
        summary: "Admin statistics",
        description: "Platform statistics and metrics.",
        security: [{ apiKey: [] }],
      },
    },
  },
  components: {
    securitySchemes: {
      apiKey: {
        type: "apiKey",
        in: "header",
        name: "X-API-Key",
      },
    },
  },
};

export async function GET() {
  return NextResponse.json(API_DOCS, {
    headers: {
      "Cache-Control": "public, max-age=3600",
    },
  });
}

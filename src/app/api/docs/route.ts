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
    version: "0.4.0",
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
          "Creates and publishes a bounty event. Two modes: (1) Managed — provide X-API-Key header and bounty fields, platform signs the NOSTR event. (2) Pre-signed — submit a fully signed NIP-01 kind:30402 event with id, pubkey, sig, tags. No API key needed for pre-signed events.",
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
    "/api/bounties/{id}/fund": {
      post: {
        summary: "Fund a bounty with Bitcoin",
        description:
          "Creates a BTCPay invoice for escrow. Redirects to BTCPay checkout. Only the bounty owner can fund.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["amountSats"],
                properties: {
                  amountSats: {
                    type: "integer",
                    minimum: 1000,
                    maximum: 10000000,
                    description: "Amount to escrow in satoshis",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description:
              "Invoice created. Contains checkoutUrl to redirect user to BTCPay.",
          },
          "409": { description: "Bounty already funded" },
          "503": { description: "BTCPay Server not configured" },
        },
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
    "/api/admin/sync": {
      post: {
        summary: "Sync bounties from relays",
        description: "Triggers relay→SQLite bounty cache sync. Use ?full=true for full sync, default incremental.",
        security: [{ apiKey: [] }],
      },
    },
    "/api/admin/expire": {
      post: {
        summary: "Expire stale bounties",
        description: "Finds open bounties past expiration and marks them expired on NOSTR.",
        security: [{ apiKey: [] }],
      },
    },
    "/api/agents/register": {
      post: {
        summary: "Register a new agent",
        description: "Self-service agent registration. Generates NOSTR keypair + API key. Returns raw API key once.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name"],
                properties: {
                  name: { type: "string", maxLength: 100 },
                  registrationSecret: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "201": { description: "Agent registered, API key returned" },
          "403": { description: "Invalid registration secret" },
        },
      },
    },
    "/api/metrics": {
      get: {
        summary: "Prometheus metrics",
        description: "Exports platform metrics in Prometheus text format. Use ?format=json for JSON. Auth required when ADMIN_SECRET is set.",
        responses: {
          "200": { description: "Metrics in text/plain or application/json" },
        },
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

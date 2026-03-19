/**
 * Environment variable validation for BTC-Bounty.
 * Import at server startup to fail fast on missing config.
 */

interface EnvVar {
  name: string;
  required: boolean;
  description: string;
  default?: string;
}

const ENV_VARS: EnvVar[] = [
  // Core
  { name: "NEXT_PUBLIC_APP_URL", required: true, description: "Public app URL (e.g. https://bounty.example.com)" },
  { name: "NEXT_PUBLIC_RELAYS", required: true, description: "Comma-separated Nostr relay URLs" },

  // Auth & Signing
  { name: "PLATFORM_NSEC", required: false, description: "Platform Nostr secret key (hex) for server-side signing" },
  { name: "AGENT_API_KEYS", required: false, description: "API keys for agent access (format: key1:nsec1,key2:nsec2)" },

  // BTCPay
  { name: "BTCPAY_URL", required: false, description: "BTCPay Server URL" },
  { name: "BTCPAY_API_KEY", required: false, description: "BTCPay API key" },
  { name: "BTCPAY_STORE_ID", required: false, description: "BTCPay store ID" },
  { name: "BTCPAY_WEBHOOK_SECRET", required: false, description: "BTCPay webhook HMAC secret" },

  // Webhooks
  { name: "WEBHOOK_SECRET", required: false, description: "HMAC secret for outbound webhook signatures" },
  { name: "WEBHOOK_URLS", required: false, description: "Comma-separated webhook delivery URLs" },

  // Data
  { name: "BTCBOUNTY_DATA_DIR", required: false, description: "SQLite data directory", default: ".data" },
];

export interface ValidationResult {
  valid: boolean;
  missing: string[];
  warnings: string[];
  present: string[];
}

export function validateEnv(): ValidationResult {
  const missing: string[] = [];
  const warnings: string[] = [];
  const present: string[] = [];

  for (const v of ENV_VARS) {
    const value = process.env[v.name];
    if (!value && !v.default) {
      if (v.required) {
        missing.push(`${v.name} — ${v.description}`);
      } else {
        warnings.push(`${v.name} not set — ${v.description}`);
      }
    } else {
      present.push(v.name);
    }
  }

  // BTCPay group: warn if partially configured
  const btcpayVars = ["BTCPAY_URL", "BTCPAY_API_KEY", "BTCPAY_STORE_ID"];
  const btcpaySet = btcpayVars.filter((v) => process.env[v]);
  if (btcpaySet.length > 0 && btcpaySet.length < btcpayVars.length) {
    const btcpayMissing = btcpayVars.filter((v) => !process.env[v]);
    warnings.push(
      `BTCPay partially configured: missing ${btcpayMissing.join(", ")}`
    );
  }

  return {
    valid: missing.length === 0,
    missing,
    warnings,
    present,
  };
}

export function validateEnvOrThrow(): void {
  const result = validateEnv();
  if (!result.valid) {
    const msg = [
      "❌ Missing required environment variables:",
      ...result.missing.map((m) => `  • ${m}`),
      "",
      "See .env.example for configuration reference.",
    ].join("\n");
    throw new Error(msg);
  }
  if (result.warnings.length > 0) {
    console.warn("⚠️  Environment warnings:");
    result.warnings.forEach((w) => console.warn(`  • ${w}`));
  }
}

export const DEFAULT_RELAYS = (
  process.env.NEXT_PUBLIC_RELAYS ||
  "wss://relay.damus.io,wss://relay.primal.net,wss://nos.lol,wss://relay.snort.social"
)
  .split(",")
  .map((r) => r.trim());

export const APP_NAME =
  process.env.NEXT_PUBLIC_APP_NAME || "BTC-Bounty";

export const DOMAIN = "mintclaw.dev";

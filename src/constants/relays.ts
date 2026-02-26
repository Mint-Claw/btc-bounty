export const DEFAULT_RELAYS = (
  process.env.NEXT_PUBLIC_RELAYS ||
  "wss://relay.damus.io,wss://nos.lol,wss://nostr.wine,wss://relay.primal.net"
)
  .split(",")
  .map((r) => r.trim());

export const APP_NAME =
  process.env.NEXT_PUBLIC_APP_NAME || "BTC-Bounty";

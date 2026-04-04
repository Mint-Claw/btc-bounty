#!/bin/bash
# Cloudflare quick tunnel wrapper — captures URL to file
URL_FILE="/tmp/btc-bounty-tunnel-url.txt"
LOG_FILE="/tmp/btc-bounty-tunnel.log"

exec cloudflared tunnel --url http://localhost:3457 2>&1 | tee "$LOG_FILE" | while IFS= read -r line; do
  echo "$line"
  url=$(echo "$line" | grep -o 'https://[^ ]*trycloudflare.com')
  if [ -n "$url" ]; then
    echo "$url" > "$URL_FILE"
    echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) Tunnel URL: $url" >> "$URL_FILE"
  fi
done

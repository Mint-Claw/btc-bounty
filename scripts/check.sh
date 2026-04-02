#!/bin/bash
# check.sh — Quick health check for btc-bounty
# Returns 0 if healthy, 1 if not

BASE="${1:-http://localhost:3457}"

health=$(curl -sf "$BASE/api/health" 2>/dev/null)
if [ $? -ne 0 ]; then
  echo "❌ Server unreachable at $BASE"
  exit 1
fi

tables=$(echo "$health" | python3 -c "import sys,json;print(json.load(sys.stdin)['database']['tables'])" 2>/dev/null)
relays=$(echo "$health" | python3 -c "import sys,json;d=json.load(sys.stdin)['nostr'];print(f'{d[\"online\"]}/{d[\"total\"]}')" 2>/dev/null)
uptime=$(echo "$health" | python3 -c "import sys,json;print(f'{json.load(sys.stdin)[\"uptime\"]:.0f}s')" 2>/dev/null)

bounties=$(curl -sf "$BASE/api/bounties" 2>/dev/null | python3 -c "import sys,json;print(json.load(sys.stdin)['count'])" 2>/dev/null || echo "?")

echo "✅ BTC-Bounty healthy"
echo "   Uptime: $uptime | Tables: $tables | Relays: $relays | Bounties: $bounties"

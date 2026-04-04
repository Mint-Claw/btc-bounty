#!/bin/bash
# BTC-Bounty Health Check — suitable for cron
# Usage: ./health-check.sh [base_url]
# Returns 0 if healthy, 1 if unhealthy

BASE_URL="${1:-http://localhost:3457}"
TIMEOUT=10

# Check health endpoint
health=$(curl -sf --max-time "$TIMEOUT" "$BASE_URL/api/health" 2>/dev/null)
if [ $? -ne 0 ]; then
  echo "CRITICAL: Health endpoint unreachable at $BASE_URL"
  exit 1
fi

status=$(echo "$health" | python3 -c "import sys,json;print(json.load(sys.stdin).get('status',''))" 2>/dev/null)
version=$(echo "$health" | python3 -c "import sys,json;print(json.load(sys.stdin).get('version','?'))" 2>/dev/null)
db_ok=$(echo "$health" | python3 -c "import sys,json;print(json.load(sys.stdin).get('database',{}).get('ok',False))" 2>/dev/null)
relays=$(echo "$health" | python3 -c "import sys,json;n=json.load(sys.stdin).get('nostr',{});print(f\"{n.get('online',0)}/{n.get('total',0)}\")" 2>/dev/null)

if [ "$status" != "ok" ]; then
  echo "WARNING: Status=$status (v$version) db=$db_ok relays=$relays"
  exit 1
fi

if [ "$db_ok" != "True" ]; then
  echo "CRITICAL: Database unhealthy (v$version)"
  exit 1
fi

# Check bounty count
stats=$(curl -sf --max-time "$TIMEOUT" "$BASE_URL/api/admin/stats" 2>/dev/null)
total=$(echo "$stats" | python3 -c "import sys,json;print(json.load(sys.stdin).get('bounties',{}).get('total',0))" 2>/dev/null)

echo "OK: v$version db=$db_ok relays=$relays bounties=$total"
exit 0

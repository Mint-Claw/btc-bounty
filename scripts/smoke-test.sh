#!/bin/bash
# Smoke test for BTC Bounty deployment
# Usage: ./scripts/smoke-test.sh [BASE_URL]

set -e

BASE="${1:-http://localhost:3000}"
PASS=0
FAIL=0

check() {
  local name="$1"
  local url="$2"
  local expect="$3"
  
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || echo "000")
  if [ "$STATUS" = "$expect" ]; then
    echo "✅ $name ($STATUS)"
    PASS=$((PASS + 1))
  else
    echo "❌ $name (got $STATUS, expected $expect)"
    FAIL=$((FAIL + 1))
  fi
}

check_json() {
  local name="$1"
  local url="$2"
  local field="$3"
  
  BODY=$(curl -s "$url" 2>/dev/null || echo "{}")
  if echo "$BODY" | grep -q "$field"; then
    echo "✅ $name (has $field)"
    PASS=$((PASS + 1))
  else
    echo "❌ $name (missing $field)"
    FAIL=$((FAIL + 1))
  fi
}

echo "🔍 Smoke Testing: $BASE"
echo "================================"

# Health endpoint
check "Health endpoint" "$BASE/api/health" "200"
check_json "Health status" "$BASE/api/health" '"status"'

# Bounties API
check "Bounties list" "$BASE/api/bounties" "200"
check "Bounties feed" "$BASE/api/bounties/feed" "200"

# Payment status (empty query)
check "Payment status (no ids)" "$BASE/api/payments/status" "400"
check "Payment status (with ids)" "$BASE/api/payments/status?bountyIds=test" "200"

# Relay status (no auth needed for public)
check "Relay status" "$BASE/api/relays/status" "200"

# Admin (should require auth)
check "Admin stats (no auth)" "$BASE/api/admin/stats" "401"
check "Admin expire (no auth)" "$BASE/api/admin/expire" "401"

# Pages
check "Home page" "$BASE" "200"

echo "================================"
echo "Results: $PASS passed, $FAIL failed"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi

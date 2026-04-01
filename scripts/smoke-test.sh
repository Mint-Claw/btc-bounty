#!/usr/bin/env bash
# ═══════════════════════════════════════════════════
# BTC-Bounty Smoke Test
# Run against a live deployment to verify core functionality
# Usage: ./scripts/smoke-test.sh [BASE_URL]
# ═══════════════════════════════════════════════════

set -euo pipefail

BASE_URL="${1:-http://localhost:3000}"
PASS=0
FAIL=0
WARN=0

green() { printf "\033[32m✓ %s\033[0m\n" "$1"; }
red()   { printf "\033[31m✗ %s\033[0m\n" "$1"; }
yellow(){ printf "\033[33m⚠ %s\033[0m\n" "$1"; }

check() {
  local name="$1" url="$2" expected="${3:-200}"
  local status
  status=$(curl -sf -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || echo "000")
  if [[ "$status" == "$expected" ]]; then
    green "$name (HTTP $status)"
    ((PASS++))
  else
    red "$name — expected $expected, got $status"
    ((FAIL++))
  fi
}

check_json() {
  local name="$1" url="$2" jq_filter="$3" expected="$4"
  local result
  result=$(curl -sf "$url" 2>/dev/null | jq -r "$jq_filter" 2>/dev/null || echo "ERROR")
  if [[ "$result" == "$expected" ]]; then
    green "$name ($result)"
    ((PASS++))
  else
    red "$name — expected '$expected', got '$result'"
    ((FAIL++))
  fi
}

echo "═══════════════════════════════════════════"
echo "  BTC-Bounty Smoke Test"
echo "  Target: $BASE_URL"
echo "═══════════════════════════════════════════"
echo ""

# ── Core pages ──────────────────────────────────
echo "── Pages ──"
check "Homepage"           "$BASE_URL/"
check "Post bounty page"   "$BASE_URL/post"
check "API docs page"      "$BASE_URL/docs"

# ── API endpoints ───────────────────────────────
echo ""
echo "── API ──"
check "Health endpoint"    "$BASE_URL/api/health"
check "Version endpoint"   "$BASE_URL/api/version"
check "Bounty list (GET)"  "$BASE_URL/api/bounties"
check "Bounty stats"       "$BASE_URL/api/bounties/stats"
check "Payment status"     "$BASE_URL/api/payments/status?bountyIds=test"
check "RSS feed"           "$BASE_URL/api/bounties/feed"
check "Relay status"       "$BASE_URL/api/relays"

# ── Auth enforcement ────────────────────────────
echo ""
echo "── Auth ──"
check "POST bounty → 401" "$BASE_URL/api/bounties" "401"

# Verify POST returns 401 (not 405 or 500)
AUTH_STATUS=$(curl -sf -o /dev/null -w "%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  -d '{"title":"test"}' \
  "$BASE_URL/api/bounties" 2>/dev/null || echo "000")
if [[ "$AUTH_STATUS" == "401" ]]; then
  green "POST /api/bounties enforces auth (401)"
  ((PASS++))
else
  red "POST /api/bounties auth check — expected 401, got $AUTH_STATUS"
  ((FAIL++))
fi

# ── Health details ──────────────────────────────
echo ""
echo "── Health Details ──"

HEALTH=$(curl -sf "$BASE_URL/api/health" 2>/dev/null || echo "{}")

DB_OK=$(echo "$HEALTH" | jq -r '.database.ok' 2>/dev/null || echo "false")
if [[ "$DB_OK" == "true" ]]; then
  TABLES=$(echo "$HEALTH" | jq -r '.database.tables' 2>/dev/null)
  green "SQLite database OK ($TABLES tables)"
  ((PASS++))
else
  red "SQLite database NOT OK"
  ((FAIL++))
fi

BTCPAY_OK=$(echo "$HEALTH" | jq -r '.btcpay.connected' 2>/dev/null || echo "false")
if [[ "$BTCPAY_OK" == "true" ]]; then
  green "BTCPay Server connected"
  ((PASS++))
else
  yellow "BTCPay Server not connected (escrow disabled)"
  ((WARN++))
fi

RELAY_CONNECTED=$(echo "$HEALTH" | jq -r '.nostr.connected' 2>/dev/null || echo "0")
RELAY_TOTAL=$(echo "$HEALTH" | jq -r '.nostr.total' 2>/dev/null || echo "0")
if [[ "$RELAY_CONNECTED" -gt 0 ]]; then
  green "NOSTR relays: $RELAY_CONNECTED/$RELAY_TOTAL connected"
  ((PASS++))
else
  red "No NOSTR relays connected"
  ((FAIL++))
fi

# ── SEO ─────────────────────────────────────────
echo ""
echo "── SEO ──"
check "robots.txt"  "$BASE_URL/robots.txt"
check "sitemap.xml" "$BASE_URL/sitemap.xml"

# Check OG image
OG_STATUS=$(curl -sf -o /dev/null -w "%{http_code}" "$BASE_URL/opengraph-image" 2>/dev/null || echo "000")
if [[ "$OG_STATUS" == "200" ]]; then
  green "OG image generates"
  ((PASS++))
else
  yellow "OG image not available ($OG_STATUS)"
  ((WARN++))
fi

# ── Summary ─────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════"
printf "  Results: \033[32m%d passed\033[0m" "$PASS"
[[ "$FAIL" -gt 0 ]] && printf ", \033[31m%d failed\033[0m" "$FAIL"
[[ "$WARN" -gt 0 ]] && printf ", \033[33m%d warnings\033[0m" "$WARN"
echo ""
echo "═══════════════════════════════════════════"

exit "$FAIL"

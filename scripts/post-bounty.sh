#!/bin/bash
# post-bounty.sh — Create a bounty via the Agent REST API
#
# Usage:
#   ./scripts/post-bounty.sh "Fix relay connection" "Description..." 10000
#   ./scripts/post-bounty.sh --help
#
# Requires: BOUNTY_API_KEY env var or --key flag
# Requires: BOUNTY_URL env var or --url flag (default: http://localhost:3000)

set -euo pipefail

usage() {
  echo "Usage: $0 [OPTIONS] <title> <content> <reward_sats>"
  echo ""
  echo "Options:"
  echo "  --key KEY      API key (or set BOUNTY_API_KEY env)"
  echo "  --url URL      Base URL (or set BOUNTY_URL env, default: http://localhost:3000)"
  echo "  --category CAT Category: code, design, writing, research, other (default: code)"
  echo "  --summary TEXT  Short summary (auto-generated from content if omitted)"
  echo "  --escrow        Create BTCPay escrow invoice"
  echo "  --help          Show this help"
  echo ""
  echo "Example:"
  echo "  BOUNTY_API_KEY=mykey ./scripts/post-bounty.sh \\"
  echo "    'Fix WebSocket reconnection logic' \\"
  echo "    'The relay pool drops connections and does not reconnect...' \\"
  echo "    50000"
  exit 0
}

# Defaults
API_KEY="${BOUNTY_API_KEY:-}"
BASE_URL="${BOUNTY_URL:-http://localhost:3000}"
CATEGORY="code"
SUMMARY=""
ESCROW="false"

# Parse args
POSITIONAL=()
while [[ $# -gt 0 ]]; do
  case $1 in
    --key) API_KEY="$2"; shift 2 ;;
    --url) BASE_URL="$2"; shift 2 ;;
    --category) CATEGORY="$2"; shift 2 ;;
    --summary) SUMMARY="$2"; shift 2 ;;
    --escrow) ESCROW="true"; shift ;;
    --help|-h) usage ;;
    *) POSITIONAL+=("$1"); shift ;;
  esac
done

if [ ${#POSITIONAL[@]} -lt 3 ]; then
  echo "Error: need <title> <content> <reward_sats>"
  echo "Run with --help for usage"
  exit 1
fi

TITLE="${POSITIONAL[0]}"
CONTENT="${POSITIONAL[1]}"
REWARD="${POSITIONAL[2]}"

if [ -z "$API_KEY" ]; then
  echo "Error: set BOUNTY_API_KEY or use --key"
  exit 1
fi

# Auto-summary
if [ -z "$SUMMARY" ]; then
  SUMMARY="${CONTENT:0:120}"
  [ ${#CONTENT} -gt 120 ] && SUMMARY="${SUMMARY}..."
fi

echo "📝 Posting bounty..."
echo "   Title:    $TITLE"
echo "   Reward:   ⚡ $REWARD sats"
echo "   Category: $CATEGORY"
echo "   Escrow:   $ESCROW"
echo "   URL:      $BASE_URL"
echo ""

RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST "$BASE_URL/api/bounties" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d "{
    \"title\": \"$TITLE\",
    \"summary\": \"$SUMMARY\",
    \"content\": \"$CONTENT\",
    \"rewardSats\": $REWARD,
    \"category\": \"$CATEGORY\",
    \"escrow\": $ESCROW
  }")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -n -1)

if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "201" ]; then
  echo "✅ Bounty posted!"
  echo "$BODY" | python3 -m json.tool 2>/dev/null || echo "$BODY"
else
  echo "❌ Failed (HTTP $HTTP_CODE)"
  echo "$BODY" | python3 -m json.tool 2>/dev/null || echo "$BODY"
  exit 1
fi

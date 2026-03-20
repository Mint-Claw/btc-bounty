#!/bin/bash
# Seed development data via the API
# Usage: API_KEY=your-key ./scripts/seed-dev.sh [BASE_URL]
#
# Requires AGENT_API_KEYS to be set in .env with at least one key.

set -e

BASE="${1:-http://localhost:3000}"
KEY="${API_KEY:-devkey}"

echo "🌱 Seeding development data at $BASE"
echo "   API Key: ${KEY:0:4}..."
echo ""

create_bounty() {
  local title="$1"
  local summary="$2"
  local reward="$3"
  local category="$4"
  local tags="$5"

  RESULT=$(curl -s -X POST "$BASE/api/bounties" \
    -H "Content-Type: application/json" \
    -H "X-API-Key: $KEY" \
    -d "{
      \"title\": \"$title\",
      \"summary\": \"$summary\",
      \"content\": \"Full description for: $title\",
      \"rewardSats\": $reward,
      \"category\": \"$category\",
      \"tags\": [$tags]
    }")

  if echo "$RESULT" | grep -q '"id"'; then
    ID=$(echo "$RESULT" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
    echo "  ✅ Created: $title (${ID:0:8}...)"
  else
    echo "  ❌ Failed: $title"
    echo "     $RESULT"
  fi
}

echo "Creating bounties..."
create_bounty \
  "Build a Lightning-powered comment system" \
  "Create a NIP-07 authenticated comment widget for static sites" \
  50000 "dev" '"nostr","lightning","javascript"'

create_bounty \
  "Design a bounty board logo" \
  "Create an SVG logo combining Bitcoin and bounty themes" \
  25000 "design" '"svg","branding"'

create_bounty \
  "Write NIP-99 marketplace spec review" \
  "Review and document edge cases in the NIP-99 classified listings spec" \
  15000 "writing" '"nostr","nip-99","documentation"'

create_bounty \
  "Rust Nostr relay stress test tool" \
  "Build a CLI tool that stress-tests Nostr relay implementations" \
  100000 "dev" '"rust","nostr","relay","testing"'

create_bounty \
  "Mobile-responsive bounty card component" \
  "Fix layout issues on bounty cards for screens under 375px wide" \
  10000 "dev" '"css","responsive","ui"'

echo ""
echo "Done! Visit $BASE to see your bounties."

#!/usr/bin/env bash
# ═══════════════════════════════════════════════════
# BTC-Bounty Database Backup
# Creates a timestamped backup of the SQLite database.
# Usage: ./scripts/db-backup.sh [DATA_DIR] [BACKUP_DIR]
# ═══════════════════════════════════════════════════

set -euo pipefail

DATA_DIR="${1:-${BTCBOUNTY_DATA_DIR:-./data}}"
BACKUP_DIR="${2:-./backups}"
DB_FILE="$DATA_DIR/btc-bounty.db"

if [ ! -f "$DB_FILE" ]; then
  echo "❌ Database not found: $DB_FILE"
  exit 1
fi

mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/btc-bounty_${TIMESTAMP}.db"

# Use SQLite's backup API for safe hot-copy
sqlite3 "$DB_FILE" ".backup '$BACKUP_FILE'"

# Get size info
DB_SIZE=$(du -h "$DB_FILE" | cut -f1)
BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)

# Get row counts
BOUNTIES=$(sqlite3 "$DB_FILE" "SELECT count(*) FROM bounty_events;" 2>/dev/null || echo "?")
PAYMENTS=$(sqlite3 "$DB_FILE" "SELECT count(*) FROM bounty_payments;" 2>/dev/null || echo "?")
AGENTS=$(sqlite3 "$DB_FILE" "SELECT count(*) FROM api_keys;" 2>/dev/null || echo "?")

echo "✅ Backup created: $BACKUP_FILE"
echo "   Source:   $DB_FILE ($DB_SIZE)"
echo "   Backup:   $BACKUP_FILE ($BACKUP_SIZE)"
echo "   Bounties: $BOUNTIES | Payments: $PAYMENTS | Agents: $AGENTS"

# Clean old backups (keep last 10)
BACKUP_COUNT=$(ls -1 "$BACKUP_DIR"/btc-bounty_*.db 2>/dev/null | wc -l | tr -d ' ')
if [ "$BACKUP_COUNT" -gt 10 ]; then
  EXCESS=$((BACKUP_COUNT - 10))
  ls -1t "$BACKUP_DIR"/btc-bounty_*.db | tail -n "$EXCESS" | xargs rm -f
  echo "   Cleaned $EXCESS old backup(s). Keeping last 10."
fi

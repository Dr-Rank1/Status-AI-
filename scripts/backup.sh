#!/usr/bin/env bash
# Automated PostgreSQL backup with gzip compression and 30-day retention.
#
# Usage:
#   ./scripts/backup.sh
#   BACKUP_DIR=/mnt/backups/status RETENTION_DAYS=14 ./scripts/backup.sh
#
# Cron (daily at 02:00):
#   0 2 * * * /opt/status/scripts/backup.sh >> /var/log/status-backup.log 2>&1
#
# Requires: pg_dump, gzip, DATABASE_URL in backend/.env or environment
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT/backend/.env}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/status/postgres}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_FILE="$BACKUP_DIR/status_${TIMESTAMP}.sql.gz"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL is not set. Export it or configure $ENV_FILE" >&2
  exit 1
fi

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "ERROR: pg_dump not found. Install postgresql-client." >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

echo "[$(date -Is)] Starting backup -> $BACKUP_FILE"
pg_dump "$DATABASE_URL" | gzip -9 > "$BACKUP_FILE"

if [[ ! -s "$BACKUP_FILE" ]]; then
  echo "ERROR: Backup file is empty" >&2
  rm -f "$BACKUP_FILE"
  exit 1
fi

SIZE="$(du -h "$BACKUP_FILE" | cut -f1)"
echo "[$(date -Is)] Backup complete ($SIZE)"

echo "[$(date -Is)] Pruning backups older than ${RETENTION_DAYS} days in $BACKUP_DIR"
find "$BACKUP_DIR" -type f -name 'status_*.sql.gz' -mtime +"$RETENTION_DAYS" -print -delete

echo "[$(date -Is)] Remaining backups:"
ls -lh "$BACKUP_DIR"/status_*.sql.gz 2>/dev/null || echo "  (none)"

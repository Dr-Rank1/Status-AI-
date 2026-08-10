#!/usr/bin/env bash
# Apply SQL migrations in order using DATABASE_URL from backend/.env
set -euo pipefail

BACKEND_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$BACKEND_DIR/.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE" >&2
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "psql is required but not installed." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is not set in $ENV_FILE" >&2
  exit 1
fi

echo "Running migrations against configured database..."
shopt -s nullglob
for migration in "$BACKEND_DIR"/db/migrations/*.sql; do
  echo "  -> $(basename "$migration")"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$migration"
done
echo "Migrations complete."

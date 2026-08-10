#!/usr/bin/env bash
# Phase 28 — Safe production key rotation utility.
# Rotates JWT secrets, DB passwords, and LLM API key placeholders without
# printing secrets to stdout. Generates a sealed .env.rotated sidecar.
#
# Usage:
#   ./scripts/rotate_keys.sh [--env-file PATH] [--dry-run] [--apply]
#
# Safety:
#   - Default is dry-run (writes .env.rotated only; does not overwrite live .env)
#   - Requires --apply to replace the live env file (creates .env.bak.<timestamp>)
#   - Never commits or echoes secret values
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ROOT}/backend/.env"
DRY_RUN=true
APPLY=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env-file)
      ENV_FILE="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --apply)
      APPLY=true
      DRY_RUN=false
      shift
      ;;
    -h|--help)
      sed -n '2,16p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Env file not found: $ENV_FILE" >&2
  echo "Copy backend/.env.example to backend/.env first." >&2
  exit 1
fi

gen_secret() {
  local bytes="${1:-48}"
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -base64 "$bytes" | tr -d '\n'
  else
    head -c "$bytes" /dev/urandom | base64 | tr -d '\n'
  fi
}

TIMESTAMP="$(date -u +"%Y%m%dT%H%M%SZ")"
OUT_FILE="${ENV_FILE}.rotated.${TIMESTAMP}"
BACKUP_FILE="${ENV_FILE}.bak.${TIMESTAMP}"
AUDIT_LOG="${ROOT}/docs/KEY_ROTATION_AUDIT.md"

mkdir -p "$(dirname "$AUDIT_LOG")"

# Keys we rotate (name = env var). LLM keys are rotated as placeholders —
# operators must paste new provider keys from their vendor console.
ROTATE_GENERATE=(
  JWT_SECRET
  PQ_AUTH_PEPPER
  ZKP_PEPPER
  FEDERATED_AGGREGATION_KEY
  REVENUECAT_WEBHOOK_SECRET
  OAUTH_CLIENT_SECRET_PEPPER
)

ROTATE_PLACEHOLDER=(
  OPENAI_API_KEY
  ANTHROPIC_API_KEY
  GEMINI_API_KEY
  DATABASE_URL
  DATABASE_READ_URL
)

declare -A NEW_VALUES=()

echo "==> Status key rotation (${TIMESTAMP})"
echo "    Source: $ENV_FILE"
echo "    Mode:   $([[ "$APPLY" == true ]] && echo APPLY || echo DRY-RUN)"

cp "$ENV_FILE" "$OUT_FILE"

for key in "${ROTATE_GENERATE[@]}"; do
  if grep -qE "^${key}=" "$ENV_FILE" 2>/dev/null || grep -qE "^#?${key}=" "$ENV_FILE" 2>/dev/null; then
    NEW_VALUES["$key"]="$(gen_secret 48)"
    if grep -qE "^${key}=" "$OUT_FILE"; then
      # shellcheck disable=SC2001
      sed -i "s|^${key}=.*|${key}=${NEW_VALUES[$key]}|" "$OUT_FILE"
    elif grep -qE "^#${key}=" "$OUT_FILE"; then
      sed -i "s|^#${key}=.*|${key}=${NEW_VALUES[$key]}|" "$OUT_FILE"
    else
      echo "${key}=${NEW_VALUES[$key]}" >> "$OUT_FILE"
    fi
    echo "    [rotated] $key"
  fi
done

for key in "${ROTATE_PLACEHOLDER[@]}"; do
  if grep -qE "^${key}=" "$ENV_FILE" 2>/dev/null; then
    case "$key" in
      DATABASE_URL|DATABASE_READ_URL)
        # Rewrite password segment if URL form postgresql://user:pass@host/db
        current="$(grep -E "^${key}=" "$ENV_FILE" | head -1 | cut -d= -f2-)"
        new_pass="$(gen_secret 24 | tr '+/' 'Aa' | tr -d '=')"
        if [[ "$current" =~ ^(postgresql?://[^:]+):([^@]+)@(.+)$ ]]; then
          rotated="${BASH_REMATCH[1]}:${new_pass}@${BASH_REMATCH[3]}"
          sed -i "s|^${key}=.*|${key}=${rotated}|" "$OUT_FILE"
          echo "    [rotated] $key (password segment)"
          echo "    !! Apply the same password on the PostgreSQL role before restarting the API"
        else
          echo "    [skip] $key — non-standard URL; rotate manually"
        fi
        ;;
      *)
        marker="ROTATE_ME_${TIMESTAMP}_paste_from_vendor_console"
        sed -i "s|^${key}=.*|${key}=${marker}|" "$OUT_FILE"
        echo "    [flagged] $key — replace placeholder with new vendor key before apply"
        ;;
    esac
  fi
done

{
  echo "## Key rotation audit — ${TIMESTAMP}"
  echo ""
  echo "| Key | Action | Applied |"
  echo "|-----|--------|---------|"
  for key in "${ROTATE_GENERATE[@]}"; do
    if [[ -n "${NEW_VALUES[$key]:-}" ]]; then
      echo "| \`$key\` | generated | $([[ "$APPLY" == true ]] && echo yes || echo pending) |"
    fi
  done
  for key in "${ROTATE_PLACEHOLDER[@]}"; do
    if grep -qE "^${key}=" "$ENV_FILE" 2>/dev/null; then
      echo "| \`$key\` | placeholder / DB password | $([[ "$APPLY" == true ]] && echo yes || echo pending) |"
    fi
  done
  echo ""
  echo "- Output file: \`$OUT_FILE\`"
  echo "- Backup: \`$BACKUP_FILE\` (created on --apply)"
  echo "- Operator must restart API after apply: \`systemctl restart status-api\` or redeploy."
  echo "- Invalidate sessions: all JWTs signed with old \`JWT_SECRET\` become invalid."
  echo ""
} >> "$AUDIT_LOG"

if [[ "$APPLY" == true ]]; then
  # Refuse apply if LLM placeholders still present
  if grep -qE '^OPENAI_API_KEY=ROTATE_ME_|^ANTHROPIC_API_KEY=ROTATE_ME_|^GEMINI_API_KEY=ROTATE_ME_' "$OUT_FILE"; then
    echo "Refusing --apply: LLM API key placeholders still present in $OUT_FILE" >&2
    echo "Paste real keys from vendor consoles, then re-run with --apply." >&2
    exit 2
  fi
  cp "$ENV_FILE" "$BACKUP_FILE"
  cp "$OUT_FILE" "$ENV_FILE"
  chmod 600 "$ENV_FILE" "$BACKUP_FILE" "$OUT_FILE"
  echo "==> Applied. Backup at $BACKUP_FILE"
  echo "    Restart the API and rotate PostgreSQL role password to match DATABASE_URL."
else
  chmod 600 "$OUT_FILE"
  echo "==> Dry-run complete. Review: $OUT_FILE"
  echo "    Fill LLM placeholders, then: ./scripts/rotate_keys.sh --env-file $ENV_FILE --apply"
fi

echo "    Audit appended to $AUDIT_LOG"

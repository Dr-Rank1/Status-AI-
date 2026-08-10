#!/usr/bin/env bash
# Provision an isolated white-label tenant on Ubuntu.
# Usage: ./scripts/provision_tenant.sh acme-corp "Acme Corp" [--dry-run]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SLUG="${1:?Usage: provision_tenant.sh <slug> <name> [--dry-run]}"
NAME="${2:?Usage: provision_tenant.sh <slug> <name> [--dry-run]}"
DRY_RUN=false
[[ "${3:-}" == "--dry-run" ]] && DRY_RUN=true

ENV_FILE="${ENV_FILE:-$ROOT/backend/.env}"
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

DATABASE_URL="${DATABASE_URL:?DATABASE_URL required}"
REDIS_URL="${REDIS_URL:-redis://127.0.0.1:6379}"
API_PORT="${PORT:-3000}"

log() { echo "[provision] $*"; }
run() {
  if $DRY_RUN; then log "DRY-RUN: $*"; else "$@"; fi
}

log "=== Provisioning tenant: $SLUG ($NAME) ==="

# ── 1. Validate Ubuntu environment ────────────────────────────────────
if [[ -f /etc/os-release ]]; then
  # shellcheck disable=SC1091
  source /etc/os-release
  log "Target OS: ${NAME:-unknown} ${VERSION_ID:-}"
fi

command -v psql >/dev/null || { echo "psql required — apt install postgresql-client"; exit 1; }

# ── 2. Apply base migrations if needed ────────────────────────────────
log "Applying migrations..."
for f in "$ROOT"/backend/db/migrations/*.sql; do
  run psql "$DATABASE_URL" -f "$f" -v ON_ERROR_STOP=0
done

# ── 3. Insert tenant record ─────────────────────────────────────────────
REDIS_NS="status:${SLUG}"
log "Creating tenant record (redis namespace: $REDIS_NS)..."

TENANT_SQL="
INSERT INTO tenants (slug, name, redis_namespace, theme_config, ai_config)
VALUES (
  '${SLUG}',
  '${NAME}',
  '${REDIS_NS}',
  '{\"appName\":\"${NAME}\",\"primaryColor\":\"#8B5CF6\",\"accentColor\":\"#22D3EE\",\"backgroundColor\":\"#0A0A0B\",\"fontFamily\":\"Inter\"}'::jsonb,
  '{\"defaultProvider\":\"mock\",\"empathyDefault\":0.7}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, updated_at = NOW()
RETURNING id, slug, redis_namespace;
"

if $DRY_RUN; then
  log "Would execute tenant INSERT for $SLUG"
else
  psql "$DATABASE_URL" -c "$TENANT_SQL"
fi

# ── 4. Redis namespace isolation ────────────────────────────────────────
if command -v redis-cli >/dev/null; then
  log "Registering Redis namespace prefix: ${REDIS_NS}:"
  run redis-cli -u "$REDIS_URL" SET "${REDIS_NS}:provisioned" "$(date -Iseconds)" EX 86400
else
  log "redis-cli not found — skip Redis namespace setup"
fi

# ── 5. systemd environment snippet ──────────────────────────────────────
SNIPPET_DIR="/etc/status/tenants"
SNIPPET_FILE="${SNIPPET_DIR}/${SLUG}.env"

if [[ "$EUID" -eq 0 ]] || [[ -w /etc/status ]] 2>/dev/null; then
  log "Writing tenant env snippet: $SNIPPET_FILE"
  run mkdir -p "$SNIPPET_DIR"
  run tee "$SNIPPET_FILE" > /dev/null <<EOF
# Tenant: $SLUG — generated $(date -Iseconds)
DEFAULT_TENANT_SLUG=$SLUG
TENANT_SLUG=$SLUG
REDIS_NAMESPACE=$REDIS_NS
EOF
else
  LOCAL_SNIPPET="$ROOT/deploy/tenants/${SLUG}.env"
  log "Writing local tenant env: $LOCAL_SNIPPET"
  run mkdir -p "$ROOT/deploy/tenants"
  run tee "$LOCAL_SNIPPET" > /dev/null <<EOF
DEFAULT_TENANT_SLUG=$SLUG
TENANT_SLUG=$SLUG
REDIS_NAMESPACE=$REDIS_NS
EOF
fi

# ── 6. Dashboard config ─────────────────────────────────────────────────
DASH_ENV="$ROOT/dashboard/.env.local"
log "Writing dashboard config: $DASH_ENV"
run mkdir -p "$(dirname "$DASH_ENV")"
run tee "$DASH_ENV" > /dev/null <<EOF
NEXT_PUBLIC_API_BASE_URL=http://localhost:${API_PORT}/api/v1
NEXT_PUBLIC_TENANT_SLUG=${SLUG}
EOF

# ── 7. Mobile tenant config ─────────────────────────────────────────────
MOBILE_ENV="$ROOT/mobile/.env.tenant.${SLUG}"
run tee "$MOBILE_ENV" > /dev/null <<EOF
TENANT_SLUG=${SLUG}
API_BASE_URL=http://localhost:${API_PORT}/api/v1
EOF

log "=== Tenant '$SLUG' provisioned ==="
log "API header:  X-Tenant-Slug: $SLUG"
log "Dashboard:   cd dashboard && npm install && npm run dev  (port 3100)"
log "Flutter:     copy mobile/.env.tenant.${SLUG} → mobile/.env"
log "Handoff doc: CLIENT_HANDOFF.md"

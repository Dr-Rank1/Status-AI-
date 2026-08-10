#!/usr/bin/env bash
# Status Golden Master Deployment — orchestrates multi-cloud infra, CDN, migrations, and services.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT/backend/.env}"
DRY_RUN="${DRY_RUN:-false}"

log() { echo "[golden-master] $*"; }
run() {
  if [[ "$DRY_RUN" == "true" ]]; then
    log "DRY-RUN: $*"
  else
    log "RUN: $*"
    "$@"
  fi
}

log "=== Status Golden Master Deployment ==="
log "Root: $ROOT"

# ── 1. Pre-flight checks ──────────────────────────────────────────────
log "Step 1/8 — Pre-flight checks"
command -v node >/dev/null || { echo "node required"; exit 1; }
command -v psql >/dev/null || log "WARN: psql not found — migrations skipped"
[[ -f "$ENV_FILE" ]] || log "WARN: $ENV_FILE not found — using environment defaults"

# ── 2. Security & audit ───────────────────────────────────────────────
log "Step 2/8 — Golden master audit"
if [[ -x "$ROOT/scripts/golden_master_audit.sh" ]]; then
  run bash "$ROOT/scripts/golden_master_audit.sh"
else
  log "Audit script not found — skipping"
fi

# ── 3. Backend dependencies & tests ────────────────────────────────────
log "Step 3/8 — Backend tests"
run bash -c "cd '$ROOT/backend' && npm ci --omit=dev 2>/dev/null || npm install"
run bash -c "cd '$ROOT/backend' && npm test"

# ── 4. Database migrations (001–018) ───────────────────────────────────
log "Step 4/8 — Database migrations"
if command -v psql >/dev/null && [[ -n "${DATABASE_URL:-}" ]]; then
  for migration in "$ROOT"/backend/db/migrations/*.sql; do
    log "Applying $(basename "$migration")"
    run psql "$DATABASE_URL" -f "$migration"
  done
else
  log "Skipping migrations — set DATABASE_URL or use scripts/run-migrations.sh"
fi

# ── 5. CDN edge (Terraform) ───────────────────────────────────────────
log "Step 5/8 — CDN edge infrastructure"
if command -v terraform >/dev/null && [[ -d "$ROOT/deploy/cdn" ]]; then
  run bash -c "cd '$ROOT/deploy/cdn' && terraform init -input=false && terraform apply -auto-approve \
    -var=\"domain=${CDN_DOMAIN:-cdn.status.app}\" \
    -var=\"origin_bucket=${CDN_ORIGIN_BUCKET:-status-media-origin}\""
else
  log "Terraform not available — CDN deploy skipped"
fi

# ── 6. Monitoring & self-healing ───────────────────────────────────────
log "Step 6/8 — Monitoring & self-healing config"
log "Prometheus rules: deploy/monitoring/ai-alerting-rules.yml"
log "Self-healing daemon: deploy/self-healing/daemon.config.json"
if [[ -n "${PROMETHEUS_CONFIG:-}" ]] && [[ -f "$ROOT/deploy/prometheus-scrape.example.yml" ]]; then
  log "Merge deploy/prometheus-scrape.example.yml into your Prometheus config"
fi

# ── 7. vLLM / optional LLM stack ──────────────────────────────────────
log "Step 7/8 — Optional vLLM stack"
if [[ "${DEPLOY_VLLM:-false}" == "true" ]] && [[ -f "$ROOT/deploy/vllm/docker-compose.yml" ]]; then
  run bash -c "cd '$ROOT/deploy/vllm' && docker compose up -d"
else
  log "vLLM deploy skipped (set DEPLOY_VLLM=true to enable)"
fi

# ── 8. Backend service start ────────────────────────────────────────────
log "Step 8/8 — Backend service"
if [[ -f "$ROOT/deploy/status-backend.service" ]] && command -v systemctl >/dev/null; then
  run sudo cp "$ROOT/deploy/status-backend.service" /etc/systemd/system/
  run sudo systemctl daemon-reload
  run sudo systemctl enable status-backend
  run sudo systemctl restart status-backend
else
  log "Starting backend directly"
  run bash -c "cd '$ROOT/backend' && NODE_ENV=production node src/index.js &"
fi

log "=== Golden Master deployment complete ==="
log "API:       http://localhost:${PORT:-3000}"
log "Metrics:   http://localhost:${PORT:-3000}/metrics"
log "Docs:      http://localhost:${PORT:-3000}/api/docs"
log "Metaverse: POST /api/v1/metaverse/sync"
log "Architecture: docs/GOLDEN_MASTER.md"

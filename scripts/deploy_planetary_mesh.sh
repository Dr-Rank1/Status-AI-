#!/usr/bin/env bash
# Phase 35 — Planetary mesh self-driving failover (Ubuntu-optimized).
#
# Monitors regional API/edge health; on latency spikes or drops, reroutes
# traffic and spins up localized edge-inference containers.
#
# Usage (Ubuntu 22.04/24.04):
#   sudo ./scripts/deploy_planetary_mesh.sh
#   DRY_RUN=1 ./scripts/deploy_planetary_mesh.sh --once
#   ./scripts/deploy_planetary_mesh.sh --watch
#
# Env:
#   PRIMARY_URL          Health URL for primary DC (default http://127.0.0.1:3000/api/v2/health)
#   FAILOVER_URLS        Comma-separated regional health URLs
#   LATENCY_BUDGET_MS    Failover if p95-ish sample exceeds this (default 800)
#   EDGE_COMPOSE_FILE    docker compose for edge inference (default deploy/vllm/docker-compose.yml)
#   EDGE_REGION          Label for spun edge containers (default local)
#   STATE_DIR            Runtime state (default /var/lib/status-planetary-mesh)
#   WATCH_INTERVAL_SEC   Watch loop interval (default 30)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PRIMARY_URL="${PRIMARY_URL:-http://127.0.0.1:3000/api/v2/health}"
FAILOVER_URLS="${FAILOVER_URLS:-}"
LATENCY_BUDGET_MS="${LATENCY_BUDGET_MS:-800}"
EDGE_COMPOSE_FILE="${EDGE_COMPOSE_FILE:-$ROOT/deploy/vllm/docker-compose.yml}"
EDGE_REGION="${EDGE_REGION:-local}"
STATE_DIR="${STATE_DIR:-/var/lib/status-planetary-mesh}"
WATCH_INTERVAL_SEC="${WATCH_INTERVAL_SEC:-30}"
TRAFFIC_FILE="${STATE_DIR}/active_upstream.txt"
DRY_RUN="${DRY_RUN:-0}"

log() { echo "[planetary-mesh $(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }
die() { log "ERROR: $*"; exit 1; }

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1 (Ubuntu: apt install $2)"
}

ensure_ubuntuish() {
  if [[ -f /etc/os-release ]]; then
    # shellcheck disable=SC1091
    . /etc/os-release
    case "${ID:-}:${ID_LIKE:-}" in
      ubuntu:*|*:ubuntu*|debian:*|*:debian*) ;;
      *) log "WARN: optimized for Ubuntu; detected ID=${ID:-unknown}" ;;
    esac
  fi
}

probe() {
  local url="$1"
  local start end ms code
  start=$(date +%s%3N)
  code=$(curl -sS -o /tmp/status-mesh-probe.json -w '%{http_code}' --max-time 5 "$url" || echo "000")
  end=$(date +%s%3N)
  ms=$((end - start))
  echo "${code}|${ms}"
}

pick_healthiest() {
  local best_url="" best_ms=999999 entry url code ms
  local candidates=("$PRIMARY_URL")
  if [[ -n "$FAILOVER_URLS" ]]; then
    IFS=',' read -r -a extras <<< "$FAILOVER_URLS"
    candidates+=("${extras[@]}")
  fi

  for url in "${candidates[@]}"; do
    url="$(echo "$url" | xargs)"
    [[ -z "$url" ]] && continue
    entry="$(probe "$url")"
    code="${entry%%|*}"
    ms="${entry##*|}"
    log "probe $url → http=$code latency=${ms}ms"
    if [[ "$code" =~ ^2 ]] && (( ms < best_ms )); then
      best_ms=$ms
      best_url=$url
    fi
  done

  if [[ -z "$best_url" ]]; then
    echo ""
    return 1
  fi
  echo "${best_url}|${best_ms}"
}

spin_edge_inference() {
  log "Spinning localized edge-inference for region=$EDGE_REGION"
  if [[ ! -f "$EDGE_COMPOSE_FILE" ]]; then
    log "WARN: compose file missing ($EDGE_COMPOSE_FILE) — writing stub run hint"
    mkdir -p "$STATE_DIR"
    echo "edge-pending:$EDGE_REGION:$(date -u +%s)" > "$STATE_DIR/edge_status.txt"
    return 0
  fi

  if [[ "$DRY_RUN" == "1" ]]; then
    log "DRY_RUN: would docker compose -f $EDGE_COMPOSE_FILE up -d"
    return 0
  fi

  if command -v docker >/dev/null 2>&1; then
    EDGE_REGION="$EDGE_REGION" docker compose -f "$EDGE_COMPOSE_FILE" up -d
    echo "edge-up:$EDGE_REGION:$(date -u +%s)" > "$STATE_DIR/edge_status.txt"
  else
    log "WARN: docker not installed — skip edge containers (apt install docker.io docker-compose-v2)"
  fi
}

reroute_traffic() {
  local target="$1"
  local latency="$2"
  mkdir -p "$STATE_DIR"
  echo "$target" > "$TRAFFIC_FILE"
  log "Active upstream → $target (${latency}ms)"

  # Optional: notify Status traffic switcher when admin token configured
  if [[ -n "${STATUS_ADMIN_TOKEN:-}" && -n "${STATUS_API_BASE:-}" ]]; then
    local pct=100
    if [[ "$target" != "$PRIMARY_URL" ]]; then
      pct="${FAILOVER_V2_PERCENT:-100}"
    fi
    if [[ "$DRY_RUN" == "1" ]]; then
      log "DRY_RUN: would POST traffic v2Percent=$pct"
    else
      curl -sS -X POST "${STATUS_API_BASE%/}/api/v2/ops/traffic" \
        -H "Authorization: Bearer $STATUS_ADMIN_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"v2Percent\": $pct, \"force\": true}" >/dev/null || \
        log "WARN: traffic API update failed"
    fi
  fi
}

evaluate_once() {
  local pick url ms
  pick="$(pick_healthiest || true)"
  if [[ -z "$pick" ]]; then
    log "ALL REGIONS DOWN — attempting edge inference spin-up"
    spin_edge_inference
    return 1
  fi

  url="${pick%%|*}"
  ms="${pick##*|}"

  if (( ms > LATENCY_BUDGET_MS )) || [[ "$url" != "$PRIMARY_URL" ]]; then
    log "Failover condition: latency=${ms}ms budget=${LATENCY_BUDGET_MS}ms primary=$PRIMARY_URL chosen=$url"
    reroute_traffic "$url" "$ms"
    if [[ "$url" != "$PRIMARY_URL" ]] || (( ms > LATENCY_BUDGET_MS )); then
      spin_edge_inference
    fi
  else
    reroute_traffic "$url" "$ms"
    log "Primary healthy within budget"
  fi
}

main() {
  ensure_ubuntuish
  need_cmd curl curl
  need_cmd date coreutils

  mkdir -p "$STATE_DIR" 2>/dev/null || STATE_DIR="/tmp/status-planetary-mesh"
  mkdir -p "$STATE_DIR"

  local mode="${1:---once}"
  case "$mode" in
    --once|"")
      evaluate_once
      ;;
    --watch)
      log "Watching every ${WATCH_INTERVAL_SEC}s (Ctrl+C to stop)"
      while true; do
        evaluate_once || true
        sleep "$WATCH_INTERVAL_SEC"
      done
      ;;
    --help|-h)
      sed -n '1,40p' "$0"
      ;;
    *)
      die "Unknown arg: $mode (use --once or --watch)"
      ;;
  esac
}

main "${1:-}"

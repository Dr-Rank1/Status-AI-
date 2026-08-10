#!/usr/bin/env bash
# Phase 41 — ROS 2 ↔ Status MCP bridge (Ubuntu / Humble+).
#
# Publishes soft telemetry pulses into the Status API and optionally
# mirrors queued cmd_vel when ros2 CLI is present.
#
# Usage:
#   ROS2_API_BASE=http://127.0.0.1:3000 ROS2_JWT=… ./scripts/ros2_mcp_bridge.sh
#   DRY_RUN=1 ./scripts/ros2_mcp_bridge.sh
set -euo pipefail

API_BASE="${ROS2_API_BASE:-http://127.0.0.1:3000}"
INTERVAL_SEC="${ROS2_INTERVAL_SEC:-15}"
DRY_RUN="${DRY_RUN:-0}"
NAMESPACE="${ROS2_NAMESPACE:-/status_robot}"

log() { echo "[ros2-mcp $(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }

has_ros2=0
if command -v ros2 >/dev/null 2>&1; then
  has_ros2=1
  log "ros2 CLI detected — namespace=${NAMESPACE}"
else
  log "ros2 CLI absent — API-only sandbox mode"
fi

pulse() {
  local ranges
  ranges=$(python3 - <<'PY' 2>/dev/null || echo '[1.2,1.5,2.0,0.8]')
import json, math, random
print(json.dumps([round(0.5 + random.random() * 3, 2) for _ in range(12)]))
PY
  local payload
  payload=$(cat <<EOF
{"kind":"lidar","frameId":"base_link","ranges":${ranges},"pose":{"x":0,"y":0,"yaw":0}}
EOF
)
  if [[ "$DRY_RUN" == "1" ]]; then
    log "DRY_RUN $payload"
    return 0
  fi
  if [[ -z "${ROS2_JWT:-}" ]]; then
    log "WARN: ROS2_JWT unset — local pulse only"
    return 0
  fi
  curl -sS -X POST "${API_BASE%/}/api/v2/robotics/telemetry" \
    -H "Authorization: Bearer $ROS2_JWT" \
    -H "Content-Type: application/json" \
    -d "$payload" >/dev/null
  log "telemetry posted"
  if [[ "$has_ros2" == "1" && "${ROS2_LIVE_PUBLISH:-}" == "true" ]]; then
    ros2 topic pub --once "${NAMESPACE}/scan" sensor_msgs/msg/LaserScan "{}" >/dev/null 2>&1 || true
  fi
}

log "bridge start interval=${INTERVAL_SEC}s"
while true; do
  pulse
  sleep "$INTERVAL_SEC"
done

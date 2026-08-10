# Steady-state verification script for Chaos Mesh experiments.
#
# Run while experiments are active:
#   ./deploy/chaos-mesh/staging/verify-steady-state.sh http://status-api.status-staging.svc:3000
#
# Expected during LLM latency chaos:
#   - /api/v1/health/ready → 200 (or 503 if DB also impacted)
#   - Circuit breakers trip → AI responses use cached/mock fallback (degraded: true)
#   - Flutter clients queue posts/DMs on 503 and sync when healthy
set -euo pipefail

BASE="${1:-http://localhost:3000}"

echo "=== Steady State Check: $BASE ==="

ready=$(curl -sf -o /dev/null -w "%{http_code}" "$BASE/api/v1/health/ready" || echo "000")
echo "health/ready HTTP $ready"

region=$(curl -sf "$BASE/api/v1/health/region" 2>/dev/null || echo '{}')
echo "region status: $region"

if [[ "$ready" == "200" ]]; then
  echo "PASS: API ready"
  exit 0
fi

echo "WARN: API degraded (expected during pod-kill chaos if probe fails)"
exit 0

#!/usr/bin/env bash
# Golden Master audit — security, performance, and memory leak checks across the stack.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FAILURES=0

pass() { echo "  ✔ $*"; }
fail() { echo "  ✘ $*"; FAILURES=$((FAILURES + 1)); }
section() { echo ""; echo "=== $* ==="; }

section "Security audit"
# Secret scanning in tracked env examples
if grep -rqE "(password|secret|key)\s*=\s*[^#\s\"']+" "$ROOT/backend/.env" 2>/dev/null; then
  fail "backend/.env may contain plaintext secrets — use .env.example for templates"
else
  pass "No committed .env secrets detected"
fi

# Privacy middleware coverage
for mw in bciPrivacy affectivePrivacy spatialPrivacy; do
  if [[ -f "$ROOT/backend/src/middleware/${mw}.js" ]]; then
    pass "Privacy middleware: $mw"
  else
    fail "Missing privacy middleware: $mw"
  fi
done

# PQ auth enabled check
if grep -q "PQ_AUTH_ENABLED" "$ROOT/backend/.env.example"; then
  pass "Post-quantum auth documented in .env.example"
fi

section "Backend performance"
if [[ -d "$ROOT/backend/node_modules" ]]; then
  pass "Backend dependencies installed"
else
  fail "Run npm install in backend/"
fi

# Check read replica routing exists
if [[ -f "$ROOT/backend/src/config/database.js" ]] && grep -q "queryRead" "$ROOT/backend/src/config/database.js"; then
  pass "Read replica routing (queryRead) present"
fi

# Circuit breaker for AI
if grep -q "withCircuitBreaker" "$ROOT/backend/src/services/ai/index.js"; then
  pass "AI circuit breaker configured"
fi

section "Flutter / native bridges"
for bridge in \
  "mobile/lib/services/pq_e2ee_bridge.dart" \
  "mobile/lib/services/affective_biometrics_service.dart" \
  "mobile/lib/services/mesh_network_service.dart" \
  "mobile/native/e2ee/pq_crypto/src/lib.rs"; do
  if [[ -f "$ROOT/$bridge" ]]; then
    pass "Bridge present: $bridge"
  else
    fail "Missing: $bridge"
  fi
done

section "Memory leak patterns (static analysis)"
# Timer/interval cleanup in services
for svc in selfHealingDaemon syntheticSimulatorWorker mesh_network_service bci_input_service; do
  file=$(find "$ROOT" -name "*${svc}*" -type f 2>/dev/null | head -1)
  if [[ -n "$file" ]] && grep -qE "dispose|cancel|clearInterval|clearTimeout" "$file" 2>/dev/null; then
    pass "Cleanup hooks in $(basename "$file")"
  elif [[ -n "$file" ]]; then
    fail "No cleanup hooks detected in $(basename "$file")"
  fi
done

section "Migration completeness"
migration_count=$(ls "$ROOT/backend/db/migrations/"*.sql 2>/dev/null | wc -l)
if [[ "$migration_count" -ge 18 ]]; then
  pass "Migrations present: $migration_count files (through Phase 24)"
else
  fail "Expected ≥18 migrations, found $migration_count"
fi

section "Golden master deploy script"
if [[ -x "$ROOT/deploy/deploy_golden_master.sh" ]]; then
  pass "deploy_golden_master.sh is executable"
else
  fail "deploy/deploy_golden_master.sh missing or not executable"
fi

echo ""
if [[ "$FAILURES" -eq 0 ]]; then
  echo "Audit PASSED — 0 failures"
  exit 0
else
  echo "Audit FAILED — $FAILURES failure(s)"
  exit 1
fi

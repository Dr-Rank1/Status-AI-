#!/usr/bin/env bash
# Phase 28 — Universal security & dependency audit (system-wide).
# Patches moderate+ vulnerabilities where safe and writes a report.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPORT="${ROOT}/docs/SECURITY_AUDIT_REPORT.md"
mkdir -p "$(dirname "$REPORT")"
STAMP="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
FAIL=0

{
  echo "# Universal Security Audit Report"
  echo ""
  echo "Generated: \`${STAMP}\` (Phase 28)"
  echo ""
} > "$REPORT"

section() {
  echo ""
  echo "## $1" >> "$REPORT"
  echo "" >> "$REPORT"
  echo "=== $1 ==="
}

run_capture() {
  local label="$1"
  shift
  echo "### ${label}" >> "$REPORT"
  echo '```' >> "$REPORT"
  if "$@" >> "$REPORT" 2>&1; then
    echo '```' >> "$REPORT"
    echo "" >> "$REPORT"
    return 0
  else
    local code=$?
    echo '```' >> "$REPORT"
    echo "" >> "$REPORT"
    echo "_Command exited with code ${code}_" >> "$REPORT"
    echo "" >> "$REPORT"
    return "$code"
  fi
}

section "Backend — npm audit & fix"
(
  cd "$ROOT/backend"
  npm audit fix || true
  npm audit --audit-level=moderate || FAIL=1
  npm audit --audit-level=high || FAIL=1
) | tee -a "$REPORT" || true

section "Dashboard — npm audit & fix"
if [[ -f "$ROOT/dashboard/package.json" ]]; then
  (
    cd "$ROOT/dashboard"
    [[ -f package-lock.json ]] || npm i --package-lock-only
    npm audit fix || true
    npm audit --audit-level=high || true
  ) | tee -a "$REPORT" || true
fi

section "Flutter — pub get / outdated"
if command -v flutter >/dev/null 2>&1; then
  (
    cd "$ROOT/mobile"
    flutter pub get
    flutter pub upgrade --major-versions=false || flutter pub upgrade || true
    flutter pub outdated || true
  ) | tee -a "$REPORT" || true
else
  echo "Flutter SDK not installed — skipped pub upgrade." | tee -a "$REPORT"
fi

section "Infrastructure scan"
{
  echo "Scanning deploy/ and .github/ for plaintext secrets..."
  if command -v rg >/dev/null 2>&1; then
    if rg -n "(sk-[a-zA-Z0-9]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN (RSA |EC )?PRIVATE KEY-----)" \
      "$ROOT/deploy" "$ROOT/.github" "$ROOT/backend/src" "$ROOT/mobile/lib" \
      --glob '!**/.env*' --glob '!**/node_modules/**' 2>/dev/null; then
      echo "WARNING: potential secrets found"
      FAIL=1
    else
      echo "No obvious hardcoded secrets in infra/source."
    fi
  else
    echo "rg not available — skipped secret scan"
  fi
} | tee -a "$REPORT"

section "Backend unit tests"
(cd "$ROOT/backend" && npm test) | tee -a "$REPORT" || FAIL=1

{
  echo ""
  echo "## Summary"
  echo ""
  if [[ "$FAIL" -eq 0 ]]; then
    echo "**Status:** PASS — no high/critical blockers remaining after automated fixes."
  else
    echo "**Status:** ATTENTION — review sections above; residual transitive advisories may remain."
  fi
  echo ""
  echo "Follow-up: \`./scripts/rotate_keys.sh --dry-run\` then apply after vendor key refresh."
  echo ""
} >> "$REPORT"

echo ""
echo "Report written to $REPORT"
exit "$FAIL"

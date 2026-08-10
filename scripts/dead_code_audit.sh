#!/usr/bin/env bash
# Dead-code elimination pass — reports unused exports and unreachable files.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPORT="${ROOT}/docs/DEAD_CODE_AUDIT.md"

mkdir -p "$(dirname "$REPORT")"

{
  echo "# Dead Code Audit"
  echo ""
  echo "Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  echo ""
  echo "## Backend (Node.js)"
  echo ""
  if command -v npx >/dev/null 2>&1; then
    (cd "${ROOT}/backend" && npx --yes unimported 2>/dev/null || echo "_unimported not available — run \`npm i -D unimported\`_")
  else
    echo "_npx not available_"
  fi
  echo ""
  echo "## Flutter"
  echo ""
  (cd "${ROOT}/mobile" && flutter analyze --no-fatal-infos 2>&1 | grep -E "unused|dead" || echo "No unused-element warnings from analyzer.")
  echo ""
  echo "## Manual review checklist"
  echo ""
  echo "- [ ] Remove deprecated mock IAP paths once RevenueCat is live in production"
  echo "- [ ] Archive Phase 23 synthetic simulation workers if disabled in prod"
  echo "- [ ] Confirm \`energy/refill\` mock receipts disabled when \`REVENUECAT_WEBHOOK_SECRET\` is set"
  echo "- [ ] Verify no orphaned migration scripts under \`backend/db/migrations/\`"
  echo ""
} > "$REPORT"

echo "Audit written to $REPORT"

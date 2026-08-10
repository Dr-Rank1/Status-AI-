#!/usr/bin/env bash
# Document branch protection for production main — run via GitHub CLI after archival.
set -euo pipefail

REPO="${1:-$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || echo "")}"

if [[ -z "$REPO" ]]; then
  echo "Usage: ./scripts/lock_main_branch.sh [owner/repo]"
  echo ""
  echo "Manual steps to lock main:"
  echo "  1. Settings → Branches → Add rule for 'main'"
  echo "  2. Require pull request reviews (1+)"
  echo "  3. Require status checks: test-backend, test-flutter"
  echo "  4. Require branches to be up to date"
  echo "  5. Restrict pushes — admins only for hotfixes"
  echo "  6. Enable 'Do not allow bypassing'"
  exit 0
fi

echo "Applying branch protection to $REPO:main ..."

gh api \
  --method PUT \
  "repos/${REPO}/branches/main/protection" \
  -f required_status_checks='{"strict":true,"contexts":["test-backend","test-flutter"]}' \
  -f enforce_admins=true \
  -f required_pull_request_reviews='{"required_approving_review_count":1,"dismiss_stale_reviews":true}' \
  -f restrictions=null \
  -f allow_force_pushes=false \
  -f allow_deletions=false

echo "main branch protection applied."

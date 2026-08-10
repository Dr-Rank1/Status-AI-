#!/usr/bin/env bash
# Document branch protection for production main — run via GitHub CLI after archival.
set -euo pipefail

REPO="${1:-$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || echo "")}"

if [[ -z "$REPO" ]]; then
  echo "Usage: ./scripts/lock_main_branch.sh [owner/repo]"
  echo ""
  echo "Manual steps to lock main (Phase 28 dual-approval):"
  echo "  1. Settings → Branches → Add rule for 'main'"
  echo "  2. Require pull request reviews (2+) + dismiss stale"
  echo "  3. Require status checks: Backend tests & audit, Flutter tests & audit"
  echo "  4. Require branches to be up to date + conversation resolution"
  echo "  5. Restrict force pushes / deletions"
  echo "  6. Enable 'Do not allow bypassing' (enforce_admins)"
  echo "  7. Optionally install GitHub Settings app with .github/settings.yml"
  exit 0
fi

echo "Applying Phase 28 branch protection to $REPO:main (dual approval) ..."

# Prefer JSON body for nested objects (gh -f flattens incorrectly for nested JSON)
gh api \
  --method PUT \
  "repos/${REPO}/branches/main/protection" \
  --input - <<'EOF'
{
  "required_status_checks": {
    "strict": true,
    "contexts": [
      "Backend tests & audit",
      "Flutter tests & audit"
    ]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "required_approving_review_count": 2,
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false,
    "require_last_push_approval": true
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_linear_history": true,
  "required_conversation_resolution": true
}
EOF

echo "main branch protection applied (2 approvals + CI)."
echo "Declarative config also lives at .github/settings.yml"

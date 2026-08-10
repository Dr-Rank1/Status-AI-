#!/usr/bin/env bash
# Security audit script — run before every release
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
echo "=== Status Security Audit ==="
echo "Root: $ROOT"
echo

echo "--- Backend: npm audit ---"
(cd "$ROOT/backend" && npm audit --audit-level=high || true)
echo

echo "--- Backend: unit tests ---"
(cd "$ROOT/backend" && npm test)
echo

echo "--- Scan for hardcoded secrets (excluding .env.example) ---"
if rg -n "(sk-[a-zA-Z0-9]{20,}|OPENAI_API_KEY\s*=\s*[^#\s]|password123)" \
  "$ROOT/backend/src" "$ROOT/mobile/lib" \
  --glob '!**/.env*' 2>/dev/null; then
  echo "WARNING: Potential hardcoded secrets found above."
else
  echo "No obvious hardcoded secrets in source."
fi
echo

echo "--- Scan for debugPrint / print in Dart ---"
if rg -n "debugPrint\(|print\(" "$ROOT/mobile/lib" 2>/dev/null; then
  echo "WARNING: debug print statements found."
else
  echo "No debugPrint/print in mobile/lib."
fi
echo

if command -v flutter >/dev/null 2>&1; then
  echo "--- Flutter: pub outdated ---"
  (cd "$ROOT/mobile" && flutter pub outdated || true)
  echo
  echo "--- Flutter: analyze ---"
  (cd "$ROOT/mobile" && flutter pub get && flutter analyze --no-fatal-infos)
  echo
  echo "--- Flutter: tests ---"
  (cd "$ROOT/mobile" && flutter test)
else
  echo "Flutter SDK not installed — skipping Flutter audit steps."
fi

echo
echo "=== Audit complete ==="

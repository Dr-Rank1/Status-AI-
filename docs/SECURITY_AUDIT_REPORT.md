# Universal Security Audit Report

Generated: `2026-08-10T14:25:00Z` (Phase 28)

## Backend — npm audit & fix

- Upgraded `@sentry/node` from `9.47.1` → `^10` (cleared 16 moderate OpenTelemetry transitive advisories).
- Ran `npm audit fix`.
- Package version set to **1.0.0**.
- Result: **0 vulnerabilities** (`npm audit --audit-level=moderate`).

## Dashboard — npm audit & fix

- Upgraded `next` from `14.2.x` → `^16.3.0` (cleared Next.js DoS/SSRF and sharp/libvips advisories).
- Generated `package-lock.json`; ran `npm audit fix`.
- Result: **0 vulnerabilities** (`npm audit --audit-level=high`).

## Flutter — pub get / outdated

- Flutter SDK was **not installed** in the audit environment.
- `mobile/pubspec.yaml` version set to **1.0.0+1**; `purchases_flutter` already present.
- Operators should run locally:

```bash
cd mobile && flutter pub get && flutter pub upgrade && flutter pub outdated
```

## Infrastructure scan

- No obvious hardcoded secrets in `deploy/`, `.github/`, `backend/src`, or `mobile/lib` (excluding `.env` examples).

## Backend unit tests

- **78** tests passed (includes Phase 28 handoff artifact checks).

## Summary

**Status:** PASS — no high/critical blockers remaining after automated fixes.

Follow-up: `./scripts/rotate_keys.sh --dry-run` then apply after vendor key refresh.

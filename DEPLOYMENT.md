# Deployment & Security Checklist (2026)

## Pre-release commands

```bash
# Full security audit (backend tests + secret scan + Flutter if installed)
chmod +x scripts/security-audit.sh
./scripts/security-audit.sh

# Backend only
cd backend && npm ci && npm audit --audit-level=high && npm test

# Mobile only (after flutter create if needed)
cd mobile && flutter pub get && flutter analyze && flutter test
flutter pub outdated
```

## Cleanup performed in this phase

| Item | Action |
|------|--------|
| Login pre-filled credentials | Gated behind `kDebugMode` only |
| Backend `console.log` | Replaced with `logger` (silent in production) |
| API keys / DB passwords | Loaded from env only (`.env` gitignored) |
| Flutter API URLs | `flutter_dotenv` + `--dart-define` (no hardcoded localhost in release) |
| `debugPrint` / `print()` | None found in `mobile/lib` |

## Android (Play Store 2026)

- `compileSdk` / `targetSdk`: **35** (`mobile/android/app/build.gradle`)
- Release builds: **App Bundle only** in CI (`flutter build appbundle`)
- Obfuscation: `--obfuscate --split-debug-info=build/app/outputs/symbols`
- R8 minify + shrink: enabled in release `buildTypes`

## iOS (TestFlight)

- Fastlane: `mobile/ios/fastlane/Fastfile`
- CI build step uses `--no-codesign`
- TestFlight upload via `fastlane beta` when signing secrets are configured

## GitHub Actions secrets required

| Secret | Purpose |
|--------|---------|
| `API_BASE_URL` | Production API endpoint |
| `SOCKET_URL` | Production WebSocket URL |
| `ANDROID_KEYSTORE_BASE64` | Play Store signing keystore |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password |
| `ANDROID_KEY_PASSWORD` | Key password |
| `ANDROID_KEY_ALIAS` | Key alias |
| `APPLE_ID` | Apple developer account |
| `MATCH_GIT_URL` | Fastlane Match cert repo |
| `MATCH_PASSWORD` | Match encryption password |
| `APP_STORE_CONNECT_API_KEY_PATH` | ASC API key (CI file) |

## CI triggers

- **GitHub Actions**: `.github/workflows/deploy.yml` on push to `main`
- **Codemagic**: `codemagic.yaml` (alternative)

Build numbers auto-increment via `github.run_number` / `CM_BUILD_NUMBER`.

## Production backend (systemd)

| File | Purpose |
|------|---------|
| `deploy/status-backend.service` | systemd unit — auto-restart, boot on startup, journalctl logs |
| `scripts/deploy-backend.sh` | `npm ci`, migrations, service restart |
| `backend/scripts/run-migrations.sh` | Apply `db/migrations/*.sql` via `DATABASE_URL` |
| `deploy/prometheus-scrape.example.yml` | Prometheus scrape target for `/metrics` |

```bash
sudo ./scripts/deploy-backend.sh
journalctl -u status-backend -f
curl http://localhost:3000/api/v1/health/ready
```

Default install path: `/opt/status/backend`. Override with `INSTALL_DIR=/srv/status`.

## Ubuntu desktop (Flutter Linux)

```bash
cd mobile && bash scripts/init-linux-desktop.sh && flutter run -d linux
```

Requires `libayatana-appindicator3-dev` for system tray support.

## Automated backups

```bash
./scripts/backup.sh
sudo cp deploy/status-backup.cron /etc/cron.d/status-backup
tail -f /var/log/status-backup.log
```

Backups land in `/var/backups/status/postgres/` as gzip-compressed dumps. Files older than 30 days are pruned automatically.

## Load & E2E testing

```bash
k6 run loadtests/k6/rest-api-load.js
k6 run loadtests/k6/websocket-load.js

cd mobile && flutter test integration_test/app_test.dart \
  --dart-define=API_BASE_URL=http://localhost:3000/api/v1 \
  --dart-define=SOCKET_URL=http://localhost:3000
```

Production CORS: set `CORS_ORIGINS=https://your-app.example` in backend `.env`.

## PostHog & Sentry (Phase 17)

| Secret | Where |
|--------|-------|
| `POSTHOG_API_KEY` | `backend/.env` + `mobile/.env` |
| `POSTHOG_HOST` | Optional — defaults to `https://us.i.posthog.com` |
| `SENTRY_DSN` | `backend/.env` + `mobile/.env` |

Create feature flags in PostHog using `backend/config/posthog-flags.example.json` as a template. Toggle `enable-3d-avatars` or `force-gemini-dm` live without redeploying.

## Multi-region & resilience (Phase 18)

```bash
REGION_ID=us-east-1 npm start
curl http://localhost:3000/api/v1/health/region
docker compose -f docker-compose.yml -f deploy/redpanda-compose.yml up -d
kubectl apply -f deploy/chaos-mesh/staging/ -n status-staging
```

## Post-merge verification

1. Confirm GitHub Actions workflow passes on `main`
2. Download `android-release-aab` artifact
3. Upload AAB to Google Play Internal Testing
4. Confirm TestFlight build appears after Fastlane lane completes

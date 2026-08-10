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

## Post-merge verification

1. Confirm GitHub Actions workflow passes on `main`
2. Download `android-release-aab` artifact
3. Upload AAB to Google Play Internal Testing
4. Confirm TestFlight build appears after Fastlane lane completes

# Flutter E2E Integration Tests

Uses Flutter's built-in `integration_test` package (runs on device/emulator/desktop).

## Prerequisites

1. Backend + PostgreSQL running with seeded AI characters
2. Flutter SDK with a connected device or emulator

## Run

**Android emulator** (API at host loopback):

```bash
cd mobile
flutter pub get
flutter test integration_test/app_test.dart \
  --dart-define=API_BASE_URL=http://10.0.2.2:3000/api/v1 \
  --dart-define=SOCKET_URL=http://10.0.2.2:3000
```

**Linux desktop / iOS simulator**:

```bash
flutter test integration_test/app_test.dart \
  --dart-define=API_BASE_URL=http://localhost:3000/api/v1 \
  --dart-define=SOCKET_URL=http://localhost:3000
```

## Covered journeys

| Test | Steps |
|------|-------|
| Registration | Create account → verify energy bar on feed |
| Login + DM | Sign in → scroll feed → Explore → Message → send DM → verify energy deduction |

Test keys are prefixed with `e2e_` in login, register, feed, explore, and chat widgets.

## CI note

Run on Firebase Test Lab, Codemagic, or GitHub Actions with an Android emulator service container and the backend started as a job service.

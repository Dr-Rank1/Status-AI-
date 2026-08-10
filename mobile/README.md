# Mobile (Flutter)

Run once to generate Android/iOS platform folders:

```bash
flutter create . --project-name status --org com.status
flutter pub get

# Generate splash screen + launcher icons (after flutter create)
dart run flutter_native_splash:create
dart run flutter_launcher_icons

flutter run
```

Point at your backend (physical device / emulator example):

```bash
flutter run \
  --dart-define=API_BASE_URL=http://10.0.2.2:3000/api/v1 \
  --dart-define=SOCKET_URL=http://10.0.2.2:3000
```

## Permissions (after `flutter create`)

**Android** — add to `android/app/src/main/AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>
<uses-permission android:name="android.permission.READ_MEDIA_IMAGES"/>
```

**iOS** — add to `ios/Runner/Info.plist`:

```xml
<key>NSPhotoLibraryUsageDescription</key>
<string>Status needs photo access to set your avatar and attach images to posts.</string>
```

## Admin screen

Users with `is_admin = true` (seed user `player_one` after migration 007) see an **Admin** button on the Profile tab to manage AI characters.

## Release builds

```bash
flutter build appbundle --release --obfuscate --split-debug-info=build/app/outputs/symbols
flutter build ios --release --no-codesign
cd ios && bundle exec fastlane beta
```

## Layout

```
mobile/lib/
├── main.dart
├── config/
├── models/
├── services/
│   ├── analytics_service.dart
│   ├── permission_service.dart
│   └── realtime_service.dart
├── features/
│   ├── admin/admin_screen.dart
│   └── feed/
└── widgets/
```

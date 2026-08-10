# Mobile (Flutter)

Run once to generate Android/iOS platform folders:

```bash
flutter create . --project-name status --org com.status
flutter pub get
flutter run
```

Point at your backend (physical device example):

```bash
flutter run --dart-define=API_BASE_URL=http://192.168.1.10:3000/api/v1
```

## Layout

```
mobile/lib/
├── main.dart                 # App entry
├── config/                   # API URLs, env
├── theme/                    # Dark theme tokens
├── models/                   # Data classes
├── services/                 # HTTP / API clients
├── features/                 # Feature-first screens
│   └── feed/
│       ├── feed_screen.dart
│       └── widgets/
└── widgets/                  # Shared shell, nav
```

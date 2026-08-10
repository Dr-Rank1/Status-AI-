#!/usr/bin/env bash
# Bootstrap Linux desktop support for the Status Flutter app.
#
# Run once from the mobile/ directory (requires Flutter 3.16+ with Linux desktop):
#   cd mobile && bash scripts/init-linux-desktop.sh
#
# Build:
#   flutter build linux --release
#
# Native deps on Ubuntu:
#   sudo apt install clang cmake ninja-build pkg-config libgtk-3-dev libayatana-appindicator3-dev
set -euo pipefail

MOBILE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$MOBILE_DIR"

if ! command -v flutter >/dev/null 2>&1; then
  echo "Flutter SDK not found. Install Flutter and enable Linux desktop:" >&2
  echo "  flutter config --enable-linux-desktop" >&2
  exit 1
fi

echo "=== Enabling Linux desktop platform ==="
flutter config --enable-linux-desktop
flutter create . --platforms=linux --project-name status --org com.status

DESKTOP_FILE="$MOBILE_DIR/linux/com.status.app.desktop"
if [[ -f "$DESKTOP_FILE" ]]; then
  install -Dm644 "$DESKTOP_FILE" "$HOME/.local/share/applications/com.status.app.desktop"
  echo "Installed desktop entry to ~/.local/share/applications/"
fi

echo
echo "=== Linux desktop ready ==="
echo "  flutter pub get"
echo "  flutter run -d linux"
echo "  flutter build linux --release"

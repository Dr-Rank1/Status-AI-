import 'dart:io' show Platform;

/// True when running as a native desktop target (Linux, macOS, or Windows).
bool get isDesktopPlatform {
  return Platform.isLinux || Platform.isMacOS || Platform.isWindows;
}

/// True when running on Ubuntu/Linux desktop builds.
bool get isLinuxDesktop => Platform.isLinux && !Platform.isAndroid;

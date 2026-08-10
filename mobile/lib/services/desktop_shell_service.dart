import 'dart:io';

import 'package:desktop_multi_window/desktop_multi_window.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:path/path.dart' as p;
import 'package:tray_manager/tray_manager.dart';
import 'package:window_manager/window_manager.dart';

import '../utils/desktop_platform.dart';

/// System tray, window management, and multi-window helpers for desktop builds.
class DesktopShellService with TrayListener, WindowListener {
  DesktopShellService._();

  static final DesktopShellService instance = DesktopShellService._();

  bool _initialized = false;
  VoidCallback? _onShow;
  VoidCallback? _onQuit;

  Future<void> init({
    required VoidCallback onShow,
    required VoidCallback onQuit,
  }) async {
    if (!isDesktopPlatform || _initialized) return;

    _onShow = onShow;
    _onQuit = onQuit;

    await windowManager.ensureInitialized();
    windowManager.addListener(this);

    const windowOptions = WindowOptions(
      size: Size(1280, 720),
      minimumSize: Size(960, 640),
      center: true,
      title: 'Status',
      titleBarStyle: TitleBarStyle.normal,
    );

    await windowManager.waitUntilReadyToShow(windowOptions, () async {
      await windowManager.show();
      await windowManager.focus();
    });

    trayManager.addListener(this);
    await trayManager.setToolTip('Status');

    final iconPath = await _resolveTrayIconPath();
    if (iconPath != null) {
      await trayManager.setIcon(iconPath);
    }

    await trayManager.setContextMenu(
      Menu(
        items: [
          MenuItem(key: 'show', label: 'Show Status'),
          MenuItem(key: 'messages', label: 'Open Messages Window'),
          MenuItem.separator(),
          MenuItem(key: 'quit', label: 'Quit Status'),
        ],
      ),
    );

    _initialized = true;
  }

  Future<String?> _resolveTrayIconPath() async {
    if (kIsWeb) return null;

    final candidates = <String>[
      p.join(Directory.current.path, 'assets', 'branding', 'app_icon.png'),
      p.join(Platform.resolvedExecutable, '..', 'data', 'flutter_assets', 'assets', 'branding', 'app_icon.png'),
    ];

    for (final path in candidates) {
      if (await File(path).exists()) return path;
    }
    return null;
  }

  /// Opens a secondary Flutter window (Canonical multi-window desktop support).
  Future<void> openMessagesWindow() async {
    if (!isDesktopPlatform) return;

    final window = await DesktopMultiWindow.createWindow(
      '{"route":"messages","title":"Status — Messages"}',
    );
    window
      ..setFrame(const Offset(80, 80) & const Size(480, 720))
      ..center()
      ..setTitle('Status — Messages')
      ..show();
  }

  Future<void> dispose() async {
    trayManager.removeListener(this);
    windowManager.removeListener(this);
    _initialized = false;
  }

  @override
  void onTrayIconMouseDown() {
    _onShow?.call();
    windowManager.show();
    windowManager.focus();
  }

  @override
  void onTrayIconRightMouseDown() {
    trayManager.popUpContextMenu();
  }

  @override
  void onTrayMenuItemClick(MenuItem menuItem) {
    switch (menuItem.key) {
      case 'show':
        _onShow?.call();
        windowManager.show();
        windowManager.focus();
      case 'messages':
        openMessagesWindow();
      case 'quit':
        _onQuit?.call();
    }
  }

  @override
  void onWindowClose() async {
    if (isLinuxDesktop) {
      await windowManager.hide();
    } else {
      _onQuit?.call();
    }
  }
}

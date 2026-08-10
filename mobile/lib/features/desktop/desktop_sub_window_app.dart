import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

/// Lightweight shell for secondary desktop windows created via desktop_multi_window.
class DesktopSubWindowApp extends StatelessWidget {
  const DesktopSubWindowApp({
    super.key,
    required this.argument,
  });

  final String? argument;

  String get _title {
    if (argument == null || argument!.isEmpty) return 'Status';
    if (argument!.contains('messages')) return 'Status — Messages';
    return 'Status';
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: _title,
      debugShowCheckedModeBanner: false,
      theme: buildAppTheme(),
      home: Scaffold(
        appBar: AppBar(title: Text(_title)),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Text(
              argument != null && argument!.contains('messages')
                  ? 'Messages window — sign in from the main Status window, then open Messages here.'
                  : 'Status desktop sub-window',
              textAlign: TextAlign.center,
            ),
          ),
        ),
      ),
    );
  }
}

import 'package:flutter/material.dart';

/// Tenant-specific white-label theme configuration from backend JSON.
class ThemeConfig {
  const ThemeConfig({
    this.appName = 'Status',
    this.primaryColor = '#8B5CF6',
    this.accentColor = '#22D3EE',
    this.backgroundColor = '#0A0A0B',
    this.surfaceColor = '#141416',
    this.fontFamily = 'Inter',
    this.logoUrl,
  });

  final String appName;
  final String primaryColor;
  final String accentColor;
  final String backgroundColor;
  final String surfaceColor;
  final String fontFamily;
  final String? logoUrl;

  static const defaults = ThemeConfig();

  factory ThemeConfig.fromJson(Map<String, dynamic> json) {
    return ThemeConfig(
      appName: json['appName'] as String? ?? defaults.appName,
      primaryColor: json['primaryColor'] as String? ?? defaults.primaryColor,
      accentColor: json['accentColor'] as String? ?? defaults.accentColor,
      backgroundColor: json['backgroundColor'] as String? ?? defaults.backgroundColor,
      surfaceColor: json['surfaceColor'] as String? ?? defaults.surfaceColor,
      fontFamily: json['fontFamily'] as String? ?? defaults.fontFamily,
      logoUrl: json['logoUrl'] as String?,
    );
  }

  Color get primary => _hex(primaryColor);
  Color get accent => _hex(accentColor);
  Color get background => _hex(backgroundColor);
  Color get surface => _hex(surfaceColor);

  static Color _hex(String hex) {
    final h = hex.replaceFirst('#', '');
    return Color(int.parse('FF$h', radix: 16));
  }
}

/// Provides tenant theme config to the widget tree.
class ThemeConfigProvider extends InheritedWidget {
  const ThemeConfigProvider({
    super.key,
    required this.config,
    required super.child,
  });

  final ThemeConfig config;

  static ThemeConfig of(BuildContext context) {
    return context.dependOnInheritedWidgetOfExactType<ThemeConfigProvider>()?.config
        ?? ThemeConfig.defaults;
  }

  @override
  bool updateShouldNotify(ThemeConfigProvider oldWidget) =>
      config.appName != oldWidget.config.appName ||
      config.primaryColor != oldWidget.config.primaryColor;
}

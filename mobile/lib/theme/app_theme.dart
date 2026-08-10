import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../models/theme_config.dart';

/// Legacy static palette — prefer [ThemeConfig] for white-label deployments.
abstract final class AppColors {
  static const background = Color(0xFF0A0A0B);
  static const surface = Color(0xFF141416);
  static const surfaceElevated = Color(0xFF1C1C1F);
  static const border = Color(0xFF2A2A2E);
  static const primary = Color(0xFF8B5CF6);
  static const primaryMuted = Color(0xFF6D28D9);
  static const accent = Color(0xFF22D3EE);
  static const textPrimary = Color(0xFFF4F4F5);
  static const textSecondary = Color(0xFFA1A1AA);
  static const textMuted = Color(0xFF71717A);
  static const like = Color(0xFFF472B6);
  static const energy = Color(0xFFFBBF24);
  static const success = Color(0xFF34D399);
}

ThemeData buildAppTheme([ThemeConfig config = ThemeConfig.defaults]) {
  final bg = config.background;
  final surface = config.surface;
  final primary = config.primary;
  final accent = config.accent;

  final base = ThemeData(
    brightness: Brightness.dark,
    useMaterial3: true,
    scaffoldBackgroundColor: bg,
    colorScheme: ColorScheme.dark(
      surface: surface,
      primary: primary,
      secondary: accent,
      onSurface: AppColors.textPrimary,
    ),
  );

  final textTheme = config.fontFamily.toLowerCase() == 'inter'
      ? GoogleFonts.interTextTheme(base.textTheme)
      : base.textTheme;

  return base.copyWith(
    textTheme: textTheme.apply(
      bodyColor: AppColors.textPrimary,
      displayColor: AppColors.textPrimary,
    ),
    appBarTheme: AppBarTheme(
      backgroundColor: bg,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
      foregroundColor: AppColors.textPrimary,
    ),
    dividerTheme: const DividerThemeData(
      color: AppColors.border,
      thickness: 0.5,
    ),
    iconTheme: const IconThemeData(color: AppColors.textSecondary),
    cardTheme: CardThemeData(
      color: surface,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: const BorderSide(color: AppColors.border, width: 0.5),
      ),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: surface,
      indicatorColor: primary.withValues(alpha: 0.2),
      labelTextStyle: WidgetStateProperty.all(
        const TextStyle(color: AppColors.textSecondary, fontSize: 12),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: primary,
        foregroundColor: Colors.white,
      ),
    ),
    snackBarTheme: const SnackBarThemeData(
      backgroundColor: AppColors.surfaceElevated,
      contentTextStyle: TextStyle(color: AppColors.textPrimary),
    ),
  );
}

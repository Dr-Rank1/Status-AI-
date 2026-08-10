import 'dart:io' show Platform;

import 'package:flutter/foundation.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';

/// Detects spatial / visionOS-capable environments.
abstract final class SpatialPlatform {
  static bool get forceSpatial =>
      dotenv.env['SPATIAL_MODE']?.toLowerCase() == 'true';

  static bool get isMacOS => !kIsWeb && Platform.isMacOS;

  /// visionOS builds run Flutter on darwin; treat macOS + spatial flag as spatial for dev.
  static bool get isSpatialEnvironment => forceSpatial || isMacOS;

  static bool get supportsGazeDwell => isSpatialEnvironment || kIsWeb;

  static bool get supportsPersistentScenes => isSpatialEnvironment;
}

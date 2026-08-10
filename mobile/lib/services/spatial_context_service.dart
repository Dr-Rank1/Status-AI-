import 'dart:convert';

import 'package:hive_flutter/hive_flutter.dart';

import '../models/spatial.dart';

/// On-device spatial processing — raw mapping never leaves the device.
class SpatialContextService {
  static const _boxName = 'spatial_context_local';

  static Future<void> init() async {
    if (!Hive.isBoxOpen(_boxName)) {
      await Hive.openBox<String>(_boxName);
    }
  }

  /// Simulates on-device room understanding and returns bucketed context only.
  Future<ProcessedSpatialContext> processLocalContext({
    required double userDistanceMeters,
    String roomType = 'living',
    String lightingLevel = 'neutral',
    String furnitureDensity = 'moderate',
    String ambientMood = 'neutral',
    String residencyRegion = 'local',
  }) async {
    final context = ProcessedSpatialContext(
      proxemicZone: ProxemicZone.fromDistanceMeters(userDistanceMeters),
      roomType: roomType,
      lightingLevel: lightingLevel,
      furnitureDensity: furnitureDensity,
      ambientMood: ambientMood,
      residencyRegion: residencyRegion,
      processedOnly: true,
    );

    await _cache(context);
    return context;
  }

  Future<void> _cache(ProcessedSpatialContext context) async {
    await init();
    final box = Hive.box<String>(_boxName);
    await box.put('latest', jsonEncode(context.toApiJson()));
    await box.put('cached_at', DateTime.now().toIso8601String());
  }

  ProcessedSpatialContext? loadCached() {
    if (!Hive.isBoxOpen(_boxName)) return null;
    final raw = Hive.box<String>(_boxName).get('latest');
    if (raw == null) return null;
    try {
      final json = jsonDecode(raw) as Map<String, dynamic>;
      return ProcessedSpatialContext(
        proxemicZone: ProxemicZone.values.byName(json['proxemic_zone'] as String? ?? 'personal'),
        roomType: json['room_type'] as String? ?? 'unknown',
        lightingLevel: json['lighting_level'] as String? ?? 'neutral',
        furnitureDensity: json['furniture_density'] as String? ?? 'moderate',
        ambientMood: json['ambient_mood'] as String? ?? 'neutral',
        residencyRegion: json['residency_region'] as String? ?? 'local',
      );
    } catch (_) {
      return null;
    }
  }
}

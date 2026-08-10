import 'dart:async';
import 'dart:convert';

import 'package:hive_flutter/hive_flutter.dart';

import '../models/spatial.dart';

/// Local persistence for visionOS-style spatial scene anchors (metadata only).
class SpatialSceneStore {
  static const _boxName = 'spatial_scenes_local';

  static Future<void> init() async {
    if (!Hive.isBoxOpen(_boxName)) {
      await Hive.openBox<String>(_boxName);
    }
  }

  Future<void> saveLocal(SpatialScene scene) async {
    await init();
    final box = Hive.box<String>(_boxName);
    await box.put(scene.sceneKey, jsonEncode({
      'scene_key': scene.sceneKey,
      'character_id': scene.characterId,
      'character_name': scene.characterName,
      'anchor_label': scene.anchorLabel,
      'world_position': scene.worldPosition,
      'world_rotation': scene.worldRotation,
      'scale': scene.scale,
      'is_persistent': scene.isPersistent,
      'updated_at': DateTime.now().toIso8601String(),
    }));
  }

  List<SpatialScene> loadAll() {
    if (!Hive.isBoxOpen(_boxName)) return [];
    final box = Hive.box<String>(_boxName);
    final scenes = <SpatialScene>[];
    for (final key in box.keys) {
      final raw = box.get(key);
      if (raw == null) continue;
      try {
        final json = jsonDecode(raw) as Map<String, dynamic>;
        scenes.add(SpatialScene.fromJson(json));
      } catch (_) {}
    }
    return scenes;
  }

  SpatialScene? load(String sceneKey) {
    if (!Hive.isBoxOpen(_boxName)) return null;
    final raw = Hive.box<String>(_boxName).get(sceneKey);
    if (raw == null) return null;
    try {
      return SpatialScene.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } catch (_) {
      return null;
    }
  }
}

/// Coordinates local scene store with backend metadata sync (no raw spatial data).
class SpatialSceneService {
  SpatialSceneService({SpatialSceneStore? store}) : _store = store ?? SpatialSceneStore();

  final SpatialSceneStore _store;

  Future<void> persistScene({
    required SpatialScene scene,
    required ProcessedSpatialContext context,
    required Future<void> Function(SpatialScene scene, ProcessedSpatialContext context) syncToBackend,
  }) async {
    await _store.saveLocal(scene);
    await syncToBackend(scene, context);
  }

  List<SpatialScene> localScenes() => _store.loadAll();

  SpatialScene? localScene(String key) => _store.load(key);
}

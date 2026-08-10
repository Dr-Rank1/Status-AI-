enum ProxemicZone {
  intimate,
  personal,
  social,
  public;

  static ProxemicZone fromDistanceMeters(double meters) {
    if (meters < 0.5) return ProxemicZone.intimate;
    if (meters < 1.2) return ProxemicZone.personal;
    if (meters < 3.0) return ProxemicZone.social;
    return ProxemicZone.public;
  }

  String get apiValue => name;

  double get layoutScale {
    switch (this) {
      case ProxemicZone.intimate:
        return 1.18;
      case ProxemicZone.personal:
        return 1.0;
      case ProxemicZone.social:
        return 0.92;
      case ProxemicZone.public:
        return 0.82;
    }
  }

  double get minTouchTarget {
    switch (this) {
      case ProxemicZone.intimate:
        return 52;
      case ProxemicZone.personal:
        return 48;
      case ProxemicZone.social:
        return 44;
      case ProxemicZone.public:
        return 40;
    }
  }
}

/// Processed on-device context — never includes raw mesh, LiDAR, or eye-tracking.
class ProcessedSpatialContext {
  const ProcessedSpatialContext({
    required this.proxemicZone,
    this.roomType = 'unknown',
    this.lightingLevel = 'neutral',
    this.furnitureDensity = 'moderate',
    this.ambientMood = 'neutral',
    this.residencyRegion = 'local',
    this.processedOnly = true,
  });

  final ProxemicZone proxemicZone;
  final String roomType;
  final String lightingLevel;
  final String furnitureDensity;
  final String ambientMood;
  final String residencyRegion;
  final bool processedOnly;

  Map<String, dynamic> toApiJson() => {
        'proxemic_zone': proxemicZone.apiValue,
        'room_type': roomType,
        'lighting_level': lightingLevel,
        'furniture_density': furnitureDensity,
        'ambient_mood': ambientMood,
        'residency_region': residencyRegion,
        'processed_only': true,
      };

  factory ProcessedSpatialContext.fromDistance({
    required double distanceMeters,
    String roomType = 'living',
    String lightingLevel = 'neutral',
  }) {
    return ProcessedSpatialContext(
      proxemicZone: ProxemicZone.fromDistanceMeters(distanceMeters),
      roomType: roomType,
      lightingLevel: lightingLevel,
    );
  }
}

class SpatialScene {
  const SpatialScene({
    required this.sceneKey,
    required this.characterId,
    this.characterName,
    this.characterHandle,
    this.characterAvatarUrl,
    this.model3dUrl,
    this.anchorLabel,
    this.worldPosition = const {},
    this.worldRotation = const {},
    this.scale = 1,
    this.isPersistent = true,
  });

  final String sceneKey;
  final String characterId;
  final String? characterName;
  final String? characterHandle;
  final String? characterAvatarUrl;
  final String? model3dUrl;
  final String? anchorLabel;
  final Map<String, dynamic> worldPosition;
  final Map<String, dynamic> worldRotation;
  final double scale;
  final bool isPersistent;

  factory SpatialScene.fromJson(Map<String, dynamic> json) {
    return SpatialScene(
      sceneKey: json['scene_key'] as String,
      characterId: json['character_id'] as String,
      characterName: json['character_name'] as String?,
      characterHandle: json['character_handle'] as String?,
      characterAvatarUrl: json['avatar_url'] as String?,
      model3dUrl: json['model_3d_url'] as String?,
      anchorLabel: json['anchor_label'] as String?,
      worldPosition: Map<String, dynamic>.from(json['world_position'] as Map? ?? {}),
      worldRotation: Map<String, dynamic>.from(json['world_rotation'] as Map? ?? {}),
      scale: (json['scale'] as num?)?.toDouble() ?? 1,
      isPersistent: json['is_persistent'] as bool? ?? true,
    );
  }
}

class SpatialReactResult {
  const SpatialReactResult({
    required this.content,
    this.provider,
  });

  final String content;
  final String? provider;

  factory SpatialReactResult.fromJson(Map<String, dynamic> json) {
    final reply = json['reply'] as Map<String, dynamic>? ?? {};
    return SpatialReactResult(
      content: reply['content'] as String? ?? '',
      provider: reply['provider'] as String?,
    );
  }
}

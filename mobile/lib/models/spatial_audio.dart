import 'dart:math' as math;

/// 3D audio source position relative to the listener (meters, right-handed Y-up).
class AudioSource3D {
  const AudioSource3D({
    required this.x,
    required this.y,
    required this.z,
    this.label = 'avatar',
  });

  final double x;
  final double y;
  final double z;
  final String label;

  double distanceTo(const AudioListener3D listener) {
    final dx = x - listener.x;
    final dy = y - listener.y;
    final dz = z - listener.z;
    return math.sqrt(dx * dx + dy * dy + dz * dz);
  }
}

class AudioListener3D {
  const AudioListener3D({
    this.x = 0,
    this.y = 0,
    this.z = 0,
    this.yawRadians = 0,
  });

  final double x;
  final double y;
  final double z;
  final double yawRadians;
}

/// Computed spatial audio parameters for a source/listener pair.
class SpatialAudioParams {
  const SpatialAudioParams({
    required this.volume,
    required this.pan,
    required this.reverbMix,
    required this.distanceMeters,
    required this.occlusion,
  });

  final double volume;
  final double pan;
  final double reverbMix;
  final double distanceMeters;
  final double occlusion;
}

SpatialAudioParams computeSpatialAudioParams({
  required AudioSource3D source,
  required AudioListener3D listener,
  double maxAudibleDistance = 12,
  double referenceDistance = 1.0,
}) {
  final distance = source.distanceTo(listener).clamp(0.05, maxAudibleDistance);
  final dx = source.x - listener.x;
  final dz = source.z - listener.z;

  final angle = math.atan2(dx, dz) - listener.yawRadians;
  final pan = (angle / math.pi).clamp(-1.0, 1.0);

  final attenuation = referenceDistance / (referenceDistance + distance * 0.35);
  final volume = (attenuation * (1 - (distance / maxAudibleDistance) * 0.25)).clamp(0.05, 1.0);
  final reverbMix = (distance / maxAudibleDistance * 0.6).clamp(0, 0.85);
  final occlusion = source.y < listener.y - 0.5 ? 0.25 : 0;

  return SpatialAudioParams(
    volume: volume * (1 - occlusion),
    pan: pan,
    reverbMix: reverbMix,
    distanceMeters: distance,
    occlusion: occlusion,
  );
}

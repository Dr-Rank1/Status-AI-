import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';

/// Phase 32 — Dart bindings for flutter_neuromorphic_bridge (SNN / NPU).
class NeuromorphicBridgeService {
  NeuromorphicBridgeService._();

  static final NeuromorphicBridgeService instance = NeuromorphicBridgeService._();

  static const MethodChannel _channel = MethodChannel('com.status/neuromorphic');

  bool _initialized = false;
  String _backend = 'cpu';
  bool _npuAvailable = false;

  bool get isEnabled =>
      dotenv.maybeGet('NEUROMORPHIC_ENABLED')?.toLowerCase() == 'true';

  String get backend => _backend;
  bool get npuAvailable => _npuAvailable;

  Future<bool> init({String preferred = 'auto'}) async {
    if (!isEnabled || kIsWeb) return false;
    if (_initialized) return true;

    try {
      final result = await _channel.invokeMethod<Map>('init', {
        'preferred': preferred,
        'platform': Platform.isIOS
            ? 'ane'
            : Platform.isAndroid
                ? 'hexagon'
                : 'cpu',
      });
      _backend = result?['backend']?.toString() ?? 'cpu';
      _npuAvailable = result?['npuAvailable'] == true;
      _initialized = true;
      return true;
    } on MissingPluginException {
      // Pure-Dart fallback when native lib is not linked.
      _backend = 'cpu-dart-fallback';
      _npuAvailable = false;
      _initialized = true;
      return true;
    } catch (e) {
      debugPrint('[Neuromorphic] init failed: $e');
      return false;
    }
  }

  /// Ambient voice activity / intent — targets sub-ms on NPU.
  Future<NeuromorphicInference?> inferVoice(Float32List samples, {int sampleRate = 16000}) async {
    await init();
    if (!_initialized) return null;

    try {
      final result = await _channel.invokeMethod<Map>('inferVoice', {
        'samples': samples,
        'sampleRate': sampleRate,
      });
      if (result == null) return _dartVoiceFallback(samples);
      return NeuromorphicInference.fromMap(Map<String, dynamic>.from(result));
    } on MissingPluginException {
      return _dartVoiceFallback(samples);
    } catch (_) {
      return _dartVoiceFallback(samples);
    }
  }

  Future<NeuromorphicGesture?> inferGesture(Float32List features) async {
    await init();
    try {
      final result = await _channel.invokeMethod<Map>('inferGesture', {
        'features': features,
      });
      if (result == null) return null;
      return NeuromorphicGesture.fromMap(Map<String, dynamic>.from(result));
    } on MissingPluginException {
      if (features.length < 3) return null;
      final mag = (features[0] * features[0] + features[1] * features[1] + features[2] * features[2]);
      return NeuromorphicGesture(
        x: features[0],
        y: features[1],
        z: features[2],
        confidence: mag.clamp(0, 1),
        gestureId: mag > 0.16 ? 2 : 0,
      );
    } catch (_) {
      return null;
    }
  }

  NeuromorphicInference _dartVoiceFallback(Float32List samples) {
    var energy = 0.0;
    for (final s in samples) {
      energy += s * s;
    }
    energy = samples.isEmpty ? 0 : energy / samples.length;
    return NeuromorphicInference(
      intentId: energy > 0.0004 ? 1 : 0,
      confidence: (energy * 200).clamp(0, 1),
      latencyMs: 0.2,
      spikeCount: (energy * 1000).round(),
    );
  }

  Map<String, dynamic> get diagnostics => {
        'enabled': isEnabled,
        'initialized': _initialized,
        'backend': _backend,
        'npuAvailable': _npuAvailable,
        'header': 'native/neuromorphic/include/status_neuromorphic.h',
      };
}

class NeuromorphicInference {
  const NeuromorphicInference({
    required this.intentId,
    required this.confidence,
    required this.latencyMs,
    required this.spikeCount,
  });

  final int intentId;
  final double confidence;
  final double latencyMs;
  final int spikeCount;

  factory NeuromorphicInference.fromMap(Map<String, dynamic> json) {
    return NeuromorphicInference(
      intentId: json['intentId'] as int? ?? 0,
      confidence: (json['confidence'] as num?)?.toDouble() ?? 0,
      latencyMs: (json['latencyMs'] as num?)?.toDouble() ?? 0,
      spikeCount: json['spikeCount'] as int? ?? 0,
    );
  }
}

class NeuromorphicGesture {
  const NeuromorphicGesture({
    required this.x,
    required this.y,
    required this.z,
    required this.confidence,
    required this.gestureId,
  });

  final double x;
  final double y;
  final double z;
  final double confidence;
  final int gestureId;

  factory NeuromorphicGesture.fromMap(Map<String, dynamic> json) {
    return NeuromorphicGesture(
      x: (json['x'] as num?)?.toDouble() ?? 0,
      y: (json['y'] as num?)?.toDouble() ?? 0,
      z: (json['z'] as num?)?.toDouble() ?? 0,
      confidence: (json['confidence'] as num?)?.toDouble() ?? 0,
      gestureId: json['gestureId'] as int? ?? 0,
    );
  }
}

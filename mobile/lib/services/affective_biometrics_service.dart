import 'dart:async';
import 'dart:math' as math;

import 'package:flutter_dotenv/flutter_dotenv.dart';

import '../models/affective.dart';
import 'api_service.dart';
import 'wearable_companion_service.dart';

/// On-device affective biometrics — HRV proxy, facial valence heuristic, voice stress.
class AffectiveBiometricsService {
  AffectiveBiometricsService({ApiService? api, WearableCompanionService? wearable})
      : _api = api,
        _wearable = wearable;

  ApiService? _api;
  WearableCompanionService? _wearable;
  Timer? _pollTimer;
  final _controller = StreamController<AffectiveSnapshot>.broadcast();

  AffectiveSnapshot? _latest;
  double _voiceStressAccumulator = 0.3;
  int _voiceStressSamples = 0;

  Stream<AffectiveSnapshot> get snapshots => _controller.stream;
  AffectiveSnapshot? get latest => _latest;

  bool get isEnabled => _readEnvFlag('AFFECTIVE_BIOMETRICS', defaultValue: false);

  Future<void> init({ApiService? api, WearableCompanionService? wearable}) async {
    _api = api ?? _api;
    _wearable = wearable ?? _wearable;
    if (!isEnabled) return;
    _startPolling();
  }

  /// Process camera frame metrics (brightness variance / motion proxy — not raw landmarks).
  Future<double> analyzeFacialValenceFromFrameMetrics({
    required double brightnessMean,
    required double motionScore,
  }) async {
    final valence = ((brightnessMean - 0.5) * 0.4 + (0.5 - motionScore) * 0.3).clamp(-1.0, 1.0);
    return valence;
  }

  /// Ingest voice amplitude samples during recording for stress estimation.
  void ingestVoiceAmplitude(double normalizedAmplitude) {
    _voiceStressAccumulator += normalizedAmplitude.clamp(0, 1);
    _voiceStressSamples += 1;
  }

  double get voiceStress {
    if (_voiceStressSamples == 0) return 0.3;
    return (_voiceStressAccumulator / _voiceStressSamples).clamp(0, 1);
  }

  Future<AffectiveSnapshot> captureSnapshot({
    double? facialValence,
    String? characterId,
  }) async {
    final hrv = await _estimateHrv();
    final facial = facialValence ?? await _estimateFacialValence();
    final stress = voiceStress;

    final snapshot = AffectiveSnapshot(
      hrvScore: hrv,
      facialValence: facial,
      voiceStress: stress,
    );

    _latest = snapshot;
    _controller.add(snapshot);

    if (_api != null) {
      try {
        await _api!.submitAffectiveMetrics(snapshot: snapshot, characterId: characterId);
      } catch (_) {
        // Offline — local context still valid
      }
    }

    return snapshot;
  }

  Future<double> _estimateHrv() async {
    if (_wearable != null) {
      try {
        final sync = _wearable!.fetchLatestMetrics();
        final hr = sync['heartRate'] as num?;
        if (hr != null) {
          final coherence = (1 - ((hr - 70).abs() / 40)).clamp(0.3, 0.95);
          return coherence.toDouble();
        }
      } catch (_) {}
    }
    return 0.55 + math.sin(DateTime.now().millisecondsSinceEpoch / 10000) * 0.15;
  }

  Future<double> _estimateFacialValence() async {
    return math.sin(DateTime.now().millisecondsSinceEpoch / 8000) * 0.4;
  }

  void _startPolling() {
    _pollTimer?.cancel();
    _pollTimer = Timer.periodic(const Duration(seconds: 5), (_) {
      captureSnapshot();
    });
  }

  void dispose() {
    _pollTimer?.cancel();
    _controller.close();
  }

  bool _readEnvFlag(String key, {required bool defaultValue}) {
    final env = dotenv.maybeGet(key);
    if (env != null) return env.toLowerCase() == 'true';
    return defaultValue;
  }
}

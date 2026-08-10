import 'dart:async';
import 'dart:math' as math;

import 'package:flutter_dotenv/flutter_dotenv.dart';

import '../models/bci.dart';
import 'api_service.dart';

typedef BciThemeCallback = void Function(BciThemeAdaptation theme);
typedef BciAffinityCallback = void Function({required int affinityDelta, int? affinity});

/// Experimental BCI input abstraction — maps processed neural metrics to user intent.
class BciInputService {
  BciInputService({ApiService? api}) : _api = api;

  ApiService? _api;
  Timer? _pollTimer;
  bool _simulationMode = true;
  String? _characterId;

  BciThemeCallback? _onTheme;
  BciAffinityCallback? _onAffinity;
  final _signalController = StreamController<BciSignalSnapshot>.broadcast();

  Stream<BciSignalSnapshot> get signals => _signalController.stream;
  BciSignalSnapshot? _latest;

  BciSignalSnapshot? get latest => _latest;

  Future<void> init({ApiService? api, bool? simulationMode}) async {
    _api = api ?? _api;
    _simulationMode = simulationMode ?? _readEnvFlag('BCI_MODE', defaultValue: false);
    if (_simulationMode) {
      _startSimulationPoll();
    }
  }

  void setCharacterId(String? characterId) {
    _characterId = characterId;
  }

  void setThemeCallback(BciThemeCallback callback) {
    _onTheme = callback;
  }

  void setAffinityCallback(BciAffinityCallback callback) {
    _onAffinity = callback;
  }

  /// Ingest processed metrics from paired hardware (Muse, OpenBCI, etc.).
  Future<void> ingestProcessedMetrics({
    required double valence,
    required double arousal,
    double focusLevel = 0.5,
    BciIntentType intent = BciIntentType.ambient,
    double confidence = 0.85,
  }) async {
    final snapshot = BciSignalSnapshot(
      valence: valence.clamp(-1, 1),
      arousal: arousal.clamp(0, 1),
      focusLevel: focusLevel.clamp(0, 1),
      intentType: intent,
      confidence: confidence,
    );
    await _dispatch(snapshot);
  }

  Future<void> _dispatch(BciSignalSnapshot snapshot) async {
    _latest = snapshot;
    _signalController.add(snapshot);

    final theme = BciThemeAdaptation.fromSignal(snapshot);
    _onTheme?.call(theme);

    if (_api != null) {
      try {
        final result = await _api!.submitBciIntent(
          snapshot: snapshot,
          characterId: _characterId,
        );
        final delta = result['affinityDelta'] as int? ?? 0;
        final affinity = result['affinity'] as int?;
        if (delta != 0 || affinity != null) {
          _onAffinity?.call(affinityDelta: delta, affinity: affinity);
        }
      } catch (_) {
        // Offline — local theme still applies
      }
    }
  }

  void _startSimulationPoll() {
    _pollTimer?.cancel();
    var t = 0.0;
    _pollTimer = Timer.periodic(const Duration(seconds: 4), (_) async {
      t += 0.25;
      final valence = math.sin(t) * 0.6;
      final arousal = (math.sin(t * 0.7) + 1) / 2;
      final focus = (math.cos(t * 0.5) + 1) / 2;
      final intent = focus > 0.75
          ? BciIntentType.focusCharacter
          : arousal < 0.25
              ? BciIntentType.disengage
              : BciIntentType.ambient;

      await ingestProcessedMetrics(
        valence: valence,
        arousal: arousal,
        focusLevel: focus,
        intent: intent,
        confidence: 0.72,
      );
    });
  }

  void dispose() {
    _pollTimer?.cancel();
    _signalController.close();
  }

  bool _readEnvFlag(String key, {required bool defaultValue}) {
    final env = dotenv.maybeGet(key);
    if (env != null) return env.toLowerCase() == 'true';
    return defaultValue;
  }
}

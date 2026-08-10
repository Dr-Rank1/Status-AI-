import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';

/// Phase 36 — Edge bio-adaptive UI / cognitive filters.
/// Combines BCI + biometrics → declutter, font scale, action limits.
class BioAdaptiveUiService {
  BioAdaptiveUiService();

  final _controller = StreamController<BioAdaptiveUiState>.broadcast();
  BioAdaptiveUiState _state = BioAdaptiveUiState.neutral();

  Stream<BioAdaptiveUiState> get onChange => _controller.stream;
  BioAdaptiveUiState get state => _state;

  bool get isEnabled =>
      (dotenv.maybeGet('BIO_ADAPTIVE_UI_ENABLED') ?? 'true').toLowerCase() != 'false';

  /// Ingest BCI + biometric sample (from wearables / BCI Intent API).
  BioAdaptiveUiState ingest({
    Map<String, dynamic>? bci,
    Map<String, dynamic>? biometrics,
  }) {
    if (!isEnabled) return _state;

    final arousal = _n(bci?['arousal'], 0.4);
    final focus = _n(bci?['focusLevel'] ?? bci?['focus_level'], 0.5);
    final valence = _n(bci?['valence'], 0);
    final stress = _n(biometrics?['stress'] ?? biometrics?['voiceStress'], 0.3);
    final hr = _n(biometrics?['heartRate'] ?? biometrics?['hr'], 70);
    final hrv = _n(biometrics?['hrv'], 50);
    final blink = _n(biometrics?['blinkRate'], 15);

    final hrLoad = ((hr - 60) / 80).clamp(0.0, 1.0);
    final fatigue = ((1 - focus) * 0.35 +
            stress * 0.3 +
            (blink > 25 ? 0.2 : 0.0) +
            (hrv < 30 ? 0.15 : 0.0) +
            hrLoad * 0.1)
        .clamp(0.0, 1.0);
    final load =
        (arousal * 0.25 + (1 - focus) * 0.4 + stress * 0.25 + hrLoad * 0.1).clamp(0.0, 1.0);

    final complexity = (1 - (load > fatigue ? load : fatigue) * 0.85).clamp(0.15, 1.0);
    final simplify = fatigue >= 0.6 || load >= 0.7;

    _state = BioAdaptiveUiState(
      cognitiveLoad: load,
      fatigue: fatigue,
      empathyBoost: (stress * 0.35 + (valence < 0 ? 0.15 : 0.0)).clamp(0.0, 1.0),
      llmTemperatureHint: (0.75 - load * 0.35 - fatigue * 0.15).clamp(0.2, 1.2),
      uiComplexity: complexity,
      declutter: complexity < 0.55,
      simplifyLayout: simplify,
      reduceMotion: fatigue >= 0.55,
      hideSecondaryPanels: simplify,
      maxVisibleActions: simplify ? 3 : 8,
      fontScale: fatigue >= 0.65 ? 1.12 : 1.0,
    );

    debugPrint(
      '[BioAdaptive] load=${load.toStringAsFixed(2)} fatigue=${fatigue.toStringAsFixed(2)} declutter=${_state.declutter}',
    );
    _controller.add(_state);
    return _state;
  }

  /// Apply from server `/api/v2/cognitive/modulate` payload.
  BioAdaptiveUiState applyServerControls(Map<String, dynamic> data) {
    final ui = Map<String, dynamic>.from(data['ui'] as Map? ?? {});
    final filters = Map<String, dynamic>.from(ui['edgeFilters'] as Map? ?? {});
    final llm = Map<String, dynamic>.from(data['llm'] as Map? ?? {});
    final st = Map<String, dynamic>.from(data['state'] as Map? ?? {});

    _state = BioAdaptiveUiState(
      cognitiveLoad: _n(st['cognitiveLoad'], _state.cognitiveLoad),
      fatigue: _n(st['fatigue'], _state.fatigue),
      empathyBoost: _n(llm['empathy'], _state.empathyBoost),
      llmTemperatureHint: _n(llm['temperature'], _state.llmTemperatureHint),
      uiComplexity: _n(ui['complexity'], _state.uiComplexity),
      declutter: ui['declutter'] as bool? ?? _state.declutter,
      simplifyLayout: ui['simplifyLayout'] as bool? ?? _state.simplifyLayout,
      reduceMotion: filters['reduceMotion'] as bool? ?? _state.reduceMotion,
      hideSecondaryPanels: filters['hideSecondaryPanels'] as bool? ?? _state.hideSecondaryPanels,
      maxVisibleActions: filters['maxVisibleActions'] as int? ?? _state.maxVisibleActions,
      fontScale: _n(filters['fontScale'], _state.fontScale),
    );
    _controller.add(_state);
    return _state;
  }

  void dispose() => _controller.close();

  double _n(dynamic v, double fallback) {
    if (v is num) return v.toDouble();
    return fallback;
  }
}

class BioAdaptiveUiState {
  const BioAdaptiveUiState({
    required this.cognitiveLoad,
    required this.fatigue,
    required this.empathyBoost,
    required this.llmTemperatureHint,
    required this.uiComplexity,
    required this.declutter,
    required this.simplifyLayout,
    required this.reduceMotion,
    required this.hideSecondaryPanels,
    required this.maxVisibleActions,
    required this.fontScale,
  });

  factory BioAdaptiveUiState.neutral() => const BioAdaptiveUiState(
        cognitiveLoad: 0.3,
        fatigue: 0.2,
        empathyBoost: 0.5,
        llmTemperatureHint: 0.75,
        uiComplexity: 1,
        declutter: false,
        simplifyLayout: false,
        reduceMotion: false,
        hideSecondaryPanels: false,
        maxVisibleActions: 8,
        fontScale: 1,
      );

  final double cognitiveLoad;
  final double fatigue;
  final double empathyBoost;
  final double llmTemperatureHint;
  final double uiComplexity;
  final bool declutter;
  final bool simplifyLayout;
  final bool reduceMotion;
  final bool hideSecondaryPanels;
  final int maxVisibleActions;
  final double fontScale;
}

/// Processed BCI metrics — raw EEG/neural waveforms never leave the device.
class BciSignalSnapshot {
  const BciSignalSnapshot({
    required this.valence,
    required this.arousal,
    this.focusLevel = 0.5,
    this.confidence = 0.8,
    this.intentType = BciIntentType.ambient,
    this.processedOnly = true,
  });

  final double valence;
  final double arousal;
  final double focusLevel;
  final double confidence;
  final BciIntentType intentType;
  final bool processedOnly;

  Map<String, dynamic> toApiJson({String? characterId}) => {
        'valence': valence,
        'arousal': arousal,
        'focusLevel': focusLevel,
        'intentType': intentType.apiValue,
        'confidence': confidence,
        'processedOnly': true,
        if (characterId != null) 'characterId': characterId,
      };
}

enum BciIntentType {
  ambient,
  focusCharacter,
  navigate,
  disengage,
  engage;

  String get apiValue {
    switch (this) {
      case BciIntentType.ambient:
        return 'ambient';
      case BciIntentType.focusCharacter:
        return 'focus_character';
      case BciIntentType.navigate:
        return 'navigate';
      case BciIntentType.disengage:
        return 'disengage';
      case BciIntentType.engage:
        return 'engage';
    }
  }
}

/// UI theme adaptation derived from neural valence/arousal.
class BciThemeAdaptation {
  const BciThemeAdaptation({
    required this.backgroundColor,
    required this.accentColor,
    required this.moodLabel,
    required this.energyLevel,
  });

  final int backgroundColor;
  final int accentColor;
  final String moodLabel;
  final String energyLevel;

  factory BciThemeAdaptation.fromSignal(BciSignalSnapshot signal) {
    final v = signal.valence.clamp(-1.0, 1.0);
    final a = signal.arousal.clamp(0.0, 1.0);

    final hue = 220 + ((v + 1) / 2) * 100;
    final sat = 0.35 + a * 0.5;
    final light = 0.12 + ((v + 1) / 2) * 0.1;

    return BciThemeAdaptation(
      backgroundColor: _hslToArgb(hue, sat * 0.4, light),
      accentColor: _hslToArgb(hue, sat, 0.45 + a * 0.2),
      moodLabel: v > 0.3 ? 'positive' : v < -0.3 ? 'negative' : 'neutral',
      energyLevel: a > 0.6 ? 'high' : a > 0.3 ? 'medium' : 'low',
    );
  }
}

int _hslToArgb(double h, double s, double l) {
  final c = (1 - (2 * l - 1).abs()) * s;
  final x = c * (1 - ((h / 60) % 2 - 1).abs());
  final m = l - c / 2;
  double r = 0, g = 0, b = 0;
  if (h < 60) {
    r = c;
    g = x;
  } else if (h < 120) {
    r = x;
    g = c;
  } else if (h < 180) {
    g = c;
    b = x;
  } else if (h < 240) {
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  int ch(double v) => ((v + m) * 255).round().clamp(0, 255);
  return 0xFF000000 | (ch(r) << 16) | (ch(g) << 8) | ch(b);
}

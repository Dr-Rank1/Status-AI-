/// Processed affective biometric snapshot — no raw camera/PPG streams.
class AffectiveSnapshot {
  const AffectiveSnapshot({
    required this.hrvScore,
    required this.facialValence,
    required this.voiceStress,
    this.confidence = 0.8,
    this.processedOnly = true,
  });

  final double hrvScore;
  final double facialValence;
  final double voiceStress;
  final double confidence;
  final bool processedOnly;

  Map<String, dynamic> toApiJson({String? characterId}) => {
        'hrvScore': hrvScore,
        'facialValence': facialValence,
        'voiceStress': voiceStress,
        'confidence': confidence,
        'processedOnly': true,
        if (characterId != null) 'characterId': characterId,
      };

  /// Local AI context window injection block.
  String toLocalAiContextBlock() {
    final stress = voiceStress > 0.6 ? 'elevated stress' : voiceStress > 0.35 ? 'moderate stress' : 'calm';
    final mood = facialValence > 0.3 ? 'positive' : facialValence < -0.3 ? 'distressed' : 'neutral';
    final pacing = voiceStress > 0.55 ? 'slow and gentle' : hrvScore > 0.65 ? 'natural' : 'attentive';
    return 'User affect: $mood mood, $stress, HRV coherence ${hrvScore.toStringAsFixed(2)}. '
        'Adapt empathy and use $pacing pacing.';
  }
}

class AffectiveToneParams {
  const AffectiveToneParams({
    required this.empathyLevel,
    required this.speechRate,
    required this.temperature,
  });

  final double empathyLevel;
  final double speechRate;
  final double temperature;

  factory AffectiveToneParams.fromSnapshot(AffectiveSnapshot s) {
    final empathy = (0.5 + s.facialValence * 0.2 + (s.voiceStress > 0.5 ? 0.2 : 0)).clamp(0.2, 1.0);
    final rate = (0.42 - s.voiceStress * 0.08 + s.hrvScore * 0.05).clamp(0.32, 0.52);
    final temp = (0.75 + empathy * 0.15).clamp(0.7, 0.95);
    return AffectiveToneParams(empathyLevel: empathy, speechRate: rate, temperature: temp);
  }
}

import '../models/affective.dart';
import 'affective_biometrics_service.dart';
import 'local_ai_service.dart';

/// Bridges affective biometrics into the local AI context window.
class AffectiveContextBridge {
  AffectiveContextBridge({
    required LocalAiService localAi,
    required AffectiveBiometricsService biometrics,
  })  : _localAi = localAi,
        _biometrics = biometrics;

  final LocalAiService _localAi;
  final AffectiveBiometricsService _biometrics;

  AffectiveSnapshot? _cached;

  void bind() {
    _biometrics.snapshots.listen((snapshot) {
      _cached = snapshot;
    });
  }

  AffectiveSnapshot? get currentSnapshot => _cached ?? _biometrics.latest;

  AffectiveToneParams get toneParams =>
      AffectiveToneParams.fromSnapshot(currentSnapshot ?? const AffectiveSnapshot(
        hrvScore: 0.5,
        facialValence: 0,
        voiceStress: 0.3,
      ));

  String get contextBlock => currentSnapshot?.toLocalAiContextBlock() ?? '';

  Future<String?> generateAffectAwareReply({
    required String characterName,
    required String characterBio,
    required String userMessage,
    List<String> recentLines = const [],
  }) async {
    final snapshot = currentSnapshot;
    final tone = AffectiveToneParams.fromSnapshot(snapshot ?? const AffectiveSnapshot(
      hrvScore: 0.5,
      facialValence: 0,
      voiceStress: 0.3,
    ));

    final affectBlock = snapshot?.toLocalAiContextBlock() ?? '';
    final enrichedBio = characterBio.isEmpty
        ? affectBlock
        : '$characterBio\n$affectBlock';

    return _localAi.generateDmReply(
      characterName: characterName,
      characterBio: enrichedBio,
      userMessage: userMessage,
      recentLines: recentLines,
      temperature: tone.temperature,
    );
  }
}

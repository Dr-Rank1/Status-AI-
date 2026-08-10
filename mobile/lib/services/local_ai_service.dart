import 'package:flutter_local_ai/flutter_local_ai.dart';

/// On-device inference via Gemini Nano / Apple Foundation Models.
class LocalAiService {
  LocalAiService({FlutterLocalAi? engine}) : _engine = engine ?? FlutterLocalAi();

  final FlutterLocalAi _engine;
  bool _initialized = false;
  bool? _available;

  Future<bool> get isAvailable async {
    _available ??= await _engine.isAvailable();
    return _available!;
  }

  Future<void> init() async {
    if (_initialized) return;
    if (!await isAvailable) return;
    _initialized = await _engine.initialize(
      instructions:
          'You are a helpful in-character assistant for a social fiction app. '
          'Keep replies concise (1-3 sentences), stay in character, never mention being an AI.',
    );
  }

  Future<String?> generateDmReply({
    required String characterName,
    required String characterBio,
    required String userMessage,
    List<String> recentLines = const [],
    double? temperature,
  }) async {
    if (!await isAvailable) return null;
    await init();

    final history = recentLines.isEmpty
        ? ''
        : 'Recent chat:\n${recentLines.join('\n')}\n\n';

    try {
      final response = await _engine.generateText(
        prompt: '${history}User says: "$userMessage"\n\nReply as $characterName now.',
        instructions:
            'You are $characterName. ${characterBio.isNotEmpty ? 'Bio: $characterBio. ' : ''}'
            'Reply in 1-3 sentences, in character.',
        config: GenerationConfig(
          maxTokens: 120,
          temperature: temperature ?? 0.85,
        ),
      );
      return response.text.trim().isEmpty ? null : response.text.trim();
    } catch (_) {
      return null;
    }
  }

  Future<String?> generateFeedReply({
    required String characterName,
    required String postContent,
    required String userReply,
  }) async {
    if (!await isAvailable) return null;
    await init();

    try {
      final response = await _engine.generateText(
        prompt: 'Post by $characterName: "$postContent"\n'
            'A fan replied: "$userReply"\n\nWrite $characterName\'s in-character reply (1-2 sentences).',
        config: const GenerationConfig(maxTokens: 80, temperature: 0.85),
      );
      return response.text.trim().isEmpty ? null : response.text.trim();
    } catch (_) {
      return null;
    }
  }

  Future<GenUiModuleSpec?> generateUiModule({
    required String goal,
    String? principles,
  }) async {
    if (!await isAvailable) return null;
    await init();

    final generator = LocalAiUiGenerator(_engine);
    return generator.generateModule(
      goal,
      principles: principles ??
          'Dark-mode social app. Compact blocks. Polls use checklist type. '
          'Mood widgets use stat or note blocks. Mini-games use calc or progress.',
      language: 'en',
    );
  }

  Future<LocalAiPlatformInfo?> platformInfo() async {
    if (!await isAvailable) return null;
    try {
      return await _engine.getPlatformInfo();
    } catch (_) {
      return null;
    }
  }
}

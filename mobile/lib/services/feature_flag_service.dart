import 'package:flutter/foundation.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:posthog_flutter/posthog_flutter.dart';

/// PostHog feature flag client for dynamic UI rollouts.
class FeatureFlagService {
  FeatureFlagService._();

  static final FeatureFlagService instance = FeatureFlagService._();

  bool _initialized = false;
  final Map<String, bool> _cache = {};

  static const enable3dAvatars = 'enable-3d-avatars';

  Future<void> init() async {
    if (_initialized) return;

    final apiKey = dotenv.maybeGet('POSTHOG_API_KEY') ??
        const String.fromEnvironment('POSTHOG_API_KEY', defaultValue: '');
    if (apiKey.isEmpty) {
      _initialized = true;
      return;
    }

    final host = dotenv.maybeGet('POSTHOG_HOST') ??
        const String.fromEnvironment('POSTHOG_HOST', defaultValue: 'https://us.i.posthog.com');

    final config = PostHogConfig(
      apiKey: apiKey,
      host: host,
      captureApplicationLifecycleEvents: true,
    );

    await Posthog().setup(config);
    _initialized = true;
  }

  Future<bool> isFeatureEnabled(String key, {bool defaultValue = false}) async {
    if (!_initialized) await init();

    final apiKey = dotenv.maybeGet('POSTHOG_API_KEY') ??
        const String.fromEnvironment('POSTHOG_API_KEY', defaultValue: '');
    if (apiKey.isEmpty) return defaultValue;

    if (_cache.containsKey(key)) return _cache[key]!;

    try {
      final enabled = await Posthog().isFeatureEnabled(key) ?? defaultValue;
      _cache[key] = enabled;
      return enabled;
    } catch (_) {
      return defaultValue;
    }
  }

  Future<bool> is3dAvatarsEnabled() => isFeatureEnabled(enable3dAvatars);

  Future<Map<String, dynamic>> activeFlagSnapshot() async {
    final flags = <String, dynamic>{
      enable3dAvatars: await is3dAvatarsEnabled(),
    };
    return flags;
  }

  Future<void> identify(String userId, {Map<String, Object>? properties}) async {
    if (!_initialized) await init();
    final apiKey = dotenv.maybeGet('POSTHOG_API_KEY') ??
        const String.fromEnvironment('POSTHOG_API_KEY', defaultValue: '');
    if (apiKey.isEmpty) return;

    await Posthog().identify(userId: userId, userProperties: properties);
  }

  void track(String event, {Map<String, Object>? properties}) {
    if (!_initialized) return;
    Posthog().capture(eventName: event, properties: properties ?? {});
  }

  void clearCache() => _cache.clear();
}

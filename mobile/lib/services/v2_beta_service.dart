import 'package:flutter/foundation.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'api_service.dart';
import 'feature_flag_service.dart';

/// Phase 31 — V2 Beta opt-in for experimental API / GraphQL / reflection mesh.
class V2BetaService {
  V2BetaService._();

  static final V2BetaService instance = V2BetaService._();

  static const _storageKey = 'status_v2_beta_enabled';
  static const posthogFlag = 'enable-api-v2-beta';

  final FlutterSecureStorage _storage = const FlutterSecureStorage();
  bool _enabled = false;
  bool _loaded = false;

  bool get isEnabled => _enabled;

  String get apiBasePath => _enabled ? '/api/v2' : '/api/v1';

  Future<void> load() async {
    if (_loaded) return;
    final stored = await _storage.read(key: _storageKey);
    if (stored != null) {
      _enabled = stored == 'true';
    } else {
      final envDefault = dotenv.maybeGet('V2_BETA_ENABLED')?.toLowerCase() == 'true';
      final flag = await FeatureFlagService.instance.isFeatureEnabled(
        posthogFlag,
        defaultValue: envDefault,
      );
      _enabled = flag;
    }
    _loaded = true;
  }

  Future<void> setEnabled(bool value) async {
    _enabled = value;
    await _storage.write(key: _storageKey, value: value ? 'true' : 'false');
    FeatureFlagService.instance.track('v2_beta_toggled', properties: {'enabled': value});
    debugPrint('[V2Beta] enabled=$_enabled');
  }

  /// Probe V2 capability endpoint when beta is on.
  Future<Map<String, dynamic>?> fetchCapabilities(ApiService api) async {
    if (!_enabled) return null;
    try {
      return await api.fetchV2Version();
    } catch (_) {
      return null;
    }
  }
}

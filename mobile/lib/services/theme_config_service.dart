import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:http/http.dart' as http;

import '../config/api_config.dart';
import '../models/theme_config.dart';

/// Fetches and caches tenant-specific white-label theme at startup.
class ThemeConfigService extends ChangeNotifier {
  ThemeConfigService({http.Client? client}) : _client = client ?? http.Client();

  final http.Client _client;
  ThemeConfig _config = ThemeConfig.defaults;
  String? _tenantSlug;
  bool _loaded = false;

  ThemeConfig get config => _config;
  String? get tenantSlug => _tenantSlug;
  bool get isLoaded => _loaded;

  String get tenantHeaderSlug =>
      _tenantSlug ?? dotenv.maybeGet('TENANT_SLUG') ?? 'default';

  Future<ThemeConfig> load({String? slug}) async {
    _tenantSlug = slug ?? dotenv.maybeGet('TENANT_SLUG') ?? 'default';

    try {
      final uri = Uri.parse('${ApiConfig.baseUrl}/tenant/theme');
      final response = await _client.get(uri, headers: {
        'Accept': 'application/json',
        'X-Tenant-Slug': _tenantSlug!,
      });

      if (response.statusCode == 200) {
        final body = jsonDecode(response.body) as Map<String, dynamic>;
        final theme = body['data']?['theme'] as Map<String, dynamic>?;
        if (theme != null) {
          _config = ThemeConfig.fromJson(theme);
        }
      }
    } catch (_) {
      _config = ThemeConfig.defaults;
    }

    _loaded = true;
    notifyListeners();
    return _config;
  }
}

final themeConfigService = ThemeConfigService();

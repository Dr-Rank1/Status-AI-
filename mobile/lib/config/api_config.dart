import 'package:flutter_dotenv/flutter_dotenv.dart';

abstract final class ApiConfig {
  /// Production default; override via `.env` or `--dart-define`.
  static String get baseUrl {
    final fromDotenv = dotenv.maybeGet('API_BASE_URL');
    if (fromDotenv != null && fromDotenv.isNotEmpty) return fromDotenv;

    return const String.fromEnvironment(
      'API_BASE_URL',
      defaultValue: 'https://api.status.app/api/v1',
    );
  }

  static String get socketUrl {
    final fromDotenv = dotenv.maybeGet('SOCKET_URL');
    if (fromDotenv != null && fromDotenv.isNotEmpty) return fromDotenv;

    return const String.fromEnvironment(
      'SOCKET_URL',
      defaultValue: 'https://api.status.app',
    );
  }
}

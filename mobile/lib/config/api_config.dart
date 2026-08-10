abstract final class ApiConfig {
  /// Android emulator: 10.0.2.2; iOS simulator: localhost; device: your LAN IP.
  static const baseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://localhost:3000/api/v1',
  );
}

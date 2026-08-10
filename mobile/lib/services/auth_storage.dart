import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class AuthStorage {
  AuthStorage({FlutterSecureStorage? storage})
      : _storage = storage ?? const FlutterSecureStorage();

  static const _tokenKey = 'status_jwt';

  final FlutterSecureStorage _storage;

  Future<String?> getToken() => _storage.read(key: _tokenKey);

  Future<void saveToken(String token) => _storage.write(key: _tokenKey, value: token);

  Future<void clearToken() => _storage.delete(key: _tokenKey);
}

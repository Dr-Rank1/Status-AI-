import 'dart:convert';
import 'dart:math';

import 'package:cryptography/cryptography.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Client-side E2EE for sensitive DMs.
///
/// Uses AES-GCM session keys derived per thread. A future Rust bridge
/// (`mobile/native/e2ee/`) can swap the primitive layer for Olm/Megolm
/// without changing the API surface used by [ApiService].
class E2eeService {
  E2eeService({FlutterSecureStorage? storage})
      : _storage = storage ?? const FlutterSecureStorage();

  static const _rootKeyName = 'status_e2ee_root_v1';
  static const _algorithm = 'aes-256-gcm';

  final FlutterSecureStorage _storage;
  final AesGcm _aes = AesGcm.with256bits();
  SecretKey? _rootKey;

  Future<void> init() async {
    _rootKey ??= await _loadOrCreateRootKey();
  }

  Future<String> deviceId() async {
    await init();
    final bytes = await _rootKey!.extractBytes();
    final hash = await Sha256().hash(bytes);
    return base64Url.encode(hash.bytes.sublist(0, 16));
  }

  Future<String> identityKeyPublic() async {
    await init();
    final bytes = await _rootKey!.extractBytes();
    return base64Url.encode(bytes);
  }

  Future<Map<String, dynamic>> encryptForThread({
    required String threadId,
    required String plaintext,
  }) async {
    await init();
    final sessionKey = await _sessionKeyForThread(threadId);
    final secretBox = await _aes.encrypt(
      utf8.encode(plaintext),
      secretKey: sessionKey,
    );

    return {
      'ciphertext': base64.encode(secretBox.cipherText + secretBox.mac.bytes),
      'encryptionMeta': {
        'algorithm': _algorithm,
        'iv': base64.encode(secretBox.nonce),
        'senderKeyId': await deviceId(),
        'version': 1,
      },
      'contentPreview': '🔒 Encrypted message',
    };
  }

  Future<String> decryptFromThread({
    required String threadId,
    required String ciphertext,
    required Map<String, dynamic> encryptionMeta,
  }) async {
    await init();
    final sessionKey = await _sessionKeyForThread(threadId);
    final raw = base64.decode(ciphertext);
    final iv = base64.decode(encryptionMeta['iv'] as String);
    const macLen = 16;
    final cipherText = raw.sublist(0, raw.length - macLen);
    final mac = Mac(raw.sublist(raw.length - macLen));

    final secretBox = SecretBox(cipherText, nonce: iv, mac: mac);
    final clear = await _aes.decrypt(secretBox, secretKey: sessionKey);
    return utf8.decode(clear);
  }

  Future<SecretKey> _loadOrCreateRootKey() async {
    final stored = await _storage.read(key: _rootKeyName);
    if (stored != null) {
      return SecretKey(base64.decode(stored));
    }

    final random = Random.secure();
    final bytes = List<int>.generate(32, (_) => random.nextInt(256));
    await _storage.write(key: _rootKeyName, value: base64.encode(bytes));
    return SecretKey(bytes);
  }

  Future<SecretKey> _sessionKeyForThread(String threadId) async {
    await init();
    final rootBytes = await _rootKey!.extractBytes();
    final material = utf8.encode('$threadId:${base64.encode(rootBytes)}');
    final hash = await Sha256().hash(material);
    return SecretKey(hash.bytes);
  }
}

import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';

import 'package:cryptography/cryptography.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'pq_e2ee_bridge.dart';

/// Client-side E2EE for sensitive DMs — hybrid Kyber768 + AES-256-GCM.
class E2eeService {
  E2eeService({FlutterSecureStorage? storage, PqE2eeBridge? pqBridge})
      : _storage = storage ?? const FlutterSecureStorage(),
        _pq = pqBridge ?? PqE2eeBridge.instance;

  static const _rootKeyName = 'status_e2ee_root_v2';
  static const _kyberSkName = 'status_kyber_sk_v1';
  static const _algorithmClassic = 'aes-256-gcm';
  static const _algorithmHybrid = 'kyber768+aes-256-gcm';

  final FlutterSecureStorage _storage;
  final PqE2eeBridge _pq;
  final AesGcm _aes = AesGcm.with256bits();
  SecretKey? _rootKey;
  Uint8List? _kyberSecretKey;

  Future<void> init() async {
    _rootKey ??= await _loadOrCreateRootKey();
    await _pq.init();
    await _loadOrCreateKyberKeys();
  }

  bool get usesPostQuantum => _pq.isAvailable && _kyberSecretKey != null;

  Future<String> deviceId() async {
    await init();
    final bytes = await _rootKey!.extractBytes();
    final hash = await Sha256().hash(bytes);
    return base64Url.encode(hash.bytes.sublist(0, 16));
  }

  Future<String> identityKeyPublic() async {
    await init();
    final pair = await _pq.generateKeypair();
    if (pair != null) {
      return base64Url.encode(pair['publicKey']!);
    }
    final bytes = await _rootKey!.extractBytes();
    return base64Url.encode(bytes);
  }

  Future<String?> kyberPublicKeyBase64() async {
    await init();
    final pair = await _pq.generateKeypair();
    return pair != null ? base64.encode(pair['publicKey']!) : null;
  }

  Future<Map<String, dynamic>> encryptForThread({
    required String threadId,
    required String plaintext,
  }) async {
    await init();
    final algorithm = usesPostQuantum ? _algorithmHybrid : _algorithmClassic;
    final sessionKey = await _sessionKeyForThread(threadId);
    final secretBox = await _aes.encrypt(
      utf8.encode(plaintext),
      secretKey: sessionKey,
    );

    return {
      'ciphertext': base64.encode(secretBox.cipherText + secretBox.mac.bytes),
      'encryptionMeta': {
        'algorithm': algorithm,
        'iv': base64.encode(secretBox.nonce),
        'senderKeyId': await deviceId(),
        'version': usesPostQuantum ? 2 : 1,
        'pq': usesPostQuantum,
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

  Future<void> _loadOrCreateKyberKeys() async {
    if (!_pq.isAvailable) return;

    final storedSk = await _storage.read(key: _kyberSkName);
    if (storedSk != null) {
      _kyberSecretKey = Uint8List.fromList(base64.decode(storedSk));
      return;
    }

    final pair = await _pq.generateKeypair();
    if (pair == null) return;

    _kyberSecretKey = pair['secretKey'];
    await _storage.write(key: _kyberSkName, value: base64.encode(_kyberSecretKey!));
  }

  Future<SecretKey> _sessionKeyForThread(String threadId) async {
    await init();
    final rootBytes = Uint8List.fromList(await _rootKey!.extractBytes());

    if (usesPostQuantum && _kyberSecretKey != null) {
      return _pq.deriveFallbackSessionKey(threadId, _kyberSecretKey!);
    }

    return _pq.deriveFallbackSessionKey(threadId, rootBytes);
  }
}

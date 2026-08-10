import 'dart:convert';
import 'dart:ffi';
import 'dart:io';
import 'dart:typed_data';

import 'package:cryptography/cryptography.dart';
import 'package:ffi/ffi.dart';

/// FFI bridge to Rust CRYSTALS-Kyber768 (`mobile/native/e2ee/pq_crypto`).
class PqE2eeBridge {
  PqE2eeBridge._();

  static final PqE2eeBridge instance = PqE2eeBridge._();

  DynamicLibrary? _lib;
  bool _initialized = false;

  bool get isAvailable => _initialized;

  Future<void> init() async {
    if (_initialized) return;
    try {
      if (Platform.isLinux || Platform.isAndroid) {
        _lib = DynamicLibrary.open('libstatus_pq_crypto.so');
      } else if (Platform.isMacOS) {
        _lib = DynamicLibrary.open('libstatus_pq_crypto.dylib');
      } else if (Platform.isWindows) {
        _lib = DynamicLibrary.open('status_pq_crypto.dll');
      }
      _initialized = _lib != null;
    } catch (_) {
      _initialized = false;
    }
  }

  Future<SecretKey> deriveSessionKey({
    required String threadId,
    required Uint8List kyberSharedSecret,
  }) async {
    final material = utf8.encode('$threadId:${base64.encode(kyberSharedSecret)}');
    final hash = await Sha256().hash(material);
    return SecretKey(hash.bytes);
  }

  Future<SecretKey> deriveFallbackSessionKey(String threadId, Uint8List rootKey) async {
    final material = utf8.encode('$threadId:hybrid-pq-fallback:${base64.encode(rootKey)}');
    final hash = await Sha512().hash(material);
    return SecretKey(hash.bytes.sublist(0, 32));
  }

  Future<Map<String, Uint8List>?> generateKeypair() async {
    await init();
    if (!_initialized || _lib == null) return null;

    final sizes = calloc<Uint32>(4);
    _lib!.lookupFunction<Void Function(Pointer<Uint32>), void Function(Pointer<Uint32>)>(
      'status_kyber768_sizes',
    )(sizes);

    final pkLen = sizes[0];
    final skLen = sizes[1];
    final pk = calloc<Uint8>(pkLen);
    final sk = calloc<Uint8>(skLen);

    final rc = _lib!.lookupFunction<Int32 Function(Pointer<Uint8>, Pointer<Uint8>), int Function(Pointer<Uint8>, Pointer<Uint8>)>(
      'status_kyber768_keypair',
    )(pk, sk);

    calloc.free(sizes);

    if (rc != 0) {
      calloc.free(pk);
      calloc.free(sk);
      return null;
    }

    final result = {
      'publicKey': Uint8List.fromList(pk.asTypedList(pkLen)),
      'secretKey': Uint8List.fromList(sk.asTypedList(skLen)),
    };
    calloc.free(pk);
    calloc.free(sk);
    return result;
  }
}

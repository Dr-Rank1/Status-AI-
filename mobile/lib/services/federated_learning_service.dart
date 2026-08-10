import 'dart:convert';
import 'dart:math';

import 'package:cryptography/cryptography.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// On-device federated learning — trains local preference weights without raw chat export.
class FederatedLearningService {
  FederatedLearningService({FlutterSecureStorage? storage})
      : _storage = storage ?? const FlutterSecureStorage();

  static const _weightsKey = 'status_fed_local_weights_v1';
  static const _commitmentKey = 'status_fed_commitment_v1';
  static const weightDim = 32;

  final FlutterSecureStorage _storage;
  final Random _random = Random.secure();

  List<double> _localWeights = List.filled(weightDim, 0);
  bool _loaded = false;

  Future<void> init() async {
    if (_loaded) return;
    final stored = await _storage.read(key: _weightsKey);
    if (stored != null) {
      final decoded = jsonDecode(stored) as List<dynamic>;
      _localWeights = decoded.map((e) => (e as num).toDouble()).toList();
    }
    _loaded = true;
  }

  Future<String> userCommitment() async {
    final existing = await _storage.read(key: _commitmentKey);
    if (existing != null) return existing;

    final bytes = List<int>.generate(16, (_) => _random.nextInt(256));
    final hash = await Sha256().hash(bytes);
    final commitment = base64Url.encode(hash.bytes);
    await _storage.write(key: _commitmentKey, value: commitment);
    return commitment;
  }

  /// Record interaction habit signal locally (never leaves device as raw text).
  Future<void> recordInteractionSignal({
    required String channel,
    required int messageLength,
    required bool positive,
  }) async {
    await init();
    final channelIdx = channel.hashCode.abs() % weightDim;
    final delta = (positive ? 0.02 : -0.01) * (messageLength.clamp(1, 200) / 100);
    _localWeights[channelIdx] = (_localWeights[channelIdx] + delta).clamp(-1.0, 1.0);
    await _storage.write(key: _weightsKey, value: jsonEncode(_localWeights));
  }

  Future<Map<String, dynamic>> buildContributionPayload({int sampleCount = 1}) async {
    await init();
    return {
      'weights': _localWeights,
      'version': 1,
      'sampleCount': sampleCount,
    };
  }

  Future<void applyGlobalWeights(List<double> global) async {
    await init();
    if (global.length != weightDim) return;
    for (var i = 0; i < weightDim; i++) {
      _localWeights[i] = (_localWeights[i] * 0.7) + (global[i] * 0.3);
    }
    await _storage.write(key: _weightsKey, value: jsonEncode(_localWeights));
  }
}

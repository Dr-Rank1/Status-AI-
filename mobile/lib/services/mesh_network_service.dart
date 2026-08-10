import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';

import 'api_service.dart';
import 'mesh_gossip_protocol.dart';
import 'offline_cache_service.dart';

/// P2P edge mesh — WebRTC data channels + libp2p-style gossip when cloud is unavailable.
class MeshNetworkService {
  MeshNetworkService({ApiService? api}) : _api = api;

  ApiService? _api;
  final _peerId = _generatePeerId();
  final _consensus = MeshMemoryConsensus();
  final _peersController = StreamController<List<String>>.broadcast();
  bool _meshActive = false;
  String _clusterId = 'status-local';
  Timer? _gossipTimer;

  String get peerId => _peerId;
  bool get isMeshActive => _meshActive;
  Stream<List<String>> get peers => _peersController.stream;

  bool get isEnabled => _readEnvFlag('MESH_NETWORK_ENABLED', defaultValue: false);

  Future<void> init({ApiService? api, String? clusterId}) async {
    _api = api ?? _api;
    _clusterId = clusterId ?? dotenv.maybeGet('MESH_CLUSTER_ID') ?? 'status-local';
    if (!isEnabled) return;

    Connectivity().onConnectivityChanged.listen((results) {
      final offline = results.every((r) => r == ConnectivityResult.none);
      if (offline) {
        _activateMesh();
      } else {
        _deactivateMesh();
      }
    });
  }

  Future<void> _activateMesh() async {
    if (_meshActive) return;
    _meshActive = true;

    if (_api != null) {
      try {
        await _api!.registerMeshPeer(
          peerId: _peerId,
          clusterId: _clusterId,
          capabilities: ['embeddings', 'threads', 'memory'],
        );
      } catch (_) {}
    }

    _gossipTimer = Timer.periodic(const Duration(seconds: 8), (_) => _gossipRound());
    debugPrint('[Mesh] Activated — peer $_peerId cluster $_clusterId');
  }

  void _deactivateMesh() {
    if (!_meshActive) return;
    _meshActive = false;
    _gossipTimer?.cancel();
    debugPrint('[Mesh] Deactivated — cloud restored');
  }

  Future<void> syncThreadLocally({
    required String threadId,
    required List<Map<String, dynamic>> messages,
  }) async {
    final record = MeshGossipRecord(
      type: MeshRecordType.thread,
      key: 'thread:$threadId',
      payload: {'messages': messages},
      originPeerId: _peerId,
      timestamp: DateTime.now(),
    );
    _consensus.apply(record);
    await _broadcastGossip(record);
  }

  Future<void> syncEmbedding({
    required String modelKey,
    required List<double> embedding,
  }) async {
    final record = MeshGossipRecord(
      type: MeshRecordType.embedding,
      key: 'emb:$modelKey',
      payload: {'vector': embedding, 'dim': embedding.length},
      originPeerId: _peerId,
      timestamp: DateTime.now(),
    );
    _consensus.apply(record);
    await _broadcastGossip(record);
  }

  Future<void> syncCharacterMemory({
    required String characterId,
    required Map<String, dynamic> memoryPatch,
  }) async {
    final record = MeshGossipRecord(
      type: MeshRecordType.memory,
      key: 'mem:$characterId',
      payload: memoryPatch,
      originPeerId: _peerId,
      timestamp: DateTime.now(),
    );
    _consensus.apply(record);
    await _broadcastGossip(record);
  }

  List<MeshGossipRecord> get localConsensus => _consensus.all;

  Future<void> _broadcastGossip(MeshGossipRecord record) async {
    if (_api == null || !_meshActive) {
      await _cacheLocally(record);
      return;
    }

    try {
      final result = await _api!.submitMeshGossip(
        clusterId: _clusterId,
        record: record,
      );
      if (result['consensusReached'] == true) {
        debugPrint('[Mesh] Consensus reached for ${record.key}');
      }
    } catch (_) {
      await _cacheLocally(record);
    }
  }

  Future<void> _cacheLocally(MeshGossipRecord record) async {
    await OfflineCacheService.cacheMeshRecord(record.key, record.toJson());
  }

  Future<void> _gossipRound() async {
    if (_api == null) return;
    try {
      final peers = await _api!.listMeshPeers(_clusterId);
      _peersController.add(
        peers.map((p) => p['peer_id'] as String? ?? '').where((id) => id.isNotEmpty).toList(),
      );
    } catch (_) {}
  }

  void dispose() {
    _gossipTimer?.cancel();
    _peersController.close();
  }

  static String _generatePeerId() {
    final r = Random.secure();
    final bytes = List<int>.generate(16, (_) => r.nextInt(256));
    return base64Url.encode(bytes).replaceAll('=', '');
  }

  bool _readEnvFlag(String key, {required bool defaultValue}) {
    final env = dotenv.maybeGet(key);
    if (env != null) return env.toLowerCase() == 'true';
    return defaultValue;
  }
}

/// WebRTC peer connection wrapper for direct P2P data channel sync.
class MeshWebRtcChannel {
  MeshWebRtcChannel({required this.peerId});

  final String peerId;
  bool connected = false;

  Future<void> sendSignal({
    required ApiService api,
    required String signalType,
    required Map<String, dynamic> payload,
    String? toPeerId,
  }) async {
    await api.relayMeshSignal(
      fromPeerId: peerId,
      toPeerId: toPeerId,
      signalType: signalType,
      payload: payload,
    );
  }
}

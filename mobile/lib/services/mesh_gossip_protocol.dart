import 'dart:convert';

/// Libp2p-inspired gossip record types for mesh consensus.
enum MeshRecordType {
  thread,
  embedding,
  memory,
  characterState;

  String get apiValue => name == 'characterState' ? 'character_state' : name;
}

class MeshGossipRecord {
  const MeshGossipRecord({
    required this.type,
    required this.key,
    required this.payload,
    required this.originPeerId,
    required this.timestamp,
  });

  final MeshRecordType type;
  final String key;
  final Map<String, dynamic> payload;
  final String originPeerId;
  final DateTime timestamp;

  Map<String, dynamic> toJson() => {
        'recordType': type.apiValue,
        'recordKey': key,
        'payload': payload,
        'originPeerId': originPeerId,
        'timestamp': timestamp.toIso8601String(),
      };

  factory MeshGossipRecord.fromJson(Map<String, dynamic> json) {
    final typeStr = json['recordType'] as String? ?? 'thread';
    return MeshGossipRecord(
      type: MeshRecordType.values.firstWhere(
        (t) => t.apiValue == typeStr,
        orElse: () => MeshRecordType.thread,
      ),
      key: json['recordKey'] as String? ?? '',
      payload: Map<String, dynamic>.from(json['payload'] as Map? ?? {}),
      originPeerId: json['originPeerId'] as String? ?? 'unknown',
      timestamp: DateTime.tryParse(json['timestamp'] as String? ?? '') ?? DateTime.now(),
    );
  }

  List<int> encode() => utf8.encode(jsonEncode(toJson()));
}

/// CRDT-lite memory consensus — latest timestamp wins per key.
class MeshMemoryConsensus {
  final _store = <String, MeshGossipRecord>{};

  void apply(MeshGossipRecord record) {
    final existing = _store[record.key];
    if (existing == null || record.timestamp.isAfter(existing.timestamp)) {
      _store[record.key] = record;
    }
  }

  MeshGossipRecord? get(String key) => _store[key];
  List<MeshGossipRecord> get all => _store.values.toList();
}

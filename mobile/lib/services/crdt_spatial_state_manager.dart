import 'dart:async';
import 'dart:convert';
import 'dart:math';

/// Phase 36 — CRDT spatial state manager for cross-world metaverse sync.
///
/// Engines: Flutter Spatial UI, Unity, Unreal Engine 5 / OpenXR.
/// Uses LWW-Register (coords), OR-Set (inventory), LWW-Map (interaction flags).
class CrdtSpatialStateManager {
  CrdtSpatialStateManager({String? replicaId})
      : replicaId = replicaId ?? _genReplicaId();

  final String replicaId;
  final _coords = <String, LwwRegister<SpatialPose>>{};
  final _inventory = <String, OrSet<String>>{};
  final _interactions = <String, LwwMap<String, dynamic>>{};
  final _controller = StreamController<SpatialWorldSnapshot>.broadcast();
  int _lamport = 0;

  Stream<SpatialWorldSnapshot> get onChange => _controller.stream;

  int _tick() => ++_lamport;

  /// Update character world pose (UE5 / Unity / Flutter).
  void upsertPose({
    required String characterId,
    required SpatialPose pose,
    String? engine,
  }) {
    final key = 'pose:$characterId';
    final reg = _coords.putIfAbsent(key, () => LwwRegister());
    reg.set(
      pose.copyWith(engine: engine ?? pose.engine, replicaId: replicaId),
      _tick(),
      replicaId,
    );
    _emit();
  }

  SpatialPose? poseOf(String characterId) => _coords['pose:$characterId']?.value;

  void addInventoryItem({required String characterId, required String itemId}) {
    final set = _inventory.putIfAbsent(characterId, () => OrSet());
    set.add(itemId, replicaId, _tick());
    _emit();
  }

  void removeInventoryItem({required String characterId, required String itemId}) {
    _inventory[characterId]?.remove(itemId, replicaId, _tick());
    _emit();
  }

  Set<String> inventoryOf(String characterId) =>
      _inventory[characterId]?.values ?? <String>{};

  void setInteraction({
    required String characterId,
    required String key,
    required dynamic value,
  }) {
    final map = _interactions.putIfAbsent(characterId, () => LwwMap());
    map.set(key, value, _tick(), replicaId);
    _emit();
  }

  Map<String, dynamic> interactionsOf(String characterId) =>
      _interactions[characterId]?.toMap() ?? {};

  /// Merge remote CRDT document (from another engine / peer).
  void merge(Map<String, dynamic> doc) {
    final remoteLamport = doc['lamport'] as int? ?? 0;
    if (remoteLamport > _lamport) _lamport = remoteLamport;

    final poses = doc['poses'] as Map<String, dynamic>? ?? {};
    for (final e in poses.entries) {
      final reg = _coords.putIfAbsent(e.key, () => LwwRegister());
      reg.merge(LwwRegister.fromJson(
        Map<String, dynamic>.from(e.value as Map),
        (m) => SpatialPose.fromJson(Map<String, dynamic>.from(m)),
      ));
    }

    final inv = doc['inventory'] as Map<String, dynamic>? ?? {};
    for (final e in inv.entries) {
      final set = _inventory.putIfAbsent(e.key, () => OrSet());
      set.merge(OrSet.fromJson(Map<String, dynamic>.from(e.value as Map)));
    }

    final ix = doc['interactions'] as Map<String, dynamic>? ?? {};
    for (final e in ix.entries) {
      final map = _interactions.putIfAbsent(e.key, () => LwwMap());
      map.merge(LwwMap.fromJson(Map<String, dynamic>.from(e.value as Map)));
    }

    _emit();
  }

  Map<String, dynamic> toDocument() => {
        'v': 1,
        'replicaId': replicaId,
        'lamport': _lamport,
        'poses': _coords.map((k, v) => MapEntry(k, v.toJson((p) => p.toJson()))),
        'inventory': _inventory.map((k, v) => MapEntry(k, v.toJson())),
        'interactions': _interactions.map((k, v) => MapEntry(k, v.toJson())),
      };

  String encode() => jsonEncode(toDocument());

  void decodeMerge(String raw) => merge(jsonDecode(raw) as Map<String, dynamic>);

  SpatialWorldSnapshot snapshot() => SpatialWorldSnapshot(
        replicaId: replicaId,
        lamport: _lamport,
        poses: {
          for (final e in _coords.entries)
            if (e.value.value != null) e.key.replaceFirst('pose:', ''): e.value.value!,
        },
        inventory: {
          for (final e in _inventory.entries) e.key: e.value.values,
        },
        interactions: {
          for (final e in _interactions.entries) e.key: e.value.toMap(),
        },
      );

  void _emit() => _controller.add(snapshot());

  void dispose() => _controller.close();

  static String _genReplicaId() {
    final r = Random.secure();
    return 'rep-${List.generate(4, (_) => r.nextInt(256).toRadixString(16).padLeft(2, '0')).join()}';
  }
}

class SpatialPose {
  const SpatialPose({
    required this.x,
    required this.y,
    required this.z,
    this.yaw = 0,
    this.pitch = 0,
    this.roll = 0,
    this.engine = 'flutter',
    this.replicaId,
  });

  final double x, y, z;
  final double yaw, pitch, roll;
  final String engine;
  final String? replicaId;

  SpatialPose copyWith({
    double? x,
    double? y,
    double? z,
    double? yaw,
    double? pitch,
    double? roll,
    String? engine,
    String? replicaId,
  }) =>
      SpatialPose(
        x: x ?? this.x,
        y: y ?? this.y,
        z: z ?? this.z,
        yaw: yaw ?? this.yaw,
        pitch: pitch ?? this.pitch,
        roll: roll ?? this.roll,
        engine: engine ?? this.engine,
        replicaId: replicaId ?? this.replicaId,
      );

  Map<String, dynamic> toJson() => {
        'x': x,
        'y': y,
        'z': z,
        'yaw': yaw,
        'pitch': pitch,
        'roll': roll,
        'engine': engine,
        'replicaId': replicaId,
      };

  factory SpatialPose.fromJson(Map<String, dynamic> j) => SpatialPose(
        x: (j['x'] as num?)?.toDouble() ?? 0,
        y: (j['y'] as num?)?.toDouble() ?? 0,
        z: (j['z'] as num?)?.toDouble() ?? 0,
        yaw: (j['yaw'] as num?)?.toDouble() ?? 0,
        pitch: (j['pitch'] as num?)?.toDouble() ?? 0,
        roll: (j['roll'] as num?)?.toDouble() ?? 0,
        engine: j['engine'] as String? ?? 'flutter',
        replicaId: j['replicaId'] as String?,
      );
}

class SpatialWorldSnapshot {
  const SpatialWorldSnapshot({
    required this.replicaId,
    required this.lamport,
    required this.poses,
    required this.inventory,
    required this.interactions,
  });

  final String replicaId;
  final int lamport;
  final Map<String, SpatialPose> poses;
  final Map<String, Set<String>> inventory;
  final Map<String, Map<String, dynamic>> interactions;
}

/// Last-Writer-Wins register.
class LwwRegister<T> {
  T? value;
  int timestamp = 0;
  String writer = '';

  void set(T v, int ts, String replica) {
    if (ts > timestamp || (ts == timestamp && replica.compareTo(writer) > 0)) {
      value = v;
      timestamp = ts;
      writer = replica;
    }
  }

  void merge(LwwRegister<T> other) {
    if (other.value != null) set(other.value as T, other.timestamp, other.writer);
  }

  Map<String, dynamic> toJson(Map<String, dynamic> Function(T) enc) => {
        'value': value == null ? null : enc(value as T),
        'ts': timestamp,
        'writer': writer,
      };

  static LwwRegister<T> fromJson<T>(
    Map<String, dynamic> j,
    T Function(Map<String, dynamic>) dec,
  ) {
    final r = LwwRegister<T>();
    final raw = j['value'];
    if (raw is Map) r.value = dec(Map<String, dynamic>.from(raw));
    r.timestamp = j['ts'] as int? ?? 0;
    r.writer = j['writer'] as String? ?? '';
    return r;
  }
}

/// Observed-Remove Set.
class OrSet<T> {
  final _adds = <T, Set<String>>{};
  final _removes = <T, Set<String>>{};

  void add(T value, String replica, int tag) {
    final token = '$replica:$tag';
    _adds.putIfAbsent(value, () => {}).add(token);
  }

  void remove(T value, String replica, int tag) {
    final tokens = _adds[value];
    if (tokens == null) return;
    _removes.putIfAbsent(value, () => {}).addAll(tokens);
  }

  Set<T> get values {
    final out = <T>{};
    for (final e in _adds.entries) {
      final removed = _removes[e.key] ?? {};
      if (e.value.any((t) => !removed.contains(t))) out.add(e.key);
    }
    return out;
  }

  void merge(OrSet<T> other) {
    for (final e in other._adds.entries) {
      _adds.putIfAbsent(e.key, () => {}).addAll(e.value);
    }
    for (final e in other._removes.entries) {
      _removes.putIfAbsent(e.key, () => {}).addAll(e.value);
    }
  }

  Map<String, dynamic> toJson() => {
        'adds': _adds.map((k, v) => MapEntry(k.toString(), v.toList())),
        'removes': _removes.map((k, v) => MapEntry(k.toString(), v.toList())),
      };

  static OrSet<String> fromJson(Map<String, dynamic> j) {
    final s = OrSet<String>();
    final adds = j['adds'] as Map<String, dynamic>? ?? {};
    for (final e in adds.entries) {
      s._adds[e.key] = Set<String>.from(e.value as List? ?? []);
    }
    final removes = j['removes'] as Map<String, dynamic>? ?? {};
    for (final e in removes.entries) {
      s._removes[e.key] = Set<String>.from(e.value as List? ?? []);
    }
    return s;
  }
}

/// LWW map of keys.
class LwwMap<K, V> {
  final _regs = <K, LwwRegister<V>>{};

  void set(K key, V value, int ts, String replica) {
    _regs.putIfAbsent(key, () => LwwRegister()).set(value, ts, replica);
  }

  Map<K, V> toMap() => {
        for (final e in _regs.entries)
          if (e.value.value != null) e.key: e.value.value as V,
      };

  void merge(LwwMap<K, V> other) {
    for (final e in other._regs.entries) {
      _regs.putIfAbsent(e.key, () => LwwRegister()).merge(e.value);
    }
  }

  Map<String, dynamic> toJson() => {
        for (final e in _regs.entries)
          e.key.toString(): {
            'value': e.value.value,
            'ts': e.value.timestamp,
            'writer': e.value.writer,
          },
      };

  static LwwMap<String, dynamic> fromJson(Map<String, dynamic> j) {
    final m = LwwMap<String, dynamic>();
    for (final e in j.entries) {
      final raw = Map<String, dynamic>.from(e.value as Map);
      final reg = LwwRegister<dynamic>()
        ..value = raw['value']
        ..timestamp = raw['ts'] as int? ?? 0
        ..writer = raw['writer'] as String? ?? '';
      m._regs[e.key] = reg;
    }
    return m;
  }
}

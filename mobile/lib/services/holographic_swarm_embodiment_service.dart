import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/foundation.dart';

import '../utils/spatial_platform.dart';
import 'realtime_service.dart';

/// Phase 39 — OpenXR / spatial holographic rendering of the agent swarm.
///
/// Positions agents in a shared XR coordinate frame and animates handoffs
/// (e.g. Research → Dialogue beam transfer) for the "digital assembly line".
class HolographicSwarmEmbodimentService {
  HolographicSwarmEmbodimentService({RealtimeService? realtime}) : _realtime = realtime;

  RealtimeService? _realtime;
  StreamSubscription<Map<String, dynamic>>? _sub;
  final _agents = <String, HologramAgent>{};
  final _controller = StreamController<HologramFrame>.broadcast();
  final _handoffController = StreamController<HologramHandoff>.broadcast();

  Map<String, HologramPose> _layout = Map<String, HologramPose>.from(_defaultLayout);
  double _t = 0;
  Timer? _ticker;

  Stream<HologramFrame> get onFrame => _controller.stream;
  Stream<HologramHandoff> get onHandoff => _handoffController.stream;
  List<HologramAgent> get agents => List.unmodifiable(_agents.values);

  bool get isSpatial => SpatialPlatform.isSpatialEnvironment;

  void attachRealtime(RealtimeService realtime) {
    _realtime = realtime;
  }

  /// Seed default swarm holograms (OpenXR meters, Y-up).
  void bootstrap({String? topologyId}) {
    _agents
      ..clear()
      ..addAll({
        for (final e in _layout.entries)
          e.key: HologramAgent(
            id: e.key,
            pose: e.value,
            status: e.key.contains('puppeteer') ? HologramStatus.conductor : HologramStatus.idle,
          ),
      });
    _emitFrame();
    _realtime?.joinSwarmHologram(topologyId);
    _sub?.cancel();
    _sub = _realtime?.onSwarmHologram.listen(_onEvent);
    _ticker?.cancel();
    _ticker = Timer.periodic(const Duration(milliseconds: 33), (_) {
      _t += 0.033;
      _tickAnimations();
    });
    debugPrint('[Hologram] bootstrap spatial=$isSpatial agents=${_agents.length}');
  }

  void _onEvent(Map<String, dynamic> event) {
    final layout = event['layout'];
    if (layout is Map) {
      _layout = {
        for (final e in layout.entries)
          e.key.toString(): HologramPose.fromJson(Map<String, dynamic>.from(e.value as Map)),
      };
    }

    final type = event['type'] as String? ?? '';
    switch (type) {
      case 'topology_assembled':
      case 'topology_reconfigured':
        final topo = event['topology'];
        if (topo is Map && topo['nodes'] is List) {
          for (final n in topo['nodes'] as List) {
            if (n is! Map) continue;
            final id = n['id']?.toString() ?? '';
            if (id.isEmpty) continue;
            final pose = _layout[id] ?? HologramPose(x: 0, y: 1.5, z: -1.2);
            _agents[id] = HologramAgent(
              id: id,
              pose: pose,
              status: HologramStatus.active,
              role: n['role']?.toString(),
            );
          }
        }
        break;
      case 'agent_activate':
        final id = event['agentId']?.toString();
        if (id != null) {
          final existing = _agents[id];
          _agents[id] = (existing ??
                  HologramAgent(id: id, pose: _layout[id] ?? const HologramPose(x: 0, y: 1.5, z: -1.2)))
              .copyWith(status: HologramStatus.active, pulse: 1);
        }
        break;
      case 'agent_handoff':
        final from = event['from']?.toString() ?? '';
        final to = event['to']?.toString() ?? '';
        final handoff = HologramHandoff(
          fromId: from,
          toId: to,
          animation: event['animation']?.toString() ?? 'beam_transfer',
          startedAt: DateTime.now(),
          progress: 0,
        );
        _activeHandoff = handoff;
        _handoffController.add(handoff);
        break;
      case 'agent_quarantine':
        final id = event['agentId']?.toString();
        if (id != null && _agents[id] != null) {
          _agents[id] = _agents[id]!.copyWith(status: HologramStatus.quarantined, opacity: 0.35);
        }
        break;
      case 'topology_disbanded':
        for (final id in _agents.keys.toList()) {
          _agents[id] = _agents[id]!.copyWith(status: HologramStatus.idle, pulse: 0);
        }
        break;
    }
    _emitFrame();
  }

  HologramHandoff? _activeHandoff;

  void _tickAnimations() {
    var dirty = false;
    for (final e in _agents.entries) {
      final a = e.value;
      if (a.pulse > 0) {
        _agents[e.key] = a.copyWith(pulse: math.max(0, a.pulse - 0.04));
        dirty = true;
      }
      // Gentle hover for active holograms
      if (a.status == HologramStatus.active || a.status == HologramStatus.conductor) {
        final hover = math.sin(_t * 2 + a.pose.x) * 0.02;
        _agents[e.key] = _agents[e.key]!.copyWith(
          pose: a.pose.copyWith(y: (_layout[a.id]?.y ?? a.pose.y) + hover),
        );
        dirty = true;
      }
    }

    final h = _activeHandoff;
    if (h != null) {
      final next = h.progress + 0.04;
      if (next >= 1) {
        _activeHandoff = null;
        final to = _agents[h.toId];
        if (to != null) {
          _agents[h.toId] = to.copyWith(status: HologramStatus.active, pulse: 1);
        }
      } else {
        _activeHandoff = HologramHandoff(
          fromId: h.fromId,
          toId: h.toId,
          animation: h.animation,
          startedAt: h.startedAt,
          progress: next,
        );
        _handoffController.add(_activeHandoff!);
      }
      dirty = true;
    }

    if (dirty) _emitFrame();
  }

  /// OpenXR-ready render packet (consume from CustomPainter / platform view / UE bridge).
  void _emitFrame() {
    _controller.add(HologramFrame(
      agents: agents,
      handoff: _activeHandoff,
      openXr: OpenXrRenderPacket.fromAgents(agents, _activeHandoff),
      spatial: isSpatial,
      at: DateTime.now(),
    ));
  }

  void dispose() {
    _ticker?.cancel();
    _sub?.cancel();
    _controller.close();
    _handoffController.close();
  }
}

const _defaultLayout = {
  'status.puppeteer': HologramPose(x: 0, y: 1.6, z: -1.2, color: '#94a3b8', mesh: 'orb_conductor'),
  'status.research': HologramPose(x: -0.55, y: 1.55, z: -1.35, color: '#38bdf8', mesh: 'orb_research'),
  'status.dialogue': HologramPose(x: 0.55, y: 1.55, z: -1.35, color: '#a78bfa', mesh: 'orb_dialogue'),
  'status.tools': HologramPose(x: -0.85, y: 1.35, z: -1.1, color: '#34d399', mesh: 'orb_tools'),
  'status.transaction': HologramPose(x: 0.85, y: 1.35, z: -1.1, color: '#fbbf24', mesh: 'orb_tx'),
};

enum HologramStatus { idle, active, conductor, quarantined }

class HologramPose {
  const HologramPose({
    required this.x,
    required this.y,
    required this.z,
    this.color = '#ffffff',
    this.mesh = 'orb',
  });

  final double x, y, z;
  final String color;
  final String mesh;

  HologramPose copyWith({double? x, double? y, double? z, String? color, String? mesh}) =>
      HologramPose(
        x: x ?? this.x,
        y: y ?? this.y,
        z: z ?? this.z,
        color: color ?? this.color,
        mesh: mesh ?? this.mesh,
      );

  factory HologramPose.fromJson(Map<String, dynamic> j) => HologramPose(
        x: (j['x'] as num?)?.toDouble() ?? 0,
        y: (j['y'] as num?)?.toDouble() ?? 1.5,
        z: (j['z'] as num?)?.toDouble() ?? -1.2,
        color: j['color'] as String? ?? '#ffffff',
        mesh: j['mesh'] as String? ?? 'orb',
      );

  Map<String, dynamic> toOpenXr() => {
        'position': {'x': x, 'y': y, 'z': z},
        'color': color,
        'mesh': mesh,
      };
}

class HologramAgent {
  const HologramAgent({
    required this.id,
    required this.pose,
    this.status = HologramStatus.idle,
    this.role,
    this.pulse = 0,
    this.opacity = 1,
  });

  final String id;
  final HologramPose pose;
  final HologramStatus status;
  final String? role;
  final double pulse;
  final double opacity;

  HologramAgent copyWith({
    HologramPose? pose,
    HologramStatus? status,
    String? role,
    double? pulse,
    double? opacity,
  }) =>
      HologramAgent(
        id: id,
        pose: pose ?? this.pose,
        status: status ?? this.status,
        role: role ?? this.role,
        pulse: pulse ?? this.pulse,
        opacity: opacity ?? this.opacity,
      );
}

class HologramHandoff {
  const HologramHandoff({
    required this.fromId,
    required this.toId,
    required this.animation,
    required this.startedAt,
    required this.progress,
  });

  final String fromId;
  final String toId;
  final String animation;
  final DateTime startedAt;
  final double progress;
}

class HologramFrame {
  const HologramFrame({
    required this.agents,
    required this.openXr,
    required this.spatial,
    required this.at,
    this.handoff,
  });

  final List<HologramAgent> agents;
  final HologramHandoff? handoff;
  final OpenXrRenderPacket openXr;
  final bool spatial;
  final DateTime at;
}

/// Serializable packet for OpenXR / Unity / UE5 bridges.
class OpenXrRenderPacket {
  const OpenXrRenderPacket({required this.nodes, this.beams = const []});

  final List<Map<String, dynamic>> nodes;
  final List<Map<String, dynamic>> beams;

  factory OpenXrRenderPacket.fromAgents(List<HologramAgent> agents, HologramHandoff? handoff) {
    final nodes = agents
        .map((a) => {
              'id': a.id,
              'role': a.role,
              'status': a.status.name,
              'opacity': a.opacity,
              'pulse': a.pulse,
              ...a.pose.toOpenXr(),
            })
        .toList();
    final beams = <Map<String, dynamic>>[];
    if (handoff != null) {
      beams.add({
        'from': handoff.fromId,
        'to': handoff.toId,
        'animation': handoff.animation,
        't': handoff.progress,
      });
    }
    return OpenXrRenderPacket(nodes: nodes, beams: beams);
  }

  Map<String, dynamic> toJson() => {
        'protocol': 'openxr-hologram/v1',
        'nodes': nodes,
        'beams': beams,
      };
}

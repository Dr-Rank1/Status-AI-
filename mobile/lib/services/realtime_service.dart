import 'dart:async';

import 'package:socket_io_client/socket_io_client.dart' as io;

import '../config/api_config.dart';
import '../models/post.dart';
import '../models/session.dart';
import '../models/live_stream.dart';

typedef ReputationPayload = Map<String, dynamic>;
typedef MessagePayload = Map<String, dynamic>;

class RealtimeService {
  io.Socket? _socket;
  final _newPostController = StreamController<Post>.broadcast();
  final _newMessageController = StreamController<MessagePayload>.broadcast();
  final _reputationController = StreamController<ReputationPayload>.broadcast();
  final _energyController = StreamController<EnergyState>.broadcast();
  final _groupMessageController = StreamController<Map<String, dynamic>>.broadcast();
  final _narrativeController = StreamController<Map<String, dynamic>>.broadcast();
  final _liveChatController = StreamController<Map<String, dynamic>>.broadcast();
  final _liveTtsController = StreamController<Map<String, dynamic>>.broadcast();
  final _liveSpeakingController = StreamController<Map<String, dynamic>>.broadcast();
  final _webrtcSignalController = StreamController<Map<String, dynamic>>.broadcast();
  final _webrtcMultimodalController = StreamController<Map<String, dynamic>>.broadcast();
  final _swarmHologramController = StreamController<Map<String, dynamic>>.broadcast();
  final _voiceDuplexChunkController = StreamController<Map<String, dynamic>>.broadcast();
  final _voiceDuplexInterruptController = StreamController<Map<String, dynamic>>.broadcast();

  Stream<Post> get onNewPost => _newPostController.stream;
  Stream<MessagePayload> get onNewMessage => _newMessageController.stream;
  Stream<ReputationPayload> get onReputationChange => _reputationController.stream;
  Stream<EnergyState> get onEnergyRecharged => _energyController.stream;
  Stream<Map<String, dynamic>> get onGroupMessage => _groupMessageController.stream;
  Stream<Map<String, dynamic>> get onNarrativeEvent => _narrativeController.stream;
  Stream<Map<String, dynamic>> get onLiveChat => _liveChatController.stream;
  Stream<Map<String, dynamic>> get onLiveTtsChunk => _liveTtsController.stream;
  Stream<Map<String, dynamic>> get onLiveAiSpeaking => _liveSpeakingController.stream;
  Stream<Map<String, dynamic>> get onWebrtcSignal => _webrtcSignalController.stream;
  Stream<Map<String, dynamic>> get onWebrtcMultimodal => _webrtcMultimodalController.stream;
  Stream<Map<String, dynamic>> get onSwarmHologram => _swarmHologramController.stream;
  Stream<Map<String, dynamic>> get onVoiceDuplexChunk => _voiceDuplexChunkController.stream;
  Stream<Map<String, dynamic>> get onVoiceDuplexInterrupt => _voiceDuplexInterruptController.stream;

  bool get isConnected => _socket?.connected ?? false;

  void connect(String token) {
    disconnect();

    _socket = io.io(
      ApiConfig.socketUrl,
      io.OptionBuilder()
          .setTransports(['websocket'])
          .disableAutoConnect()
          .setAuth({'token': token})
          .enableReconnection()
          .setReconnectionAttempts(10)
          .setReconnectionDelay(2000)
          .build(),
    );

    _socket!
      ..onConnect((_) {})
      ..on('new_post', (data) {
        if (data is Map<String, dynamic>) {
          _newPostController.add(Post.fromJson(data));
        } else if (data is Map) {
          _newPostController.add(Post.fromJson(Map<String, dynamic>.from(data)));
        }
      })
      ..on('new_message', (data) {
        if (data is Map) {
          _newMessageController.add(Map<String, dynamic>.from(data));
        }
      })
      ..on('reputation_change', (data) {
        if (data is Map) {
          _reputationController.add(Map<String, dynamic>.from(data));
        }
      })
      ..on('energy_recharged', (data) {
        if (data is Map) {
          _energyController.add(EnergyState.fromJson(Map<String, dynamic>.from(data)));
        }
      })
      ..on('group_message', (data) {
        if (data is Map) {
          _groupMessageController.add(Map<String, dynamic>.from(data));
        }
      })
      ..on('narrative_event', (data) {
        if (data is Map) {
          _narrativeController.add(Map<String, dynamic>.from(data));
        }
      })
      ..on('live_chat', (data) {
        if (data is Map) {
          _liveChatController.add(Map<String, dynamic>.from(data));
        }
      })
      ..on('live_tts_chunk', (data) {
        if (data is Map) {
          _liveTtsController.add(Map<String, dynamic>.from(data));
        }
      })
      ..on('live_ai_speaking', (data) {
        if (data is Map) {
          _liveSpeakingController.add(Map<String, dynamic>.from(data));
        }
      })
      ..on('webrtc_signal', (data) {
        if (data is Map) {
          _webrtcSignalController.add(Map<String, dynamic>.from(data));
        }
      })
      ..on('webrtc_multimodal', (data) {
        if (data is Map) {
          _webrtcMultimodalController.add(Map<String, dynamic>.from(data));
        }
      })
      ..on('swarm_hologram_event', (data) {
        if (data is Map) {
          _swarmHologramController.add(Map<String, dynamic>.from(data));
        }
      })
      ..on('voice_duplex_chunk', (data) {
        if (data is Map) {
          _voiceDuplexChunkController.add(Map<String, dynamic>.from(data));
        }
      })
      ..on('voice_duplex_interrupt', (data) {
        if (data is Map) {
          _voiceDuplexInterruptController.add(Map<String, dynamic>.from(data));
        }
      })
      ..connect();
  }

  void joinGroup(String groupId) {
    _socket?.emit('join_group', groupId);
  }

  void joinLive(String sessionId) {
    _socket?.emit('join_live', sessionId);
  }

  void leaveLive(String sessionId) {
    _socket?.emit('leave_live', sessionId);
  }

  void joinWebrtc(String sessionId) {
    _socket?.emit('join_webrtc', sessionId);
  }

  void leaveWebrtc(String sessionId) {
    _socket?.emit('leave_webrtc', sessionId);
  }

  void emitWebrtcSignal({
    required String sessionId,
    required String type,
    dynamic payload,
  }) {
    _socket?.emit('webrtc_signal', {
      'sessionId': sessionId,
      'type': type,
      'payload': payload,
    });
  }

  void joinSwarmHologram([String? topologyId]) {
    _socket?.emit('join_swarm_hologram', topologyId);
  }

  void leaveSwarmHologram([String? topologyId]) {
    _socket?.emit('leave_swarm_hologram', topologyId);
  }

  void joinVoiceDuplex(String sessionId) {
    _socket?.emit('join_voice_duplex', sessionId);
  }

  void emitVoiceBargeIn({required String sessionId, double energy = 0.7}) {
    _socket?.emit('voice_duplex_barge_in', {'sessionId': sessionId, 'energy': energy});
  }

  void emitVoiceUserChunk({required String sessionId, String? pcmBase64, String? textDelta}) {
    _socket?.emit('voice_duplex_user_chunk', {
      'sessionId': sessionId,
      if (pcmBase64 != null) 'pcmBase64': pcmBase64,
      if (textDelta != null) 'textDelta': textDelta,
    });
  }

  /// Expose socket for advanced WebRTC peers (LiveKit / flutter_webrtc adapters).
  io.Socket? get socket => _socket;

  void disconnect() {
    _socket?.dispose();
    _socket = null;
  }

  void dispose() {
    disconnect();
    _newPostController.close();
    _newMessageController.close();
    _reputationController.close();
    _energyController.close();
    _groupMessageController.close();
    _narrativeController.close();
    _liveChatController.close();
    _liveTtsController.close();
    _liveSpeakingController.close();
    _webrtcSignalController.close();
    _webrtcMultimodalController.close();
    _swarmHologramController.close();
    _voiceDuplexChunkController.close();
    _voiceDuplexInterruptController.close();
  }
}

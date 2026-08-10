import 'dart:async';

import 'package:socket_io_client/socket_io_client.dart' as io;

import '../config/api_config.dart';
import '../models/post.dart';
import '../models/session.dart';

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

  Stream<Post> get onNewPost => _newPostController.stream;
  Stream<MessagePayload> get onNewMessage => _newMessageController.stream;
  Stream<ReputationPayload> get onReputationChange => _reputationController.stream;
  Stream<EnergyState> get onEnergyRecharged => _energyController.stream;
  Stream<Map<String, dynamic>> get onGroupMessage => _groupMessageController.stream;
  Stream<Map<String, dynamic>> get onNarrativeEvent => _narrativeController.stream;

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
      ..connect();
  }

  void joinGroup(String groupId) {
    _socket?.emit('join_group', groupId);
  }

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
  }
}

import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:simli_flutter/simli_flutter.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

/// Wraps [SimliFlutter] for session setup and a bi-directional LipsyncStream
/// WebSocket that sends PCM16 mic bytes and receives lip-synced video/audio frames.
class SimliLiveService {
  SimliFlutter? _simli;
  WebSocketChannel? _channel;
  StreamSubscription<dynamic>? _subscription;
  final _framesController = StreamController<LipsyncStreamResult>.broadcast();
  final _eventsController = StreamController<String>.broadcast();

  bool _connected = false;
  String? _sessionToken;

  Stream<LipsyncStreamResult> get frames => _framesController.stream;
  Stream<String> get serverEvents => _eventsController.stream;
  bool get isConnected => _connected;

  Future<void> connect({
    required String apiKey,
    required String faceId,
    bool syncAudio = true,
    bool isJpg = true,
  }) async {
    await disconnect();

    _simli = SimliFlutter(apiKey: apiKey);
    final available = await _simli!.isSessionAvailable();
    if (!available) {
      throw SimliLiveException('Simli session unavailable');
    }

    _sessionToken = await _simli!.startAudioToVideoSession(syncAudio, isJpg, faceId);

    final uri = Uri.parse('wss://api.simli.ai/LipsyncStream').replace(
      queryParameters: {'session_token': _sessionToken!},
    );
    _channel = WebSocketChannel.connect(uri);

    _subscription = _channel!.stream.listen(
      (message) {
        if (message is String) {
          if (message == 'SPEAK' || message == 'SILENT' || message == 'START') {
            _eventsController.add(message);
          }
          return;
        }

        if (message is List<int>) {
          _handleBinaryFrame(Uint8List.fromList(message), syncAudio, isJpg);
        } else if (message is Uint8List) {
          _handleBinaryFrame(message, syncAudio, isJpg);
        }
      },
      onError: (Object error) => _framesController.addError(error),
      onDone: () {
        _connected = false;
      },
    );

    _connected = true;
  }

  void _handleBinaryFrame(Uint8List data, bool syncAudio, bool isJpg) {
    if (data.isEmpty) return;

    if (isJpg) {
      _framesController.add(LipsyncStreamResult(data));
      return;
    }

    if (syncAudio && data.length > 2) {
      final split = data.length ~/ 2;
      final videoFrame = Uint8List.sublistView(data, 0, split);
      final audioFrame = Uint8List.sublistView(data, split);
      _framesController.add(LipsyncStreamResult(videoFrame, audioFrame: audioFrame));
      return;
    }

    _framesController.add(LipsyncStreamResult(data));
  }

  /// Stream PCM16 mono audio at 16 kHz to drive lip-sync.
  void sendPcm16(Uint8List chunk) {
    if (!_connected || _channel == null || chunk.isEmpty) return;
    _channel!.sink.add(chunk);
  }

  void sendJsonControl(Map<String, dynamic> payload) {
    if (!_connected || _channel == null) return;
    _channel!.sink.add(jsonEncode(payload));
  }

  void clearBuffer() {
    _channel?.sink.add('SKIP');
  }

  void finalizeAudio() {
    _channel?.sink.add('DONE');
  }

  Future<void> disconnect() async {
    _connected = false;
    await _subscription?.cancel();
    _subscription = null;
    await _channel?.sink.close();
    _channel = null;
    _sessionToken = null;
  }

  Future<void> dispose() async {
    await disconnect();
    await _framesController.close();
    await _eventsController.close();
    _simli = null;
  }
}

class SimliLiveException implements Exception {
  SimliLiveException(this.message);
  final String message;
  @override
  String toString() => message;
}

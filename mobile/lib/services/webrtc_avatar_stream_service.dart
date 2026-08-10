import 'dart:async';

import 'package:flutter/foundation.dart';

import 'api_service.dart';
import 'realtime_service.dart';

/// Phase 35 — Real-time multi-modal WebRTC avatar + spatial audio client.
///
/// Signaling is Socket.IO (`join_webrtc` / `webrtc_signal` / `webrtc_multimodal`).
/// Media path prefers LiveKit tokens from the session payload; otherwise peers
/// exchange SDP/ICE over the signal stream (pair with `flutter_webrtc` if needed).
class WebrtcAvatarStreamService {
  WebrtcAvatarStreamService({
    required ApiService api,
    required RealtimeService realtime,
  })  : _api = api,
        _realtime = realtime;

  final ApiService _api;
  final RealtimeService _realtime;

  String? _sessionId;
  StreamSubscription<Map<String, dynamic>>? _signalSub;
  StreamSubscription<Map<String, dynamic>>? _frameSub;

  final _avatarFrameController = StreamController<Map<String, dynamic>>.broadcast();
  final _spatialAudioController = StreamController<Map<String, dynamic>>.broadcast();
  final _textDeltaController = StreamController<String>.broadcast();

  String? get sessionId => _sessionId;
  Stream<Map<String, dynamic>> get onAvatarFrame => _avatarFrameController.stream;
  Stream<Map<String, dynamic>> get onSpatialAudio => _spatialAudioController.stream;
  Stream<String> get onTextDelta => _textDeltaController.stream;

  Future<Map<String, dynamic>> start({
    String? characterId,
    String? threadId,
    List<String> modalities = const ['avatar3d', 'spatial_audio', 'text'],
  }) async {
    final data = await _api.createV2WebrtcSession(
      characterId: characterId,
      threadId: threadId,
      modalities: modalities,
    );
    final session = Map<String, dynamic>.from(data['session'] as Map);
    _sessionId = session['id'] as String?;
    if (_sessionId == null) {
      throw StateError('WebRTC session missing id');
    }

    _realtime.joinWebrtc(_sessionId!);

    _signalSub?.cancel();
    _signalSub = _realtime.onWebrtcSignal.listen((msg) {
      if (msg['sessionId'] != _sessionId) return;
      debugPrint('[WebRTC] signal ${msg['type']}');
    });

    _frameSub?.cancel();
    _frameSub = _realtime.onWebrtcMultimodal.listen((msg) {
      if (msg['sessionId'] != _sessionId) return;
      final avatar = msg['avatar'];
      if (avatar is Map) {
        _avatarFrameController.add(Map<String, dynamic>.from(avatar));
      }
      final audio = msg['spatialAudio'];
      if (audio is Map) {
        _spatialAudioController.add(Map<String, dynamic>.from(audio));
      }
      final text = msg['textDelta'];
      if (text is String && text.isNotEmpty) {
        _textDeltaController.add(text);
      }
    });

    return data;
  }

  void sendOffer(Map<String, dynamic> sdp) {
    final id = _sessionId;
    if (id == null) return;
    _realtime.emitWebrtcSignal(sessionId: id, type: 'offer', payload: sdp);
  }

  void sendAnswer(Map<String, dynamic> sdp) {
    final id = _sessionId;
    if (id == null) return;
    _realtime.emitWebrtcSignal(sessionId: id, type: 'answer', payload: sdp);
  }

  void sendIce(Map<String, dynamic> candidate) {
    final id = _sessionId;
    if (id == null) return;
    _realtime.emitWebrtcSignal(sessionId: id, type: 'ice', payload: candidate);
  }

  Future<void> stop() async {
    final id = _sessionId;
    if (id != null) {
      _realtime.emitWebrtcSignal(sessionId: id, type: 'close', payload: {});
      _realtime.leaveWebrtc(id);
    }
    await _signalSub?.cancel();
    await _frameSub?.cancel();
    _sessionId = null;
  }

  void dispose() {
    stop();
    _avatarFrameController.close();
    _spatialAudioController.close();
    _textDeltaController.close();
  }
}

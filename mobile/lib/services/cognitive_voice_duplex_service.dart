import 'dart:async';

import 'package:flutter/foundation.dart';

import 'api_service.dart';
import 'bio_adaptive_ui_service.dart';
import 'realtime_service.dart';

/// Phase 39 — Full-duplex cognitive voice with bio-adaptive prosody + barge-in.
class CognitiveVoiceDuplexService {
  CognitiveVoiceDuplexService({
    required ApiService api,
    required RealtimeService realtime,
    BioAdaptiveUiService? bio,
  })  : _api = api,
        _realtime = realtime,
        _bio = bio ?? BioAdaptiveUiService();

  final ApiService _api;
  final RealtimeService _realtime;
  final BioAdaptiveUiService _bio;

  String? _sessionId;
  Map<String, dynamic> _prosody = {};
  StreamSubscription? _chunkSub;
  StreamSubscription? _interruptSub;

  final _agentText = StreamController<String>.broadcast();
  final _interrupt = StreamController<void>.broadcast();

  String? get sessionId => _sessionId;
  Map<String, dynamic> get prosody => Map.unmodifiable(_prosody);
  Stream<String> get onAgentText => _agentText.stream;
  Stream<void> get onInterrupted => _interrupt.stream;

  Future<Map<String, dynamic>> start({
    String? characterId,
    Map<String, dynamic>? bci,
    Map<String, dynamic>? biometrics,
  }) async {
    // Local bio hint before server round-trip
    if (bci != null || biometrics != null) {
      _bio.ingest(bci: bci, biometrics: biometrics);
    }

    final data = await _api.createV2DuplexVoiceSession(
      characterId: characterId,
      bci: bci,
      biometrics: biometrics,
    );
    final session = Map<String, dynamic>.from(data['session'] as Map? ?? data);
    _sessionId = session['id'] as String?;
    _prosody = Map<String, dynamic>.from(session['prosody'] as Map? ?? {});

    if (_sessionId != null) {
      _realtime.joinVoiceDuplex(_sessionId!);
    }

    _chunkSub?.cancel();
    _chunkSub = _realtime.onVoiceDuplexChunk.listen((msg) {
      if (msg['sessionId'] != _sessionId) return;
      if (msg['direction'] == 'agent') {
        final text = msg['textDelta'];
        if (text is String && text.isNotEmpty) _agentText.add(text);
        final p = msg['prosody'];
        if (p is Map) _prosody = Map<String, dynamic>.from(p);
      }
    });

    _interruptSub?.cancel();
    _interruptSub = _realtime.onVoiceDuplexInterrupt.listen((msg) {
      if (msg['sessionId'] != _sessionId) return;
      _interrupt.add(null);
      debugPrint('[CognitiveVoice] interrupted — stop local TTS');
    });

    return data;
  }

  void bargeIn({double energy = 0.7}) {
    final id = _sessionId;
    if (id == null) return;
    _realtime.emitVoiceBargeIn(sessionId: id, energy: energy);
  }

  void sendUserPcm(String pcmBase64) {
    final id = _sessionId;
    if (id == null) return;
    _realtime.emitVoiceUserChunk(sessionId: id, pcmBase64: pcmBase64);
  }

  Future<void> updateFromBiometrics({
    Map<String, dynamic>? bci,
    Map<String, dynamic>? biometrics,
  }) async {
    final id = _sessionId;
    if (id == null) return;
    _bio.ingest(bci: bci, biometrics: biometrics);
    final p = await _api.updateV2DuplexProsody(
      sessionId: id,
      bci: bci,
      biometrics: biometrics,
    );
    _prosody = p;
  }

  Future<void> stop() async {
    await _chunkSub?.cancel();
    await _interruptSub?.cancel();
    _sessionId = null;
  }

  void dispose() {
    stop();
    _agentText.close();
    _interrupt.close();
  }
}

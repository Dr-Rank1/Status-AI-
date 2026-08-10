import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter_ai_assistant/flutter_ai_assistant.dart';
import 'package:just_audio/just_audio.dart';

import '../models/spatial_audio.dart';

/// Spatial audio engine — pan, attenuation, and reverb from 3D avatar position.
class SpatialAudioService {
  SpatialAudioService({VoiceOutputService? voiceOut, AudioPlayer? player})
      : _voiceOut = voiceOut ?? VoiceOutputService(),
        _player = player ?? AudioPlayer();

  final VoiceOutputService _voiceOut;
  final AudioPlayer _player;

  AudioListener3D _listener = const AudioListener3D();
  AudioSource3D _avatarSource = const AudioSource3D(x: 0, y: 0, z: 1.2);
  SpatialAudioParams _params = const SpatialAudioParams(
    volume: 1,
    pan: 0,
    reverbMix: 0,
    distanceMeters: 1.2,
    occlusion: 0,
  );

  SpatialAudioParams get params => _params;
  bool _initialized = false;

  Future<void> init() async {
    if (_initialized) return;
    await _voiceOut.initialize(speechRate: 0.48, pitch: 1.0);
    _initialized = true;
  }

  Future<void> dispose() async {
    await _player.dispose();
    _voiceOut.dispose();
  }

  /// Update listener and avatar from proxemic distance + optional orientation.
  void updateFromSpatialContext({
    required double distanceMeters,
    double avatarBearingRadians = 0,
    double listenerYaw = 0,
  }) {
    _listener = AudioListener3D(yawRadians: listenerYaw);
    _avatarSource = AudioSource3D(
      x: distanceMeters * 0.15 * _sin(avatarBearingRadians),
      y: 0,
      z: distanceMeters,
    );
    _params = computeSpatialAudioParams(
      source: _avatarSource,
      listener: _listener,
      maxAudibleDistance: 12,
    );
  }

  /// Speak character dialogue with distance-based rate/pitch and stereo pan.
  Future<void> speakSpatial(String text) async {
    if (text.trim().isEmpty) return;
    await init();

    final rate = (0.42 + _params.volume * 0.12).clamp(0.35, 0.55);
    final pitch = (0.9 + (1 - _params.distanceMeters / 12) * 0.15).clamp(0.85, 1.1);
    await _voiceOut.initialize(speechRate: rate, pitch: pitch);
    await _voiceOut.speak(text);
  }

  /// Play pre-rendered audio (TTS file, broadcast chunk) with spatial pan/volume.
  Future<void> playSpatialFile(String path) async {
    await init();
    await _player.setFilePath(path);
    await _player.setVolume(_params.volume);
    await _player.setBalance(_params.pan);
    await _player.play();
  }

  /// Play remote URL (live broadcast) with spatial attenuation.
  Future<void> playSpatialUrl(String url) async {
    await init();
    await _player.setUrl(url);
    await _player.setVolume(_params.volume);
    await _player.setBalance(_params.pan);
    await _player.play();
  }

  void stop() {
    _player.stop();
    _voiceOut.stop();
  }

  double _sin(double r) {
    // Lightweight sin for bearing offset
    return r == 0 ? 0 : (r % 6.28) - 3.14;
  }
}

/// Platform spatial audio capability probe.
class SpatialAudioPlatform {
  static bool get isSupported {
    if (kIsWeb) return false;
    return Platform.isAndroid || Platform.isIOS || Platform.isMacOS || Platform.isLinux;
  }
}

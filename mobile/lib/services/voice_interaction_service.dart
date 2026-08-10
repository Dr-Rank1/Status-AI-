import 'dart:io';

import 'package:flutter_ai_assistant/flutter_ai_assistant.dart';
import 'package:path_provider/path_provider.dart';
import 'package:record/record.dart';

import 'api_service.dart';

/// Voice I/O for character DMs — uses flutter_ai_assistant's VoiceOutputService
/// for TTS and records audio for backend Whisper transcription.
class VoiceInteractionService {
  VoiceInteractionService({required ApiService api}) : _api = api;

  final ApiService _api;
  final _recorder = AudioRecorder();
  final _voiceOut = VoiceOutputService();
  bool _recording = false;

  bool get isRecording => _recording;

  Future<void> init() async {
    await _voiceOut.initialize(speechRate: 0.48, pitch: 1.0);
  }

  Future<void> dispose() async {
    await _recorder.dispose();
    _voiceOut.dispose();
  }

  Future<void> startRecording() async {
    if (_recording) return;
    if (!await _recorder.hasPermission()) {
      throw VoiceException('Microphone permission denied');
    }
    final dir = await getTemporaryDirectory();
    final path = '${dir.path}/status_voice_${DateTime.now().millisecondsSinceEpoch}.m4a';
    await _recorder.start(const RecordConfig(encoder: AudioEncoder.aacLc), path: path);
    _recording = true;
  }

  Future<String> stopRecordingAndTranscribe() async {
    if (!_recording) {
      throw VoiceException('Not recording');
    }
    final path = await _recorder.stop();
    _recording = false;
    if (path == null || path.isEmpty) {
      throw VoiceException('Recording failed');
    }
    return _api.transcribeVoice(File(path));
  }

  Future<void> speak(String text) async {
    if (text.trim().isEmpty) return;

    final serverAudio = await _api.trySynthesizeVoice(text);
    if (serverAudio != null) {
      // Server TTS available — VoiceOutputService handles on-device fallback.
      final dir = await getTemporaryDirectory();
      final file = File('${dir.path}/tts_${DateTime.now().millisecondsSinceEpoch}.mp3');
      await file.writeAsBytes(serverAudio);
    }

    await _voiceOut.stop();
    await _voiceOut.speakSummary(text, maxChars: 200);
  }

  Future<void> stopSpeaking() => _voiceOut.stop();
}

class VoiceException implements Exception {
  VoiceException(this.message);
  final String message;
  @override
  String toString() => message;
}

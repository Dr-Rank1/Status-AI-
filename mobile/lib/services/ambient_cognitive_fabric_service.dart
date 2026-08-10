import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';

import 'api_service.dart';

/// Phase 40 — Ambient Cognitive Fabric.
/// Background listening via native OS bridges (no wake word); proactive suggestions.
class AmbientCognitiveFabricService {
  AmbientCognitiveFabricService({ApiService? api}) : _api = api;

  ApiService? _api;
  static const MethodChannel _channel = MethodChannel('com.status/ambient');

  final _suggestionController = StreamController<AmbientSuggestion>.broadcast();
  final _transcriptController = StreamController<String>.broadcast();
  bool _running = false;
  Timer? _pollTimer;

  Stream<AmbientSuggestion> get onSuggestion => _suggestionController.stream;
  Stream<String> get onTranscript => _transcriptController.stream;
  bool get isRunning => _running;

  bool get isEnabled =>
      (dotenv.maybeGet('AMBIENT_FABRIC_ENABLED') ?? 'false').toLowerCase() == 'true';

  Future<void> init({ApiService? api}) async {
    _api = api ?? _api;
    _channel.setMethodCallHandler(_onNativeCall);
  }

  Future<bool> start({bool continuous = true}) async {
    if (!isEnabled || kIsWeb) return false;
    if (_running) return true;

    try {
      final ok = await _channel.invokeMethod<bool>('startAmbient', {
        'continuous': continuous,
        'wakeWordRequired': false,
        'platform': _platformLabel(),
      });
      _running = ok == true;
    } on MissingPluginException {
      // Dart fallback loop — simulates ambient ticks for desktop/dev.
      _running = true;
      _pollTimer = Timer.periodic(const Duration(seconds: 12), (_) {
        _ingestTranscript('[ambient-fallback] context tick ${_platformLabel()}');
      });
      debugPrint('[Ambient] using Dart fallback on ${_platformLabel()}');
    } catch (e) {
      debugPrint('[Ambient] start failed: $e');
      return false;
    }
    return _running;
  }

  Future<void> stop() async {
    _pollTimer?.cancel();
    try {
      await _channel.invokeMethod('stopAmbient');
    } catch (_) {}
    _running = false;
  }

  Future<dynamic> _onNativeCall(MethodCall call) async {
    switch (call.method) {
      case 'onAmbientTranscript':
        final text = call.arguments is Map
            ? (call.arguments as Map)['text']?.toString() ?? ''
            : call.arguments?.toString() ?? '';
        if (text.isNotEmpty) await _ingestTranscript(text);
        break;
      case 'onAmbientActivity':
        final args = Map<String, dynamic>.from(call.arguments as Map? ?? {});
        await _ingestTranscript(args['transcript']?.toString() ?? '', activity: args['activity']?.toString());
        break;
    }
  }

  Future<void> _ingestTranscript(String text, {String? activity}) async {
    _transcriptController.add(text);
    final api = _api;
    if (api == null) return;
    try {
      final data = await api.inferV2AmbientSuggestions(
        transcript: text,
        activity: activity,
      );
      final list = data['suggestions'] as List? ?? [];
      for (final raw in list) {
        if (raw is Map) {
          _suggestionController.add(AmbientSuggestion.fromJson(Map<String, dynamic>.from(raw)));
        }
      }
    } catch (e) {
      debugPrint('[Ambient] infer failed: $e');
    }
  }

  Future<void> accept(AmbientSuggestion suggestion) async {
    await _api?.acceptV2AmbientSuggestion(suggestion.toJson());
  }

  String _platformLabel() {
    if (kIsWeb) return 'web';
    if (Platform.isIOS) return 'ios';
    if (Platform.isAndroid) return 'android';
    if (Platform.isLinux) return 'ubuntu';
    if (Platform.isMacOS) return 'macos';
    return 'unknown';
  }

  void dispose() {
    stop();
    _suggestionController.close();
    _transcriptController.close();
  }
}

class AmbientSuggestion {
  const AmbientSuggestion({
    required this.id,
    required this.type,
    required this.title,
    required this.action,
    required this.confidence,
    this.payload = const {},
  });

  final String id;
  final String type;
  final String title;
  final String action;
  final double confidence;
  final Map<String, dynamic> payload;

  factory AmbientSuggestion.fromJson(Map<String, dynamic> j) => AmbientSuggestion(
        id: j['id']?.toString() ?? '',
        type: j['type']?.toString() ?? 'observe',
        title: j['title']?.toString() ?? '',
        action: j['action']?.toString() ?? 'noop',
        confidence: (j['confidence'] as num?)?.toDouble() ?? 0,
        payload: Map<String, dynamic>.from(j['payload'] as Map? ?? {}),
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'type': type,
        'title': title,
        'action': action,
        'confidence': confidence,
        'payload': payload,
      };
}

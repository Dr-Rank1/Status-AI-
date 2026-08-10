import 'dart:async';

import 'package:flutter/material.dart';
import 'package:speech_to_text/speech_to_text.dart' as stt;

typedef SpatialNavCommand = void Function(SpatialNavAction action);

enum SpatialNavAction {
  openFeed,
  openExplore,
  openMessages,
  openProfile,
  openSpatialScene,
  scrollDown,
  goBack,
  unknown,
}

/// Hands-free gaze (dwell) + voice navigation for spatial environments.
class GazeVoiceNavigationService {
  GazeVoiceNavigationService();

  final _speech = stt.SpeechToText();
  bool _speechReady = false;
  bool _listening = false;
  SpatialNavCommand? _onCommand;
  Timer? _dwellTimer;
  String? _dwellTargetId;

  bool get isListening => _listening;

  Future<bool> init() async {
    _speechReady = await _speech.initialize();
    return _speechReady;
  }

  void setCommandHandler(SpatialNavCommand handler) {
    _onCommand = handler;
  }

  /// Gaze proxy — pointer dwell activates focused targets (VisionOS-compatible pattern).
  void onGazeEnter(String targetId, VoidCallback onActivate, {Duration dwell = const Duration(milliseconds: 750)}) {
    _dwellTimer?.cancel();
    _dwellTargetId = targetId;
    _dwellTimer = Timer(dwell, () {
      if (_dwellTargetId == targetId) onActivate();
    });
  }

  void onGazeExit(String targetId) {
    if (_dwellTargetId == targetId) {
      _dwellTimer?.cancel();
      _dwellTargetId = null;
    }
  }

  Future<void> startVoiceNavigation() async {
    if (!_speechReady || _listening) return;
    _listening = true;

    await _speech.listen(
      onResult: (result) {
        if (!result.finalResult) return;
        final action = parseVoiceCommand(result.recognizedWords);
        if (action != SpatialNavAction.unknown) {
          _onCommand?.call(action);
        }
      },
      listenMode: stt.ListenMode.dictation,
      partialResults: false,
    );
  }

  Future<void> stopVoiceNavigation() async {
    if (!_listening) return;
    await _speech.stop();
    _listening = false;
  }

  static SpatialNavAction parseVoiceCommand(String phrase) {
    final p = phrase.toLowerCase().trim();
    if (p.contains('feed') || p.contains('home')) return SpatialNavAction.openFeed;
    if (p.contains('explore') || p.contains('discover')) return SpatialNavAction.openExplore;
    if (p.contains('message') || p.contains('chat') || p.contains('dm')) {
      return SpatialNavAction.openMessages;
    }
    if (p.contains('profile') || p.contains('account')) return SpatialNavAction.openProfile;
    if (p.contains('spatial') || p.contains('workspace') || p.contains('immersive')) {
      return SpatialNavAction.openSpatialScene;
    }
    if (p.contains('scroll') || p.contains('down')) return SpatialNavAction.scrollDown;
    if (p.contains('back') || p.contains('previous')) return SpatialNavAction.goBack;
    return SpatialNavAction.unknown;
  }

  void dispose() {
    _dwellTimer?.cancel();
    _speech.stop();
  }
}

/// Wraps a child with gaze-dwell activation affordance.
class GazeTarget extends StatelessWidget {
  const GazeTarget({
    super.key,
    required this.id,
    required this.navigation,
    required this.onActivate,
    required this.child,
    this.dwell = const Duration(milliseconds: 750),
  });

  final String id;
  final GazeVoiceNavigationService navigation;
  final VoidCallback onActivate;
  final Widget child;
  final Duration dwell;

  @override
  Widget build(BuildContext context) {
    return MouseRegion(
      onEnter: (_) => navigation.onGazeEnter(id, onActivate, dwell: dwell),
      onExit: (_) => navigation.onGazeExit(id),
      child: FocusableActionDetector(
        onShowFocusHighlight: (_, focused) => focused,
        child: child,
      ),
    );
  }
}

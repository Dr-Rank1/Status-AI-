import 'dart:async';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:livekit_client/livekit_client.dart';
import 'package:record/record.dart';
import 'package:simli_flutter/simli_flutter.dart';

import '../../models/live_stream.dart';
import '../../models/session.dart';
import '../../services/api_service.dart';
import '../../services/livekit_service.dart';
import '../../services/realtime_service.dart';
import '../../services/simli_live_service.dart';
import '../../services/voice_interaction_service.dart';
import '../../theme/app_theme.dart';
import '../../widgets/rive_avatar_widget.dart';

/// Face-to-face live stream with Simli lip-sync video, LiveKit broadcast,
/// Rive 2D fallback, live chat, and Super Chat monetization.
class LiveVideoScreen extends StatefulWidget {
  const LiveVideoScreen({
    super.key,
    required this.api,
    required this.realtime,
    required this.sessionId,
    required this.energyRemaining,
    required this.onEnergyUpdated,
  });

  final ApiService api;
  final RealtimeService realtime;
  final String sessionId;
  final int energyRemaining;
  final ValueChanged<EnergyState> onEnergyUpdated;

  @override
  State<LiveVideoScreen> createState() => _LiveVideoScreenState();
}

class _LiveVideoScreenState extends State<LiveVideoScreen> {
  LiveSessionDetail? _detail;
  AvatarRenderMode _renderMode = AvatarRenderMode.rive2d;
  RiveAvatarState _avatarState = RiveAvatarState.listening;
  Uint8List? _latestVideoFrame;
  String? _aiCaption;
  String? _error;
  bool _loading = true;
  bool _micActive = false;

  final _simli = SimliLiveService();
  final _livekit = LiveKitService();
  final _recorder = AudioRecorder();
  final _chatController = TextEditingController();
  final _chatScroll = ScrollController();

  StreamSubscription<LipsyncStreamResult>? _simliFramesSub;
  StreamSubscription<String>? _simliEventsSub;
  StreamSubscription<Map<String, dynamic>>? _chatSub;
  StreamSubscription<Map<String, dynamic>>? _ttsSub;
  StreamSubscription<Map<String, dynamic>>? _speakingSub;
  StreamSubscription<Uint8List>? _micSub;

  final List<LiveChatMessage> _messages = [];
  VoiceInteractionService? _voiceOut;

  static const _superChatCost = 25;

  @override
  void initState() {
    super.initState();
    _voiceOut = VoiceInteractionService(api: widget.api);
    unawaited(_voiceOut!.init());
    unawaited(_bootstrap());
  }

  Future<void> _bootstrap() async {
    try {
      final detail = await widget.api.fetchLiveSession(widget.sessionId);
      widget.realtime.joinLive(widget.sessionId);

      _chatSub = widget.realtime.onLiveChat.listen(_onLiveChat);
      _ttsSub = widget.realtime.onLiveTtsChunk.listen(_onTtsChunk);
      _speakingSub = widget.realtime.onLiveAiSpeaking.listen(_onAiSpeaking);

      final livekitUrl = detail.livekitUrl ?? dotenv.env['LIVEKIT_URL'];
      if (livekitUrl != null &&
          livekitUrl.isNotEmpty &&
          !detail.livekitToken.startsWith('mock-livekit-token')) {
        try {
          await _livekit.connect(url: livekitUrl, token: detail.livekitToken);
        } catch (_) {
          // LiveKit optional when keys are not configured.
        }
      }

      final simliKey = dotenv.env['SIMLI_API_KEY'];
      final faceId = detail.session.simliFaceId;
      if (simliKey != null && simliKey.isNotEmpty && faceId != null && faceId.isNotEmpty) {
        try {
          await _simli.connect(apiKey: simliKey, faceId: faceId);
          _simliFramesSub = _simli.frames.listen(_onSimliFrame);
          _simliEventsSub = _simli.serverEvents.listen(_onSimliEvent);
          _renderMode = AvatarRenderMode.simliVideo;
        } catch (_) {
          _renderMode = AvatarRenderMode.rive2d;
        }
      }

      if (!mounted) return;
      setState(() {
        _detail = detail;
        _messages
          ..clear()
          ..addAll(detail.messages);
        _loading = false;
      });
      _scrollChatToEnd();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  void _onSimliFrame(LipsyncStreamResult frame) {
    if (!mounted) return;
    setState(() {
      _latestVideoFrame = frame.videoFrame;
      _avatarState = RiveAvatarState.talking;
    });
  }

  void _onSimliEvent(String event) {
    if (!mounted) return;
    if (event == 'SILENT') {
      setState(() => _avatarState = RiveAvatarState.listening);
    } else if (event == 'SPEAK') {
      setState(() => _avatarState = RiveAvatarState.talking);
    }
  }

  void _onLiveChat(Map<String, dynamic> payload) {
    final messageJson = payload['message'];
    if (messageJson is! Map) return;
    final msg = LiveChatMessage.fromJson(Map<String, dynamic>.from(messageJson));
    if (msg.sessionId != widget.sessionId) return;
    setState(() => _messages.add(msg));
    _scrollChatToEnd();
  }

  void _onTtsChunk(Map<String, dynamic> payload) {
    final chunk = LiveTtsChunk.fromJson(payload);
    if (chunk.audio.isEmpty) return;

    final bytes = Uint8List.fromList(chunk.audio);
    if (_simli.isConnected) {
      _simli.sendPcm16(bytes);
    }
    if (mounted) {
      setState(() => _avatarState = RiveAvatarState.talking);
    }
  }

  void _onAiSpeaking(Map<String, dynamic> payload) {
    final event = LiveAiSpeakingEvent.fromJson(payload);
    if (event.text.isEmpty) return;
    setState(() {
      _aiCaption = event.text;
      _avatarState = RiveAvatarState.talking;
    });

    if (!_simli.isConnected) {
      unawaited(_voiceOut?.speak(event.text));
    }

    Future<void>.delayed(const Duration(seconds: 6), () {
      if (mounted && _avatarState == RiveAvatarState.talking) {
        setState(() => _avatarState = RiveAvatarState.listening);
      }
    });
  }

  Future<void> _toggleMic() async {
    if (_micActive) {
      await _micSub?.cancel();
      _micSub = null;
      await _recorder.stop();
      if (_simli.isConnected) _simli.finalizeAudio();
      setState(() {
        _micActive = false;
        _avatarState = RiveAvatarState.listening;
      });
      return;
    }

    if (!await _recorder.hasPermission()) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Microphone permission required')),
      );
      return;
    }

    final stream = await _recorder.startStream(
      const RecordConfig(
        encoder: AudioEncoder.pcm16bits,
        sampleRate: 16000,
        numChannels: 1,
      ),
    );

    _micSub = stream.listen((data) {
      if (_simli.isConnected) {
        _simli.sendPcm16(data);
      }
    });

    setState(() {
      _micActive = true;
      _avatarState = RiveAvatarState.listening;
    });
  }

  Future<void> _sendChat({required bool superChat}) async {
    final text = _chatController.text.trim();
    if (text.isEmpty) return;

    try {
      if (superChat) {
        if (widget.energyRemaining < _superChatCost) {
          throw InsufficientEnergyException('Need $_superChatCost energy for Super Chat');
        }
        final result = await widget.api.sendLiveSuperChat(
          sessionId: widget.sessionId,
          content: text,
        );
        widget.onEnergyUpdated(result.energy);
      } else {
        await widget.api.sendLiveChat(
          sessionId: widget.sessionId,
          content: text,
        );
      }
      _chatController.clear();
    } on InsufficientEnergyException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  void _scrollChatToEnd() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_chatScroll.hasClients) return;
      _chatScroll.animateTo(
        _chatScroll.position.maxScrollExtent,
        duration: const Duration(milliseconds: 250),
        curve: Curves.easeOut,
      );
    });
  }

  @override
  void dispose() {
    widget.realtime.leaveLive(widget.sessionId);
    _simliFramesSub?.cancel();
    _simliEventsSub?.cancel();
    _chatSub?.cancel();
    _ttsSub?.cancel();
    _speakingSub?.cancel();
    _micSub?.cancel();
    _chatController.dispose();
    _chatScroll.dispose();
    _recorder.dispose();
    unawaited(_simli.dispose());
    unawaited(_livekit.disconnect());
    unawaited(_voiceOut?.dispose());
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final session = _detail?.session;
    final theme = Theme.of(context).textTheme;

    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        title: Text(session?.title ?? 'Live'),
        actions: [
          if (session != null)
            Padding(
              padding: const EdgeInsets.only(right: 12),
              child: Center(
                child: Row(
                  children: [
                    const Icon(Icons.visibility, size: 16, color: AppColors.textMuted),
                    const SizedBox(width: 4),
                    Text('${session.viewerCount}', style: theme.labelMedium),
                  ],
                ),
              ),
            ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: AppColors.primary))
          : _error != null
              ? Center(child: Text(_error!, style: theme.bodyMedium))
              : Stack(
                  fit: StackFit.expand,
                  children: [
                    _buildAvatarLayer(session),
                    if (_aiCaption != null)
                      Positioned(
                        left: 16,
                        right: 16,
                        top: 12,
                        child: _CaptionBubble(text: _aiCaption!),
                      ),
                    Positioned(
                      left: 0,
                      right: 0,
                      bottom: 0,
                      child: _LiveChatOverlay(
                        messages: _messages,
                        controller: _chatController,
                        scrollController: _chatScroll,
                        energyRemaining: widget.energyRemaining,
                        superChatCost: _superChatCost,
                        onSend: () => _sendChat(superChat: false),
                        onSuperChat: () => _sendChat(superChat: true),
                      ),
                    ),
                    Positioned(
                      right: 16,
                      bottom: 220,
                      child: FloatingActionButton(
                        onPressed: _toggleMic,
                        backgroundColor: _micActive ? AppColors.like : AppColors.primary,
                        child: Icon(_micActive ? Icons.mic : Icons.mic_none),
                      ),
                    ),
                  ],
                ),
    );
  }

  Widget _buildAvatarLayer(LiveSession? session) {
    final remoteVideo = _livekit.firstRemoteVideo;
    if (remoteVideo != null) {
      return VideoTrackRenderer(remoteVideo);
    }

    if (_renderMode == AvatarRenderMode.simliVideo && _latestVideoFrame != null) {
      return Image.memory(
        _latestVideoFrame!,
        fit: BoxFit.cover,
        gaplessPlayback: true,
        width: double.infinity,
        height: double.infinity,
      );
    }

    return RiveAvatarWidget(
      state: _avatarState,
      characterName: session?.characterName ?? 'AI',
      avatarUrl: session?.characterAvatarUrl,
    );
  }
}

class _CaptionBubble extends StatelessWidget {
  const _CaptionBubble({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.55),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border),
      ),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Text(
          text,
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: Colors.white),
        ),
      ),
    );
  }
}

class _LiveChatOverlay extends StatelessWidget {
  const _LiveChatOverlay({
    required this.messages,
    required this.controller,
    required this.scrollController,
    required this.energyRemaining,
    required this.superChatCost,
    required this.onSend,
    required this.onSuperChat,
  });

  final List<LiveChatMessage> messages;
  final TextEditingController controller;
  final ScrollController scrollController;
  final int energyRemaining;
  final int superChatCost;
  final VoidCallback onSend;
  final VoidCallback onSuperChat;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.bottomCenter,
          end: Alignment.topCenter,
          colors: [
            Colors.black.withValues(alpha: 0.92),
            Colors.black.withValues(alpha: 0.35),
            Colors.transparent,
          ],
        ),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 24, 12, 12),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              SizedBox(
                height: 140,
                child: ListView.builder(
                  controller: scrollController,
                  itemCount: messages.length,
                  itemBuilder: (context, index) {
                    final msg = messages[index];
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 6),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          if (msg.isSuperChat)
                            const Padding(
                              padding: EdgeInsets.only(right: 6, top: 2),
                              child: Icon(Icons.bolt, color: AppColors.energy, size: 16),
                            ),
                          Expanded(
                            child: RichText(
                              text: TextSpan(
                                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                                      color: Colors.white.withValues(alpha: 0.92),
                                    ),
                                children: [
                                  TextSpan(
                                    text: '${msg.authorLabel}: ',
                                    style: TextStyle(
                                      fontWeight: FontWeight.w700,
                                      color: msg.isSuperChat
                                          ? AppColors.energy
                                          : AppColors.accent,
                                    ),
                                  ),
                                  TextSpan(text: msg.content),
                                ],
                              ),
                            ),
                          ),
                        ],
                      ),
                    );
                  },
                ),
              ),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: controller,
                      style: const TextStyle(color: Colors.white),
                      decoration: InputDecoration(
                        hintText: 'Say something…',
                        hintStyle: TextStyle(color: Colors.white.withValues(alpha: 0.5)),
                        filled: true,
                        fillColor: Colors.white.withValues(alpha: 0.08),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(24),
                          borderSide: BorderSide.none,
                        ),
                        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                      ),
                      onSubmitted: (_) => onSend(),
                    ),
                  ),
                  const SizedBox(width: 8),
                  IconButton.filled(
                    onPressed: onSend,
                    icon: const Icon(Icons.send_rounded),
                  ),
                  IconButton.filled(
                    tooltip: 'Super Chat ($superChatCost⚡)',
                    style: IconButton.styleFrom(backgroundColor: AppColors.energy),
                    onPressed: energyRemaining >= superChatCost ? onSuperChat : null,
                    icon: const Icon(Icons.auto_awesome, color: Colors.black),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_local_ai/flutter_local_ai.dart';

import '../../models/messaging.dart';
import '../../models/session.dart';
import '../../services/api_service.dart';
import '../../services/offline_cache_service.dart';
import '../../services/realtime_service.dart';
import '../../services/voice_interaction_service.dart';
import '../../theme/app_theme.dart';
import '../../widgets/character_avatar.dart';
import '../../widgets/genui_block_renderer.dart';

class ChatScreen extends StatefulWidget {
  const ChatScreen({
    super.key,
    required this.api,
    required this.realtime,
    required this.character,
    this.threadId,
    required this.energyRemaining,
    required this.onEnergyUpdated,
    this.onInteraction,
  });

  final ApiService api;
  final RealtimeService realtime;
  final AiCharacter character;
  final String? threadId;
  final int energyRemaining;
  final ValueChanged<EnergyState> onEnergyUpdated;
  final ValueChanged<InteractionUpdate>? onInteraction;

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  static const _dmCost = 8;

  final _controller = TextEditingController();
  final _scrollController = ScrollController();
  List<DmMessage> _messages = [];
  bool _loading = true;
  bool _sending = false;
  bool _aiTyping = false;
  String? _threadId;
  late int _energyRemaining;
  Timer? _pollTimer;
  StreamSubscription<MessagePayload>? _messageSub;
  StreamSubscription<ReputationPayload>? _repSub;
  late VoiceInteractionService _voice;
  bool _voiceBusy = false;
  GenUiModuleSpec? _genUiModule;
  bool _genUiLoading = false;
  bool _offlineMode = false;
  List<Map<String, dynamic>> _agentArtifacts = [];

  @override
  void initState() {
    super.initState();
    _threadId = widget.threadId;
    _energyRemaining = widget.energyRemaining;
    _voice = VoiceInteractionService(api: widget.api);
    _voice.init();
    _loadMessages();
    _wireRealtime();
  }

  void _wireRealtime() {
    _messageSub = widget.realtime.onNewMessage.listen((payload) {
      final threadId = payload['threadId'] as String?;
      if (threadId != _threadId) return;

      final raw = payload['message'];
      if (raw is! Map) return;

      final message = DmMessage.fromJson(Map<String, dynamic>.from(raw));
      if (!message.isCharacter) return;

      setState(() {
        _aiTyping = false;
        if (!_messages.any((m) => m.id == message.id)) {
          _messages = [..._messages, message];
        }
        final tools = payload['toolResults'];
        if (tools is List && tools.isNotEmpty) {
          _agentArtifacts = tools.map((e) => Map<String, dynamic>.from(e as Map)).toList();
        }
      });
      _voice.speak(message.content);
      if (_threadId != null) {
        OfflineCacheService.cacheThreadMessages(_threadId!, _messages);
      }
      _pollTimer?.cancel();
      _scrollToBottom();
    });

    _repSub = widget.realtime.onReputationChange.listen((payload) {
      if (payload['threadId'] != _threadId) return;
      final interaction = InteractionUpdate(
        affinity: payload['affinity'] as int? ?? 0,
        affinityDelta: payload['affinityDelta'] as int? ?? 0,
        reputation: payload['reputation'] as int? ?? 0,
        reputationDelta: payload['reputationDelta'] as int? ?? 0,
        followerCount: payload['followerCount'] as int? ?? 0,
      );
      widget.onInteraction?.call(interaction);
    });
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    _messageSub?.cancel();
    _repSub?.cancel();
    _voice.dispose();
    _controller.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  Future<void> _loadMessages() async {
    if (_threadId == null) {
      setState(() => _loading = false);
      return;
    }

    final cached = OfflineCacheService.loadThreadMessages(_threadId!);
    if (cached != null && cached.isNotEmpty) {
      setState(() {
        _messages = cached;
        _loading = false;
      });
    }

    try {
      final result = await widget.api.fetchThreadMessages(_threadId!);
      if (!mounted) return;

      setState(() {
        _messages = result.messages;
        _loading = false;
        _aiTyping = result.aiPending;
      });

      if (_threadId != null) {
        await OfflineCacheService.cacheThreadMessages(_threadId!, _messages);
      }

      if (result.interaction != null) {
        widget.onInteraction?.call(result.interaction!);
      }

      _scrollToBottom();

      if (result.aiPending && !widget.realtime.isConnected) {
        _startPolling();
      }
    } catch (e) {
      if (!mounted) return;
      final hasCache = cached != null && cached.isNotEmpty;
      setState(() {
        _loading = false;
        if (hasCache) _messages = cached;
      });
      if (!hasCache) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.toString())),
        );
      }
    }
  }

  void _startPolling() {
    _pollTimer?.cancel();
    _pollTimer = Timer.periodic(const Duration(milliseconds: 2000), (_) async {
      if (_threadId == null || !mounted) return;

      try {
        final result = await widget.api.fetchThreadMessages(_threadId!);
        if (!mounted) return;

        setState(() {
          _messages = result.messages;
          _aiTyping = result.aiPending;
        });

        if (result.interaction != null) {
          widget.onInteraction?.call(result.interaction!);
        }

        if (!result.aiPending) {
          _pollTimer?.cancel();
          _scrollToBottom();
        }
      } catch (_) {}
    });
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scrollController.hasClients) return;
      _scrollController.animateTo(
        _scrollController.position.maxScrollExtent,
        duration: const Duration(milliseconds: 250),
        curve: Curves.easeOut,
      );
    });
  }

  Future<void> _send() async {
    final text = _controller.text.trim();
    if (text.isEmpty || _sending) return;

    final online = await widget.api.isOnline();
    if (online && _energyRemaining < _dmCost) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Need $_dmCost energy (have $_energyRemaining)'),
          backgroundColor: AppColors.like,
        ),
      );
      return;
    }

    final pending = DmMessage.pending(text);
    setState(() {
      _sending = true;
      _messages = [..._messages, pending];
      _aiTyping = true;
      _offlineMode = !online;
    });
    _controller.clear();
    _scrollToBottom();

    final recentLines = _messages
        .where((m) => !m.isPending)
        .take(6)
        .map((m) => '${m.isCharacter ? widget.character.name : 'You'}: ${m.content}')
        .toList();

    try {
      final result = await widget.api.sendMessage(
        characterId: widget.character.id,
        content: text,
        characterName: widget.character.name,
        characterBio: widget.character.bio ?? '',
        recentLines: recentLines,
        currentEnergy: EnergyState(
          remaining: _energyRemaining,
          max: 100,
          resetAt: DateTime.now().add(const Duration(hours: 24)),
        ),
      );

      if (!mounted) return;

      setState(() {
        _threadId = result.threadId ?? _threadId;
        _messages = [
          ..._messages.where((m) => !m.isPending),
          result.userMessage,
          if (result.characterReply != null) result.characterReply!,
        ];
        if (!result.offline) {
          _energyRemaining = result.energy.remaining;
        }
        _sending = false;
        _aiTyping = result.aiPending;
        _offlineMode = result.offline;
        if (result.toolResults != null) _agentArtifacts = result.toolResults!;
      });

      if (!result.offline) {
        widget.onEnergyUpdated(result.energy);
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Offline — on-device AI replied locally')),
        );
      }

      if (_threadId != null) {
        await OfflineCacheService.cacheThreadMessages(_threadId!, _messages);
      }

      _scrollToBottom();

      if (result.aiPending && !widget.realtime.isConnected) {
        _startPolling();
      }
    } on InsufficientEnergyException catch (e) {
      if (!mounted) return;
      setState(() {
        _messages = _messages.where((m) => !m.isPending).toList();
        _sending = false;
        _aiTyping = false;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.message), backgroundColor: AppColors.like),
      );
    } on ContentModerationException catch (e) {
      if (!mounted) return;
      setState(() {
        _messages = _messages.where((m) => !m.isPending).toList();
        _sending = false;
        _aiTyping = false;
      });
      showDialog<void>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Message blocked'),
          content: Text(e.message),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context), child: const Text('OK')),
          ],
        ),
      );
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _messages = _messages.where((m) => !m.isPending).toList();
        _sending = false;
        _aiTyping = false;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.message)),
      );
    }
  }

  Future<void> _toggleVoice() async {
    if (_voiceBusy || _sending) return;

    if (!_voice.isRecording) {
      try {
        await _voice.startRecording();
        setState(() => _voiceBusy = true);
      } on VoiceException catch (e) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
      return;
    }

    setState(() => _voiceBusy = true);
    try {
      final text = await _voice.stopRecordingAndTranscribe();
      if (!mounted) return;
      if (text.trim().isEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not understand audio')),
        );
        return;
      }
      _controller.text = text;
      await _send();
    } on VoiceException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _voiceBusy = false);
    }
  }

  Future<void> _generateGenUi() async {
    final goal = _controller.text.trim();
    if (goal.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Describe what you want — poll, mood widget, mini-game…')),
      );
      return;
    }

    setState(() => _genUiLoading = true);
    try {
      final module = await widget.api.generateGenUiModule(
        'For a chat with ${widget.character.name}: $goal',
      );
      if (!mounted) return;
      if (module == null) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('On-device AI unavailable on this device')),
        );
        return;
      }
      setState(() => _genUiModule = module);
    } finally {
      if (mounted) setState(() => _genUiLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Row(
          children: [
            CharacterAvatar(
              name: widget.character.name,
              imageUrl: widget.character.avatarUrl,
              radius: 18,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(widget.character.name),
                  Text(
                    _offlineMode
                        ? 'Offline · on-device AI'
                        : '@${widget.character.handle} · $_dmCost energy/msg',
                    style: Theme.of(context).textTheme.labelSmall?.copyWith(
                          color: _offlineMode ? AppColors.energy : AppColors.textMuted,
                        ),
                  ),
                ],
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            onPressed: _genUiLoading ? null : _generateGenUi,
            icon: _genUiLoading
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.auto_awesome),
            tooltip: 'Generate UI block',
          ),
        ],
      ),
      body: Column(
        children: [
          if (_genUiModule != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
              child: GenUiBlockRenderer(module: _genUiModule!),
            ),
          if (_agentArtifacts.isNotEmpty)
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
              child: _AgentArtifactsBar(artifacts: _agentArtifacts),
            ),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator(color: AppColors.primary))
                : ListView.builder(
                    controller: _scrollController,
                    padding: const EdgeInsets.all(16),
                    itemCount: _messages.length + (_aiTyping ? 1 : 0) + (_messages.isEmpty ? 1 : 0),
                    itemBuilder: (context, index) {
                      if (_messages.isEmpty && index == 0) {
                        return Center(
                          child: Padding(
                            padding: const EdgeInsets.only(top: 48),
                            child: Text(
                              'Say hi to ${widget.character.name}',
                              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                                    color: AppColors.textMuted,
                                  ),
                            ),
                          ),
                        );
                      }

                      if (_aiTyping && index == _messages.length + (_messages.isEmpty ? 1 : 0)) {
                        return _TypingIndicator(name: widget.character.name);
                      }

                      final msgIndex = _messages.isEmpty ? index - 1 : index;
                      if (msgIndex < 0 || msgIndex >= _messages.length) {
                        return const SizedBox.shrink();
                      }

                      final msg = _messages[msgIndex];
                      return _MessageBubble(
                        message: msg,
                        character: widget.character,
                      );
                    },
                  ),
          ),
          Padding(
            padding: EdgeInsets.fromLTRB(
              12,
              8,
              12,
              8 + MediaQuery.paddingOf(context).bottom,
            ),
            child: Row(
              children: [
                IconButton.filled(
                  onPressed: _voiceBusy ? null : _toggleVoice,
                  style: IconButton.styleFrom(
                    backgroundColor: _voice.isRecording ? AppColors.like : AppColors.surfaceElevated,
                  ),
                  icon: Icon(_voice.isRecording ? Icons.stop_rounded : Icons.mic_rounded),
                  tooltip: _voice.isRecording ? 'Stop & send' : 'Voice message',
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: TextField(
                    controller: _controller,
                    enabled: !_sending,
                    textInputAction: TextInputAction.send,
                    onSubmitted: (_) => _send(),
                    decoration: InputDecoration(
                      hintText: 'Message ${widget.character.name}...',
                      filled: true,
                      fillColor: AppColors.surfaceElevated,
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(24),
                        borderSide: BorderSide.none,
                      ),
                      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                _sending
                    ? const SizedBox(
                        width: 48,
                        height: 48,
                        child: Padding(
                          padding: EdgeInsets.all(12),
                          child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.primary),
                        ),
                      )
                    : IconButton.filled(
                        onPressed: _send,
                        icon: const Icon(Icons.send_rounded),
                      ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _MessageBubble extends StatelessWidget {
  const _MessageBubble({required this.message, required this.character});

  final DmMessage message;
  final AiCharacter character;

  @override
  Widget build(BuildContext context) {
    final isUser = message.isUser;

    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        mainAxisAlignment: isUser ? MainAxisAlignment.end : MainAxisAlignment.start,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          if (!isUser) ...[
            CharacterAvatar(name: character.name, imageUrl: character.avatarUrl, radius: 16),
            const SizedBox(width: 8),
          ],
          Flexible(
            child: AnimatedOpacity(
              opacity: message.isPending ? 0.6 : 1,
              duration: const Duration(milliseconds: 200),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                decoration: BoxDecoration(
                  color: isUser ? AppColors.primary : AppColors.surfaceElevated,
                  borderRadius: BorderRadius.only(
                    topLeft: const Radius.circular(16),
                    topRight: const Radius.circular(16),
                    bottomLeft: Radius.circular(isUser ? 16 : 4),
                    bottomRight: Radius.circular(isUser ? 4 : 16),
                  ),
                ),
                child: Text(message.content),
              ),
            ),
          ),
          if (isUser) const SizedBox(width: 4),
        ],
      ),
    );
  }
}

class _TypingIndicator extends StatefulWidget {
  const _TypingIndicator({required this.name});

  final String name;

  @override
  State<_TypingIndicator> createState() => _TypingIndicatorState();
}

class _TypingIndicatorState extends State<_TypingIndicator>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1200),
    )..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          color: AppColors.surfaceElevated,
          borderRadius: BorderRadius.circular(16),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              '${widget.name} is typing',
              style: Theme.of(context).textTheme.labelSmall?.copyWith(
                    color: AppColors.textMuted,
                  ),
            ),
            const SizedBox(width: 8),
            AnimatedBuilder(
              animation: _controller,
              builder: (context, _) {
                return Row(
                  children: List.generate(3, (i) {
                    final delay = i * 0.2;
                    final t = (_controller.value - delay).clamp(0.0, 1.0);
                    final opacity = (t * 3.1415926535).clamp(0.0, 1.0);
                    return Container(
                      margin: const EdgeInsets.symmetric(horizontal: 2),
                      width: 6,
                      height: 6,
                      decoration: BoxDecoration(
                        color: AppColors.primary.withValues(alpha: 0.3 + opacity * 0.7),
                        shape: BoxShape.circle,
                      ),
                    );
                  }),
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}

class _AgentArtifactsBar extends StatelessWidget {
  const _AgentArtifactsBar({required this.artifacts});

  final List<Map<String, dynamic>> artifacts;

  @override
  Widget build(BuildContext context) {
    return Card(
      color: AppColors.surfaceElevated,
      child: Padding(
        padding: const EdgeInsets.all(10),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Agent actions',
              style: Theme.of(context).textTheme.labelLarge?.copyWith(color: AppColors.accent),
            ),
            const SizedBox(height: 6),
            ...artifacts.map((artifact) {
              final tool = artifact['tool'] as String? ?? 'tool';
              final output = artifact['output'] as Map<String, dynamic>? ?? {};
              String subtitle = '';
              if (output['event'] != null) {
                subtitle = output['event']['title'] as String? ?? '';
              } else if (output['link'] != null) {
                subtitle = output['link']['title'] as String? ?? output['link']['url'] as String? ?? '';
              } else if (output['results'] is List && (output['results'] as List).isNotEmpty) {
                subtitle = (output['results'] as List).first['title'] as String? ?? '';
              }
              return ListTile(
                dense: true,
                contentPadding: EdgeInsets.zero,
                leading: Icon(
                  tool == 'create_calendar_event'
                      ? Icons.event
                      : tool == 'web_search'
                          ? Icons.search
                          : Icons.link,
                  color: AppColors.primary,
                  size: 20,
                ),
                title: Text(tool.replaceAll('_', ' '), style: const TextStyle(fontSize: 13)),
                subtitle: subtitle.isNotEmpty ? Text(subtitle, maxLines: 1, overflow: TextOverflow.ellipsis) : null,
              );
            }),
          ],
        ),
      ),
    );
  }
}

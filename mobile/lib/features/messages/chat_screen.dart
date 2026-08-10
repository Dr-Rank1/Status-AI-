import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../models/messaging.dart';
import '../../models/session.dart';
import '../../services/api_service.dart';
import '../../theme/app_theme.dart';
import '../../widgets/character_avatar.dart';

class ChatScreen extends StatefulWidget {
  const ChatScreen({
    super.key,
    required this.api,
    required this.character,
    this.threadId,
    required this.energyRemaining,
    required this.onEnergyUpdated,
    this.onInteraction,
  });

  final ApiService api;
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

  @override
  void initState() {
    super.initState();
    _threadId = widget.threadId;
    _energyRemaining = widget.energyRemaining;
    _loadMessages();
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    _controller.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  Future<void> _loadMessages() async {
    if (_threadId == null) {
      setState(() => _loading = false);
      return;
    }

    try {
      final result = await widget.api.fetchThreadMessages(_threadId!);
      if (!mounted) return;

      setState(() {
        _messages = result.messages;
        _loading = false;
        _aiTyping = result.aiPending;
      });

      if (result.interaction != null) {
        widget.onInteraction?.call(result.interaction!);
      }

      _scrollToBottom();

      if (result.aiPending) _startPolling();
    } catch (e) {
      if (!mounted) return;
      setState(() => _loading = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString())),
      );
    }
  }

  void _startPolling() {
    _pollTimer?.cancel();
    _pollTimer = Timer.periodic(const Duration(milliseconds: 1500), (_) async {
      if (_threadId == null || !mounted) return;

      try {
        final result = await widget.api.fetchThreadMessages(_threadId!);
        if (!mounted) return;

        final hadTyping = _aiTyping;
        setState(() {
          _messages = result.messages;
          _aiTyping = result.aiPending;
        });

        if (result.messages.length > _messages.length || !result.aiPending) {
          _scrollToBottom();
        }

        if (result.interaction != null) {
          widget.onInteraction?.call(result.interaction!);

          if (!mounted) return;
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                'Affinity ${result.interaction!.affinityDelta >= 0 ? '+' : ''}'
                '${result.interaction!.affinityDelta} · '
                'Rep ${result.interaction!.reputationDelta >= 0 ? '+' : ''}'
                '${result.interaction!.reputationDelta}',
              ),
              duration: const Duration(seconds: 2),
            ),
          );
        }

        if (hadTyping && !result.aiPending) {
          _pollTimer?.cancel();
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

    if (_energyRemaining < _dmCost) {
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
    });
    _controller.clear();
    _scrollToBottom();

    try {
      final result = await widget.api.sendMessage(
        characterId: widget.character.id,
        content: text,
      );

      if (!mounted) return;

      setState(() {
        _threadId = result.threadId ?? _threadId;
        _messages = [
          ..._messages.where((m) => !m.isPending),
          result.userMessage,
        ];
        _energyRemaining = result.energy.remaining;
        _sending = false;
        _aiTyping = result.aiPending;
      });

      widget.onEnergyUpdated(result.energy);
      _scrollToBottom();

      if (result.aiPending) _startPolling();
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
                    '@${widget.character.handle} · $_dmCost energy/msg',
                    style: Theme.of(context).textTheme.labelSmall?.copyWith(
                          color: AppColors.textMuted,
                        ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
      body: Column(
        children: [
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
                    final opacity = (math.sin(t * math.pi)).abs();
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

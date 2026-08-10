import 'dart:async';

import 'package:flutter/material.dart';

import '../../models/messaging.dart';
import '../../models/session.dart';
import '../../services/api_service.dart';
import '../../services/realtime_service.dart';
import '../../theme/app_theme.dart';
import '../../widgets/character_avatar.dart';

/// Group chat with @mention support for triggering AI character replies.
class GroupChatScreen extends StatefulWidget {
  const GroupChatScreen({
    super.key,
    required this.api,
    required this.realtime,
    required this.group,
    required this.energyRemaining,
    required this.onEnergyUpdated,
  });

  final ApiService api;
  final RealtimeService realtime;
  final GroupThread group;
  final int energyRemaining;
  final ValueChanged<EnergyState> onEnergyUpdated;

  @override
  State<GroupChatScreen> createState() => _GroupChatScreenState();
}

class _GroupChatScreenState extends State<GroupChatScreen> {
  static const _messageCost = 8;

  final _controller = TextEditingController();
  final _scrollController = ScrollController();
  List<GroupMessage> _messages = [];
  late GroupThread _group;
  bool _loading = true;
  bool _sending = false;
  bool _aiTyping = false;
  late int _energyRemaining;
  StreamSubscription<Map<String, dynamic>>? _groupSub;

  List<GroupMember> get _characters =>
      _group.members.where((m) => m.isCharacter).toList();

  @override
  void initState() {
    super.initState();
    _group = widget.group;
    _energyRemaining = widget.energyRemaining;
    widget.realtime.joinGroup(_group.id);
    _loadMessages();
    _wireRealtime();
  }

  void _wireRealtime() {
    _groupSub = widget.realtime.onGroupMessage.listen((payload) {
      if (payload['groupId'] != _group.id) return;
      final raw = payload['message'];
      if (raw is! Map) return;

      final message = GroupMessage.fromJson(Map<String, dynamic>.from(raw));
      if (!message.isCharacter) return;

      setState(() {
        _aiTyping = false;
        if (!_messages.any((m) => m.id == message.id)) {
          _messages = [..._messages, message];
        }
      });
      _scrollToBottom();
    });
  }

  @override
  void dispose() {
    _groupSub?.cancel();
    _controller.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  Future<void> _loadMessages() async {
    try {
      final result = await widget.api.fetchGroupMessages(_group.id);
      if (!mounted) return;
      setState(() {
        _messages = result.messages;
        _group = result.group;
        _loading = false;
        _aiTyping = result.aiPending;
      });
      _scrollToBottom();
    } catch (e) {
      if (!mounted) return;
      setState(() => _loading = false);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    }
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

  void _insertMention(String handle) {
    final text = _controller.text;
    _controller.text = text.isEmpty ? '@$handle ' : '$text @$handle ';
    _controller.selection = TextSelection.collapsed(offset: _controller.text.length);
  }

  Future<void> _send() async {
    final text = _controller.text.trim();
    if (text.isEmpty || _sending) return;

    if (_energyRemaining < _messageCost) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Need $_messageCost energy (have $_energyRemaining)'),
          backgroundColor: AppColors.like,
        ),
      );
      return;
    }

    final pending = GroupMessage.pending(text);
    setState(() {
      _sending = true;
      _messages = [..._messages, pending];
      _aiTyping = true;
    });
    _controller.clear();
    _scrollToBottom();

    try {
      final result = await widget.api.sendGroupMessage(groupId: _group.id, content: text);
      if (!mounted) return;

      setState(() {
        _messages = [..._messages.where((m) => !m.isPending), result.message];
        _energyRemaining = result.energy.remaining;
        _sending = false;
        _aiTyping = result.aiPending;
      });
      widget.onEnergyUpdated(result.energy);
      _scrollToBottom();
    } on InsufficientEnergyException catch (e) {
      _rollbackSend(e.message);
    } on ContentModerationException catch (e) {
      _rollbackSend(e.message, moderation: true);
    } on ApiException catch (e) {
      _rollbackSend(e.message);
    }
  }

  void _rollbackSend(String message, {bool moderation = false}) {
    if (!mounted) return;
    setState(() {
      _messages = _messages.where((m) => !m.isPending).toList();
      _sending = false;
      _aiTyping = false;
    });
    if (moderation) {
      showDialog<void>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Message blocked'),
          content: Text(message),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context), child: const Text('OK')),
          ],
        ),
      );
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(message), backgroundColor: moderation ? AppColors.like : null),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(_group.name),
            Text(
              '${_group.memberCount} members · use @handle to mention AI',
              style: Theme.of(context).textTheme.labelSmall?.copyWith(color: AppColors.textMuted),
            ),
          ],
        ),
      ),
      body: Column(
        children: [
          if (_characters.isNotEmpty)
            SizedBox(
              height: 44,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                itemCount: _characters.length,
                separatorBuilder: (_, __) => const SizedBox(width: 8),
                itemBuilder: (context, i) {
                  final c = _characters[i];
                  return ActionChip(
                    avatar: CharacterAvatar(
                      name: c.characterName ?? '?',
                      imageUrl: c.characterAvatar,
                      radius: 12,
                    ),
                    label: Text('@${c.characterHandle ?? ''}'),
                    onPressed: () => _insertMention(c.characterHandle ?? ''),
                  );
                },
              ),
            ),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator(color: AppColors.primary))
                : ListView.builder(
                    controller: _scrollController,
                    padding: const EdgeInsets.all(16),
                    itemCount: _messages.length + (_aiTyping ? 1 : 0),
                    itemBuilder: (context, index) {
                      if (index == _messages.length && _aiTyping) {
                        return const _TypingRow();
                      }
                      final msg = _messages[index];
                      return _GroupBubble(message: msg);
                    },
                  ),
          ),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _controller,
                      decoration: InputDecoration(
                        hintText: 'Message… (@nova_star to mention)',
                        filled: true,
                        fillColor: AppColors.surfaceElevated,
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(24),
                          borderSide: BorderSide.none,
                        ),
                        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                      ),
                      textInputAction: TextInputAction.send,
                      onSubmitted: (_) => _send(),
                    ),
                  ),
                  const SizedBox(width: 8),
                  IconButton.filled(
                    onPressed: _sending ? null : _send,
                    icon: const Icon(Icons.send_rounded),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _GroupBubble extends StatelessWidget {
  const _GroupBubble({required this.message});
  final GroupMessage message;

  @override
  Widget build(BuildContext context) {
    final isUser = message.isUser;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        mainAxisAlignment: isUser ? MainAxisAlignment.end : MainAxisAlignment.start,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          if (!isUser)
            CharacterAvatar(
              name: message.senderCharacterName ?? 'AI',
              imageUrl: message.senderCharacterAvatar,
              radius: 16,
            ),
          if (!isUser) const SizedBox(width: 8),
          Flexible(
            child: Column(
              crossAxisAlignment: isUser ? CrossAxisAlignment.end : CrossAxisAlignment.start,
              children: [
                if (!isUser)
                  Padding(
                    padding: const EdgeInsets.only(left: 4, bottom: 4),
                    child: Text(
                      message.displayName,
                      style: Theme.of(context).textTheme.labelSmall?.copyWith(color: AppColors.textMuted),
                    ),
                  ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  decoration: BoxDecoration(
                    color: isUser ? AppColors.primary : AppColors.surfaceElevated,
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Text(
                    message.content,
                    style: TextStyle(color: isUser ? Colors.white : AppColors.textPrimary),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _TypingRow extends StatelessWidget {
  const _TypingRow();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        children: [
          const SizedBox(
            width: 16,
            height: 16,
            child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.primary),
          ),
          const SizedBox(width: 8),
          Text('AI is typing…', style: Theme.of(context).textTheme.labelSmall),
        ],
      ),
    );
  }
}

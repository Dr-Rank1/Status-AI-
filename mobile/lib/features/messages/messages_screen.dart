import 'package:flutter/material.dart';

import '../../models/messaging.dart';
import '../../models/session.dart';
import '../../services/api_service.dart';
import '../../theme/app_theme.dart';
import '../../widgets/async_state.dart';
import '../../widgets/character_avatar.dart';
import 'chat_screen.dart';

class MessagesScreen extends StatefulWidget {
  const MessagesScreen({
    super.key,
    required this.api,
    required this.session,
    required this.onSessionUpdated,
    required this.onInteraction,
  });

  final ApiService api;
  final AppSession session;
  final ValueChanged<AppSession> onSessionUpdated;
  final ValueChanged<InteractionUpdate> onInteraction;

  @override
  State<MessagesScreen> createState() => MessagesScreenState();
}

class MessagesScreenState extends State<MessagesScreen> {
  late Future<_InboxData> _inboxFuture;

  @override
  void initState() {
    super.initState();
    _load();
  }

  void _load() {
    _inboxFuture = _fetchInbox();
  }

  Future<_InboxData> _fetchInbox() async {
    final results = await Future.wait([
      widget.api.fetchThreads(),
      widget.api.fetchCharacters(),
    ]);
    return _InboxData(
      threads: results[0] as List<DmThread>,
      characters: results[1] as List<AiCharacter>,
    );
  }

  Future<void> refresh() async {
    setState(_load);
    await _inboxFuture;
  }

  Future<void> _openNewChat() async {
    final data = await _inboxFuture;
    if (!mounted) return;

    final character = await showModalBottomSheet<AiCharacter>(
      context: context,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (context) => _CharacterPicker(characters: data.characters),
    );

    if (character == null || !mounted) return;
    await _openChat(character);
  }

  Future<void> _openThread(DmThread thread) async {
    final character = AiCharacter(
      id: thread.characterId,
      name: thread.characterName,
      handle: thread.characterHandle,
      fandom: thread.characterFandom ?? '',
      avatarUrl: thread.characterAvatar,
      threadId: thread.id,
    );
    await _openChat(character, threadId: thread.id);
  }

  Future<void> _openChat(AiCharacter character, {String? threadId}) async {
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => ChatScreen(
          api: widget.api,
          character: character,
          threadId: threadId ?? character.threadId,
          energyRemaining: widget.session.energy.remaining,
          onEnergyUpdated: (energy) {
            widget.onSessionUpdated(widget.session.copyWith(energy: energy));
          },
          onInteraction: widget.onInteraction,
        ),
      ),
    );
    await refresh();
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 8, 12),
            child: Row(
              children: [
                Text('Messages', style: Theme.of(context).textTheme.headlineSmall),
                const Spacer(),
                IconButton(
                  onPressed: _openNewChat,
                  icon: const Icon(Icons.edit_outlined),
                  tooltip: 'New message',
                ),
              ],
            ),
          ),
          const Divider(height: 1),
          Expanded(
            child: FutureBuilder<_InboxData>(
              future: _inboxFuture,
              builder: (context, snapshot) {
                return AsyncStateView<_InboxData>(
                  snapshot: snapshot,
                  onRetry: refresh,
                  loading: const SkeletonList.threads(count: 6),
                  empty: EmptyStateView(
                    title: 'No conversations yet',
                    subtitle: 'Message a character from Explore or start a new chat.',
                    icon: Icons.chat_bubble_outline,
                    actionLabel: 'New message',
                    onAction: _openNewChat,
                  ),
                  builder: (data) {
                    final threads = data.threads;
                    if (threads.isEmpty) {
                      return EmptyStateView(
                        title: 'No conversations yet',
                        icon: Icons.chat_bubble_outline,
                        actionLabel: 'New message',
                        onAction: _openNewChat,
                      );
                    }

                    return RefreshIndicator(
                      onRefresh: refresh,
                      color: AppColors.primary,
                      backgroundColor: AppColors.surface,
                      child: ListView.separated(
                        itemCount: threads.length,
                        separatorBuilder: (_, __) => const Divider(height: 1, indent: 72),
                        itemBuilder: (context, index) {
                          final thread = threads[index];
                          return ListTile(
                            leading: Stack(
                              clipBehavior: Clip.none,
                              children: [
                                CharacterAvatar(
                                  name: thread.characterName,
                                  imageUrl: thread.characterAvatar,
                                ),
                                if (thread.aiPending)
                                  Positioned(
                                    right: -2,
                                    bottom: -2,
                                    child: Container(
                                      width: 14,
                                      height: 14,
                                      decoration: BoxDecoration(
                                        color: AppColors.accent,
                                        shape: BoxShape.circle,
                                        border: Border.all(color: AppColors.background, width: 2),
                                      ),
                                    ),
                                  ),
                              ],
                            ),
                            title: Row(
                              children: [
                                Expanded(child: Text(thread.characterName)),
                                if (thread.aiPending)
                                  Text(
                                    'typing...',
                                    style: Theme.of(context).textTheme.labelSmall?.copyWith(
                                          color: AppColors.accent,
                                        ),
                                  ),
                              ],
                            ),
                            subtitle: Text(
                              thread.lastMessagePreview ?? 'Start chatting',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                            trailing: Text(
                              '@${thread.characterHandle}',
                              style: Theme.of(context).textTheme.labelSmall?.copyWith(
                                    color: AppColors.textMuted,
                                  ),
                            ),
                            onTap: () => _openThread(thread),
                          );
                        },
                      ),
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _InboxData {
  const _InboxData({required this.threads, required this.characters});

  final List<DmThread> threads;
  final List<AiCharacter> characters;
}

class _CharacterPicker extends StatelessWidget {
  const _CharacterPicker({required this.characters});

  final List<AiCharacter> characters;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: Text('Choose a character', style: Theme.of(context).textTheme.titleMedium),
          ),
          ...characters.map(
            (c) => ListTile(
              leading: CharacterAvatar(name: c.name, imageUrl: c.avatarUrl),
              title: Text(c.name),
              subtitle: Text('${c.fandom} · @${c.handle}'),
              onTap: () => Navigator.pop(context, c),
            ),
          ),
          const SizedBox(height: 8),
        ],
      ),
    );
  }
}

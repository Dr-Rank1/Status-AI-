import 'package:flutter/material.dart';

import '../../models/messaging.dart';
import '../../models/session.dart';
import '../../services/api_service.dart';
import '../../services/offline_cache_service.dart';
import '../../services/realtime_service.dart';
import '../../theme/app_theme.dart';
import '../../widgets/async_state.dart';
import '../../widgets/character_avatar.dart';
import 'chat_screen.dart';
import 'group_chat_screen.dart';

class MessagesScreen extends StatefulWidget {
  const MessagesScreen({
    super.key,
    required this.api,
    required this.realtime,
    required this.session,
    required this.onSessionUpdated,
    required this.onInteraction,
  });

  final ApiService api;
  final RealtimeService realtime;
  final AppSession session;
  final ValueChanged<AppSession> onSessionUpdated;
  final ValueChanged<InteractionUpdate> onInteraction;

  @override
  State<MessagesScreen> createState() => MessagesScreenState();
}

class MessagesScreenState extends State<MessagesScreen> {
  late Future<_InboxData> _inboxFuture;
  bool _offline = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  void _load() {
    _inboxFuture = _fetchInbox().then((data) {
      if (mounted) setState(() {});
      return data;
    });
  }

  Future<_InboxData> _fetchInbox() async {
    try {
      final results = await Future.wait([
        widget.api.fetchThreads(),
        widget.api.fetchCharacters(),
        widget.api.fetchGroups(),
      ]);
      final threads = results[0] as List<DmThread>;
      final groups = results[2] as List<GroupThread>;
      await OfflineCacheService.cacheThreads(threads);
      _offline = false;
      return _InboxData(
        threads: threads,
        groups: groups,
        characters: results[1] as List<AiCharacter>,
      );
    } catch (_) {
      final cached = OfflineCacheService.loadThreads();
      if (cached != null) {
        _offline = true;
        return _InboxData(threads: cached, groups: const [], characters: const []);
      }
      rethrow;
    }
  }

  Future<void> refresh() async {
    setState(_load);
    await _inboxFuture;
  }

  Future<void> _openNewGroup() async {
    final data = await _inboxFuture;
    if (!mounted) return;

    final selected = await showModalBottomSheet<List<AiCharacter>>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (context) => _MultiCharacterPicker(characters: data.characters),
    );

    if (selected == null || selected.isEmpty || !mounted) return;

    final nameController = TextEditingController(
      text: selected.length == 1 ? 'Chat with ${selected.first.name}' : 'Group chat',
    );
    final name = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Group name'),
        content: TextField(controller: nameController, autofocus: true),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
          TextButton(
            onPressed: () => Navigator.pop(context, nameController.text.trim()),
            child: const Text('Create'),
          ),
        ],
      ),
    );
    nameController.dispose();
    if (name == null || name.isEmpty || !mounted) return;

    try {
      final group = await widget.api.createGroup(
        name: name,
        characterIds: selected.map((c) => c.id).toList(),
      );
      if (!mounted) return;
      await _openGroup(group);
      refresh();
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  Future<void> _openGroup(GroupThread group) async {
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => GroupChatScreen(
          api: widget.api,
          realtime: widget.realtime,
          group: group,
          energyRemaining: widget.session.energy.remaining,
          onEnergyUpdated: (energy) {
            widget.onSessionUpdated(widget.session.copyWith(energy: energy));
          },
        ),
      ),
    );
    refresh();
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
          realtime: widget.realtime,
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
                  onPressed: _openNewGroup,
                  icon: const Icon(Icons.group_add_outlined),
                  tooltip: 'New group',
                ),
                IconButton(
                  onPressed: _openNewChat,
                  icon: const Icon(Icons.edit_outlined),
                  tooltip: 'New message',
                ),
              ],
            ),
          ),
          const Divider(height: 1),
          if (_offline)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              color: AppColors.surfaceElevated,
              child: Text(
                'Offline — showing cached conversations',
                style: Theme.of(context).textTheme.labelSmall?.copyWith(color: AppColors.textMuted),
                textAlign: TextAlign.center,
              ),
            ),
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
                    final items = <_InboxItem>[
                      ...data.groups.map(_InboxItem.group),
                      ...data.threads.map(_InboxItem.dm),
                    ];
                    items.sort((a, b) {
                      final aTime = a.sortTime ?? DateTime.fromMillisecondsSinceEpoch(0);
                      final bTime = b.sortTime ?? DateTime.fromMillisecondsSinceEpoch(0);
                      return bTime.compareTo(aTime);
                    });

                    if (items.isEmpty) {
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
                        itemCount: items.length,
                        separatorBuilder: (_, __) => const Divider(height: 1, indent: 72),
                        itemBuilder: (context, index) {
                          final item = items[index];
                          if (item.isGroup) {
                            final group = item.group!;
                            return ListTile(
                              leading: CircleAvatar(
                                backgroundColor: AppColors.primary.withValues(alpha: 0.2),
                                child: const Icon(Icons.groups_rounded, color: AppColors.primary),
                              ),
                              title: Text(group.name),
                              subtitle: Text(group.lastMessagePreview ?? '${group.memberCount} members'),
                              trailing: group.aiPending
                                  ? Text('typing…', style: Theme.of(context).textTheme.labelSmall?.copyWith(color: AppColors.accent))
                                  : null,
                              onTap: () => _openGroup(group),
                            );
                          }

                          final thread = item.thread!;
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
  const _InboxData({
    required this.threads,
    required this.groups,
    required this.characters,
  });

  final List<DmThread> threads;
  final List<GroupThread> groups;
  final List<AiCharacter> characters;
}

class _InboxItem {
  const _InboxItem._({this.thread, this.group});

  factory _InboxItem.dm(DmThread thread) => _InboxItem._(thread: thread);
  factory _InboxItem.group(GroupThread group) => _InboxItem._(group: group);

  final DmThread? thread;
  final GroupThread? group;

  bool get isGroup => group != null;
  DateTime? get sortTime => thread?.lastMessageAt ?? group?.lastMessageAt;
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

class _MultiCharacterPicker extends StatefulWidget {
  const _MultiCharacterPicker({required this.characters});
  final List<AiCharacter> characters;

  @override
  State<_MultiCharacterPicker> createState() => _MultiCharacterPickerState();
}

class _MultiCharacterPickerState extends State<_MultiCharacterPicker> {
  final _selected = <String, AiCharacter>{};

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Padding(
              padding: const EdgeInsets.all(16),
              child: Text('Select AI characters for group', style: Theme.of(context).textTheme.titleMedium),
            ),
            Flexible(
              child: ListView(
                shrinkWrap: true,
                children: widget.characters.map((c) {
                  final checked = _selected.containsKey(c.id);
                  return CheckboxListTile(
                    value: checked,
                    onChanged: (_) {
                      setState(() {
                        if (checked) {
                          _selected.remove(c.id);
                        } else {
                          _selected[c.id] = c;
                        }
                      });
                    },
                    secondary: CharacterAvatar(name: c.name, imageUrl: c.avatarUrl),
                    title: Text(c.name),
                    subtitle: Text('@${c.handle}'),
                  );
                }).toList(),
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(12),
              child: FilledButton(
                onPressed: _selected.isEmpty
                    ? null
                    : () => Navigator.pop(context, _selected.values.toList()),
                child: Text('Add ${_selected.length} character(s)'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

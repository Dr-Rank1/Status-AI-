import 'package:flutter/material.dart';

import '../../models/messaging.dart';
import '../../models/session.dart';
import '../../services/api_service.dart';
import '../../services/realtime_service.dart';
import '../../theme/app_theme.dart';
import '../../widgets/animated_counter.dart';
import '../../widgets/async_state.dart';
import '../../widgets/character_avatar.dart';
import '../../utils/responsive_layout.dart';
import '../../widgets/character_3d_viewer.dart';
import '../../widgets/gated_character_3d_viewer.dart';
import '../characters/character_creator_screen.dart';
import '../live/live_hub_screen.dart';
import '../live/live_video_screen.dart';
import '../messages/chat_screen.dart';
import '../spatial/spatial_scene_screen.dart';

class ExploreScreen extends StatefulWidget {
  const ExploreScreen({
    super.key,
    required this.api,
    required this.realtime,
    required this.session,
    required this.onSessionUpdated,
  });

  final ApiService api;
  final RealtimeService realtime;
  final AppSession session;
  final ValueChanged<AppSession> onSessionUpdated;

  @override
  State<ExploreScreen> createState() => ExploreScreenState();
}

class ExploreScreenState extends State<ExploreScreen> {
  late Future<ExploreData> _exploreFuture;

  @override
  void initState() {
    super.initState();
    _load();
  }

  void _load() {
    _exploreFuture = widget.api.fetchExplore();
  }

  Future<void> refresh() async {
    setState(_load);
    await _exploreFuture;
  }

  Future<void> _toggleFollow(AiCharacter character) async {
    try {
      final result = character.isFollowing
          ? await widget.api.unfollowCharacter(character.id)
          : await widget.api.followCharacter(character.id);

      widget.onSessionUpdated(
        widget.session.copyWith(user: result.user),
      );

      await refresh();

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            result.isFollowing
                ? 'Following ${character.name}'
                : 'Unfollowed ${character.name}',
          ),
        ),
      );
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.message)),
      );
    }
  }

  Future<void> _openLiveHub() async {
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => LiveHubScreen(
          api: widget.api,
          realtime: widget.realtime,
          session: widget.session,
          onEnergyUpdated: (energy) {
            widget.onSessionUpdated(widget.session.copyWith(energy: energy));
          },
        ),
      ),
    );
  }

  Future<void> _goLive(AiCharacter character) async {
    try {
      final result = await widget.api.createLiveSession(
        characterId: character.id,
        title: '${character.name} Live',
      );

      if (!mounted) return;

      await Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => LiveVideoScreen(
            api: widget.api,
            realtime: widget.realtime,
            sessionId: result.session.id,
            energyRemaining: widget.session.energy.remaining,
            onEnergyUpdated: (energy) {
              widget.onSessionUpdated(widget.session.copyWith(energy: energy));
            },
          ),
        ),
      );

      await refresh();
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.message)),
      );
    }
  }

  Future<void> _messageCharacter(AiCharacter character) async {
    try {
      final threadId = character.threadId ?? await widget.api.getOrCreateThread(character.id);

      if (!mounted) return;

      await Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => ChatScreen(
            api: widget.api,
            realtime: widget.realtime,
            character: character,
            threadId: threadId,
            energyRemaining: widget.session.energy.remaining,
            onEnergyUpdated: (energy) {
              widget.onSessionUpdated(widget.session.copyWith(energy: energy));
            },
            onInteraction: (update) {
              widget.onSessionUpdated(
                widget.session.copyWith(
                  user: widget.session.user.copyWith(
                    reputation: update.reputation,
                    followerCount: update.followerCount,
                  ),
                ),
              );
            },
          ),
        ),
      );

      await refresh();
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.message)),
      );
    }
  }

  Future<void> _openSpatial(AiCharacter character) async {
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => SpatialSceneScreen(
          api: widget.api,
          character: character,
        ),
      ),
    );
  }

  Future<void> _openCreator() async {
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => CharacterCreatorScreen(
          api: widget.api,
          onCreated: (_) => refresh(),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _openCreator,
        backgroundColor: AppColors.primary,
        icon: const Icon(Icons.add_rounded, color: Colors.white),
        label: const Text('Create', style: TextStyle(color: Colors.white)),
      ),
      body: SafeArea(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Explore', style: Theme.of(context).textTheme.headlineSmall),
                const SizedBox(height: 8),
                Row(
                  children: [
                    OutlinedButton.icon(
                      onPressed: _openLiveHub,
                      icon: const Icon(Icons.live_tv_rounded, size: 18),
                      label: const Text('Live Now'),
                    ),
                    const Spacer(),
                    AnimatedCountLabel(
                      label: 'Reputation',
                      value: widget.session.user.reputation,
                      icon: Icons.star_rounded,
                      color: AppColors.energy,
                    ),
                    const SizedBox(width: 24),
                    AnimatedCountLabel(
                      label: 'Followers',
                      value: widget.session.user.followerCount,
                      icon: Icons.people_outline,
                      color: AppColors.accent,
                    ),
                    const SizedBox(width: 24),
                    AnimatedCountLabel(
                      label: 'Following',
                      value: widget.session.user.followingCount,
                      icon: Icons.person_add_outlined,
                      color: AppColors.primary,
                    ),
                  ],
                ),
              ],
            ),
          ),
          const Divider(height: 1),
          Expanded(
            child: FutureBuilder<ExploreData>(
              future: _exploreFuture,
              builder: (context, snapshot) {
                return AsyncStateView<ExploreData>(
                  snapshot: snapshot,
                  onRetry: refresh,
                  loading: const SkeletonList.characters(count: 4),
                  empty: const EmptyStateView(
                    title: 'No characters found',
                    subtitle: 'Check back later for new fandoms.',
                    icon: Icons.search_off_rounded,
                  ),
                  builder: (data) {
                    final byFandom = data.byFandom;
                    if (byFandom.isEmpty) {
                      return const EmptyStateView(
                        title: 'No characters found',
                        icon: Icons.search_off_rounded,
                      );
                    }

                    return RefreshIndicator(
                      onRefresh: refresh,
                      color: AppColors.primary,
                      backgroundColor: AppColors.surface,
                      child: ResponsiveContent(
                        maxWidth: ResponsiveLayout.isDesktop(context) ? 960 : double.infinity,
                        child: ListView(
                          children: [
                            if (ResponsiveLayout.isDesktop(context))
                              Padding(
                                padding: const EdgeInsets.fromLTRB(0, 12, 0, 8),
                                child: GatedCharacter3DViewer(
                                  modelUrl: Character3DAssets.defaultModel,
                                  config: const Character3DConfig(
                                    height: 280,
                                    transparentBackground: true,
                                    rotationSpeed: 6,
                                  ),
                                  fallbackLabel: 'Explore characters in 3D',
                                ),
                              ),
                            for (final entry in byFandom.entries) ...[
                            Padding(
                              padding: const EdgeInsets.fromLTRB(16, 20, 16, 8),
                              child: Text(
                                entry.key,
                                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                                      color: AppColors.accent,
                                      fontWeight: FontWeight.w700,
                                    ),
                              ),
                            ),
                            ...entry.value.map(
                              (character) => _CharacterCard(
                                character: character,
                                onFollow: () => _toggleFollow(character),
                                onMessage: () => _messageCharacter(character),
                                onGoLive: () => _goLive(character),
                                onSpatial: () => _openSpatial(character),
                              ),
                            ),
                            ],
                            const SizedBox(height: 24),
                          ],
                        ),
                      ),
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
      ),
    );
  }
}

class _CharacterCard extends StatelessWidget {
  const _CharacterCard({
    required this.character,
    required this.onFollow,
    required this.onMessage,
    required this.onGoLive,
    required this.onSpatial,
  });

  final AiCharacter character;
  final VoidCallback onFollow;
  final VoidCallback onMessage;
  final VoidCallback onGoLive;
  final VoidCallback onSpatial;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context).textTheme;

    return Card(
      color: AppColors.surface,
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: const BorderSide(color: AppColors.border, width: 0.5),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            GatedCharacter3DViewer(
              modelUrl: Character3DAssets.forCharacter(
                modelUrl: character.model3dUrl,
                handle: character.handle,
              ),
              config: const Character3DConfig(
                height: 180,
                transparentBackground: true,
                rotationSpeed: 10,
              ),
              fallbackLabel: character.name,
            ),
            const SizedBox(height: 12),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                CharacterAvatar(name: character.name, imageUrl: character.avatarUrl),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              character.name,
                              style: theme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
                            ),
                          ),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                            decoration: BoxDecoration(
                              color: AppColors.primary.withValues(alpha: 0.15),
                              borderRadius: BorderRadius.circular(4),
                            ),
                            child: Text(
                              'AI',
                              style: theme.labelSmall?.copyWith(
                                color: AppColors.primary,
                                fontWeight: FontWeight.w600,
                                fontSize: 10,
                              ),
                            ),
                          ),
                        ],
                      ),
                      Text(
                        '@${character.handle}',
                        style: theme.bodySmall?.copyWith(color: AppColors.textMuted),
                      ),
                      if (character.bio != null) ...[
                        const SizedBox(height: 6),
                        Text(
                          character.bio!,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: theme.bodySmall,
                        ),
                      ],
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                AnimatedCountLabel(
                  label: 'Fans',
                  value: character.followerCount,
                  color: AppColors.textSecondary,
                ),
                const SizedBox(width: 20),
                AnimatedCountLabel(
                  label: 'Affinity',
                  value: character.affinity,
                  color: character.affinity >= 0 ? AppColors.success : AppColors.like,
                ),
              ],
            ),
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: onGoLive,
                icon: const Icon(Icons.videocam_rounded, size: 18),
                label: const Text('Go Live'),
              ),
            ),
            const SizedBox(height: 8),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: onSpatial,
                icon: const Icon(Icons.view_in_ar_rounded, size: 18),
                label: const Text('Spatial Scene'),
              ),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: onFollow,
                    icon: Icon(
                      character.isFollowing ? Icons.check_rounded : Icons.person_add_outlined,
                      size: 18,
                    ),
                    label: Text(character.isFollowing ? 'Following' : 'Follow'),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: character.isFollowing ? AppColors.success : AppColors.primary,
                      side: BorderSide(
                        color: character.isFollowing ? AppColors.success : AppColors.border,
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: FilledButton.icon(
                    key: Key('e2e_character_message_${character.id}'),
                    onPressed: onMessage,
                    icon: const Icon(Icons.chat_bubble_outline_rounded, size: 18),
                    label: const Text('Message'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

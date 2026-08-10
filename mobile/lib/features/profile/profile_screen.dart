import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../../models/profile.dart';
import '../../models/session.dart';
import '../../services/api_service.dart';
import '../../../main.dart' show permissionService;
import '../../theme/app_theme.dart';
import '../../widgets/animated_counter.dart';
import '../../widgets/async_state.dart';
import '../../widgets/character_avatar.dart';
import '../../widgets/character_3d_viewer.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({
    super.key,
    required this.api,
    required this.session,
    required this.onSessionUpdated,
    this.onOpenStore,
    this.onLogout,
    this.onOpenAdmin,
  });

  final ApiService api;
  final AppSession session;
  final ValueChanged<AppSession> onSessionUpdated;
  final VoidCallback? onOpenStore;
  final VoidCallback? onLogout;
  final VoidCallback? onOpenAdmin;

  @override
  State<ProfileScreen> createState() => ProfileScreenState();
}

class ProfileScreenState extends State<ProfileScreen> {
  late Future<_ProfileData> _profileFuture;
  final _picker = ImagePicker();
  bool _uploadingAvatar = false;

  Future<void> _changeAvatar() async {
    final allowed = await permissionService.ensurePhotosAccess();
    if (!allowed || !mounted) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Photo library permission is required')),
        );
      }
      return;
    }

    final picked = await _picker.pickImage(source: ImageSource.gallery, maxWidth: 800);
    if (picked == null || !mounted) return;

    setState(() => _uploadingAvatar = true);
    try {
      final url = await widget.api.uploadImage(File(picked.path));
      final user = await widget.api.updateProfile(avatarUrl: url);
      widget.onSessionUpdated(
        widget.session.copyWith(user: user),
      );
      await refresh();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Profile photo updated')),
      );
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.message)),
      );
    } finally {
      if (mounted) setState(() => _uploadingAvatar = false);
    }
  }

  @override
  void initState() {
    super.initState();
    _load();
  }

  void _load() {
    _profileFuture = _fetch();
  }

  Future<_ProfileData> _fetch() async {
    final results = await Future.wait([
      widget.api.fetchProfile(),
      widget.api.fetchProfileActivity(),
    ]);
    return _ProfileData(
      profile: results[0] as UserProfile,
      activity: results[1] as List<ActivityItem>,
    );
  }

  Future<void> refresh() async {
    setState(_load);
    final data = await _profileFuture;
    widget.onSessionUpdated(
      AppSession(user: data.profile.user, energy: data.profile.energy),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context).textTheme;

    return SafeArea(
      child: RefreshIndicator(
        onRefresh: refresh,
        color: AppColors.primary,
        backgroundColor: AppColors.surface,
        child: FutureBuilder<_ProfileData>(
          future: _profileFuture,
          builder: (context, snapshot) {
            return AsyncStateView<_ProfileData>(
              snapshot: snapshot,
              onRetry: () {
                setState(_load);
              },
              loading: ListView(
                children: const [
                  ProfileHeaderSkeleton(),
                  Divider(height: 1),
                  SkeletonList.posts(count: 4),
                ],
              ),
              builder: (data) {
                final user = data.profile.user;
                final stats = data.profile.stats;
                final activity = data.activity;

                return ListView(
                  children: [
                    Container(
                      padding: const EdgeInsets.fromLTRB(24, 24, 24, 16),
                      decoration: const BoxDecoration(
                        border: Border(bottom: BorderSide(color: AppColors.border, width: 0.5)),
                      ),
                      child: Column(
                        children: [
                          Character3DViewer(
                            modelUrl: Character3DAssets.forCharacter(handle: user.username),
                            config: const Character3DConfig(
                              height: 200,
                              transparentBackground: true,
                              autoRotate: true,
                            ),
                            fallbackLabel: user.displayName,
                          ),
                          const SizedBox(height: 12),
                          GestureDetector(
                            onTap: _uploadingAvatar ? null : _changeAvatar,
                            child: Stack(
                              alignment: Alignment.bottomRight,
                              children: [
                                CharacterAvatar(
                                  name: user.displayName,
                                  imageUrl: user.avatarUrl,
                                  radius: 44,
                                  isCharacter: false,
                                ),
                                if (_uploadingAvatar)
                                  Positioned.fill(
                                    child: Container(
                                      decoration: BoxDecoration(
                                        color: Colors.black54,
                                        borderRadius: BorderRadius.circular(44),
                                      ),
                                      child: const Center(
                                        child: SizedBox(
                                          width: 24,
                                          height: 24,
                                          child: CircularProgressIndicator(strokeWidth: 2),
                                        ),
                                      ),
                                    ),
                                  )
                                else
                                  Container(
                                    padding: const EdgeInsets.all(6),
                                    decoration: BoxDecoration(
                                      color: AppColors.primary,
                                      shape: BoxShape.circle,
                                      border: Border.all(color: AppColors.surface, width: 2),
                                    ),
                                    child: const Icon(Icons.camera_alt_rounded, size: 16, color: Colors.white),
                                  ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 14),
                          Text(
                            user.displayName,
                            style: theme.headlineSmall?.copyWith(fontWeight: FontWeight.w700),
                          ),
                          Text(
                            '@${user.username}',
                            style: theme.bodyMedium?.copyWith(color: AppColors.textMuted),
                          ),
                          if (user.bio != null && user.bio!.isNotEmpty) ...[
                            const SizedBox(height: 10),
                            Text(
                              user.bio!,
                              textAlign: TextAlign.center,
                              style: theme.bodyMedium?.copyWith(color: AppColors.textSecondary),
                            ),
                          ],
                          const SizedBox(height: 20),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                            children: [
                              _StatColumn(
                                label: 'Followers',
                                value: user.followerCount,
                                color: AppColors.accent,
                              ),
                              _StatColumn(
                                label: 'Following',
                                value: user.followingCount,
                                color: AppColors.primary,
                              ),
                              _StatColumn(
                                label: 'Reputation',
                                value: user.reputation,
                                color: AppColors.energy,
                              ),
                            ],
                          ),
                          const SizedBox(height: 16),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              if (widget.onOpenStore != null)
                                OutlinedButton.icon(
                                  onPressed: widget.onOpenStore,
                                  icon: const Icon(Icons.bolt_rounded, size: 18),
                                  label: const Text('Energy Store'),
                                ),
                              if (widget.onOpenStore != null && widget.onLogout != null)
                                const SizedBox(width: 12),
                              if (widget.onOpenAdmin != null)
                                OutlinedButton.icon(
                                  onPressed: widget.onOpenAdmin,
                                  icon: const Icon(Icons.admin_panel_settings_outlined, size: 18),
                                  label: const Text('Admin'),
                                ),
                              if (widget.onOpenAdmin != null && widget.onLogout != null)
                                const SizedBox(width: 12),
                              if (widget.onLogout != null)
                                TextButton.icon(
                                  onPressed: widget.onLogout,
                                  icon: const Icon(Icons.logout_rounded, size: 18),
                                  label: const Text('Log out'),
                                ),
                            ],
                          ),
                          const SizedBox(height: 8),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              _MiniStat(label: 'Posts', value: stats.postCount),
                              const SizedBox(width: 24),
                              _MiniStat(label: 'Replies', value: stats.replyCount),
                              const SizedBox(width: 24),
                              Row(
                                children: [
                                  const Icon(Icons.bolt_rounded, size: 16, color: AppColors.energy),
                                  const SizedBox(width: 4),
                                  AnimatedCounter(
                                    value: data.profile.energy.remaining,
                                    suffix: ' / ${data.profile.energy.max}',
                                    style: theme.labelLarge?.copyWith(
                                      color: AppColors.energy,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
                      child: Text(
                        'Activity',
                        style: theme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
                      ),
                    ),
                    if (activity.isEmpty)
                      const EmptyStateView(
                        title: 'No activity yet',
                        subtitle: 'Posts and replies will show up here.',
                        icon: Icons.history_rounded,
                      )
                    else
                      ...activity.map((item) => _ActivityTile(item: item)),
                    const SizedBox(height: 24),
                  ],
                );
              },
            );
          },
        ),
      ),
    );
  }
}

class _ProfileData {
  const _ProfileData({required this.profile, required this.activity});

  final UserProfile profile;
  final List<ActivityItem> activity;
}

class _StatColumn extends StatelessWidget {
  const _StatColumn({required this.label, required this.value, required this.color});

  final String label;
  final int value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        AnimatedCounter(
          value: value,
          style: Theme.of(context).textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.w800,
                color: color,
              ),
        ),
        const SizedBox(height: 2),
        Text(
          label,
          style: Theme.of(context).textTheme.labelSmall?.copyWith(
                color: AppColors.textMuted,
              ),
        ),
      ],
    );
  }
}

class _MiniStat extends StatelessWidget {
  const _MiniStat({required this.label, required this.value});

  final String label;
  final int value;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        AnimatedCounter(
          value: value,
          style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
        ),
        Text(label, style: Theme.of(context).textTheme.labelSmall?.copyWith(color: AppColors.textMuted)),
      ],
    );
  }
}

class _ActivityTile extends StatelessWidget {
  const _ActivityTile({required this.item});

  final ActivityItem item;

  String _timeAgo(DateTime dt) {
    final diff = DateTime.now().difference(dt);
    if (diff.inMinutes < 60) return '${diff.inMinutes}m';
    if (diff.inHours < 24) return '${diff.inHours}h';
    return '${diff.inDays}d';
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context).textTheme;

    return Container(
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: AppColors.border, width: 0.5)),
      ),
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                item.isReply ? Icons.chat_bubble_outline_rounded : Icons.edit_outlined,
                size: 16,
                color: item.isReply ? AppColors.accent : AppColors.primary,
              ),
              const SizedBox(width: 6),
              Text(
                item.isReply ? 'Reply' : 'Post',
                style: theme.labelSmall?.copyWith(
                  color: item.isReply ? AppColors.accent : AppColors.primary,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(width: 6),
              Text('·', style: theme.labelSmall?.copyWith(color: AppColors.textMuted)),
              const SizedBox(width: 6),
              Text(
                _timeAgo(item.createdAt),
                style: theme.labelSmall?.copyWith(color: AppColors.textMuted),
              ),
              const Spacer(),
              Text(
                item.fandom,
                style: theme.labelSmall?.copyWith(color: AppColors.textMuted),
              ),
            ],
          ),
          if (item.isReply && item.parentContent != null) ...[
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: AppColors.surfaceElevated,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: AppColors.border),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (item.parentCharacterName != null)
                    Text(
                      'Replying to ${item.parentCharacterName}',
                      style: theme.labelSmall?.copyWith(color: AppColors.accent),
                    ),
                  Text(
                    item.parentContent!,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: theme.bodySmall?.copyWith(color: AppColors.textSecondary),
                  ),
                ],
              ),
            ),
          ],
          const SizedBox(height: 8),
          Text(item.content, style: theme.bodyLarge?.copyWith(height: 1.4)),
          const SizedBox(height: 8),
          Row(
            children: [
              Icon(Icons.favorite_border, size: 16, color: AppColors.like.withValues(alpha: 0.8)),
              const SizedBox(width: 4),
              Text('${item.likeCount}', style: theme.labelSmall?.copyWith(color: AppColors.textMuted)),
              const SizedBox(width: 16),
              Icon(Icons.chat_bubble_outline, size: 16, color: AppColors.textMuted),
              const SizedBox(width: 4),
              Text('${item.replyCount}', style: theme.labelSmall?.copyWith(color: AppColors.textMuted)),
            ],
          ),
        ],
      ),
    );
  }
}

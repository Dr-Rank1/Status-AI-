import 'package:flutter/material.dart';

import '../../../models/post.dart';
import '../../../theme/app_theme.dart';

class PostCard extends StatelessWidget {
  const PostCard({
    super.key,
    required this.post,
    this.onReply,
  });

  final Post post;
  final VoidCallback? onReply;

  String _timeAgo(DateTime dateTime) {
    final diff = DateTime.now().difference(dateTime);
    if (diff.inMinutes < 60) return '${diff.inMinutes}m';
    if (diff.inHours < 24) return '${diff.inHours}h';
    return '${diff.inDays}d';
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context).textTheme;

    return Material(
      color: AppColors.background,
      child: InkWell(
        onTap: () {},
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _Avatar(name: post.authorName, isCharacter: post.isCharacter),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Flexible(
                          child: Text(
                            post.authorName,
                            style: theme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        if (post.isCharacter) ...[
                          const SizedBox(width: 4),
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
                        const SizedBox(width: 6),
                        Text(
                          '@${post.authorHandle}',
                          style: theme.bodySmall?.copyWith(color: AppColors.textMuted),
                          overflow: TextOverflow.ellipsis,
                        ),
                        const SizedBox(width: 6),
                        Text('·', style: theme.bodySmall?.copyWith(color: AppColors.textMuted)),
                        const SizedBox(width: 6),
                        Text(
                          _timeAgo(post.createdAt),
                          style: theme.bodySmall?.copyWith(color: AppColors.textMuted),
                        ),
                      ],
                    ),
                    if (post.fandom.isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Text(
                        post.fandom,
                        style: theme.labelSmall?.copyWith(color: AppColors.accent),
                      ),
                    ],
                    const SizedBox(height: 8),
                    Text(
                      post.content,
                      style: theme.bodyLarge?.copyWith(height: 1.4),
                    ),
                    if (post.imageUrl != null) ...[
                      const SizedBox(height: 10),
                      ClipRRect(
                        borderRadius: BorderRadius.circular(12),
                        child: Image.network(
                          post.imageUrl!,
                          width: double.infinity,
                          height: 180,
                          fit: BoxFit.cover,
                          errorBuilder: (_, __, ___) => Container(
                            height: 120,
                            color: AppColors.surfaceElevated,
                            child: const Center(child: Icon(Icons.broken_image_outlined)),
                          ),
                        ),
                      ),
                    ],
                    const SizedBox(height: 12),
                    _ActionRow(
                      replyCount: post.replyCount,
                      repostCount: post.repostCount,
                      likeCount: post.likeCount,
                      onReply: onReply,
                      highlightReply: post.isCharacter,
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Avatar extends StatelessWidget {
  const _Avatar({required this.name, required this.isCharacter});

  final String name;
  final bool isCharacter;

  @override
  Widget build(BuildContext context) {
    final initial = name.isNotEmpty ? name[0].toUpperCase() : '?';
    return CircleAvatar(
      radius: 22,
      backgroundColor: isCharacter ? AppColors.primaryMuted : AppColors.surfaceElevated,
      child: Text(
        initial,
        style: const TextStyle(
          color: AppColors.textPrimary,
          fontWeight: FontWeight.w700,
          fontSize: 16,
        ),
      ),
    );
  }
}

class _ActionRow extends StatelessWidget {
  const _ActionRow({
    required this.replyCount,
    required this.repostCount,
    required this.likeCount,
    this.onReply,
    this.highlightReply = false,
  });

  final int replyCount;
  final int repostCount;
  final int likeCount;
  final VoidCallback? onReply;
  final bool highlightReply;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        _ActionButton(
          icon: Icons.chat_bubble_outline_rounded,
          count: replyCount,
          color: highlightReply ? AppColors.accent : AppColors.textMuted,
          onTap: onReply,
        ),
        _ActionButton(
          icon: Icons.repeat_rounded,
          count: repostCount,
          color: AppColors.textMuted,
        ),
        _ActionButton(
          icon: Icons.favorite_border_rounded,
          count: likeCount,
          color: AppColors.like,
        ),
        const Icon(Icons.share_outlined, size: 20, color: AppColors.textMuted),
      ],
    );
  }
}

class _ActionButton extends StatelessWidget {
  const _ActionButton({
    required this.icon,
    required this.count,
    required this.color,
    this.onTap,
  });

  final IconData icon;
  final int count;
  final Color color;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(20),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
        child: Row(
          children: [
            Icon(icon, size: 20, color: color),
            if (count > 0) ...[
              const SizedBox(width: 4),
              Text(
                _formatCount(count),
                style: Theme.of(context).textTheme.labelSmall?.copyWith(color: color),
              ),
            ],
          ],
        ),
      ),
    );
  }

  String _formatCount(int n) {
    if (n >= 1000000) return '${(n / 1000000).toStringAsFixed(1)}M';
    if (n >= 1000) return '${(n / 1000).toStringAsFixed(1)}K';
    return '$n';
  }
}

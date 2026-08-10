import 'package:flutter/material.dart';

import '../../../theme/app_theme.dart';
import '../../../widgets/animated_counter.dart';

class FeedHeader extends StatelessWidget {
  const FeedHeader({
    super.key,
    this.displayName,
    this.reputation = 0,
    this.followerCount = 0,
  });

  final String? displayName;
  final int reputation;
  final int followerCount;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 12, 8, 12),
      decoration: const BoxDecoration(
        color: AppColors.background,
        border: Border(bottom: BorderSide(color: AppColors.border, width: 0.5)),
      ),
      child: Row(
        children: [
          ShaderMask(
            shaderCallback: (bounds) => const LinearGradient(
              colors: [AppColors.primary, AppColors.accent],
            ).createShader(bounds),
            child: Text(
              'Status',
              style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: Colors.white,
                    letterSpacing: -0.5,
                  ),
            ),
          ),
          if (displayName != null) ...[
            const SizedBox(width: 8),
            Flexible(
              child: Text(
                displayName!,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: AppColors.textMuted,
                    ),
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
          const Spacer(),
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.star_rounded, size: 14, color: AppColors.energy.withValues(alpha: 0.9)),
              const SizedBox(width: 4),
              AnimatedCounter(
                value: reputation,
                style: Theme.of(context).textTheme.labelMedium?.copyWith(
                      color: AppColors.energy,
                      fontWeight: FontWeight.w600,
                    ),
              ),
              const SizedBox(width: 12),
              Icon(Icons.people_outline, size: 14, color: AppColors.accent.withValues(alpha: 0.9)),
              const SizedBox(width: 4),
              AnimatedCounter(
                value: followerCount,
                style: Theme.of(context).textTheme.labelMedium?.copyWith(
                      color: AppColors.accent,
                      fontWeight: FontWeight.w600,
                    ),
              ),
            ],
          ),
          IconButton(
            onPressed: () {},
            icon: const Icon(Icons.notifications_none_rounded),
            tooltip: 'Notifications',
          ),
        ],
      ),
    );
  }
}

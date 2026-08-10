import 'package:flutter/material.dart';

import '../../theme/app_theme.dart';
import '../../widgets/animated_counter.dart';

class EnergyBar extends StatelessWidget {
  const EnergyBar({
    super.key,
    required this.remaining,
    required this.max,
    this.onTap,
  });

  final int remaining;
  final int max;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: TweenAnimationBuilder<double>(
        key: ValueKey(remaining),
        tween: Tween<double>(begin: 0, end: max > 0 ? remaining / max : 0),
        duration: const Duration(milliseconds: 500),
        curve: Curves.easeOutCubic,
        builder: (context, fraction, _) {
          return Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          decoration: const BoxDecoration(
            color: AppColors.surface,
            border: Border(bottom: BorderSide(color: AppColors.border, width: 0.5)),
          ),
          child: Row(
            children: [
              const Icon(Icons.bolt_rounded, color: AppColors.energy, size: 20),
              const SizedBox(width: 8),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Energy',
                      style: Theme.of(context).textTheme.labelSmall?.copyWith(
                            color: AppColors.textSecondary,
                            letterSpacing: 0.5,
                          ),
                    ),
                    const SizedBox(height: 6),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(4),
                      child: LinearProgressIndicator(
                        value: fraction,
                        minHeight: 6,
                        backgroundColor: AppColors.border,
                        valueColor: AlwaysStoppedAnimation<Color>(
                          fraction > 0.3 ? AppColors.energy : AppColors.like,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              AnimatedCounter(
                value: remaining,
                prefix: '',
                suffix: ' / $max',
                style: Theme.of(context).textTheme.labelLarge?.copyWith(
                      color: AppColors.energy,
                      fontWeight: FontWeight.w600,
                    ),
              ),
            ],
          ),
        );
      },
      ),
    );
  }
}

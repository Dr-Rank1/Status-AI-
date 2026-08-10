import 'package:flutter/material.dart';

import '../../models/spatial.dart';
import '../../theme/app_theme.dart';

/// Proxemic "plastic" layout — UI morphs with distance zone for spatial continuity.
class PlasticLayout extends StatelessWidget {
  const PlasticLayout({
    super.key,
    required this.zone,
    required this.child,
    this.padding = const EdgeInsets.all(16),
    this.elevated = true,
  });

  final ProxemicZone zone;
  final Widget child;
  final EdgeInsetsGeometry padding;
  final bool elevated;

  @override
  Widget build(BuildContext context) {
    final scale = zone.layoutScale;
    final blur = zone == ProxemicZone.public ? 8.0 : zone == ProxemicZone.social ? 4.0 : 0.0;
    final opacity = zone == ProxemicZone.public ? 0.88 : 1.0;

    return AnimatedScale(
      scale: scale,
      duration: const Duration(milliseconds: 420),
      curve: Curves.easeOutCubic,
      child: AnimatedOpacity(
        opacity: opacity,
        duration: const Duration(milliseconds: 420),
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: AppColors.surface.withValues(alpha: elevated ? 0.94 : 0.85),
            borderRadius: BorderRadius.circular(zone == ProxemicZone.intimate ? 20 : 14),
            border: Border.all(
              color: _zoneColor.withValues(alpha: 0.35),
              width: zone == ProxemicZone.intimate ? 1.5 : 1,
            ),
            boxShadow: elevated
                ? [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.35),
                      blurRadius: blur + 12,
                      offset: Offset(0, zone == ProxemicZone.public ? 8 : 4),
                    ),
                  ]
                : null,
          ),
          child: Padding(padding: padding, child: child),
        ),
      ),
    );
  }

  Color get _zoneColor {
    switch (zone) {
      case ProxemicZone.intimate:
        return AppColors.like;
      case ProxemicZone.personal:
        return AppColors.primary;
      case ProxemicZone.social:
        return AppColors.accent;
      case ProxemicZone.public:
        return AppColors.textMuted;
    }
  }
}

/// Spatial shell wrapping 2D content with depth parallax for mixed-reality continuity.
class SpatialContinuityShell extends StatelessWidget {
  const SpatialContinuityShell({
    super.key,
    required this.zone,
    required this.foreground,
    this.background,
    this.header,
  });

  final ProxemicZone zone;
  final Widget foreground;
  final Widget? background;
  final Widget? header;

  @override
  Widget build(BuildContext context) {
    final depth = switch (zone) {
      ProxemicZone.intimate => 0.0,
      ProxemicZone.personal => 12.0,
      ProxemicZone.social => 28.0,
      ProxemicZone.public => 48.0,
    };

    return Stack(
      fit: StackFit.expand,
      children: [
        if (background != null)
          Transform.translate(
            offset: Offset(0, depth * 0.3),
            child: Opacity(opacity: 0.35, child: background),
          ),
        Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (header != null) header!,
            Expanded(
              child: Transform.translate(
                offset: Offset(0, depth * 0.08),
                child: foreground,
              ),
            ),
          ],
        ),
      ],
    );
  }
}

/// Zone picker for simulating proxemic distance in dev / non-LiDAR devices.
class ProxemicZoneControl extends StatelessWidget {
  const ProxemicZoneControl({
    super.key,
    required this.zone,
    required this.distanceMeters,
    required this.onChanged,
  });

  final ProxemicZone zone;
  final double distanceMeters;
  final ValueChanged<double> onChanged;

  @override
  Widget build(BuildContext context) {
    return PlasticLayout(
      zone: zone,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.straighten, size: 16, color: AppColors.accent),
              const SizedBox(width: 8),
              Text(
                'Proxemic zone: ${zone.name}',
                style: Theme.of(context).textTheme.labelLarge,
              ),
              const Spacer(),
              Text('${distanceMeters.toStringAsFixed(1)} m'),
            ],
          ),
          Slider(
            value: distanceMeters.clamp(0.2, 4.0),
            min: 0.2,
            max: 4.0,
            onChanged: onChanged,
            activeColor: AppColors.primary,
          ),
        ],
      ),
    );
  }
}

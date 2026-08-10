import 'package:flutter/material.dart';

import '../services/feature_flag_service.dart';
import '../services/subscription_service.dart';
import 'character_3d_viewer.dart';

/// 3D avatar viewer gated behind Pro subscription or PostHog `enable-3d-avatars` flag.
class GatedCharacter3DViewer extends StatefulWidget {
  const GatedCharacter3DViewer({
    super.key,
    required this.modelUrl,
    this.config = const Character3DConfig(),
    this.fallbackLabel,
    this.fallback,
  });

  final String modelUrl;
  final Character3DConfig config;
  final String? fallbackLabel;
  final Widget? fallback;

  @override
  State<GatedCharacter3DViewer> createState() => _GatedCharacter3DViewerState();
}

class _GatedCharacter3DViewerState extends State<GatedCharacter3DViewer> {
  late Future<bool> _enabledFuture;

  @override
  void initState() {
    super.initState();
    _enabledFuture = _resolveAccess();
  }

  Future<bool> _resolveAccess() async {
    if (subscriptionService.isPro) return true;
    return FeatureFlagService.instance.is3dAvatarsEnabled();
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<bool>(
      future: _enabledFuture,
      builder: (context, snapshot) {
        final enabled = snapshot.data ?? false;

        if (enabled) {
          return Character3DViewer(
            modelUrl: widget.modelUrl,
            config: widget.config,
            fallbackLabel: widget.fallbackLabel,
          );
        }

        if (widget.fallback != null) return widget.fallback!;

        return _StaticAvatarFallback(label: widget.fallbackLabel ?? 'Character');
      },
    );
  }
}

class _StaticAvatarFallback extends StatelessWidget {
  const _StaticAvatarFallback({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 180,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHighest.withValues(alpha: 0.4),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          CircleAvatar(
            radius: 36,
            child: Text(label.isNotEmpty ? label[0].toUpperCase() : '?'),
          ),
          const SizedBox(height: 8),
          Text(label, style: Theme.of(context).textTheme.titleSmall),
        ],
      ),
    );
  }
}

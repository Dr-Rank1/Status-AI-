import 'package:flutter/material.dart';
import 'package:flutter_3d_controller/flutter_3d_controller.dart';

import '../theme/app_theme.dart';

/// Configuration for the interactive 3D character viewer.
class Character3DConfig {
  const Character3DConfig({
    this.height = 220,
    this.autoRotate = true,
    this.rotationSpeed = 8,
    this.transparentBackground = true,
    this.progressBarColor,
    this.animationName,
    this.cameraOrbitTheta = 25,
    this.cameraOrbitPhi = 75,
    this.cameraOrbitRadius = 105,
  });

  final double height;
  final bool autoRotate;
  final int rotationSpeed;
  final bool transparentBackground;
  final Color? progressBarColor;
  final String? animationName;
  final double cameraOrbitTheta;
  final double cameraOrbitPhi;
  final double cameraOrbitRadius;
}

/// Renders an interactive GLB/GLTF model with animation and camera controls.
class Character3DViewer extends StatefulWidget {
  const Character3DViewer({
    super.key,
    required this.modelUrl,
    this.config = const Character3DConfig(),
    this.fallbackLabel,
  });

  final String modelUrl;
  final Character3DConfig config;
  final String? fallbackLabel;

  @override
  State<Character3DViewer> createState() => _Character3DViewerState();
}

class _Character3DViewerState extends State<Character3DViewer> {
  final _controller = Flutter3DController();
  bool _loaded = false;
  bool _failed = false;

  @override
  void initState() {
    super.initState();
    _controller.onModelLoaded.addListener(_onModelLoaded);
  }

  void _onModelLoaded() {
    if (!_controller.onModelLoaded.value || !mounted) return;
    setState(() => _loaded = true);

    _controller.setCameraOrbit(
      widget.config.cameraOrbitTheta,
      widget.config.cameraOrbitPhi,
      widget.config.cameraOrbitRadius,
    );

    if (widget.config.autoRotate) {
      _controller.startRotation(rotationSpeed: widget.config.rotationSpeed);
    }

    if (widget.config.animationName != null) {
      _controller.playAnimation(animationName: widget.config.animationName);
    } else {
      _controller.playAnimation();
    }
  }

  @override
  void dispose() {
    _controller.onModelLoaded.removeListener(_onModelLoaded);
    _controller.stopRotation();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_failed) {
      return _FallbackPlate(label: widget.fallbackLabel ?? '3D model unavailable');
    }

    return ClipRRect(
      borderRadius: BorderRadius.circular(14),
      child: Container(
        height: widget.config.height,
        decoration: BoxDecoration(
          color: widget.config.transparentBackground
              ? Colors.transparent
              : AppColors.surfaceElevated,
          border: Border.all(color: AppColors.border.withValues(alpha: 0.4)),
          borderRadius: BorderRadius.circular(14),
        ),
        child: Stack(
          alignment: Alignment.center,
          children: [
            Flutter3DViewer(
              controller: _controller,
              src: widget.modelUrl,
              activeGestureInterceptor: true,
              enableTouch: true,
              progressBarColor:
                  widget.config.progressBarColor ?? AppColors.primary.withValues(alpha: 0.6),
              onLoad: (_) => setState(() => _loaded = true),
              onError: (_) => setState(() => _failed = true),
            ),
            if (!_loaded)
              const SizedBox(
                width: 28,
                height: 28,
                child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.primary),
              ),
          ],
        ),
      ),
    );
  }
}

class _FallbackPlate extends StatelessWidget {
  const _FallbackPlate({required this.label});
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 160,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: AppColors.surfaceElevated,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.border),
      ),
      child: Text(label, style: Theme.of(context).textTheme.labelMedium),
    );
  }
}

/// Default model URLs when API does not supply model_3d_url.
class Character3DAssets {
  static const defaultModel =
      'https://modelviewer.dev/shared-assets/models/Astronaut.glb';

  static String forCharacter({String? modelUrl, String? handle}) {
    if (modelUrl != null && modelUrl.isNotEmpty) return modelUrl;
    switch (handle) {
      case 'kai_mori':
        return 'https://modelviewer.dev/shared-assets/models/RobotExpressive.glb';
      case 'nova_star':
        return 'https://modelviewer.dev/shared-assets/models/Astronaut.glb';
      default:
        return defaultModel;
    }
  }
}

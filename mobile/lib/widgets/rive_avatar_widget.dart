import 'dart:async';

import 'package:flutter/material.dart';
import 'package:rive/rive.dart';

import '../theme/app_theme.dart';
import 'character_avatar.dart';

enum RiveAvatarState { listening, talking }

/// 2D reactive avatar fallback — transitions between talking and listening
/// based on the live audio stream. Uses a Rive state machine when an asset
/// is bundled; otherwise animates a lightweight placeholder.
class RiveAvatarWidget extends StatefulWidget {
  const RiveAvatarWidget({
    super.key,
    required this.state,
    this.characterName = 'AI',
    this.avatarUrl,
    this.riveAsset = 'assets/avatars/live_avatar.riv',
  });

  final RiveAvatarState state;
  final String characterName;
  final String? avatarUrl;
  final String riveAsset;

  @override
  State<RiveAvatarWidget> createState() => _RiveAvatarWidgetState();
}

class _RiveAvatarWidgetState extends State<RiveAvatarWidget>
    with SingleTickerProviderStateMixin {
  Artboard? _artboard;
  StateMachineController? _controller;
  SMIBool? _talkingInput;
  SMIBool? _listeningInput;
  bool _riveLoaded = false;

  late AnimationController _pulseController;
  late Animation<double> _pulse;

  @override
  void initState() {
    super.initState();
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 900),
    )..repeat(reverse: true);
    _pulse = Tween<double>(begin: 0.96, end: 1.04).animate(
      CurvedAnimation(parent: _pulseController, curve: Curves.easeInOut),
    );
    unawaited(_loadRive());
  }

  Future<void> _loadRive() async {
    try {
      final file = await RiveFile.asset(widget.riveAsset);
      final artboard = file.mainArtboard;
      final controller = StateMachineController.fromArtboard(
        artboard,
        'State Machine 1',
      );
      if (controller != null) {
        artboard.addController(controller);
        _talkingInput = controller.findInput<bool>('talking') as SMIBool?;
        _listeningInput = controller.findInput<bool>('listening') as SMIBool?;
      }
      if (!mounted) return;
      setState(() {
        _artboard = artboard;
        _controller = controller;
        _riveLoaded = true;
      });
      _applyState(widget.state);
    } catch (_) {
      if (mounted) setState(() => _riveLoaded = false);
    }
  }

  @override
  void didUpdateWidget(covariant RiveAvatarWidget oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.state != widget.state) {
      _applyState(widget.state);
    }
  }

  void _applyState(RiveAvatarState state) {
    if (!_riveLoaded) return;
    _talkingInput?.value = state == RiveAvatarState.talking;
    _listeningInput?.value = state == RiveAvatarState.listening;
  }

  @override
  void dispose() {
    _controller?.dispose();
    _pulseController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_riveLoaded && _artboard != null) {
      return ColoredBox(
        color: AppColors.surface,
        child: Rive(artboard: _artboard!, fit: BoxFit.contain),
      );
    }

    final talking = widget.state == RiveAvatarState.talking;

    return ColoredBox(
      color: AppColors.surface,
      child: Center(
        child: AnimatedBuilder(
          animation: _pulse,
          builder: (context, child) {
            return Transform.scale(
              scale: talking ? _pulse.value : 1.0,
              child: child,
            );
          },
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Stack(
                alignment: Alignment.center,
                children: [
                  CharacterAvatar(
                    name: widget.characterName,
                    imageUrl: widget.avatarUrl,
                    radius: 72,
                  ),
                  if (talking)
                    Container(
                      width: 160,
                      height: 160,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        border: Border.all(
                          color: AppColors.primary.withValues(alpha: 0.55),
                          width: 3,
                        ),
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                decoration: BoxDecoration(
                  color: talking
                      ? AppColors.primary.withValues(alpha: 0.2)
                      : AppColors.border.withValues(alpha: 0.35),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  talking ? 'Speaking…' : 'Listening…',
                  style: Theme.of(context).textTheme.labelLarge?.copyWith(
                        color: talking ? AppColors.primary : AppColors.textSecondary,
                      ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

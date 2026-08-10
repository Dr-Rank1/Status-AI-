import 'package:flutter/material.dart';

import 'dart:math' as math;

import '../models/theme_config.dart';
import '../services/omni_dimensional_shell_service.dart';
import '../services/theme_config_service.dart';
import 'ouroboros_hello_world_shell.dart';

/// Phase 50 — Meta-toggle + shells for Phase 1 / 25 / 48 surfaces.
class OmniDimensionalShell extends StatefulWidget {
  const OmniDimensionalShell({
    super.key,
    required this.child,
    this.themeConfig = ThemeConfig.defaults,
  });

  /// Production Status tree when mode == status.
  final Widget child;
  final ThemeConfig themeConfig;

  @override
  State<OmniDimensionalShell> createState() => _OmniDimensionalShellState();
}

class _OmniDimensionalShellState extends State<OmniDimensionalShell> {
  late OmniShellMode _mode;

  @override
  void initState() {
    super.initState();
    _mode = OmniDimensionalShellService.instance.mode;
  }

  Future<void> _select(OmniShellMode mode) async {
    await OmniDimensionalShellService.instance.setMode(mode);
    if (mounted) setState(() => _mode = mode);
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      fit: StackFit.expand,
      children: [
        Positioned.fill(child: _bodyForMode(_mode)),
        Positioned(
          top: MediaQuery.paddingOf(context).top + 8,
          right: 12,
          child: _MetaToggleChip(mode: _mode, onSelect: _select),
        ),
      ],
    );
  }

  Widget _bodyForMode(OmniShellMode mode) {
    switch (mode) {
      case OmniShellMode.phase1:
        return OuroborosHelloWorldShell(onContinue: () => _select(OmniShellMode.status));
      case OmniShellMode.phase25:
        return _Phase25WhiteLabelShell(
          config: widget.themeConfig,
          onBack: () => _select(OmniShellMode.status),
        );
      case OmniShellMode.phase48:
        return _Phase48MultiversalShell(onBack: () => _select(OmniShellMode.status));
      case OmniShellMode.status:
        return widget.child;
    }
  }
}

class _MetaToggleChip extends StatelessWidget {
  const _MetaToggleChip({required this.mode, required this.onSelect});

  final OmniShellMode mode;
  final ValueChanged<OmniShellMode> onSelect;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: const Color(0xCC1A1C22),
      borderRadius: BorderRadius.circular(10),
      child: PopupMenuButton<OmniShellMode>(
        tooltip: 'Omni-dimensional shell',
        initialValue: mode,
        onSelected: onSelect,
        itemBuilder: (context) => const [
          PopupMenuItem(value: OmniShellMode.status, child: Text('Status (default)')),
          PopupMenuItem(value: OmniShellMode.phase1, child: Text('Phase 1 — Hello World')),
          PopupMenuItem(value: OmniShellMode.phase25, child: Text('Phase 25 — White-Label')),
          PopupMenuItem(value: OmniShellMode.phase48, child: Text('Phase 48 — Multiversal')),
        ],
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.layers_outlined, size: 16, color: Color(0xFFE8E6E1)),
              const SizedBox(width: 6),
              Text(
                _label(mode),
                style: const TextStyle(color: Color(0xFFE8E6E1), fontSize: 12),
              ),
            ],
          ),
        ),
      ),
    );
  }

  static String _label(OmniShellMode mode) => switch (mode) {
        OmniShellMode.status => 'Omni',
        OmniShellMode.phase1 => 'P1',
        OmniShellMode.phase25 => 'P25',
        OmniShellMode.phase48 => 'P48',
      };
}

class _Phase25WhiteLabelShell extends StatelessWidget {
  const _Phase25WhiteLabelShell({required this.config, required this.onBack});

  final ThemeConfig config;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    final primary = config.primary;
    final bg = config.background;
    return Scaffold(
      backgroundColor: bg,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: Text(config.appName.isEmpty ? 'White-Label' : config.appName),
        leading: IconButton(icon: const Icon(Icons.arrow_back), onPressed: onBack),
      ),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Phase 25 · White-Label Dashboard',
              style: Theme.of(context).textTheme.headlineSmall?.copyWith(color: primary),
            ),
            const SizedBox(height: 12),
            Text(
              'Tenant theme surface for branded Status deployments. '
              'Primary, surfaces, and app name follow ThemeConfig — not hardcoded product chrome.',
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: const Color(0xFFB8B4AC),
                  ),
            ),
            const SizedBox(height: 28),
            Wrap(
              spacing: 12,
              runSpacing: 12,
              children: [
                _swatch('Primary', primary),
                _swatch('Background', bg),
                _swatch('Accent', config.accent),
                _swatch('Surface', config.surface),
              ],
            ),
            const Spacer(),
            Text(
              'tenant: ${themeConfigService.tenantHeaderSlug}',
              style: const TextStyle(color: Color(0xFF7A7870), fontSize: 12),
            ),
          ],
        ),
      ),
    );
  }

  Widget _swatch(String label, Color color) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 72,
          height: 48,
          decoration: BoxDecoration(
            color: color,
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: Colors.white24),
          ),
        ),
        const SizedBox(height: 6),
        Text(label, style: const TextStyle(color: Color(0xFFB8B4AC), fontSize: 12)),
      ],
    );
  }
}

class _Phase48MultiversalShell extends StatelessWidget {
  const _Phase48MultiversalShell({required this.onBack});

  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF05060A),
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: const Text('Multiversal Reality Canvas'),
        leading: IconButton(icon: const Icon(Icons.arrow_back), onPressed: onBack),
      ),
      body: Column(
        children: [
          const Padding(
            padding: EdgeInsets.fromLTRB(24, 8, 24, 16),
            child: Align(
              alignment: Alignment.centerLeft,
              child: Text(
                'Phase 48 · Architect / Terminal Zenith surface (client shell)',
                style: TextStyle(color: Color(0xFFB8B4AC)),
              ),
            ),
          ),
          Expanded(
            child: CustomPaint(
              painter: _MultiversalCanvasPainter(),
              child: const SizedBox.expand(),
            ),
          ),
        ],
      ),
    );
  }
}

class _MultiversalCanvasPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final center = size.center(Offset.zero);
    final bg = Paint()..color = const Color(0xFF05060A);
    canvas.drawRect(Offset.zero & size, bg);
    for (var i = 1; i <= 16; i++) {
      final paint = Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1
        ..color = Color.fromRGBO(100 + i * 6, 140, 180, 0.12 + (i % 4) * 0.04);
      canvas.drawCircle(center, size.shortestSide * 0.04 * i, paint);
    }
    final arc = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2
      ..color = const Color(0x66C8BEA0);
    canvas.drawArc(
      Rect.fromCircle(center: center, radius: size.shortestSide * 0.32),
      -math.pi / 2,
      math.pi * 1.75,
      false,
      arc,
    );
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

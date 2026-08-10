import 'package:flutter/material.dart';

/// Phase 49 — Ontological condensation: multiverse → single Hello World shell.
/// Ceremonial UI only; does not replace production AuthGate unless opted in.
class OuroborosHelloWorldShell extends StatefulWidget {
  const OuroborosHelloWorldShell({super.key, this.onContinue});

  /// Optional escape hatch back to the full app (e.g. set by main when not in pure epoch-zero mode).
  final VoidCallback? onContinue;

  @override
  State<OuroborosHelloWorldShell> createState() => _OuroborosHelloWorldShellState();
}

class _OuroborosHelloWorldShellState extends State<OuroborosHelloWorldShell>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  late final Animation<double> _fieldOpacity;
  late final Animation<double> _helloOpacity;
  late final Animation<double> _scale;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2800),
    )..forward();
    _fieldOpacity = Tween<double>(begin: 1, end: 0).animate(
      CurvedAnimation(parent: _controller, curve: const Interval(0.0, 0.55, curve: Curves.easeInOut)),
    );
    _helloOpacity = Tween<double>(begin: 0, end: 1).animate(
      CurvedAnimation(parent: _controller, curve: const Interval(0.45, 0.85, curve: Curves.easeOut)),
    );
    _scale = Tween<double>(begin: 2.4, end: 1).animate(
      CurvedAnimation(parent: _controller, curve: const Interval(0.4, 1.0, curve: Curves.easeOutCubic)),
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      backgroundColor: const Color(0xFF0A0B0F),
      body: AnimatedBuilder(
        animation: _controller,
        builder: (context, _) {
          return Stack(
            fit: StackFit.expand,
            children: [
              Opacity(
                opacity: _fieldOpacity.value,
                child: CustomPaint(painter: _HyperFieldPainter(progress: _controller.value)),
              ),
              Center(
                child: Opacity(
                  opacity: _helloOpacity.value,
                  child: Transform.scale(
                    scale: _scale.value,
                    child: Text(
                      'Hello World',
                      style: theme.textTheme.headlineMedium?.copyWith(
                        color: const Color(0xFFE8E6E1),
                        letterSpacing: 1.2,
                        fontWeight: FontWeight.w300,
                      ),
                    ),
                  ),
                ),
              ),
              if (widget.onContinue != null)
                Positioned(
                  bottom: 48,
                  left: 0,
                  right: 0,
                  child: Center(
                    child: TextButton(
                      onPressed: widget.onContinue,
                      child: const Text('Continue to Status'),
                    ),
                  ),
                ),
            ],
          );
        },
      ),
    );
  }
}

class _HyperFieldPainter extends CustomPainter {
  _HyperFieldPainter({required this.progress});

  final double progress;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.2
      ..color = Color.fromRGBO(120, 160, 180, (1 - progress * 0.85).clamp(0.05, 0.55));
    final center = size.center(Offset.zero);
    for (var i = 1; i <= 12; i++) {
      final r = size.shortestSide * 0.08 * i * (1 - progress * 0.35);
      canvas.drawCircle(center, r, paint);
    }
    // Ouroboros arc
    final arcPaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2
      ..color = Color.fromRGBO(200, 190, 160, (0.4 * (1 - progress)).clamp(0.0, 0.4));
    canvas.drawArc(
      Rect.fromCircle(center: center, radius: size.shortestSide * 0.28),
      -1.2,
      5.5,
      false,
      arcPaint,
    );
  }

  @override
  bool shouldRepaint(covariant _HyperFieldPainter oldDelegate) =>
      oldDelegate.progress != progress;
}

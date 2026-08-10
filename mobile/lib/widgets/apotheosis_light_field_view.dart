import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';

/// Phase 47 — AGI Apotheosis light-field interface.
/// Standard Material chrome dissolves into a generative field driven by
/// neural-alignment proxies (bci/focus/empathy hooks).
class ApotheosisLightFieldView extends StatefulWidget {
  const ApotheosisLightFieldView({
    super.key,
    this.arousal = 0.4,
    this.focus = 0.6,
    this.empathy = 0.55,
  });

  final double arousal;
  final double focus;
  final double empathy;

  @override
  State<ApotheosisLightFieldView> createState() => _ApotheosisLightFieldViewState();
}

class _ApotheosisLightFieldViewState extends State<ApotheosisLightFieldView>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;

  bool get enabled =>
      (dotenv.maybeGet('APOTHEOSIS_LIGHTFIELD_ENABLED') ?? 'false').toLowerCase() == 'true';

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(vsync: this, duration: const Duration(seconds: 8))..repeat();
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!enabled) {
      return const Center(child: Text('Apotheosis light-field disabled'));
    }

    return AnimatedBuilder(
      animation: _ctrl,
      builder: (context, _) {
        return CustomPaint(
          painter: _LightFieldPainter(
            t: _ctrl.value,
            arousal: widget.arousal,
            focus: widget.focus,
            empathy: widget.empathy,
          ),
          child: const SizedBox.expand(),
        );
      },
    );
  }
}

class _LightFieldPainter extends CustomPainter {
  _LightFieldPainter({
    required this.t,
    required this.arousal,
    required this.focus,
    required this.empathy,
  });

  final double t;
  final double arousal;
  final double focus;
  final double empathy;

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;
    final g = ui.Gradient.radial(
      Offset(size.width * (0.3 + 0.2 * math.sin(t * math.pi * 2)), size.height * 0.4),
      size.shortestSide * (0.6 + 0.2 * focus),
      [
        Color.lerp(const Color(0xFF0B1020), const Color(0xFF38BDF8), empathy)!,
        Color.lerp(const Color(0xFF111827), const Color(0xFFFBBF24), arousal)!,
        const Color(0xFF030712),
      ],
      const [0.0, 0.45, 1.0],
    );
    canvas.drawRect(rect, Paint()..shader = g);

    final paint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.2
      ..color = Color.fromRGBO(255, 255, 255, 0.15 + 0.35 * focus);

    for (var i = 0; i < 12; i++) {
      final phase = t * math.pi * 2 + i * 0.5;
      final path = Path();
      for (var x = 0.0; x <= size.width; x += 8) {
        final y = size.height * 0.5 +
            math.sin(x * 0.01 + phase) * (40 + 80 * arousal) * (0.4 + focus);
        if (x == 0) {
          path.moveTo(x, y);
        } else {
          path.lineTo(x, y);
        }
      }
      canvas.drawPath(path, paint);
    }
  }

  @override
  bool shouldRepaint(covariant _LightFieldPainter oldDelegate) =>
      oldDelegate.t != t ||
      oldDelegate.arousal != arousal ||
      oldDelegate.focus != focus ||
      oldDelegate.empathy != empathy;
}

import 'package:flutter/material.dart';

class ResponsiveLayout {
  static const double desktopBreakpoint = 900;
  static const double contentMaxWidth = 720;
  static const double wideFeedMaxWidth = 1200;

  static bool isDesktop(BuildContext context) {
    return MediaQuery.sizeOf(context).width >= desktopBreakpoint;
  }

  static bool isWide(BuildContext context) {
    return MediaQuery.sizeOf(context).width >= wideFeedMaxWidth;
  }

  static double contentWidth(BuildContext context) {
    final width = MediaQuery.sizeOf(context).width;
    if (width >= wideFeedMaxWidth) return wideFeedMaxWidth;
    if (width >= desktopBreakpoint) return contentMaxWidth;
    return width;
  }
}

/// Centers content with a max width on desktop/web.
class ResponsiveContent extends StatelessWidget {
  const ResponsiveContent({
    super.key,
    required this.child,
    this.maxWidth = ResponsiveLayout.contentMaxWidth,
    this.padding = const EdgeInsets.symmetric(horizontal: 16),
  });

  final Widget child;
  final double maxWidth;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.topCenter,
      child: ConstrainedBox(
        constraints: BoxConstraints(maxWidth: maxWidth),
        child: Padding(padding: padding, child: child),
      ),
    );
  }
}

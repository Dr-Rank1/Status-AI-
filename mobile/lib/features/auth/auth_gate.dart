import 'package:flutter/material.dart';

import '../../models/session.dart';
import '../../services/analytics_service.dart';
import '../../services/api_service.dart';
import '../../services/notification_service.dart';
import '../../services/realtime_service.dart';
import '../../theme/app_theme.dart';
import '../../widgets/main_shell.dart';
import 'login_screen.dart';

class AuthGate extends StatefulWidget {
  const AuthGate({
    super.key,
    required this.api,
    required this.realtime,
    required this.notifications,
    required this.analytics,
  });

  final ApiService api;
  final RealtimeService realtime;
  final NotificationService notifications;
  final AnalyticsService analytics;

  @override
  State<AuthGate> createState() => _AuthGateState();
}

class _AuthGateState extends State<AuthGate> {
  bool _checking = true;
  AppSession? _session;

  @override
  void initState() {
    super.initState();
    _bootstrap();
  }

  Future<void> _bootstrap() async {
    await widget.api.init();
    try {
      final session = await widget.api.fetchSession();
      await widget.api.connectRealtime(widget.realtime);
      if (!mounted) return;
      setState(() {
        _session = session;
        _checking = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _checking = false);
    }
  }

  Future<void> _logout() async {
    widget.realtime.disconnect();
    await widget.api.logout();
    if (!mounted) return;
    setState(() => _session = null);
  }

  @override
  Widget build(BuildContext context) {
    if (_checking) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator(color: AppColors.primary)),
      );
    }

    if (_session == null) {
      return LoginScreen(api: widget.api, onAuthenticated: _bootstrap);
    }

    return MainShell(
      session: _session!,
      api: widget.api,
      realtime: widget.realtime,
      notifications: widget.notifications,
      analytics: widget.analytics,
      onLogout: _logout,
      onSessionRestored: (session) => setState(() => _session = session),
    );
  }
}

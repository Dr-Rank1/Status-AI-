import 'package:flutter/material.dart';

import '../../models/session.dart';
import '../../services/api_service.dart';
import '../../theme/app_theme.dart';
import '../../widgets/main_shell.dart';
import 'login_screen.dart';

class AuthGate extends StatefulWidget {
  const AuthGate({super.key, required this.api});

  final ApiService api;

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
      onLogout: _logout,
      onSessionRestored: (session) => setState(() => _session = session),
    );
  }
}

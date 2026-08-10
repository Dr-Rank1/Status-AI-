import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'features/auth/auth_gate.dart';
import 'services/api_service.dart';
import 'theme/app_theme.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.light,
      systemNavigationBarColor: AppColors.surface,
      systemNavigationBarIconBrightness: Brightness.light,
    ),
  );
  runApp(StatusApp(api: ApiService()));
}

class StatusApp extends StatelessWidget {
  const StatusApp({super.key, required this.api});

  final ApiService api;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Status',
      debugShowCheckedModeBanner: false,
      theme: buildAppTheme(),
      home: AuthGate(api: api),
    );
  }
}

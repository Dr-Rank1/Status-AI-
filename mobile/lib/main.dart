import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';

import 'features/auth/auth_gate.dart';
import 'services/analytics_service.dart';
import 'services/api_service.dart';
import 'services/notification_service.dart';
import 'services/offline_cache_service.dart';
import 'services/permission_service.dart';
import 'services/realtime_service.dart';
import 'theme/app_theme.dart';

final notificationService = NotificationService();
final realtimeService = RealtimeService();
final permissionService = PermissionService();
late final ApiService apiService;
late final AnalyticsService analyticsService;

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  await dotenv.load(fileName: '.env', isOptional: true);
  await OfflineCacheService.init();

  apiService = ApiService();
  analyticsService = AnalyticsService(api: apiService);

  await notificationService.init();
  await permissionService.requestAppPermissions();

  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.light,
      systemNavigationBarColor: AppColors.surface,
      systemNavigationBarIconBrightness: Brightness.light,
    ),
  );

  runApp(StatusApp(
    api: apiService,
    realtime: realtimeService,
    notifications: notificationService,
    analytics: analyticsService,
  ));
}

class StatusApp extends StatelessWidget {
  const StatusApp({
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
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Status',
      debugShowCheckedModeBanner: false,
      theme: buildAppTheme(),
      home: AuthGate(
        api: api,
        realtime: realtime,
        notifications: notifications,
        analytics: analytics,
      ),
    );
  }
}

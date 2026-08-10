import 'package:desktop_multi_window/desktop_multi_window.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';

import 'features/auth/auth_gate.dart';
import 'features/desktop/desktop_sub_window_app.dart';
import 'services/analytics_service.dart';
import 'services/api_service.dart';
import 'services/desktop_shell_service.dart';
import 'services/feature_flag_service.dart';
import 'services/notification_service.dart';
import 'services/offline_cache_service.dart';
import 'services/permission_service.dart';
import 'services/realtime_service.dart';
import 'services/spatial_context_service.dart';
import 'services/telemetry_service.dart';
import 'theme/app_theme.dart';
import 'services/theme_config_service.dart';
import 'services/v2_beta_service.dart';
import 'models/theme_config.dart';
import 'utils/desktop_platform.dart';

final notificationService = NotificationService();
final realtimeService = RealtimeService();
final permissionService = PermissionService();
late final ApiService apiService;
late final AnalyticsService analyticsService;

@pragma('vm:entry-point')
Future<void> main(List<String> args) async {
  WidgetsFlutterBinding.ensureInitialized();

  if (isDesktopPlatform) {
    try {
      final windowController = await WindowController.fromCurrentEngine();
      if (windowController.windowId != 0) {
        runApp(DesktopSubWindowApp(argument: windowController.arguments));
        return;
      }
    } catch (_) {
      // Main window — continue normal startup.
    }
  }

  await TelemetryService.bootstrap(_bootstrapAndRun);
}

Future<void> _bootstrapAndRun() async {
  await dotenv.load(fileName: '.env', isOptional: true);
  await FeatureFlagService.instance.init();
  await OfflineCacheService.init();
  await SpatialContextService.init();
  await themeConfigService.load();
  await V2BetaService.instance.load();

  apiService = ApiService(tenantSlug: themeConfigService.tenantHeaderSlug);
  analyticsService = AnalyticsService(api: apiService);

  await notificationService.init();

  if (isDesktopPlatform) {
    await DesktopShellService.instance.init(
      onShow: () {},
      onQuit: () => exitApp(),
    );
  } else {
    await permissionService.requestAppPermissions();
    SystemChrome.setSystemUIOverlayStyle(
      const SystemUiOverlayStyle(
        statusBarColor: Colors.transparent,
        statusBarIconBrightness: Brightness.light,
        systemNavigationBarColor: AppColors.surface,
        systemNavigationBarIconBrightness: Brightness.light,
      ),
    );
  }

  runApp(StatusApp(
    api: apiService,
    realtime: realtimeService,
    notifications: notificationService,
    analytics: analyticsService,
    themeConfig: themeConfigService.config,
  ));
}

void exitApp() {
  if (isDesktopPlatform) {
    DesktopShellService.instance.dispose();
  }
  SystemNavigator.pop();
}

class StatusApp extends StatelessWidget {
  const StatusApp({
    super.key,
    required this.api,
    required this.realtime,
    required this.notifications,
    required this.analytics,
    this.themeConfig = ThemeConfig.defaults,
  });

  final ApiService api;
  final RealtimeService realtime;
  final NotificationService notifications;
  final AnalyticsService analytics;
  final ThemeConfig themeConfig;

  @override
  Widget build(BuildContext context) {
    return ThemeConfigProvider(
      config: themeConfig,
      child: MaterialApp(
        title: themeConfig.appName,
        debugShowCheckedModeBanner: false,
        theme: buildAppTheme(themeConfig),
        home: AuthGate(
          api: api,
          realtime: realtime,
          notifications: notifications,
          analytics: analytics,
        ),
      ),
    );
  }
}

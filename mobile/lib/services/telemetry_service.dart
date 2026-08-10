import 'package:flutter/foundation.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:sentry_flutter/sentry_flutter.dart';

import 'feature_flag_service.dart';

/// Sentry RUM + PostHog user identification helpers.
class TelemetryService {
  TelemetryService._();

  static final TelemetryService instance = TelemetryService._();

  static Future<void> bootstrap(Future<void> Function() appRunner) async {
    final dsn = dotenv.maybeGet('SENTRY_DSN') ??
        const String.fromEnvironment('SENTRY_DSN', defaultValue: '');

    if (dsn.isEmpty) {
      await appRunner();
      return;
    }

    await SentryFlutter.init(
      (options) {
        options.dsn = dsn;
        options.environment = kReleaseMode ? 'production' : 'development';
        options.tracesSampleRate = 0.2;
        options.attachScreenshot = false;
        options.enableAutoSessionTracking = true;
      },
      appRunner: appRunner,
    );
  }

  static Future<void> setUser({required String id, String? username, String? email}) async {
    await Sentry.configureScope((scope) {
      scope.setUser(SentryUser(id: id, username: username, email: email));
    });

    await FeatureFlagService.instance.identify(
      id,
      properties: {
        if (username != null) 'username': username,
        if (email != null) 'email': email,
      },
    );
  }

  static Future<void> clearUser() async {
    await Sentry.configureScope((scope) => scope.setUser(null));
  }

  static Future<void> captureException(Object error, {StackTrace? stackTrace}) async {
    await Sentry.captureException(error, stackTrace: stackTrace);
  }
}

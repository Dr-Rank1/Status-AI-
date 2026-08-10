import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import '../utils/desktop_platform.dart';
import 'linux_notification_service.dart';

class NotificationService {
  NotificationService({
    FlutterLocalNotificationsPlugin? plugin,
    LinuxNotificationService? linux,
  })  : _plugin = plugin ?? FlutterLocalNotificationsPlugin(),
        _linux = linux ?? LinuxNotificationService();

  final FlutterLocalNotificationsPlugin _plugin;
  final LinuxNotificationService _linux;
  bool _initialized = false;

  static const _channelId = 'status_events';
  static const _channelName = 'Status Events';

  bool get _useLinuxDBus => isLinuxDesktop;

  Future<void> init() async {
    if (_initialized) return;

    if (_useLinuxDBus) {
      await _linux.init();
      _initialized = true;
      return;
    }

    const android = AndroidInitializationSettings('@mipmap/ic_launcher');
    const ios = DarwinInitializationSettings(
      requestAlertPermission: true,
      requestBadgePermission: true,
      requestSoundPermission: true,
    );

    await _plugin.initialize(
      const InitializationSettings(android: android, iOS: ios),
      onDidReceiveNotificationResponse: (_) {},
    );

    await _plugin
        .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(
          const AndroidNotificationChannel(
            _channelId,
            _channelName,
            description: 'DMs and energy updates',
            importance: Importance.high,
          ),
        );

    _initialized = true;
  }

  Future<void> showDmNotification({
    required String characterName,
    required String preview,
    String? threadId,
  }) async {
    if (!_initialized) return;

    if (_useLinuxDBus) {
      await _linux.showDmNotification(
        characterName: characterName,
        preview: preview,
        threadId: threadId,
      );
      return;
    }

    const details = NotificationDetails(
      android: AndroidNotificationDetails(
        _channelId,
        _channelName,
        importance: Importance.high,
        priority: Priority.high,
        icon: '@mipmap/ic_launcher',
      ),
      iOS: DarwinNotificationDetails(),
    );

    await _plugin.show(
      threadId?.hashCode ?? characterName.hashCode,
      'New message from $characterName',
      preview.length > 120 ? '${preview.substring(0, 120)}…' : preview,
      details,
    );
  }

  Future<void> showEnergyRechargedNotification({
    required int remaining,
    required int max,
  }) async {
    if (!_initialized) return;

    if (_useLinuxDBus) {
      await _linux.showEnergyRechargedNotification(
        remaining: remaining,
        max: max,
      );
      return;
    }

    const details = NotificationDetails(
      android: AndroidNotificationDetails(
        _channelId,
        _channelName,
        importance: Importance.defaultImportance,
        priority: Priority.defaultPriority,
        icon: '@mipmap/ic_launcher',
      ),
      iOS: DarwinNotificationDetails(),
    );

    await _plugin.show(
      9001,
      'Energy fully recharged',
      'You have $remaining / $max energy ready to use.',
      details,
    );
  }

  Future<void> dispose() async {
    if (_useLinuxDBus) {
      await _linux.dispose();
    }
    _initialized = false;
  }
}

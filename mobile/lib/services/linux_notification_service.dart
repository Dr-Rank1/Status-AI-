import 'package:dbus/dbus.dart';

/// Native Linux desktop notifications via freedesktop.org D-Bus spec.
class LinuxNotificationService {
  LinuxNotificationService({DBusClient? client}) : _client = client;

  DBusClient? _client;
  bool _initialized = false;

  static const _appName = 'Status';

  Future<void> init() async {
    if (_initialized) return;
    _client ??= DBusClient.session();
    _initialized = true;
  }

  Future<void> dispose() async {
    await _client?.close();
    _client = null;
    _initialized = false;
  }

  Future<void> show({
    required int id,
    required String title,
    required String body,
  }) async {
    if (!_initialized) await init();

    final client = _client!;
    final proxy = DBusRemoteObjectProxy(
      client,
      DBusObjectPath('/org/freedesktop/Notifications'),
      'org.freedesktop.Notifications',
    );

    await proxy.callMethod(
      'Notify',
      [
        DBusString(_appName),
        DBusUint32(id),
        DBusString(''),
        DBusString(title),
        DBusString(body),
        DBusArray.string([]),
        DBusDict.stringVariant({}),
        DBusInt32(-1),
      ],
    );
  }

  Future<void> showDmNotification({
    required String characterName,
    required String preview,
    String? threadId,
  }) {
    final text = preview.length > 120 ? '${preview.substring(0, 120)}…' : preview;
    return show(
      id: threadId?.hashCode ?? characterName.hashCode,
      title: 'New message from $characterName',
      body: text,
    );
  }

  Future<void> showEnergyRechargedNotification({
    required int remaining,
    required int max,
  }) {
    return show(
      id: 9001,
      title: 'Energy fully recharged',
      body: 'You have $remaining / $max energy ready to use.',
    );
  }
}

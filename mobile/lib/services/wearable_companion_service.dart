import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_blue_plus/flutter_blue_plus.dart';

import 'api_service.dart';
import 'notification_service.dart';

/// Low-power BLE sync between phone and wearable HUD companion.
///
/// Broadcasts compact ambient status packets the glasses can render without
/// waking the full Flutter UI. Native bridges for Ray-Ban Meta / Android XR
/// live under `mobile/native/wearable/`.
class WearableCompanionService {
  WearableCompanionService({
    required ApiService api,
    NotificationService? notifications,
  })  : _api = api,
        _notifications = notifications;

  static const _serviceUuid = '0000status-0000-1000-8000-00805f9b34fb';
  static const _characteristicUuid = '0000status-0001-1000-8000-00805f9b34fb';

  final ApiService _api;
  final NotificationService? _notifications;

  Timer? _syncTimer;
  StreamSubscription<List<int>>? _writeSub;
  BluetoothDevice? _pairedDevice;
  Map<String, dynamic>? _lastPayload;

  Map<String, dynamic>? get lastPayload => _lastPayload;

  Map<String, dynamic> fetchLatestMetrics() {
    return Map<String, dynamic>.from(_lastPayload ?? {});
  }

  Future<void> startBackgroundSync({Duration interval = const Duration(minutes: 2)}) async {
    await _syncOnce();
    _syncTimer?.cancel();
    _syncTimer = Timer.periodic(interval, (_) => _syncOnce());
  }

  Future<void> stopBackgroundSync() async {
    _syncTimer?.cancel();
    _syncTimer = null;
    await _writeSub?.cancel();
    _writeSub = null;
  }

  Future<void> _syncOnce() async {
    try {
      if (!await _api.isOnline()) return;
      final payload = await _api.fetchWearableSync();
      _lastPayload = payload;
      await _broadcastBle(payload);
      _notifyAmbientUpdates(payload);
    } catch (e) {
      debugPrint('[WearableCompanion] sync failed: $e');
    }
  }

  Future<void> scanAndPair({Duration timeout = const Duration(seconds: 12)}) async {
    if (kIsWeb || defaultTargetPlatform == TargetPlatform.linux) {
      debugPrint('[WearableCompanion] BLE pairing skipped on this platform');
      return;
    }

    await FlutterBluePlus.startScan(timeout: timeout);
    final results = await FlutterBluePlus.scanResults.first;
    await FlutterBluePlus.stopScan();

    for (final r in results) {
      final name = r.device.platformName.toLowerCase();
      if (name.contains('meta') || name.contains('status') || name.contains('xr')) {
        _pairedDevice = r.device;
        await r.device.connect(autoConnect: true);
        return;
      }
    }
  }

  Future<void> _broadcastBle(Map<String, dynamic> payload) async {
    final device = _pairedDevice;
    if (device == null) return;

    try {
      final services = await device.discoverServices();
      for (final service in services) {
        if (service.uuid.toString().toLowerCase().contains('status')) {
          for (final char in service.characteristics) {
            if (char.properties.write) {
              final bytes = utf8.encode(jsonEncode(_compactPayload(payload)));
              await char.write(bytes, withoutResponse: true);
              return;
            }
          }
        }
      }
    } catch (e) {
      debugPrint('[WearableCompanion] BLE write failed: $e');
    }
  }

  Map<String, dynamic> _compactPayload(Map<String, dynamic> payload) {
    final ambient = (payload['ambient'] as List<dynamic>? ?? []).take(4).toList();
    return {
      'v': 1,
      'ts': payload['generatedAt'],
      'energy': payload['energy'],
      'ambient': ambient,
    };
  }

  void _notifyAmbientUpdates(Map<String, dynamic> payload) {
    final notifications = _notifications;
    if (notifications == null) return;

    final ambient = payload['ambient'] as List<dynamic>? ?? [];
    for (final item in ambient.take(2)) {
      if (item is! Map) continue;
      if (item['type'] != 'thread_update') continue;
      final character = item['character'] as String? ?? 'Character';
      final preview = item['preview'] as String? ?? '';
      if (preview.isEmpty) continue;
      await notifications.showDmNotification(
        characterName: character,
        preview: preview.length > 80 ? '${preview.substring(0, 77)}…' : preview,
      );
      break;
    }
  }

  void dispose() {
    stopBackgroundSync();
  }
}

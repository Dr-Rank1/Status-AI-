import 'dart:async';

import 'api_service.dart';

class AnalyticsService {
  AnalyticsService({required ApiService api}) : _api = api;

  final ApiService _api;
  final List<Map<String, dynamic>> _queue = [];
  Timer? _flushTimer;

  void track(String eventType, {Map<String, dynamic>? metadata}) {
    _queue.add({
      'eventType': eventType,
      'metadata': metadata ?? {},
    });

    _flushTimer ??= Timer(const Duration(seconds: 3), _flush);
  }

  Future<void> _flush() async {
    _flushTimer?.cancel();
    _flushTimer = null;

    if (_queue.isEmpty) return;

    final batch = List<Map<String, dynamic>>.from(_queue);
    _queue.clear();

    try {
      await _api.logClientEvents(batch);
    } catch (_) {
      _queue.insertAll(0, batch);
    }
  }

  Future<void> dispose() async {
    await _flush();
  }
}

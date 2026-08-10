import 'dart:async';

import 'package:flutter/material.dart';

import '../../models/session.dart';
import '../../services/api_service.dart';
import '../../services/notification_service.dart';
import '../../services/realtime_service.dart';
import '../../services/wearable_companion_service.dart';
import '../../theme/app_theme.dart';

/// Lightweight HUD for smart glasses — ambient character stream + energy pill.
class WearableHudScreen extends StatefulWidget {
  const WearableHudScreen({
    super.key,
    required this.api,
    required this.realtime,
    required this.notifications,
    required this.energy,
  });

  final ApiService api;
  final RealtimeService realtime;
  final NotificationService notifications;
  final EnergyState energy;

  @override
  State<WearableHudScreen> createState() => _WearableHudScreenState();
}

class _WearableHudScreenState extends State<WearableHudScreen> {
  late WearableCompanionService _companion;
  List<Map<String, dynamic>> _ambient = [];
  late EnergyState _energy;
  StreamSubscription<MessagePayload>? _messageSub;
  StreamSubscription<EnergyState>? _energySub;
  bool _bleActive = false;

  @override
  void initState() {
    super.initState();
    _energy = widget.energy;
    _companion = WearableCompanionService(
      api: widget.api,
      notifications: widget.notifications,
    );
    _bootstrap();
  }

  Future<void> _bootstrap() async {
    await _companion.startBackgroundSync(interval: const Duration(minutes: 1));
    try {
      await _companion.scanAndPair();
      if (mounted) setState(() => _bleActive = true);
    } catch (_) {}

    final payload = _companion.lastPayload;
    if (payload != null && mounted) {
      setState(() {
        _ambient = (payload['ambient'] as List<dynamic>? ?? [])
            .map((e) => Map<String, dynamic>.from(e as Map))
            .toList();
      });
    }

    _messageSub = widget.realtime.onNewMessage.listen((event) {
      final raw = event['message'];
      if (raw is! Map) return;
      final content = raw['content'] as String? ?? '';
      if (content.isEmpty) return;
      setState(() {
        _ambient = [
          {
            'type': 'thread_update',
            'character': event['characterName'] ?? 'Character',
            'preview': content,
          },
          ..._ambient,
        ].take(6).toList();
      });
      widget.notifications.showDmNotification(
        characterName: event['characterName'] as String? ?? 'Character',
        preview: content,
      );
    });

    _energySub = widget.realtime.onEnergyRecharged.listen((state) {
      setState(() => _energy = state);
    });
  }

  @override
  void dispose() {
    _messageSub?.cancel();
    _energySub?.cancel();
    _companion.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Icon(Icons.visibility, color: AppColors.primary, size: 20),
                  const SizedBox(width: 8),
                  Text(
                    'Status HUD',
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                          color: Colors.white,
                          fontWeight: FontWeight.w600,
                        ),
                  ),
                  const Spacer(),
                  _EnergyPill(energy: _energy),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                _bleActive ? 'BLE companion linked' : 'BLE scanning…',
                style: Theme.of(context).textTheme.labelSmall?.copyWith(color: AppColors.textMuted),
              ),
              const SizedBox(height: 20),
              Expanded(
                child: _ambient.isEmpty
                    ? Center(
                        child: Text(
                          'Ambient character stream will appear here',
                          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                                color: AppColors.textMuted,
                              ),
                          textAlign: TextAlign.center,
                        ),
                      )
                    : ListView.separated(
                        itemCount: _ambient.length,
                        separatorBuilder: (_, __) => const SizedBox(height: 12),
                        itemBuilder: (context, index) {
                          final item = _ambient[index];
                          return _AmbientCard(item: item);
                        },
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _EnergyPill extends StatelessWidget {
  const _EnergyPill({required this.energy});

  final EnergyState energy;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: AppColors.surfaceElevated,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.bolt, color: AppColors.energy, size: 14),
          const SizedBox(width: 4),
          Text(
            '${energy.remaining}',
            style: Theme.of(context).textTheme.labelMedium?.copyWith(color: Colors.white),
          ),
        ],
      ),
    );
  }
}

class _AmbientCard extends StatelessWidget {
  const _AmbientCard({required this.item});

  final Map<String, dynamic> item;

  @override
  Widget build(BuildContext context) {
    final character = item['character'] as String? ?? 'Character';
    final preview = item['preview'] as String? ?? '';
    final type = item['type'] as String? ?? 'status';

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.white12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                type == 'thread_update' ? Icons.chat_bubble_outline : Icons.person_outline,
                color: AppColors.primary,
                size: 16,
              ),
              const SizedBox(width: 6),
              Text(
                character,
                style: Theme.of(context).textTheme.labelLarge?.copyWith(
                      color: Colors.white,
                      fontWeight: FontWeight.w600,
                    ),
              ),
            ],
          ),
          if (preview.isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(
              preview,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: Colors.white70,
                    height: 1.35,
                  ),
            ),
          ],
        ],
      ),
    );
  }
}

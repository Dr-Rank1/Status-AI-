import 'package:flutter/material.dart';

import '../../models/live_stream.dart';
import '../../models/session.dart';
import '../../services/api_service.dart';
import '../../services/realtime_service.dart';
import '../../theme/app_theme.dart';
import '../../widgets/async_state.dart';
import '../../widgets/character_avatar.dart';
import 'live_video_screen.dart';

class LiveHubScreen extends StatefulWidget {
  const LiveHubScreen({
    super.key,
    required this.api,
    required this.realtime,
    required this.session,
    required this.onEnergyUpdated,
  });

  final ApiService api;
  final RealtimeService realtime;
  final AppSession session;
  final ValueChanged<EnergyState> onEnergyUpdated;

  @override
  State<LiveHubScreen> createState() => _LiveHubScreenState();
}

class _LiveHubScreenState extends State<LiveHubScreen> {
  late Future<List<LiveSession>> _sessionsFuture;

  @override
  void initState() {
    super.initState();
    _load();
  }

  void _load() {
    _sessionsFuture = widget.api.fetchLiveSessions();
  }

  Future<void> _refresh() async {
    setState(_load);
    await _sessionsFuture;
  }

  Future<void> _join(LiveSession live) async {
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => LiveVideoScreen(
          api: widget.api,
          realtime: widget.realtime,
          sessionId: live.id,
          energyRemaining: widget.session.energy.remaining,
          onEnergyUpdated: widget.onEnergyUpdated,
        ),
      ),
    );
    await _refresh();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Live Now')),
      body: RefreshIndicator(
        onRefresh: _refresh,
        color: AppColors.primary,
        child: FutureBuilder<List<LiveSession>>(
          future: _sessionsFuture,
          builder: (context, snapshot) {
            return AsyncStateView<List<LiveSession>>(
              snapshot: snapshot,
              onRetry: _refresh,
              empty: const EmptyStateView(
                title: 'No live broadcasts',
                subtitle: 'Characters go live from Explore when a host starts a session.',
                icon: Icons.videocam_off_outlined,
              ),
              builder: (sessions) {
                return ListView.separated(
                  padding: const EdgeInsets.all(16),
                  itemCount: sessions.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 10),
                  itemBuilder: (context, index) {
                    final live = sessions[index];
                    return ListTile(
                      tileColor: AppColors.surface,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                        side: const BorderSide(color: AppColors.border),
                      ),
                      leading: CharacterAvatar(
                        name: live.characterName ?? 'AI',
                        imageUrl: live.characterAvatarUrl,
                      ),
                      title: Text(live.title),
                      subtitle: Text('@${live.characterHandle ?? 'character'} · ${live.viewerCount} watching'),
                      trailing: FilledButton(
                        onPressed: () => _join(live),
                        child: const Text('Join'),
                      ),
                    );
                  },
                );
              },
            );
          },
        ),
      ),
    );
  }
}

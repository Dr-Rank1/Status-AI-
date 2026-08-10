import 'dart:async';

import 'package:flutter/material.dart';

import '../features/admin/admin_screen.dart';
import '../features/explore/explore_screen.dart';
import '../features/feed/feed_screen.dart';
import '../features/feed/widgets/reply_sheet.dart';
import '../features/messages/messages_screen.dart';
import '../features/profile/profile_screen.dart';
import '../features/store/store_screen.dart';
import '../features/spatial/spatial_scene_screen.dart';
import '../models/messaging.dart';
import '../models/session.dart';
import '../models/spatial.dart';
import '../services/analytics_service.dart';
import '../services/api_service.dart';
import '../services/gaze_voice_navigation_service.dart';
import '../services/notification_service.dart';
import '../services/permission_service.dart';
import '../services/realtime_service.dart';
import '../theme/app_theme.dart';
import '../utils/responsive_layout.dart';
import '../utils/spatial_platform.dart';
import '../widgets/spatial/plastic_layout.dart';

class MainShell extends StatefulWidget {
  const MainShell({
    super.key,
    required this.session,
    required this.api,
    required this.realtime,
    required this.notifications,
    required this.analytics,
    required this.onLogout,
    required this.onSessionRestored,
  });

  final AppSession session;
  final ApiService api;
  final RealtimeService realtime;
  final NotificationService notifications;
  final AnalyticsService analytics;
  final VoidCallback onLogout;
  final ValueChanged<AppSession> onSessionRestored;

  @override
  State<MainShell> createState() => _MainShellState();
}

class _MainShellState extends State<MainShell> {
  int _selectedIndex = 0;
  late AppSession _session;
  final _feedKey = GlobalKey<FeedScreenState>();
  final _messagesKey = GlobalKey<MessagesScreenState>();
  final _exploreKey = GlobalKey<ExploreScreenState>();
  final _profileKey = GlobalKey<ProfileScreenState>();

  StreamSubscription<MessagePayload>? _messageSub;
  StreamSubscription<EnergyState>? _energySub;
  final _spatialNav = GazeVoiceNavigationService();
  bool _spatialVoiceActive = false;

  static const _tabNames = ['feed', 'explore', 'messages', 'profile'];

  @override
  void initState() {
    super.initState();
    _session = widget.session;
    _wireGlobalRealtime();
    if (SpatialPlatform.isSpatialEnvironment) {
      _spatialNav.init().then((_) {
        _spatialNav.setCommandHandler(_handleSpatialNavCommand);
      });
    }
    widget.analytics.track('screen_view', metadata: {'screen': 'feed'});
  }

  void _handleSpatialNavCommand(SpatialNavAction action) {
    switch (action) {
      case SpatialNavAction.openFeed:
        setState(() => _selectedIndex = 0);
      case SpatialNavAction.openExplore:
        setState(() => _selectedIndex = 1);
      case SpatialNavAction.openMessages:
        setState(() => _selectedIndex = 2);
      case SpatialNavAction.openProfile:
        setState(() => _selectedIndex = 3);
      case SpatialNavAction.scrollDown:
        _feedKey.currentState?.refresh();
      case SpatialNavAction.openSpatialScene:
        _exploreKey.currentState?.refresh();
        setState(() => _selectedIndex = 1);
      case SpatialNavAction.goBack:
      case SpatialNavAction.unknown:
        break;
    }
  }

  Future<void> _toggleSpatialVoice() async {
    if (_spatialVoiceActive) {
      await _spatialNav.stopVoiceNavigation();
    } else {
      await _spatialNav.startVoiceNavigation();
    }
    setState(() => _spatialVoiceActive = !_spatialVoiceActive);
  }

  @override
  void dispose() {
    _messageSub?.cancel();
    _energySub?.cancel();
    _spatialNav.dispose();
    super.dispose();
  }

  void _wireGlobalRealtime() {
    _messageSub = widget.realtime.onNewMessage.listen((payload) {
      _messagesKey.currentState?.refresh();
      final message = payload['message'];
      if (message is Map && message['sender_type'] == 'character') {
        widget.notifications.showDmNotification(
          characterName: payload['characterName'] as String? ?? 'Character',
          preview: message['content'] as String? ?? '',
          threadId: payload['threadId'] as String?,
        );
      }
    });

    _energySub = widget.realtime.onEnergyRecharged.listen((energy) {
      _updateSession(_session.copyWith(energy: energy));
      if (energy.remaining >= energy.max) {
        widget.notifications.showEnergyRechargedNotification(
          remaining: energy.remaining,
          max: energy.max,
        );
      }
    });
  }

  void _updateSession(AppSession session) {
    setState(() => _session = session);
    widget.onSessionRestored(session);
  }

  void _applyInteraction(InteractionUpdate update) {
    _updateSession(
      _session.copyWith(
        user: _session.user.copyWith(
          reputation: update.reputation,
          followerCount: update.followerCount,
        ),
      ),
    );
  }

  void _applyReputationChange(Map<String, dynamic> payload) {
    _updateSession(
      _session.copyWith(
        user: _session.user.copyWith(
          reputation: payload['reputation'] as int? ?? _session.user.reputation,
          followerCount: payload['followerCount'] as int? ?? _session.user.followerCount,
        ),
      ),
    );
  }

  Future<void> _openStore() async {
    widget.analytics.track('store_opened');
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => StoreScreen(
          api: widget.api,
          currentEnergy: _session.energy,
          onEnergyUpdated: (energy) => _updateSession(_session.copyWith(energy: energy)),
        ),
      ),
    );
  }

  Future<void> _composePost() async {
    widget.analytics.track('compose_opened');
    const postCost = 10;
    final result = await showComposeSheet(
      context,
      energyRemaining: _session.energy.remaining,
      postCost: postCost,
    );

    if (result == null || !mounted) return;

    try {
      String? imageUrl;
      if (result.imageFile != null) {
        imageUrl = await widget.api.uploadImage(result.imageFile!);
      }

      final postResult = await widget.api.createPost(
        result.content,
        imageUrl: imageUrl,
      );
      _updateSession(_session.copyWith(energy: postResult.energy));
      await _feedKey.currentState?.refresh();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Post published')),
      );
    } on InsufficientEnergyException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.message), backgroundColor: AppColors.like),
      );
    } on ContentModerationException catch (e) {
      if (!mounted) return;
      showDialog<void>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Post blocked'),
          content: Text(e.message),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context), child: const Text('OK')),
          ],
        ),
      );
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.message)),
      );
    }
  }

  Future<void> _openAdmin() async {
    await Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => AdminScreen(api: widget.api)),
    );
  }

  @override
  Widget build(BuildContext context) {
    final tabs = [
      FeedScreen(
        key: _feedKey,
        session: _session,
        api: widget.api,
        realtime: widget.realtime,
        onSessionUpdated: _updateSession,
        onReputationChange: _applyReputationChange,
        onOpenStore: _openStore,
      ),
      ExploreScreen(
        key: _exploreKey,
        api: widget.api,
        realtime: widget.realtime,
        session: _session,
        onSessionUpdated: _updateSession,
      ),
      MessagesScreen(
        key: _messagesKey,
        api: widget.api,
        session: _session,
        realtime: widget.realtime,
        onSessionUpdated: _updateSession,
        onInteraction: _applyInteraction,
      ),
      ProfileScreen(
        key: _profileKey,
        api: widget.api,
        session: _session,
        onSessionUpdated: _updateSession,
        onOpenStore: _openStore,
        onLogout: widget.onLogout,
        onOpenAdmin: _session.user.isAdmin ? _openAdmin : null,
      ),
    ];

    final isDesktop = ResponsiveLayout.isDesktop(context);

    if (isDesktop) {
      return Scaffold(
        body: _wrapSpatial(
          Row(
            children: [
              _spatialNavRail(),
              const VerticalDivider(width: 1),
              Expanded(
                child: Align(
                  alignment: Alignment.topCenter,
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: ResponsiveLayout.wideFeedMaxWidth),
                    child: IndexedStack(index: _selectedIndex, children: tabs),
                  ),
                ),
              ),
            ],
          ),
        ),
        floatingActionButton: _buildFab(),
      );
    }

    return Scaffold(
      body: _wrapSpatial(IndexedStack(index: _selectedIndex, children: tabs)),
      bottomNavigationBar: _spatialBottomNav(),
      floatingActionButton: _buildFab(),
    );
  }

  Widget _wrapSpatial(Widget child) {
    if (!SpatialPlatform.isSpatialEnvironment) return child;
    return SpatialContinuityShell(
      zone: ProxemicZone.personal,
      foreground: child,
    );
  }

  Widget _spatialNavRail() {
    return NavigationRail(
      selectedIndex: _selectedIndex,
      onDestinationSelected: (index) {
        setState(() => _selectedIndex = index);
        widget.analytics.track('tab_selected', metadata: {'tab': _tabNames[index]});
      },
      backgroundColor: AppColors.surface,
      indicatorColor: AppColors.primary.withValues(alpha: 0.2),
      labelType: NavigationRailLabelType.all,
      destinations: [
        for (var i = 0; i < 4; i++)
          NavigationRailDestination(
            icon: GazeTarget(
              id: 'nav_$i',
              navigation: _spatialNav,
              onActivate: () => setState(() => _selectedIndex = i),
              child: Icon(_navIcon(i, selected: false)),
            ),
            selectedIcon: Icon(_navIcon(i, selected: true), color: AppColors.primary),
            label: Text(_tabNames[i][0].toUpperCase() + _tabNames[i].substring(1)),
          ),
      ],
    );
  }

  Widget _spatialBottomNav() {
    final bar = NavigationBar(
      selectedIndex: _selectedIndex,
      onDestinationSelected: (index) {
        setState(() => _selectedIndex = index);
        widget.analytics.track('tab_selected', metadata: {'tab': _tabNames[index]});
      },
      backgroundColor: AppColors.surface,
      indicatorColor: AppColors.primary.withValues(alpha: 0.2),
      destinations: const [
        NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home_rounded, color: AppColors.primary), label: 'Feed'),
        NavigationDestination(icon: Icon(Icons.search_rounded), selectedIcon: Icon(Icons.search_rounded, color: AppColors.primary), label: 'Explore'),
        NavigationDestination(icon: Icon(Icons.chat_bubble_outline_rounded), selectedIcon: Icon(Icons.chat_bubble_rounded, color: AppColors.primary), label: 'DMs'),
        NavigationDestination(icon: Icon(Icons.person_outline_rounded), selectedIcon: Icon(Icons.person_rounded, color: AppColors.primary), label: 'Profile'),
      ],
    );

    if (!SpatialPlatform.isSpatialEnvironment) return bar;

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        PlasticLayout(
          zone: ProxemicZone.personal,
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          child: Row(
            children: [
              Icon(_spatialVoiceActive ? Icons.hearing : Icons.hearing_disabled, size: 18, color: AppColors.accent),
              const SizedBox(width: 8),
              Expanded(child: Text(_spatialVoiceActive ? 'Voice nav active' : 'Say "open feed", "open messages"…')),
              TextButton(onPressed: _toggleSpatialVoice, child: Text(_spatialVoiceActive ? 'Stop' : 'Listen')),
            ],
          ),
        ),
        bar,
      ],
    );
  }

  IconData _navIcon(int index, {required bool selected}) {
    switch (index) {
      case 0:
        return selected ? Icons.home_rounded : Icons.home_outlined;
      case 1:
        return Icons.search_rounded;
      case 2:
        return selected ? Icons.chat_bubble_rounded : Icons.chat_bubble_outline_rounded;
      default:
        return selected ? Icons.person_rounded : Icons.person_outline_rounded;
    }
  }

  Widget? _buildFab() {
    if (_selectedIndex != 0) {
      if (SpatialPlatform.isSpatialEnvironment && _selectedIndex == 1) {
        return FloatingActionButton.extended(
          onPressed: () {},
          label: const Text('Spatial'),
          icon: const Icon(Icons.view_in_ar),
        );
      }
      return null;
    }
    return FloatingActionButton(
      onPressed: _composePost,
      backgroundColor: AppColors.primary,
      child: const Icon(Icons.add_rounded, color: Colors.white),
    );
  }
}

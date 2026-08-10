import 'package:flutter/material.dart';

import '../features/explore/explore_screen.dart';
import '../features/feed/feed_screen.dart';
import '../features/feed/widgets/reply_sheet.dart';
import '../features/messages/messages_screen.dart';
import '../features/profile/profile_screen.dart';
import '../features/store/store_screen.dart';
import '../models/messaging.dart';
import '../models/session.dart';
import '../services/api_service.dart';
import '../theme/app_theme.dart';

class MainShell extends StatefulWidget {
  const MainShell({
    super.key,
    required this.session,
    required this.api,
    required this.onLogout,
    required this.onSessionRestored,
  });

  final AppSession session;
  final ApiService api;
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

  @override
  void initState() {
    super.initState();
    _session = widget.session;
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

  Future<void> _openStore() async {
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
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.message)),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final tabs = [
      FeedScreen(
        key: _feedKey,
        session: _session,
        api: widget.api,
        onSessionUpdated: _updateSession,
        onOpenStore: _openStore,
      ),
      ExploreScreen(
        key: _exploreKey,
        api: widget.api,
        session: _session,
        onSessionUpdated: _updateSession,
      ),
      MessagesScreen(
        key: _messagesKey,
        api: widget.api,
        session: _session,
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
      ),
    ];

    return Scaffold(
      body: IndexedStack(
        index: _selectedIndex,
        children: tabs,
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _selectedIndex,
        onDestinationSelected: (index) => setState(() => _selectedIndex = index),
        backgroundColor: AppColors.surface,
        indicatorColor: AppColors.primary.withValues(alpha: 0.2),
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.home_outlined),
            selectedIcon: Icon(Icons.home_rounded, color: AppColors.primary),
            label: 'Feed',
          ),
          NavigationDestination(
            icon: Icon(Icons.search_rounded),
            selectedIcon: Icon(Icons.search_rounded, color: AppColors.primary),
            label: 'Explore',
          ),
          NavigationDestination(
            icon: Icon(Icons.chat_bubble_outline_rounded),
            selectedIcon: Icon(Icons.chat_bubble_rounded, color: AppColors.primary),
            label: 'DMs',
          ),
          NavigationDestination(
            icon: Icon(Icons.person_outline_rounded),
            selectedIcon: Icon(Icons.person_rounded, color: AppColors.primary),
            label: 'Profile',
          ),
        ],
      ),
      floatingActionButton: _selectedIndex == 0
          ? FloatingActionButton(
              onPressed: _composePost,
              backgroundColor: AppColors.primary,
              child: const Icon(Icons.add_rounded, color: Colors.white),
            )
          : null,
    );
  }
}

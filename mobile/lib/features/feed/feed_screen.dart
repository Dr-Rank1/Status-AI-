import 'dart:async';

import 'package:flutter/material.dart';

import '../../models/post.dart';
import '../../models/session.dart';
import '../../services/api_service.dart';
import '../../services/offline_cache_service.dart';
import '../../services/realtime_service.dart';
import '../../theme/app_theme.dart';
import '../../utils/responsive_layout.dart';
import '../../widgets/async_state.dart';
import 'widgets/energy_bar.dart';
import 'widgets/feed_header.dart';
import 'widgets/post_card.dart';
import 'widgets/reply_sheet.dart';

class FeedScreen extends StatefulWidget {
  const FeedScreen({
    super.key,
    required this.session,
    required this.api,
    required this.realtime,
    required this.onSessionUpdated,
    required this.onReputationChange,
    this.onOpenStore,
  });

  final AppSession session;
  final ApiService api;
  final RealtimeService realtime;
  final ValueChanged<AppSession> onSessionUpdated;
  final ValueChanged<Map<String, dynamic>> onReputationChange;
  final VoidCallback? onOpenStore;

  @override
  State<FeedScreen> createState() => FeedScreenState();
}

class FeedScreenState extends State<FeedScreen> {
  List<Post>? _posts;
  bool _loading = true;
  String? _error;
  bool _offline = false;
  StreamSubscription<Post>? _postSub;
  StreamSubscription<ReputationPayload>? _repSub;

  EnergyState get _energy => widget.session.energy;

  @override
  void initState() {
    super.initState();
    _loadFeed();

    _postSub = widget.realtime.onNewPost.listen((post) {
      setState(() {
        _posts ??= [];
        if (!_posts!.any((p) => p.id == post.id)) {
          _posts!.insert(0, post);
        }
      });
    });

    _repSub = widget.realtime.onReputationChange.listen((payload) {
      widget.onReputationChange(payload);
    });
  }

  @override
  void dispose() {
    _postSub?.cancel();
    _repSub?.cancel();
    super.dispose();
  }

  Future<void> _loadFeed() async {
    final cached = OfflineCacheService.loadFeed();
    if (cached != null && cached.isNotEmpty) {
      setState(() {
        _posts = cached;
        _loading = false;
        _offline = true;
      });
    } else {
      setState(() {
        _loading = true;
        _error = null;
      });
    }

    try {
      final posts = await widget.api.fetchPosts();
      await OfflineCacheService.cacheFeed(posts);
      if (!mounted) return;
      setState(() {
        _posts = posts;
        _loading = false;
        _offline = false;
        _error = null;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = cached == null ? e.message : null;
        _loading = false;
        _offline = cached != null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = cached == null ? e.toString() : null;
        _loading = false;
        _offline = cached != null;
      });
    }
  }

  Future<void> refresh() => _loadFeed();

  Future<void> _handleReply(Post post) async {
    const replyCost = 5;
    final content = await showReplySheet(
      context,
      post: post,
      energyRemaining: _energy.remaining,
      replyCost: replyCost,
    );

    if (content == null || !mounted) return;

    try {
      final result = await widget.api.replyToPost(post.id, content);
      var updated = widget.session.copyWith(energy: result.energy);
      if (result.user != null) {
        updated = updated.copyWith(user: result.user);
      }
      widget.onSessionUpdated(updated);

      if (!mounted) return;

      if (result.aiPending && post.isCharacter) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Reply sent — character is composing a response...'),
            duration: Duration(seconds: 3),
          ),
        );
      } else if (post.isCharacter) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Reply sent')),
        );
      }
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
    return ResponsiveContent(
      maxWidth: ResponsiveLayout.isWide(context)
          ? ResponsiveLayout.wideFeedMaxWidth
          : ResponsiveLayout.contentMaxWidth,
      padding: EdgeInsets.zero,
      child: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            FeedHeader(
              displayName: widget.session.user.displayName,
              reputation: widget.session.user.reputation,
              followerCount: widget.session.user.followerCount,
            ),
            EnergyBar(
              remaining: _energy.remaining,
              max: _energy.max,
              onTap: widget.onOpenStore,
            ),
            if (_offline)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                color: AppColors.surfaceElevated,
                child: Text(
                  'Offline — showing cached feed',
                  style: Theme.of(context).textTheme.labelSmall?.copyWith(color: AppColors.textMuted),
                  textAlign: TextAlign.center,
                ),
              ),
            Expanded(child: _buildBody()),
          ],
        ),
      ),
    );
  }

  Widget _buildBody() {
    if (_loading && _posts == null) {
      return const SkeletonList.posts(count: 6);
    }

    if (_error != null && (_posts == null || _posts!.isEmpty)) {
      return ErrorStateView(
        message: _error!,
        onRetry: _loadFeed,
      );
    }

    final posts = _posts ?? [];

    if (posts.isEmpty) {
      return EmptyStateView(
        title: 'No posts yet',
        subtitle: 'AI characters will post autonomously — pull to refresh.',
        icon: Icons.dynamic_feed_outlined,
        actionLabel: 'Refresh',
        onAction: refresh,
      );
    }

    final useGrid = ResponsiveLayout.isWide(context);

    return RefreshIndicator(
      onRefresh: refresh,
      color: AppColors.primary,
      backgroundColor: AppColors.surface,
      child: useGrid
          ? GridView.builder(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.all(12),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 2,
                mainAxisSpacing: 8,
                crossAxisSpacing: 8,
                childAspectRatio: 1.6,
              ),
              itemCount: posts.length,
              itemBuilder: (context, index) {
                final post = posts[index];
                return PostCard(post: post, onReply: () => _handleReply(post));
              },
            )
          : ListView.separated(
              key: const Key('e2e_feed_list'),
              physics: const AlwaysScrollableScrollPhysics(),
              itemCount: posts.length,
              separatorBuilder: (_, __) => const Divider(height: 1),
              itemBuilder: (context, index) {
                final post = posts[index];
                return PostCard(post: post, onReply: () => _handleReply(post));
              },
            ),
    );
  }
}

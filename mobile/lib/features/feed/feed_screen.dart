import 'package:flutter/material.dart';

import '../../models/post.dart';
import '../../models/session.dart';
import '../../services/api_service.dart';
import '../../theme/app_theme.dart';
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
    required this.onSessionUpdated,
    this.onOpenStore,
  });

  final AppSession session;
  final ApiService api;
  final ValueChanged<AppSession> onSessionUpdated;
  final VoidCallback? onOpenStore;

  @override
  State<FeedScreen> createState() => FeedScreenState();
}

class FeedScreenState extends State<FeedScreen> {
  late Future<List<Post>> _feedFuture;
  EnergyState get _energy => widget.session.energy;

  @override
  void initState() {
    super.initState();
    _feedFuture = widget.api.fetchPosts();
  }

  @override
  void didUpdateWidget(covariant FeedScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.session.energy.remaining != widget.session.energy.remaining) {
      // Energy updated externally (e.g. compose from FAB)
    }
  }

  Future<void> refresh() async {
    setState(() => _feedFuture = widget.api.fetchPosts());
    await _feedFuture;
  }

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

      await refresh();
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
    return SafeArea(
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
          Expanded(
            child: FutureBuilder<List<Post>>(
              future: _feedFuture,
              builder: (context, snapshot) {
                return AsyncStateView<List<Post>>(
                  snapshot: snapshot,
                  onRetry: () {
                    setState(() => _feedFuture = widget.api.fetchPosts());
                  },
                  loading: const SkeletonList.posts(count: 6),
                  empty: const SizedBox.shrink(),
                  builder: (posts) {
                    if (posts.isEmpty) {
                      return EmptyStateView(
                        title: 'No posts yet',
                        subtitle: 'AI characters will post autonomously — pull to refresh.',
                        icon: Icons.dynamic_feed_outlined,
                        actionLabel: 'Refresh',
                        onAction: refresh,
                      );
                    }

                    return RefreshIndicator(
                      onRefresh: refresh,
                      color: AppColors.primary,
                      backgroundColor: AppColors.surface,
                      child: ListView.separated(
                        physics: const AlwaysScrollableScrollPhysics(),
                        itemCount: posts.length,
                        separatorBuilder: (_, __) => const Divider(height: 1),
                        itemBuilder: (context, index) {
                          final post = posts[index];
                          return PostCard(
                            post: post,
                            onReply: () => _handleReply(post),
                          );
                        },
                      ),
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

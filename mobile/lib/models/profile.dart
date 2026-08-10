import 'session.dart';

class ProfileStats {
  const ProfileStats({required this.postCount, required this.replyCount});

  final int postCount;
  final int replyCount;

  factory ProfileStats.fromJson(Map<String, dynamic> json) {
    return ProfileStats(
      postCount: json['postCount'] as int? ?? 0,
      replyCount: json['replyCount'] as int? ?? 0,
    );
  }
}

class UserProfile {
  const UserProfile({
    required this.user,
    required this.energy,
    required this.stats,
  });

  final SessionUser user;
  final EnergyState energy;
  final ProfileStats stats;

  factory UserProfile.fromJson(Map<String, dynamic> json) {
    return UserProfile(
      user: SessionUser.fromJson(json['user'] as Map<String, dynamic>),
      energy: EnergyState.fromJson(json['energy'] as Map<String, dynamic>),
      stats: ProfileStats.fromJson(json['stats'] as Map<String, dynamic>),
    );
  }
}

class ActivityItem {
  const ActivityItem({
    required this.id,
    required this.content,
    required this.fandom,
    required this.likeCount,
    required this.replyCount,
    required this.createdAt,
    this.parentPostId,
    this.parentContent,
    this.parentCharacterName,
    this.parentCharacterHandle,
  });

  final String id;
  final String content;
  final String fandom;
  final int likeCount;
  final int replyCount;
  final DateTime createdAt;
  final String? parentPostId;
  final String? parentContent;
  final String? parentCharacterName;
  final String? parentCharacterHandle;

  bool get isReply => parentPostId != null;

  factory ActivityItem.fromJson(Map<String, dynamic> json) {
    return ActivityItem(
      id: json['id'] as String,
      content: json['content'] as String,
      fandom: json['fandom'] as String? ?? 'General',
      likeCount: json['like_count'] as int? ?? 0,
      replyCount: json['reply_count'] as int? ?? 0,
      createdAt: DateTime.parse(json['created_at'] as String),
      parentPostId: json['parent_post_id'] as String?,
      parentContent: json['parent_content'] as String?,
      parentCharacterName: json['parent_character_name'] as String?,
      parentCharacterHandle: json['parent_character_handle'] as String?,
    );
  }
}

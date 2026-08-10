class EnergyState {
  const EnergyState({
    required this.remaining,
    required this.max,
    required this.resetAt,
  });

  final int remaining;
  final int max;
  final DateTime resetAt;

  factory EnergyState.fromJson(Map<String, dynamic> json) {
    return EnergyState(
      remaining: json['energy_remaining'] as int? ?? 0,
      max: json['energy_max'] as int? ?? 100,
      resetAt: DateTime.parse(json['reset_at'] as String),
    );
  }
}

class SessionUser {
  const SessionUser({
    required this.id,
    required this.username,
    required this.displayName,
    this.avatarUrl,
    this.bio,
    this.reputation = 0,
    this.followerCount = 0,
    this.followingCount = 0,
    this.isAdmin = false,
  });

  final String id;
  final String username;
  final String displayName;
  final String? avatarUrl;
  final String? bio;
  final int reputation;
  final int followerCount;
  final int followingCount;
  final bool isAdmin;

  SessionUser copyWith({
    int? reputation,
    int? followerCount,
    int? followingCount,
    bool? isAdmin,
  }) {
    return SessionUser(
      id: id,
      username: username,
      displayName: displayName,
      avatarUrl: avatarUrl,
      bio: bio,
      reputation: reputation ?? this.reputation,
      followerCount: followerCount ?? this.followerCount,
      followingCount: followingCount ?? this.followingCount,
      isAdmin: isAdmin ?? this.isAdmin,
    );
  }

  factory SessionUser.fromJson(Map<String, dynamic> json) {
    return SessionUser(
      id: json['id'] as String,
      username: json['username'] as String,
      displayName: json['display_name'] as String,
      avatarUrl: json['avatar_url'] as String?,
      bio: json['bio'] as String?,
      reputation: json['reputation'] as int? ?? 0,
      followerCount: json['follower_count'] as int? ?? 0,
      followingCount: json['following_count'] as int? ?? 0,
      isAdmin: json['is_admin'] as bool? ?? false,
    );
  }
}

class AppSession {
  const AppSession({required this.user, required this.energy});

  final SessionUser user;
  final EnergyState energy;

  AppSession copyWith({SessionUser? user, EnergyState? energy}) {
    return AppSession(
      user: user ?? this.user,
      energy: energy ?? this.energy,
    );
  }

  factory AppSession.fromJson(Map<String, dynamic> json) {
    return AppSession(
      user: SessionUser.fromJson(json['user'] as Map<String, dynamic>),
      energy: EnergyState.fromJson(json['energy'] as Map<String, dynamic>),
    );
  }
}

class ReplyResult {
  const ReplyResult({
    required this.energy,
    this.aiReplyContent,
    this.aiProvider,
    this.aiPending = false,
    this.user,
  });

  final EnergyState energy;
  final String? aiReplyContent;
  final String? aiProvider;
  final bool aiPending;
  final SessionUser? user;
}

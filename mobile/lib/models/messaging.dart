import 'session.dart';

class AiCharacter {
  const AiCharacter({
    required this.id,
    required this.name,
    required this.handle,
    required this.fandom,
    this.avatarUrl,
    this.bio,
    this.followerCount = 0,
    this.affinity = 0,
    this.isFollowing = false,
    this.threadId,
    this.model3dUrl,
  });

  final String id;
  final String name;
  final String handle;
  final String fandom;
  final String? avatarUrl;
  final String? bio;
  final int followerCount;
  final int affinity;
  final bool isFollowing;
  final String? threadId;
  final String? model3dUrl;

  AiCharacter copyWith({
    bool? isFollowing,
    int? affinity,
    int? followerCount,
    String? threadId,
  }) {
    return AiCharacter(
      id: id,
      name: name,
      handle: handle,
      fandom: fandom,
      avatarUrl: avatarUrl,
      bio: bio,
      followerCount: followerCount ?? this.followerCount,
      affinity: affinity ?? this.affinity,
      isFollowing: isFollowing ?? this.isFollowing,
      threadId: threadId ?? this.threadId,
    );
  }

  factory AiCharacter.fromJson(Map<String, dynamic> json) {
    return AiCharacter(
      id: json['id'] as String,
      name: json['name'] as String,
      handle: json['handle'] as String,
      fandom: json['fandom'] as String,
      avatarUrl: json['avatar_url'] as String?,
      bio: json['bio'] as String?,
      followerCount: json['follower_count'] as int? ?? 0,
      affinity: json['affinity'] as int? ?? 0,
      isFollowing: json['is_following'] as bool? ?? false,
      threadId: json['thread_id'] as String?,
      model3dUrl: json['model_3d_url'] as String?,
    );
  }
}

class ExploreData {
  const ExploreData({
    required this.characters,
    required this.byFandom,
  });

  final List<AiCharacter> characters;
  final Map<String, List<AiCharacter>> byFandom;

  factory ExploreData.fromJson(Map<String, dynamic> json) {
    final characters = (json['characters'] as List<dynamic>)
        .map((e) => AiCharacter.fromJson(e as Map<String, dynamic>))
        .toList();

    final byFandomRaw = json['byFandom'] as Map<String, dynamic>;
    final byFandom = byFandomRaw.map(
      (key, value) => MapEntry(
        key,
        (value as List<dynamic>)
            .map((e) => AiCharacter.fromJson(e as Map<String, dynamic>))
            .toList(),
      ),
    );

    return ExploreData(characters: characters, byFandom: byFandom);
  }
}

class DmThread {
  const DmThread({
    required this.id,
    required this.characterId,
    required this.characterName,
    required this.characterHandle,
    this.characterAvatar,
    this.characterFandom,
    this.lastMessagePreview,
    this.lastSenderType,
    this.lastMessageAt,
    this.aiPending = false,
  });

  final String id;
  final String characterId;
  final String characterName;
  final String characterHandle;
  final String? characterAvatar;
  final String? characterFandom;
  final String? lastMessagePreview;
  final String? lastSenderType;
  final DateTime? lastMessageAt;
  final bool aiPending;

  factory DmThread.fromJson(Map<String, dynamic> json) {
    return DmThread(
      id: json['id'] as String,
      characterId: json['character_id'] as String,
      characterName: json['character_name'] as String,
      characterHandle: json['character_handle'] as String,
      characterAvatar: json['character_avatar'] as String?,
      characterFandom: json['character_fandom'] as String?,
      lastMessagePreview: json['last_message_preview'] as String?,
      lastSenderType: json['last_sender_type'] as String?,
      lastMessageAt: json['last_message_at'] != null
          ? DateTime.parse(json['last_message_at'] as String)
          : null,
      aiPending: json['ai_pending'] as bool? ?? false,
    );
  }
}

class DmMessage {
  const DmMessage({
    required this.id,
    required this.senderType,
    required this.content,
    required this.createdAt,
    this.isRead = false,
    this.isPending = false,
    this.isEncrypted = false,
    this.ciphertext,
    this.encryptionMeta,
  });

  final String id;
  final String senderType;
  final String content;
  final DateTime createdAt;
  final bool isRead;
  final bool isPending;
  final bool isEncrypted;
  final String? ciphertext;
  final Map<String, dynamic>? encryptionMeta;

  bool get isUser => senderType == 'user';
  bool get isCharacter => senderType == 'character';

  factory DmMessage.fromJson(Map<String, dynamic> json) {
    return DmMessage(
      id: json['id'] as String,
      senderType: json['sender_type'] as String,
      content: json['content'] as String,
      createdAt: DateTime.parse(json['created_at'] as String),
      isRead: json['is_read'] as bool? ?? false,
      isEncrypted: json['is_encrypted'] as bool? ?? false,
      ciphertext: json['ciphertext'] as String?,
      encryptionMeta: json['encryption_meta'] is Map
          ? Map<String, dynamic>.from(json['encryption_meta'] as Map)
          : null,
    );
  }

  DmMessage copyWith({String? content}) {
    return DmMessage(
      id: id,
      senderType: senderType,
      content: content ?? this.content,
      createdAt: createdAt,
      isRead: isRead,
      isPending: isPending,
      isEncrypted: isEncrypted,
      ciphertext: ciphertext,
      encryptionMeta: encryptionMeta,
    );
  }

  factory DmMessage.pending(String content, {bool encrypted = false}) {
    return DmMessage(
      id: 'pending-${DateTime.now().millisecondsSinceEpoch}',
      senderType: 'user',
      content: encrypted ? '🔒 Encrypted message' : content,
      createdAt: DateTime.now(),
      isPending: true,
      isEncrypted: encrypted,
    );
  }
}

class ThreadMessagesResult {
  const ThreadMessagesResult({
    required this.messages,
    required this.aiPending,
    this.interaction,
  });

  final List<DmMessage> messages;
  final bool aiPending;
  final InteractionUpdate? interaction;
}

class InteractionUpdate {
  const InteractionUpdate({
    required this.affinity,
    required this.reputation,
    required this.followerCount,
    this.affinityDelta = 0,
    this.reputationDelta = 0,
    this.sentiment = 'neutral',
  });

  final int affinity;
  final int reputation;
  final int followerCount;
  final int affinityDelta;
  final int reputationDelta;
  final String sentiment;

  factory InteractionUpdate.fromJson(Map<String, dynamic> json) {
    final user = json['user'] as Map<String, dynamic>?;
    return InteractionUpdate(
      affinity: json['affinity'] as int? ?? 0,
      reputation: user?['reputation'] as int? ?? json['reputation'] as int? ?? 0,
      followerCount: user?['follower_count'] as int? ?? json['followerCount'] as int? ?? 0,
      affinityDelta: json['affinityDelta'] as int? ?? 0,
      reputationDelta: json['reputationDelta'] as int? ?? 0,
      sentiment: json['sentiment'] as String? ?? 'neutral',
    );
  }
}

class DmSendResult {
  const DmSendResult({
    required this.userMessage,
    required this.energy,
    this.threadId,
    this.aiPending = false,
    this.characterReply,
    this.offline = false,
    this.queued = false,
    this.toolResults,
  });

  final DmMessage userMessage;
  final EnergyState energy;
  final String? threadId;
  final bool aiPending;
  final DmMessage? characterReply;
  final bool offline;
  final bool queued;
  final List<Map<String, dynamic>>? toolResults;
}

class FollowResult {
  const FollowResult({
    required this.isFollowing,
    required this.affinity,
    required this.user,
  });

  final bool isFollowing;
  final int affinity;
  final SessionUser user;

  factory FollowResult.fromJson(Map<String, dynamic> json) {
    return FollowResult(
      isFollowing: json['isFollowing'] as bool? ?? false,
      affinity: json['affinity'] as int? ?? 0,
      user: SessionUser.fromJson(json['user'] as Map<String, dynamic>),
    );
  }
}

class UserCreatedCharacter {
  const UserCreatedCharacter({
    required this.id,
    required this.name,
    required this.handle,
    required this.fandom,
    this.avatarUrl,
    this.bio,
    this.isPublished = true,
    this.creatorEnergyEarned = 0,
    this.followerCount = 0,
  });

  final String id;
  final String name;
  final String handle;
  final String fandom;
  final String? avatarUrl;
  final String? bio;
  final bool isPublished;
  final int creatorEnergyEarned;
  final int followerCount;

  factory UserCreatedCharacter.fromJson(Map<String, dynamic> json) {
    return UserCreatedCharacter(
      id: json['id'] as String,
      name: json['name'] as String,
      handle: json['handle'] as String,
      fandom: json['fandom'] as String,
      avatarUrl: json['avatar_url'] as String?,
      bio: json['bio'] as String?,
      isPublished: json['is_published'] as bool? ?? true,
      creatorEnergyEarned: json['creator_energy_earned'] as int? ?? 0,
      followerCount: json['follower_count'] as int? ?? 0,
    );
  }
}

class GroupThread {
  const GroupThread({
    required this.id,
    required this.name,
    this.lastMessagePreview,
    this.lastMessageAt,
    this.memberCount = 0,
    this.aiPending = false,
    this.members = const [],
  });

  final String id;
  final String name;
  final String? lastMessagePreview;
  final DateTime? lastMessageAt;
  final int memberCount;
  final bool aiPending;
  final List<GroupMember> members;

  factory GroupThread.fromJson(Map<String, dynamic> json) {
    final membersRaw = json['members'] as List<dynamic>?;
    return GroupThread(
      id: json['id'] as String,
      name: json['name'] as String,
      lastMessagePreview: json['last_message_preview'] as String?,
      lastMessageAt: json['last_message_at'] != null
          ? DateTime.parse(json['last_message_at'] as String)
          : null,
      memberCount: json['member_count'] as int? ?? 0,
      aiPending: json['ai_pending'] as bool? ?? false,
      members: membersRaw
              ?.map((e) => GroupMember.fromJson(e as Map<String, dynamic>))
              .toList() ??
          const [],
    );
  }
}

class GroupMember {
  const GroupMember({
    required this.memberType,
    this.userId,
    this.characterId,
    this.userName,
    this.characterName,
    this.characterHandle,
    this.characterAvatar,
  });

  final String memberType;
  final String? userId;
  final String? characterId;
  final String? userName;
  final String? characterName;
  final String? characterHandle;
  final String? characterAvatar;

  bool get isCharacter => memberType == 'character';

  factory GroupMember.fromJson(Map<String, dynamic> json) {
    return GroupMember(
      memberType: json['member_type'] as String,
      userId: json['user_id'] as String?,
      characterId: json['character_id'] as String?,
      userName: json['user_name'] as String?,
      characterName: json['character_name'] as String?,
      characterHandle: json['character_handle'] as String?,
      characterAvatar: json['character_avatar'] as String?,
    );
  }
}

class GroupMessage {
  const GroupMessage({
    required this.id,
    required this.senderType,
    required this.content,
    required this.createdAt,
    this.senderUserName,
    this.senderCharacterName,
    this.senderCharacterHandle,
    this.senderCharacterAvatar,
    this.isPending = false,
  });

  final String id;
  final String senderType;
  final String content;
  final DateTime createdAt;
  final String? senderUserName;
  final String? senderCharacterName;
  final String? senderCharacterHandle;
  final String? senderCharacterAvatar;
  final bool isPending;

  bool get isUser => senderType == 'user';
  bool get isCharacter => senderType == 'character';

  String get displayName =>
      isCharacter ? (senderCharacterName ?? 'Character') : (senderUserName ?? 'You');

  factory GroupMessage.fromJson(Map<String, dynamic> json) {
    return GroupMessage(
      id: json['id'] as String,
      senderType: json['sender_type'] as String,
      content: json['content'] as String,
      createdAt: DateTime.parse(json['created_at'] as String),
      senderUserName: json['sender_user_name'] as String?,
      senderCharacterName: json['sender_character_name'] as String?,
      senderCharacterHandle: json['sender_character_handle'] as String?,
      senderCharacterAvatar: json['sender_character_avatar'] as String?,
    );
  }

  factory GroupMessage.pending(String content) {
    return GroupMessage(
      id: 'pending-${DateTime.now().millisecondsSinceEpoch}',
      senderType: 'user',
      content: content,
      createdAt: DateTime.now(),
      isPending: true,
    );
  }
}

class GroupMessagesResult {
  const GroupMessagesResult({
    required this.messages,
    required this.group,
    this.aiPending = false,
  });

  final List<GroupMessage> messages;
  final GroupThread group;
  final bool aiPending;
}

class GroupSendResult {
  const GroupSendResult({
    required this.message,
    required this.energy,
    this.aiPending = false,
    this.mentioned = const [],
  });

  final GroupMessage message;
  final EnergyState energy;
  final bool aiPending;
  final List<Map<String, String>> mentioned;
}

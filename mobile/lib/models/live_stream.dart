import 'dart:convert';

import 'session.dart';

enum AvatarRenderMode { simliVideo, rive2d }

class LiveSession {
  const LiveSession({
    required this.id,
    required this.characterId,
    required this.title,
    required this.status,
    required this.livekitRoom,
    this.hostUserId,
    this.viewerCount = 0,
    this.characterName,
    this.characterHandle,
    this.characterAvatarUrl,
    this.simliFaceId,
    this.startedAt,
  });

  final String id;
  final String characterId;
  final String title;
  final String status;
  final String livekitRoom;
  final String? hostUserId;
  final int viewerCount;
  final String? characterName;
  final String? characterHandle;
  final String? characterAvatarUrl;
  final String? simliFaceId;
  final DateTime? startedAt;

  bool get isLive => status == 'live';

  factory LiveSession.fromJson(Map<String, dynamic> json) {
    return LiveSession(
      id: json['id'] as String,
      characterId: json['character_id'] as String,
      title: json['title'] as String,
      status: json['status'] as String? ?? 'live',
      livekitRoom: json['livekit_room'] as String,
      hostUserId: json['host_user_id'] as String?,
      viewerCount: json['viewer_count'] as int? ?? 0,
      characterName: json['character_name'] as String?,
      characterHandle: json['character_handle'] as String?,
      characterAvatarUrl: json['avatar_url'] as String?,
      simliFaceId: json['simli_face_id'] as String?,
      startedAt: json['started_at'] != null
          ? DateTime.parse(json['started_at'] as String)
          : null,
    );
  }
}

class LiveSessionDetail {
  const LiveSessionDetail({
    required this.session,
    required this.livekitToken,
    this.livekitUrl,
    this.messages = const [],
  });

  final LiveSession session;
  final String livekitToken;
  final String? livekitUrl;
  final List<LiveChatMessage> messages;
}

class LiveChatMessage {
  const LiveChatMessage({
    required this.id,
    required this.sessionId,
    required this.userId,
    required this.content,
    required this.createdAt,
    this.displayName,
    this.username,
    this.isSuperChat = false,
    this.energySpent = 0,
    this.pinnedUntil,
    this.acknowledged = false,
  });

  final String id;
  final String sessionId;
  final String userId;
  final String content;
  final DateTime createdAt;
  final String? displayName;
  final String? username;
  final bool isSuperChat;
  final int energySpent;
  final DateTime? pinnedUntil;
  final bool acknowledged;

  String get authorLabel => displayName ?? username ?? 'Viewer';

  factory LiveChatMessage.fromJson(Map<String, dynamic> json) {
    return LiveChatMessage(
      id: json['id'] as String,
      sessionId: json['session_id'] as String,
      userId: json['user_id'] as String,
      content: json['content'] as String,
      createdAt: DateTime.parse(json['created_at'] as String),
      displayName: json['display_name'] as String?,
      username: json['username'] as String?,
      isSuperChat: json['is_super_chat'] as bool? ?? false,
      energySpent: json['energy_spent'] as int? ?? 0,
      pinnedUntil: json['pinned_until'] != null
          ? DateTime.parse(json['pinned_until'] as String)
          : null,
      acknowledged: json['acknowledged'] as bool? ?? false,
    );
  }
}

class LiveSessionCreateResult {
  const LiveSessionCreateResult({
    required this.session,
    required this.livekitToken,
    this.livekitUrl,
    this.simliFaceId,
  });

  final LiveSession session;
  final String livekitToken;
  final String? livekitUrl;
  final String? simliFaceId;
}

class LiveSuperChatResult {
  const LiveSuperChatResult({
    required this.message,
    required this.energy,
    this.spent = 0,
    this.aiPending = false,
  });

  final LiveChatMessage message;
  final EnergyState energy;
  final int spent;
  final bool aiPending;
}

class LiveAiSpeakingEvent {
  const LiveAiSpeakingEvent({
    required this.sessionId,
    required this.characterId,
    required this.text,
    this.superChatsAcknowledged = const [],
  });

  final String sessionId;
  final String characterId;
  final String text;
  final List<String> superChatsAcknowledged;

  factory LiveAiSpeakingEvent.fromJson(Map<String, dynamic> json) {
    return LiveAiSpeakingEvent(
      sessionId: json['sessionId'] as String? ?? json['session_id'] as String? ?? '',
      characterId: json['characterId'] as String? ?? json['character_id'] as String? ?? '',
      text: json['text'] as String? ?? '',
      superChatsAcknowledged: (json['superChatsAcknowledged'] as List<dynamic>?)
              ?.map((e) => e.toString())
              .toList() ??
          const [],
    );
  }
}

class LiveTtsChunk {
  const LiveTtsChunk({
    required this.audio,
    required this.format,
    required this.sampleRate,
    required this.index,
  });

  final List<int> audio;
  final String format;
  final int sampleRate;
  final int index;

  factory LiveTtsChunk.fromJson(Map<String, dynamic> json) {
    final raw = json['audio'];
    final List<int> bytes;
    if (raw is String) {
      bytes = base64Decode(raw);
    } else if (raw is List) {
      bytes = raw.cast<int>();
    } else {
      bytes = const [];
    }

    return LiveTtsChunk(
      audio: bytes,
      format: json['format'] as String? ?? 'pcm16',
      sampleRate: json['sampleRate'] as int? ?? json['sample_rate'] as int? ?? 16000,
      index: json['index'] as int? ?? 0,
    );
  }
}

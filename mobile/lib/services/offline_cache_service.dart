import 'dart:convert';

import 'package:hive_flutter/hive_flutter.dart';

import '../models/messaging.dart';
import '../models/post.dart';

class OfflineCacheService {
  static const _feedBox = 'feed_cache';
  static const _threadsBox = 'threads_cache';
  static const _messagesPrefix = 'messages_';

  static Future<void> init() async {
    await Hive.initFlutter();
    await Hive.openBox<String>(_feedBox);
    await Hive.openBox<String>(_threadsBox);
  }

  static Future<void> cacheFeed(List<Post> posts) async {
    final box = Hive.box<String>(_feedBox);
    final json = posts.map((p) => _postToJson(p)).toList();
    await box.put('posts', jsonEncode(json));
    await box.put('cached_at', DateTime.now().toIso8601String());
  }

  static List<Post>? loadFeed() {
    final box = Hive.box<String>(_feedBox);
    final raw = box.get('posts');
    if (raw == null) return null;
    try {
      final list = jsonDecode(raw) as List<dynamic>;
      return list.map((e) => Post.fromJson(Map<String, dynamic>.from(e as Map))).toList();
    } catch (_) {
      return null;
    }
  }

  static DateTime? feedCachedAt() {
    final raw = Hive.box<String>(_feedBox).get('cached_at');
    if (raw == null) return null;
    return DateTime.tryParse(raw);
  }

  static Future<void> cacheThreads(List<DmThread> threads) async {
    final box = Hive.box<String>(_threadsBox);
    final json = threads.map(_threadToJson).toList();
    await box.put('threads', jsonEncode(json));
    await box.put('cached_at', DateTime.now().toIso8601String());
  }

  static List<DmThread>? loadThreads() {
    final box = Hive.box<String>(_threadsBox);
    final raw = box.get('threads');
    if (raw == null) return null;
    try {
      final list = jsonDecode(raw) as List<dynamic>;
      return list.map((e) => DmThread.fromJson(Map<String, dynamic>.from(e as Map))).toList();
    } catch (_) {
      return null;
    }
  }

  static Future<void> cacheThreadMessages(String threadId, List<DmMessage> messages) async {
    final box = await Hive.openBox<String>('$_messagesPrefix$threadId');
    final json = messages.map(_messageToJson).toList();
    await box.put('messages', jsonEncode(json));
    await box.put('cached_at', DateTime.now().toIso8601String());
  }

  static List<DmMessage>? loadThreadMessages(String threadId) {
    if (!Hive.isBoxOpen('$_messagesPrefix$threadId')) return null;
    final box = Hive.box<String>('$_messagesPrefix$threadId');
    final raw = box.get('messages');
    if (raw == null) return null;
    try {
      final list = jsonDecode(raw) as List<dynamic>;
      return list.map((e) => DmMessage.fromJson(Map<String, dynamic>.from(e as Map))).toList();
    } catch (_) {
      return null;
    }
  }

  static Post? findCachedPost(String postId) {
    final feed = loadFeed();
    if (feed == null) return null;
    for (final post in feed) {
      if (post.id == postId) return post;
    }
    return null;
  }

  static Future<void> appendThreadMessage(String threadId, DmMessage message) async {
    final existing = loadThreadMessages(threadId) ?? [];
    await cacheThreadMessages(threadId, [...existing, message]);
  }

  static Map<String, dynamic> _postToJson(Post p) => {
        'id': p.id,
        'content': p.content,
        'author_character_id': p.authorCharacterId,
        'author_character_name': p.authorName,
        'author_character_handle': p.authorHandle,
        'author_user_name': p.isCharacter ? null : p.authorName,
        'author_user_username': p.isCharacter ? null : p.authorHandle,
        'author_character_avatar': p.isCharacter ? p.authorAvatarUrl : null,
        'author_user_avatar': p.isCharacter ? null : p.authorAvatarUrl,
        'image_url': p.imageUrl,
        'fandom': p.fandom,
        'like_count': p.likeCount,
        'reply_count': p.replyCount,
        'repost_count': p.repostCount,
        'created_at': p.createdAt.toIso8601String(),
      };

  static Map<String, dynamic> _threadToJson(DmThread t) => {
        'id': t.id,
        'character_id': t.characterId,
        'character_name': t.characterName,
        'character_handle': t.characterHandle,
        'character_avatar': t.characterAvatar,
        'character_fandom': t.characterFandom,
        'last_message_preview': t.lastMessagePreview,
        'last_message_at': t.lastMessageAt?.toIso8601String(),
        'ai_pending': t.aiPending,
      };

  static Map<String, dynamic> _messageToJson(DmMessage m) => {
        'id': m.id,
        'sender_type': m.senderType,
        'content': m.content,
        'is_read': m.isRead,
        'created_at': m.createdAt.toIso8601String(),
      };

  static const _meshBox = 'mesh_gossip_cache';

  static Future<void> cacheMeshRecord(String key, Map<String, dynamic> record) async {
    final box = await Hive.openBox<String>(_meshBox);
    await box.put(key, jsonEncode(record));
    await box.put('mesh_cached_at', DateTime.now().toIso8601String());
  }

  static Map<String, dynamic>? loadMeshRecord(String key) {
    if (!Hive.isBoxOpen(_meshBox)) return null;
    final raw = Hive.box<String>(_meshBox).get(key);
    if (raw == null) return null;
    try {
      return Map<String, dynamic>.from(jsonDecode(raw) as Map);
    } catch (_) {
      return null;
    }
  }
}

import 'dart:convert';
import 'dart:io';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_local_ai/flutter_local_ai.dart';
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';

import '../config/api_config.dart';
import '../models/auth.dart';
import '../models/admin_character.dart';
import '../models/messaging.dart';
import '../models/post.dart';
import '../models/profile.dart';
import '../models/session.dart';
import '../models/live_stream.dart';
import '../models/spatial.dart';
import 'auth_storage.dart';
import 'local_ai_service.dart';
import 'offline_cache_service.dart';
import 'realtime_service.dart';

class ApiService {
  ApiService({
    http.Client? client,
    AuthStorage? authStorage,
    LocalAiService? localAi,
    Connectivity? connectivity,
  })  : _client = client ?? http.Client(),
        _authStorage = authStorage ?? AuthStorage(),
        _localAi = localAi ?? LocalAiService(),
        _connectivity = connectivity ?? Connectivity();

  final http.Client _client;
  final AuthStorage _authStorage;
  final LocalAiService _localAi;
  final Connectivity _connectivity;
  String? _token;
  EnergyState? _lastEnergy;

  Future<void> init() async {
    _token = await _authStorage.getToken();
    await _localAi.init();
  }

  LocalAiService get localAi => _localAi;

  Future<bool> isOnline() async {
    final results = await _connectivity.checkConnectivity();
    return !results.contains(ConnectivityResult.none);
  }

  Future<bool> get isLocalAiAvailable => _localAi.isAvailable;

  Future<GenUiModuleSpec?> generateGenUiModule(String goal) =>
      _localAi.generateUiModule(goal: goal);

  Future<void> setToken(String? token) async {
    _token = token;
    if (token != null) {
      await _authStorage.saveToken(token);
    } else {
      await _authStorage.clearToken();
    }
  }

  Future<Map<String, String>> _headers({bool json = true}) async {
    final token = _token ?? await _authStorage.getToken();
    _token = token;
    return {
      if (json) 'Content-Type': 'application/json',
      'Accept': 'application/json',
      if (token != null) 'Authorization': 'Bearer $token',
    };
  }

  Future<AuthResult> register({
    required String username,
    required String email,
    required String password,
    required String displayName,
  }) async {
    final uri = Uri.parse('${ApiConfig.baseUrl}/auth/register');
    final response = await _client.post(
      uri,
      headers: await _headers(),
      body: jsonEncode({
        'username': username,
        'email': email,
        'password': password,
        'displayName': displayName,
      }),
    );
    _throwIfError(response, 'Registration failed');
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    final result = AuthResult.fromJson(body['data'] as Map<String, dynamic>);
    await setToken(result.token);
    return result;
  }

  Future<AuthResult> login({required String email, required String password}) async {
    final uri = Uri.parse('${ApiConfig.baseUrl}/auth/login');
    final response = await _client.post(
      uri,
      headers: await _headers(),
      body: jsonEncode({'email': email, 'password': password}),
    );
    _throwIfError(response, 'Login failed');
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    final result = AuthResult.fromJson(body['data'] as Map<String, dynamic>);
    await setToken(result.token);
    return result;
  }

  Future<void> logout() async {
    await setToken(null);
  }

  Future<String?> getToken() async {
    return _token ?? await _authStorage.getToken();
  }

  Future<void> connectRealtime(RealtimeService realtime) async {
    final token = await getToken();
    if (token != null) {
      realtime.connect(token);
    }
  }

  Future<AppSession> fetchSession() async {
    final uri = Uri.parse('${ApiConfig.baseUrl}/auth/me');
    final response = await _client.get(uri, headers: await _headers());
    _throwIfError(response, 'Failed to load session');
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    final session = AppSession.fromJson(body['data'] as Map<String, dynamic>);
    _lastEnergy = session.energy;
    return session;
  }

  Future<String> uploadImage(File file) async {
    final uri = Uri.parse('${ApiConfig.baseUrl}/uploads/image');
    final request = http.MultipartRequest('POST', uri);
    final headers = await _headers(json: false);
    request.headers.addAll(headers);
    request.files.add(await http.MultipartFile.fromPath(
      'image',
      file.path,
      contentType: MediaType('image', 'jpeg'),
    ));

    final streamed = await _client.send(request);
    final response = await http.Response.fromStream(streamed);
    _throwIfError(response, 'Upload failed');
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    return (body['data'] as Map<String, dynamic>)['url'] as String;
  }

  Future<SessionUser> updateProfile({String? displayName, String? bio, String? avatarUrl}) async {
    final uri = Uri.parse('${ApiConfig.baseUrl}/profile');
    final response = await _client.patch(
      uri,
      headers: await _headers(),
      body: jsonEncode({
        if (displayName != null) 'displayName': displayName,
        if (bio != null) 'bio': bio,
        if (avatarUrl != null) 'avatarUrl': avatarUrl,
      }),
    );
    _throwIfError(response, 'Failed to update profile');
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    return SessionUser.fromJson(body['data'] as Map<String, dynamic>);
  }

  Future<List<StoreProduct>> fetchStoreProducts() async {
    final uri = Uri.parse('${ApiConfig.baseUrl}/store/products');
    final response = await _client.get(uri, headers: await _headers());
    _throwIfError(response, 'Failed to load store');
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    final data = body['data'] as List<dynamic>;
    return data.map((e) => StoreProduct.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<RefillResult> purchaseEnergy(String productId) async {
    final receiptToken = 'mock_receipt_${productId}_${DateTime.now().millisecondsSinceEpoch}';
    final uri = Uri.parse('${ApiConfig.baseUrl}/energy/refill');
    final response = await _client.post(
      uri,
      headers: await _headers(),
      body: jsonEncode({'productId': productId, 'receiptToken': receiptToken}),
    );
    _throwIfError(response, 'Purchase failed');
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    return RefillResult.fromJson(body);
  }

  Future<List<Post>> fetchPosts({int limit = 20, String? fandom}) async {
    if (!await isOnline()) {
      final cached = OfflineCacheService.loadFeed();
      if (cached != null) return cached;
      throw ApiOfflineException('Offline — no cached feed available');
    }

    final query = <String, String>{'limit': '$limit'};
    if (fandom != null) query['fandom'] = fandom;

    try {
      final uri = Uri.parse('${ApiConfig.baseUrl}/posts').replace(queryParameters: query);
      final response = await _client.get(uri, headers: await _headers());
      _throwIfError(response, 'Failed to load feed');

      final body = jsonDecode(response.body) as Map<String, dynamic>;
      final data = body['data'] as List<dynamic>;
      return data.map((e) => Post.fromJson(e as Map<String, dynamic>)).toList();
    } on SocketException {
      final cached = OfflineCacheService.loadFeed();
      if (cached != null) return cached;
      rethrow;
    }
  }

  Future<ReplyResult> replyToPost(
    String postId,
    String content, {
    String? characterName,
    String? postContent,
  }) async {
    if (!await isOnline()) {
      return _replyToPostOffline(
        postId: postId,
        content: content,
        characterName: characterName,
        postContent: postContent,
      );
    }

    final uri = Uri.parse('${ApiConfig.baseUrl}/posts/$postId/replies');
    final response = await _client.post(
      uri,
      headers: await _headers(),
      body: jsonEncode({'content': content}),
    );

    if (response.statusCode == 409) {
      final body = jsonDecode(response.body) as Map<String, dynamic>;
      throw InsufficientEnergyException(body['message'] as String? ?? 'Insufficient energy');
    }

    _throwIfError(response, 'Failed to reply');
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    final userJson = body['user'] as Map<String, dynamic>?;

    return ReplyResult(
      energy: EnergyState.fromJson(body['energy'] as Map<String, dynamic>),
      aiPending: body['aiPending'] as bool? ?? false,
      user: userJson != null ? SessionUser.fromJson(userJson) : null,
    );
  }

  Future<ReplyResult> createPost(String content, {String fandom = 'General', String? imageUrl}) async {
    final uri = Uri.parse('${ApiConfig.baseUrl}/posts');
    final response = await _client.post(
      uri,
      headers: await _headers(),
      body: jsonEncode({
        'content': content,
        'fandom': fandom,
        if (imageUrl != null) 'imageUrl': imageUrl,
      }),
    );

    if (response.statusCode == 409) {
      final body = jsonDecode(response.body) as Map<String, dynamic>;
      throw InsufficientEnergyException(body['message'] as String? ?? 'Insufficient energy');
    }

    _throwIfError(response, 'Failed to create post');
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    return ReplyResult(
      energy: EnergyState.fromJson(body['energy'] as Map<String, dynamic>),
    );
  }

  Future<ExploreData> fetchExplore() async {
    final uri = Uri.parse('${ApiConfig.baseUrl}/characters/explore');
    final response = await _client.get(uri, headers: await _headers());
    _throwIfError(response, 'Failed to load explore');
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    return ExploreData.fromJson(body['data'] as Map<String, dynamic>);
  }

  Future<FollowResult> followCharacter(String characterId) async {
    final uri = Uri.parse('${ApiConfig.baseUrl}/characters/$characterId/follow');
    final response = await _client.post(uri, headers: await _headers());
    _throwIfError(response, 'Failed to follow');
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    return FollowResult.fromJson(body['data'] as Map<String, dynamic>);
  }

  Future<FollowResult> unfollowCharacter(String characterId) async {
    final uri = Uri.parse('${ApiConfig.baseUrl}/characters/$characterId/follow');
    final response = await _client.delete(uri, headers: await _headers());
    _throwIfError(response, 'Failed to unfollow');
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    return FollowResult.fromJson(body['data'] as Map<String, dynamic>);
  }

  Future<String> getOrCreateThread(String characterId) async {
    final uri = Uri.parse('${ApiConfig.baseUrl}/messages/threads/character/$characterId');
    final response = await _client.post(uri, headers: await _headers());
    _throwIfError(response, 'Failed to open thread');
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    return (body['data'] as Map<String, dynamic>)['threadId'] as String;
  }

  Future<List<AiCharacter>> fetchCharacters() async {
    final uri = Uri.parse('${ApiConfig.baseUrl}/characters');
    final response = await _client.get(uri, headers: await _headers());
    _throwIfError(response, 'Failed to load characters');
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    final data = body['data'] as List<dynamic>;
    return data.map((e) => AiCharacter.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<List<DmThread>> fetchThreads() async {
    final uri = Uri.parse('${ApiConfig.baseUrl}/messages/threads');
    final response = await _client.get(uri, headers: await _headers());
    _throwIfError(response, 'Failed to load threads');
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    final data = body['data'] as List<dynamic>;
    return data.map((e) => DmThread.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<ThreadMessagesResult> fetchThreadMessages(String threadId) async {
    if (!await isOnline()) {
      final cached = OfflineCacheService.loadThreadMessages(threadId);
      if (cached != null) {
        return ThreadMessagesResult(messages: cached, aiPending: false);
      }
      throw ApiOfflineException('Offline — no cached messages for this thread');
    }

    final uri = Uri.parse('${ApiConfig.baseUrl}/messages/threads/$threadId');
    final response = await _client.get(uri, headers: await _headers());
    _throwIfError(response, 'Failed to load messages');
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    final data = body['data'] as List<dynamic>;
    final meta = body['meta'] as Map<String, dynamic>?;

    InteractionUpdate? interaction;
    final interactionJson = meta?['interaction'] as Map<String, dynamic>?;
    if (interactionJson != null) {
      interaction = InteractionUpdate.fromJson(interactionJson);
    }

    return ThreadMessagesResult(
      messages: data.map((e) => DmMessage.fromJson(e as Map<String, dynamic>)).toList(),
      aiPending: meta?['aiPending'] as bool? ?? false,
      interaction: interaction,
    );
  }

  Future<DmSendResult> sendMessage({
    required String characterId,
    required String content,
    String? characterName,
    String? characterBio,
    List<String> recentLines = const [],
    EnergyState? currentEnergy,
  }) async {
    if (!await isOnline()) {
      return _sendMessageOffline(
        characterId: characterId,
        content: content,
        characterName: characterName ?? 'Character',
        characterBio: characterBio ?? '',
        recentLines: recentLines,
        currentEnergy: currentEnergy,
      );
    }

    final uri = Uri.parse('${ApiConfig.baseUrl}/messages');
    final response = await _client.post(
      uri,
      headers: await _headers(),
      body: jsonEncode({'characterId': characterId, 'content': content}),
    );

    if (response.statusCode == 409) {
      final body = jsonDecode(response.body) as Map<String, dynamic>;
      throw InsufficientEnergyException(body['message'] as String? ?? 'Insufficient energy');
    }

    _throwIfError(response, 'Failed to send message');
    final body = jsonDecode(response.body) as Map<String, dynamic>;

    final energy = EnergyState.fromJson(body['energy'] as Map<String, dynamic>);
    _lastEnergy = energy;

    return DmSendResult(
      userMessage: DmMessage.fromJson(body['data'] as Map<String, dynamic>),
      energy: energy,
      threadId: body['threadId'] as String?,
      aiPending: body['aiPending'] as bool? ?? true,
      toolResults: (body['toolResults'] as List<dynamic>?)
          ?.map((e) => Map<String, dynamic>.from(e as Map))
          .toList(),
    );
  }

  Future<DmSendResult> _sendMessageOffline({
    required String characterId,
    required String content,
    required String characterName,
    required String characterBio,
    required List<String> recentLines,
    EnergyState? currentEnergy,
  }) async {
    final now = DateTime.now();
    final userMessage = DmMessage(
      id: 'offline-user-${now.millisecondsSinceEpoch}',
      senderType: 'user',
      content: content,
      createdAt: now,
    );

    final replyText = await _localAi.generateDmReply(
          characterName: characterName,
          characterBio: characterBio,
          userMessage: content,
          recentLines: recentLines,
        ) ??
        "I'm here — we'll sync properly when you're back online.";

    final characterReply = DmMessage(
      id: 'offline-ai-${now.millisecondsSinceEpoch}',
      senderType: 'character',
      content: replyText,
      createdAt: now.add(const Duration(milliseconds: 400)),
    );

    final energy = currentEnergy ??
        _lastEnergy ??
        EnergyState(
          remaining: 100,
          max: 100,
          resetAt: now.add(const Duration(hours: 24)),
        );

    return DmSendResult(
      userMessage: userMessage,
      characterReply: characterReply,
      energy: energy,
      threadId: 'offline-$characterId',
      aiPending: false,
      offline: true,
    );
  }

  Future<ReplyResult> _replyToPostOffline({
    required String postId,
    required String content,
    String? characterName,
    String? postContent,
  }) async {
    final post = OfflineCacheService.findCachedPost(postId);
    final aiText = await _localAi.generateFeedReply(
          characterName: characterName ?? post?.authorName ?? 'Character',
          postContent: postContent ?? post?.content ?? 'a recent post',
          userReply: content,
        ) ??
        'Interesting — tell me more when we\'re back online.';

    final now = DateTime.now();
    final energy = _lastEnergy ??
        EnergyState(
          remaining: 100,
          max: 100,
          resetAt: now.add(const Duration(hours: 24)),
        );

    return ReplyResult(
      energy: energy,
      aiReplyContent: aiText,
      aiPending: false,
    );
  }

  Future<UserProfile> fetchProfile() async {
    final uri = Uri.parse('${ApiConfig.baseUrl}/profile');
    final response = await _client.get(uri, headers: await _headers());
    _throwIfError(response, 'Failed to load profile');
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    return UserProfile.fromJson(body['data'] as Map<String, dynamic>);
  }

  Future<List<ActivityItem>> fetchProfileActivity({int limit = 30}) async {
    final uri = Uri.parse('${ApiConfig.baseUrl}/profile/activity').replace(
      queryParameters: {'limit': '$limit'},
    );
    final response = await _client.get(uri, headers: await _headers());
    _throwIfError(response, 'Failed to load activity');
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    final data = body['data'] as List<dynamic>;
    return data.map((e) => ActivityItem.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<List<AdminCharacter>> fetchAdminCharacters() async {
    final uri = Uri.parse('${ApiConfig.baseUrl}/admin/characters');
    final response = await _client.get(uri, headers: await _headers());
    _throwIfError(response, 'Failed to load characters');
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    final data = body['data'] as List<dynamic>;
    return data.map((e) => AdminCharacter.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<AdminCharacter> upsertAdminCharacter(AdminCharacter character) async {
    final uri = Uri.parse('${ApiConfig.baseUrl}/admin/characters');
    final response = await _client.post(
      uri,
      headers: await _headers(),
      body: jsonEncode(character.toPayload()),
    );
    _throwIfError(response, 'Failed to save character');
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    return AdminCharacter.fromJson(body['data'] as Map<String, dynamic>);
  }

  Future<void> logClientEvents(List<Map<String, dynamic>> events) async {
    if (events.isEmpty) return;
    final uri = Uri.parse('${ApiConfig.baseUrl}/analytics/events');
    final response = await _client.post(
      uri,
      headers: await _headers(),
      body: jsonEncode({'events': events}),
    );
    _throwIfError(response, 'Failed to log analytics');
  }

  Future<String> transcribeVoice(File audioFile) async {
    final uri = Uri.parse('${ApiConfig.baseUrl}/voice/transcribe');
    final request = http.MultipartRequest('POST', uri);
    final headers = await _headers(json: false);
    request.headers.addAll(headers);
    request.files.add(await http.MultipartFile.fromPath('audio', audioFile.path));

    final streamed = await _client.send(request);
    final response = await http.Response.fromStream(streamed);
    _throwIfError(response, 'Voice transcription failed');
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    return (body['data'] as Map<String, dynamic>)['text'] as String;
  }

  Future<List<int>?> trySynthesizeVoice(String text) async {
    final uri = Uri.parse('${ApiConfig.baseUrl}/voice/synthesize');
    final response = await _client.post(
      uri,
      headers: await _headers(),
      body: jsonEncode({'text': text}),
    );
    if (response.statusCode == 503) return null;
    if (response.statusCode >= 200 && response.statusCode < 300) {
      return response.bodyBytes;
    }
    return null;
  }

  void _throwIfError(http.Response response, String message) {
    if (response.statusCode >= 200 && response.statusCode < 300) return;
    if (response.statusCode == 401) {
      throw AuthException('Session expired — please log in again');
    }
    if (response.statusCode == 422) {
      try {
        final body = jsonDecode(response.body) as Map<String, dynamic>;
        throw ContentModerationException(
          body['message'] as String? ?? 'Content blocked by safety filter',
        );
      } catch (e) {
        if (e is ContentModerationException) rethrow;
      }
    }
    try {
      final body = jsonDecode(response.body) as Map<String, dynamic>;
      throw ApiException(body['message'] as String? ?? message, response.statusCode);
    } catch (e) {
      if (e is ApiException || e is ContentModerationException) rethrow;
      throw ApiException(message, response.statusCode);
    }
  }

  Future<UserCreatedCharacter> createCharacter({
    required AdminCharacter character,
    String? avatarUrl,
    bool publish = true,
  }) async {
    final uri = Uri.parse('${ApiConfig.baseUrl}/characters');
    final payload = character.toPayload();
    if (avatarUrl != null) payload['avatarUrl'] = avatarUrl;
    payload['publish'] = publish;

    final response = await _client.post(
      uri,
      headers: await _headers(),
      body: jsonEncode(payload),
    );
    _throwIfError(response, 'Failed to create character');
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    return UserCreatedCharacter.fromJson(body['data'] as Map<String, dynamic>);
  }

  Future<List<GroupThread>> fetchGroups() async {
    final uri = Uri.parse('${ApiConfig.baseUrl}/messages/groups');
    final response = await _client.get(uri, headers: await _headers());
    _throwIfError(response, 'Failed to load groups');
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    final data = body['data'] as List<dynamic>;
    return data.map((e) => GroupThread.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<GroupThread> createGroup({
    required String name,
    required List<String> characterIds,
    List<String> userIds = const [],
  }) async {
    final uri = Uri.parse('${ApiConfig.baseUrl}/messages/groups');
    final response = await _client.post(
      uri,
      headers: await _headers(),
      body: jsonEncode({
        'name': name,
        'characterIds': characterIds,
        'userIds': userIds,
      }),
    );
    _throwIfError(response, 'Failed to create group');
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    return GroupThread.fromJson(body['data'] as Map<String, dynamic>);
  }

  Future<GroupMessagesResult> fetchGroupMessages(String groupId) async {
    final uri = Uri.parse('${ApiConfig.baseUrl}/messages/groups/$groupId');
    final response = await _client.get(uri, headers: await _headers());
    _throwIfError(response, 'Failed to load group messages');
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    final data = body['data'] as List<dynamic>;
    final meta = body['meta'] as Map<String, dynamic>;
    return GroupMessagesResult(
      messages: data.map((e) => GroupMessage.fromJson(e as Map<String, dynamic>)).toList(),
      group: GroupThread.fromJson(meta['group'] as Map<String, dynamic>),
      aiPending: meta['aiPending'] as bool? ?? false,
    );
  }

  Future<GroupSendResult> sendGroupMessage({
    required String groupId,
    required String content,
  }) async {
    final uri = Uri.parse('${ApiConfig.baseUrl}/messages/groups/send');
    final response = await _client.post(
      uri,
      headers: await _headers(),
      body: jsonEncode({'groupId': groupId, 'content': content}),
    );

    if (response.statusCode == 409) {
      final body = jsonDecode(response.body) as Map<String, dynamic>;
      throw InsufficientEnergyException(body['message'] as String? ?? 'Insufficient energy');
    }

    _throwIfError(response, 'Failed to send group message');
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    final mentioned = (body['mentioned'] as List<dynamic>?)
            ?.map((e) => Map<String, String>.from(e as Map))
            .toList() ??
        [];

    return GroupSendResult(
      message: GroupMessage.fromJson(body['data'] as Map<String, dynamic>),
      energy: EnergyState.fromJson(body['energy'] as Map<String, dynamic>),
      aiPending: body['aiPending'] as bool? ?? false,
      mentioned: mentioned,
    );
  }

  Future<List<LiveSession>> fetchLiveSessions() async {
    final uri = Uri.parse('${ApiConfig.baseUrl}/live/sessions');
    final response = await _client.get(uri, headers: await _headers());
    _throwIfError(response, 'Failed to load live sessions');
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    final data = body['data'] as List<dynamic>;
    return data.map((e) => LiveSession.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<LiveSessionCreateResult> createLiveSession({
    required String characterId,
    String? title,
  }) async {
    final uri = Uri.parse('${ApiConfig.baseUrl}/live/sessions');
    final response = await _client.post(
      uri,
      headers: await _headers(),
      body: jsonEncode({'characterId': characterId, if (title != null) 'title': title}),
    );
    _throwIfError(response, 'Failed to start live session');
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    final data = body['data'] as Map<String, dynamic>;
    return LiveSessionCreateResult(
      session: LiveSession.fromJson(data['session'] as Map<String, dynamic>),
      livekitToken: data['livekitToken'] as String,
      livekitUrl: data['livekitUrl'] as String?,
      simliFaceId: data['simliFaceId'] as String?,
    );
  }

  Future<LiveSessionDetail> fetchLiveSession(String sessionId) async {
    final uri = Uri.parse('${ApiConfig.baseUrl}/live/sessions/$sessionId');
    final response = await _client.get(uri, headers: await _headers());
    _throwIfError(response, 'Failed to load live session');
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    final data = body['data'] as Map<String, dynamic>;
    final session = LiveSession.fromJson(data['session'] as Map<String, dynamic>);
    final messages = (data['messages'] as List<dynamic>?)
            ?.map((e) => LiveChatMessage.fromJson(e as Map<String, dynamic>))
            .toList() ??
        [];
    return LiveSessionDetail(
      session: session,
      livekitToken: data['livekitToken'] as String,
      livekitUrl: data['livekitUrl'] as String?,
      messages: messages,
    );
  }

  Future<LiveChatMessage> sendLiveChat({
    required String sessionId,
    required String content,
  }) async {
    final uri = Uri.parse('${ApiConfig.baseUrl}/live/sessions/$sessionId/chat');
    final response = await _client.post(
      uri,
      headers: await _headers(),
      body: jsonEncode({'content': content}),
    );
    _throwIfError(response, 'Failed to send chat');
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    return LiveChatMessage.fromJson(body['data'] as Map<String, dynamic>);
  }

  Future<LiveSuperChatResult> sendLiveSuperChat({
    required String sessionId,
    required String content,
  }) async {
    final uri = Uri.parse('${ApiConfig.baseUrl}/live/sessions/$sessionId/super-chat');
    final response = await _client.post(
      uri,
      headers: await _headers(),
      body: jsonEncode({'content': content}),
    );

    if (response.statusCode == 409) {
      final body = jsonDecode(response.body) as Map<String, dynamic>;
      throw InsufficientEnergyException(body['message'] as String? ?? 'Insufficient energy');
    }

    _throwIfError(response, 'Failed to send super chat');
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    return LiveSuperChatResult(
      message: LiveChatMessage.fromJson(body['data'] as Map<String, dynamic>),
      energy: EnergyState.fromJson(body['energy'] as Map<String, dynamic>),
      spent: body['spent'] as int? ?? 0,
      aiPending: body['aiPending'] as bool? ?? false,
    );
  }

  Future<List<SpatialScene>> fetchSpatialScenes() async {
    final uri = Uri.parse('${ApiConfig.baseUrl}/spatial/scenes');
    final response = await _client.get(uri, headers: await _headers());
    _throwIfError(response, 'Failed to load spatial scenes');
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    final data = body['data'] as List<dynamic>;
    return data.map((e) => SpatialScene.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<void> saveSpatialScene({
    required SpatialScene scene,
    required ProcessedSpatialContext context,
  }) async {
    final uri = Uri.parse('${ApiConfig.baseUrl}/spatial/scenes');
    final response = await _client.post(
      uri,
      headers: await _headers(),
      body: jsonEncode({
        'characterId': scene.characterId,
        'sceneKey': scene.sceneKey,
        'anchorLabel': scene.anchorLabel,
        'worldPosition': scene.worldPosition,
        'worldRotation': scene.worldRotation,
        'scale': scene.scale,
        'isPersistent': scene.isPersistent,
        'spatial': context.toApiJson(),
      }),
    );
    _throwIfError(response, 'Failed to save spatial scene');
  }

  Future<void> submitSpatialContext({
    required ProcessedSpatialContext context,
    String? characterId,
    String? zoneLabel,
  }) async {
    final uri = Uri.parse('${ApiConfig.baseUrl}/spatial/context');
    final response = await _client.post(
      uri,
      headers: await _headers(),
      body: jsonEncode({
        if (characterId != null) 'characterId': characterId,
        'spatial': context.toApiJson(),
        if (zoneLabel != null) 'zoneLabel': zoneLabel,
        'residencyRegion': context.residencyRegion,
      }),
    );
    _throwIfError(response, 'Failed to submit spatial context');
  }

  Future<SpatialReactResult> spatialCharacterReact({
    required String characterId,
    required String message,
    required ProcessedSpatialContext context,
    String? sceneKey,
  }) async {
    final uri = Uri.parse('${ApiConfig.baseUrl}/spatial/react');
    final response = await _client.post(
      uri,
      headers: await _headers(),
      body: jsonEncode({
        'characterId': characterId,
        'message': message,
        'spatial': context.toApiJson(),
        if (sceneKey != null) 'sceneKey': sceneKey,
      }),
    );
    _throwIfError(response, 'Spatial react failed');
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    return SpatialReactResult.fromJson(body['data'] as Map<String, dynamic>);
  }
}

class ApiException implements Exception {
  ApiException(this.message, this.statusCode);
  final String message;
  final int statusCode;
  @override
  String toString() => 'ApiException($statusCode): $message';
}

class AuthException implements Exception {
  AuthException(this.message);
  final String message;
  @override
  String toString() => message;
}

class InsufficientEnergyException implements Exception {
  InsufficientEnergyException(this.message);
  final String message;
  @override
  String toString() => message;
}

class ApiOfflineException implements Exception {
  ApiOfflineException(this.message);
  final String message;
  @override
  String toString() => message;
}

class ContentModerationException implements Exception {
  ContentModerationException(this.message);
  final String message;
  @override
  String toString() => message;
}

import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:cryptography/cryptography.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
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
import '../models/bci.dart';
import '../models/affective.dart';
import 'mesh_gossip_protocol.dart';
import 'auth_storage.dart';
import 'local_ai_service.dart';
import 'offline_action_queue_service.dart';
import 'federated_learning_service.dart';
import 'offline_cache_service.dart';
import 'realtime_service.dart';
import 'e2ee_service.dart';

class ApiService {
  ApiService({
    http.Client? client,
    AuthStorage? authStorage,
    LocalAiService? localAi,
    Connectivity? connectivity,
    OfflineActionQueueService? queue,
    E2eeService? e2ee,
    FederatedLearningService? federated,
    String? tenantSlug,
  })  : _client = client ?? http.Client(),
        _authStorage = authStorage ?? AuthStorage(),
        _localAi = localAi ?? LocalAiService(),
        _connectivity = connectivity ?? Connectivity(),
        _queue = queue ?? OfflineActionQueueService.instance,
        _e2ee = e2ee ?? E2eeService(),
        _federated = federated ?? FederatedLearningService(),
        _tenantSlug = tenantSlug ?? dotenv.maybeGet('TENANT_SLUG') ?? 'default';

  final http.Client _client;
  final AuthStorage _authStorage;
  final LocalAiService _localAi;
  final Connectivity _connectivity;
  final OfflineActionQueueService _queue;
  final E2eeService _e2ee;
  final FederatedLearningService _federated;
  final String _tenantSlug;
  String? _token;
  EnergyState? _lastEnergy;
  StreamSubscription<List<ConnectivityResult>>? _connectivitySub;
  bool _syncing = false;

  static const _postEnergyCost = 10;
  static const _dmEnergyCost = 8;

  Future<void> init() async {
    _token = await _authStorage.getToken();
    await _localAi.init();
    await _e2ee.init();
    await _federated.init();
    await OfflineActionQueueService.init();

    _connectivitySub ??= _connectivity.onConnectivityChanged.listen((_) {
      unawaited(syncPendingActions());
    });

    await syncPendingActions();
  }

  Future<int> get pendingActionCount => _queue.pendingCount();

  Future<void> dispose() async {
    await _connectivitySub?.cancel();
    _connectivitySub = null;
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
      'X-Tenant-Slug': _tenantSlug,
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

  Future<SubscriptionState> fetchEntitlements() async {
    final uri = Uri.parse('${ApiConfig.baseUrl}/subscription/entitlements');
    final response = await _client.get(uri, headers: await _headers());
    _throwIfError(response, 'Failed to load entitlements');
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    return SubscriptionState.fromJson(body['data'] as Map<String, dynamic>);
  }

  Future<SubscriptionState> syncSubscription({
    String? appUserId,
    List<String> activeEntitlements = const [],
  }) async {
    final uri = Uri.parse('${ApiConfig.baseUrl}/subscription/sync');
    final response = await _client.post(
      uri,
      headers: await _headers(),
      body: jsonEncode({
        if (appUserId != null) 'appUserId': appUserId,
        'activeEntitlements': activeEntitlements,
      }),
    );
    _throwIfError(response, 'Subscription sync failed');
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    return SubscriptionState.fromJson(body['data'] as Map<String, dynamic>);
  }

  /// Phase 31 — V2 Beta capability probe (uses /api/v2 regardless of ApiConfig base).
  Future<Map<String, dynamic>> fetchV2Version() async {
    final root = ApiConfig.baseUrl.replaceAll(RegExp(r'/api/v1/?$'), '');
    final uri = Uri.parse('$root/api/v2/version');
    final response = await _client.get(uri, headers: await _headers());
    _throwIfError(response, 'Failed to load V2 capabilities');
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    return body['data'] as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> reflectV2Draft({
    required String draft,
    String? characterName,
    String? incomingMessage,
  }) async {
    final root = ApiConfig.baseUrl.replaceAll(RegExp(r'/api/v1/?$'), '');
    final uri = Uri.parse('$root/api/v2/ai/reflect');
    final response = await _client.post(
      uri,
      headers: await _headers(),
      body: jsonEncode({
        'draft': draft,
        'characterName': characterName,
        'incomingMessage': incomingMessage,
      }),
    );
    _throwIfError(response, 'V2 reflection failed');
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    return body['data'] as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> fetchV2EdgeVectorStatus() async {
    final root = ApiConfig.baseUrl.replaceAll(RegExp(r'/api/v1/?$'), '');
    final uri = Uri.parse('$root/api/v2/edge/vectors/status');
    final response = await _client.get(uri, headers: await _headers());
    _throwIfError(response, 'Failed to load edge vector status');
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    return body['data'] as Map<String, dynamic>;
  }

  /// Phase 35 — create multi-modal WebRTC avatar session (signaling via Socket.IO).
  Future<Map<String, dynamic>> createV2WebrtcSession({
    String? characterId,
    List<String> modalities = const ['avatar3d', 'spatial_audio', 'text'],
    String? threadId,
  }) async {
    final root = ApiConfig.baseUrl.replaceAll(RegExp(r'/api/v1/?$'), '');
    final uri = Uri.parse('$root/api/v2/webrtc/session');
    final response = await _client.post(
      uri,
      headers: await _headers(),
      body: jsonEncode({
        if (characterId != null) 'characterId': characterId,
        'modalities': modalities,
        if (threadId != null) 'threadId': threadId,
      }),
    );
    _throwIfError(response, 'Failed to create WebRTC session');
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    return body['data'] as Map<String, dynamic>;
  }

  /// Phase 36 — bio-adaptive cognitive modulation.
  Future<Map<String, dynamic>> modulateV2Cognitive({
    Map<String, dynamic>? bci,
    Map<String, dynamic>? biometrics,
    double? baseTemperature,
    double? baseEmpathy,
  }) async {
    final root = ApiConfig.baseUrl.replaceAll(RegExp(r'/api/v1/?$'), '');
    final uri = Uri.parse('$root/api/v2/cognitive/modulate');
    final response = await _client.post(
      uri,
      headers: await _headers(),
      body: jsonEncode({
        if (bci != null) 'bci': bci,
        if (biometrics != null) 'biometrics': biometrics,
        if (baseTemperature != null) 'baseTemperature': baseTemperature,
        if (baseEmpathy != null) 'baseEmpathy': baseEmpathy,
      }),
    );
    _throwIfError(response, 'Cognitive modulate failed');
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    return body['data'] as Map<String, dynamic>;
  }

  /// Phase 36 — publish CRDT spatial document to metaverse peers.
  Future<Map<String, dynamic>> publishV2CrdtDocument({
    required Map<String, dynamic> document,
    String? syncToken,
  }) async {
    final root = ApiConfig.baseUrl.replaceAll(RegExp(r'/api/v1/?$'), '');
    final uri = Uri.parse('$root/api/v2/metaverse/crdt/merge');
    final response = await _client.post(
      uri,
      headers: await _headers(),
      body: jsonEncode({
        'document': document,
        if (syncToken != null) 'syncToken': syncToken,
      }),
    );
    _throwIfError(response, 'CRDT merge failed');
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    return body['data'] as Map<String, dynamic>;
  }

  /// Phase 39 — cognitive full-duplex voice session.
  Future<Map<String, dynamic>> createV2DuplexVoiceSession({
    String? characterId,
    Map<String, dynamic>? bci,
    Map<String, dynamic>? biometrics,
  }) async {
    final root = ApiConfig.baseUrl.replaceAll(RegExp(r'/api/v1/?$'), '');
    final uri = Uri.parse('$root/api/v2/voice/duplex/session');
    final response = await _client.post(
      uri,
      headers: await _headers(),
      body: jsonEncode({
        if (characterId != null) 'characterId': characterId,
        if (bci != null) 'bci': bci,
        if (biometrics != null) 'biometrics': biometrics,
      }),
    );
    _throwIfError(response, 'Duplex voice session failed');
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    return body['data'] as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> updateV2DuplexProsody({
    required String sessionId,
    Map<String, dynamic>? bci,
    Map<String, dynamic>? biometrics,
  }) async {
    final root = ApiConfig.baseUrl.replaceAll(RegExp(r'/api/v1/?$'), '');
    final uri = Uri.parse('$root/api/v2/voice/duplex/$sessionId/prosody');
    final response = await _client.post(
      uri,
      headers: await _headers(),
      body: jsonEncode({
        if (bci != null) 'bci': bci,
        if (biometrics != null) 'biometrics': biometrics,
      }),
    );
    _throwIfError(response, 'Prosody update failed');
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    return body['data'] as Map<String, dynamic>;
  }

  /// Phase 40 — ambient fabric proactive suggestions (no wake word).
  Future<Map<String, dynamic>> inferV2AmbientSuggestions({
    required String transcript,
    String? activity,
    String? locationLabel,
    bool calendarBusy = false,
    String? recentIntent,
  }) async {
    final root = ApiConfig.baseUrl.replaceAll(RegExp(r'/api/v1/?$'), '');
    final uri = Uri.parse('$root/api/v2/ambient/infer');
    final response = await _client.post(
      uri,
      headers: await _headers(),
      body: jsonEncode({
        'transcript': transcript,
        if (activity != null) 'activity': activity,
        if (locationLabel != null) 'locationLabel': locationLabel,
        'calendarBusy': calendarBusy,
        if (recentIntent != null) 'recentIntent': recentIntent,
      }),
    );
    _throwIfError(response, 'Ambient infer failed');
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    return body['data'] as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> acceptV2AmbientSuggestion(
    Map<String, dynamic> suggestion, {
    String? characterId,
  }) async {
    final root = ApiConfig.baseUrl.replaceAll(RegExp(r'/api/v1/?$'), '');
    final uri = Uri.parse('$root/api/v2/ambient/accept');
    final response = await _client.post(
      uri,
      headers: await _headers(),
      body: jsonEncode({
        'suggestion': suggestion,
        if (characterId != null) 'characterId': characterId,
      }),
    );
    _throwIfError(response, 'Ambient accept failed');
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    return body['data'] as Map<String, dynamic>;
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
    if (!await isOnline()) {
      return _queueCreatePost(content: content, fandom: fandom, imageUrl: imageUrl);
    }

    try {
      return await _createPostDirect(content: content, fandom: fandom, imageUrl: imageUrl);
    } on SocketException {
      return _queueCreatePost(content: content, fandom: fandom, imageUrl: imageUrl);
    } on ServiceUnavailableException {
      return _queueCreatePost(content: content, fandom: fandom, imageUrl: imageUrl);
    } on CircuitOpenException {
      return _queueCreatePost(content: content, fandom: fandom, imageUrl: imageUrl);
    }
  }

  Future<ReplyResult> _createPostDirect({
    required String content,
    String fandom = 'General',
    String? imageUrl,
  }) async {
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

    if (_shouldQueueResponse(response)) {
      throw ServiceUnavailableException(_errorMessage(response, 'Service unavailable'));
    }

    _throwIfError(response, 'Failed to create post');
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    final energy = EnergyState.fromJson(body['energy'] as Map<String, dynamic>);
    _lastEnergy = energy;
    return ReplyResult(energy: energy);
  }

  Future<ReplyResult> _queueCreatePost({
    required String content,
    String fandom = 'General',
    String? imageUrl,
  }) async {
    await _queue.enqueue(
      type: 'post',
      payload: {
        'content': content,
        'fandom': fandom,
        if (imageUrl != null) 'imageUrl': imageUrl,
      },
    );

    final energy = _optimisticEnergySpend(_postEnergyCost);
    return ReplyResult(energy: energy, queued: true);
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
      messages: await _decryptMessages(
        sessionScope: meta?['characterId'] as String? ?? threadId,
        data: data,
      ),
      aiPending: meta?['aiPending'] as bool? ?? false,
      interaction: interaction,
    );
  }

  Future<List<DmMessage>> _decryptMessages({
    required String sessionScope,
    required List<dynamic> data,
  }) async {
    final messages = <DmMessage>[];
    for (final raw in data) {
      var msg = DmMessage.fromJson(raw as Map<String, dynamic>);
      if (msg.isEncrypted && msg.ciphertext != null && msg.encryptionMeta != null) {
        try {
          final clear = await _e2ee.decryptFromThread(
            threadId: sessionScope,
            ciphertext: msg.ciphertext!,
            encryptionMeta: msg.encryptionMeta!,
          );
          msg = msg.copyWith(content: clear);
        } catch (_) {
          msg = msg.copyWith(content: '🔒 Unable to decrypt');
        }
      }
      messages.add(msg);
    }
    return messages;
  }

  Future<void> registerE2eeDeviceKey() async {
    if (!await isOnline()) return;

    final uri = Uri.parse('${ApiConfig.baseUrl}/e2ee/keys');
    final response = await _client.post(
      uri,
      headers: await _headers(),
      body: jsonEncode({
        'deviceId': await _e2ee.deviceId(),
        'identityKeyPublic': await _e2ee.identityKeyPublic(),
      }),
    );
    _throwIfError(response, 'Failed to register E2EE key');
  }

  Future<DmSendResult> sendMessage({
    required String characterId,
    required String content,
    String? characterName,
    String? characterBio,
    List<String> recentLines = const [],
    EnergyState? currentEnergy,
    bool encrypt = false,
    String? threadId,
  }) async {
    if (!await isOnline()) {
      return _queueOrOfflineDm(
        characterId: characterId,
        content: content,
        characterName: characterName ?? 'Character',
        characterBio: characterBio ?? '',
        recentLines: recentLines,
        currentEnergy: currentEnergy,
        encrypt: encrypt,
        threadId: threadId,
      );
    }

    try {
      return await _sendMessageDirect(
        characterId: characterId,
        content: content,
        encrypt: encrypt,
        threadId: threadId,
      );
    } on SocketException {
      return _queueOrOfflineDm(
        characterId: characterId,
        content: content,
        characterName: characterName ?? 'Character',
        characterBio: characterBio ?? '',
        recentLines: recentLines,
        currentEnergy: currentEnergy,
        encrypt: encrypt,
        threadId: threadId,
      );
    } on ServiceUnavailableException {
      return _queueOrOfflineDm(
        characterId: characterId,
        content: content,
        characterName: characterName ?? 'Character',
        characterBio: characterBio ?? '',
        recentLines: recentLines,
        currentEnergy: currentEnergy,
        encrypt: encrypt,
        threadId: threadId,
      );
    } on CircuitOpenException {
      return _queueOrOfflineDm(
        characterId: characterId,
        content: content,
        characterName: characterName ?? 'Character',
        characterBio: characterBio ?? '',
        recentLines: recentLines,
        currentEnergy: currentEnergy,
        encrypt: encrypt,
        threadId: threadId,
      );
    }
  }

  Future<DmSendResult> _sendMessageDirect({
    required String characterId,
    required String content,
    bool encrypt = false,
    String? threadId,
  }) async {
    final uri = Uri.parse('${ApiConfig.baseUrl}/messages');
    final Map<String, dynamic> payload = {'characterId': characterId};

    if (encrypt) {
      final encrypted = await _e2ee.encryptForThread(
        threadId: characterId,
        plaintext: content,
      );
      payload['encrypted'] = true;
      payload['ciphertext'] = encrypted['ciphertext'];
      payload['encryptionMeta'] = encrypted['encryptionMeta'];
      payload['contentPreview'] = encrypted['contentPreview'];
      if (threadId != null) payload['threadId'] = threadId;
    } else {
      payload['content'] = content;
    }

    final response = await _client.post(
      uri,
      headers: await _headers(),
      body: jsonEncode(payload),
    );

    if (response.statusCode == 409) {
      final body = jsonDecode(response.body) as Map<String, dynamic>;
      throw InsufficientEnergyException(body['message'] as String? ?? 'Insufficient energy');
    }

    if (_shouldQueueResponse(response)) {
      throw ServiceUnavailableException(_errorMessage(response, 'Service unavailable'));
    }

    _throwIfError(response, 'Failed to send message');
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    final energy = EnergyState.fromJson(body['energy'] as Map<String, dynamic>);
    _lastEnergy = energy;

    var userMessage = DmMessage.fromJson(body['data'] as Map<String, dynamic>);
    if (encrypt) {
      userMessage = userMessage.copyWith(content: content);
    }

    return DmSendResult(
      userMessage: userMessage,
      energy: energy,
      threadId: body['threadId'] as String?,
      aiPending: body['aiPending'] as bool? ?? true,
      toolResults: (body['toolResults'] as List<dynamic>?)
          ?.map((e) => Map<String, dynamic>.from(e as Map))
          .toList(),
    );
  }

  Future<DmSendResult> _queueOrOfflineDm({
    required String characterId,
    required String content,
    required String characterName,
    required String characterBio,
    required List<String> recentLines,
    EnergyState? currentEnergy,
    bool encrypt = false,
    String? threadId,
  }) async {
    if (encrypt) {
      throw ApiOfflineException('Encrypted messages require an online connection');
    }

    await _queue.enqueue(
      type: 'dm',
      payload: {
        'characterId': characterId,
        'content': content,
        'characterName': characterName,
      },
    );

    final queuedResult = await _sendMessageOffline(
      characterId: characterId,
      content: content,
      characterName: characterName,
      characterBio: characterBio,
      recentLines: recentLines,
      currentEnergy: currentEnergy,
    );

    return DmSendResult(
      userMessage: queuedResult.userMessage,
      characterReply: queuedResult.characterReply,
      energy: _optimisticEnergySpend(_dmEnergyCost, base: queuedResult.energy),
      threadId: queuedResult.threadId,
      aiPending: false,
      offline: queuedResult.offline,
      queued: true,
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

    final replyText = await _localAi.generateWithEdgeFallback(
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

  Future<void> submitFeedback({
    required String category,
    required String message,
    required Map<String, dynamic> deviceState,
    required Map<String, dynamic> featureFlags,
  }) async {
    final uri = Uri.parse('${ApiConfig.baseUrl}/feedback');
    final response = await _client.post(
      uri,
      headers: await _headers(),
      body: jsonEncode({
        'category': category,
        'message': message,
        'deviceState': deviceState,
        'featureFlags': featureFlags,
      }),
    );
    _throwIfError(response, 'Failed to submit feedback');
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
    if (response.statusCode == 503) {
      final code = _errorCode(response);
      if (code == 'CIRCUIT_OPEN') {
        throw CircuitOpenException(
          _errorMessage(response, 'Service temporarily degraded'),
          retryAfter: _retryAfter(response),
        );
      }
      throw ServiceUnavailableException(
        _errorMessage(response, 'Service temporarily unavailable'),
        retryAfter: _retryAfter(response),
      );
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

  bool _shouldQueueResponse(http.Response response) {
    if ([502, 503, 504].contains(response.statusCode)) return true;
    final code = _errorCode(response);
    return code == 'CIRCUIT_OPEN' || code == 'SERVICE_UNAVAILABLE';
  }

  String? _errorCode(http.Response response) {
    try {
      final body = jsonDecode(response.body) as Map<String, dynamic>;
      return body['error'] as String?;
    } catch (_) {
      return null;
    }
  }

  String _errorMessage(http.Response response, String fallback) {
    try {
      final body = jsonDecode(response.body) as Map<String, dynamic>;
      return body['message'] as String? ?? fallback;
    } catch (_) {
      return fallback;
    }
  }

  int? _retryAfter(http.Response response) {
    final header = response.headers['retry-after'];
    if (header != null) return int.tryParse(header);
    try {
      final body = jsonDecode(response.body) as Map<String, dynamic>;
      return body['retryAfter'] as int?;
    } catch (_) {
      return null;
    }
  }

  EnergyState _optimisticEnergySpend(int cost, {EnergyState? base}) {
    final current = base ?? _lastEnergy;
    final now = DateTime.now();
    if (current == null) {
      return EnergyState(remaining: 100 - cost, max: 100, resetAt: now.add(const Duration(hours: 24)));
    }
    final remaining = (current.remaining - cost).clamp(0, current.max);
    final updated = EnergyState(remaining: remaining, max: current.max, resetAt: current.resetAt);
    _lastEnergy = updated;
    return updated;
  }

  /// Replay queued posts and DMs when connectivity returns.
  Future<int> syncPendingActions() async {
    if (_syncing || !await isOnline()) return 0;
    final token = await getToken();
    if (token == null) return 0;

    _syncing = true;
    var synced = 0;

    try {
      final actions = await _queue.pending();
      for (final action in actions) {
        try {
          if (action.type == 'post') {
            await _createPostDirect(
              content: action.payload['content'] as String,
              fandom: action.payload['fandom'] as String? ?? 'General',
              imageUrl: action.payload['imageUrl'] as String?,
            );
          } else if (action.type == 'dm') {
            await _sendMessageDirect(
              characterId: action.payload['characterId'] as String,
              content: action.payload['content'] as String,
            );
          }
          await _queue.remove(action.id);
          synced += 1;
        } catch (_) {
          await _queue.incrementRetry(action.id);
          if (action.retryCount >= 5) {
            await _queue.remove(action.id);
          }
          break;
        }
      }
    } finally {
      _syncing = false;
    }

    return synced;
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

  Future<Map<String, dynamic>> fetchWearableSync() async {
    final uri = Uri.parse('${ApiConfig.baseUrl}/wearable/sync');
    final response = await _client.get(uri, headers: await _headers());
    _throwIfError(response, 'Failed to fetch wearable sync');
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    return Map<String, dynamic>.from(body['data'] as Map);
  }

  Future<Map<String, dynamic>> generateZkpProof() async {
    final uri = Uri.parse('${ApiConfig.baseUrl}/zkp/proof');
    final response = await _client.post(uri, headers: await _headers());
    _throwIfError(response, 'Failed to generate ZKP');
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    return Map<String, dynamic>.from(body['data'] as Map);
  }

  FederatedLearningService get federated => _federated;

  Future<void> syncFederatedLearning({int sampleCount = 1}) async {
    if (!await isOnline()) return;

    final commitment = await _federated.userCommitment();
    final payload = await _federated.buildContributionPayload(sampleCount: sampleCount);
    final encrypted = await _encryptFederatedPayload(payload);

    final submitUri = Uri.parse('${ApiConfig.baseUrl.replaceFirst('/api/v1', '')}/api/v1/public/federated/submit');
    await _client.post(
      submitUri,
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'userCommitment': commitment,
        'encryptedPayload': encrypted,
        'sampleCount': sampleCount,
      }),
    );

    final weightsUri = Uri.parse('${ApiConfig.baseUrl.replaceFirst('/api/v1', '')}/api/v1/public/federated/weights');
    final weightsResp = await _client.get(weightsUri);
    if (weightsResp.statusCode == 200) {
      final body = jsonDecode(weightsResp.body) as Map<String, dynamic>;
      final weights = (body['data']['weights'] as List<dynamic>).map((e) => (e as num).toDouble()).toList();
      await _federated.applyGlobalWeights(weights);
    }
  }

  Future<Map<String, dynamic>> submitBciIntent({
    required BciSignalSnapshot snapshot,
    String? characterId,
  }) async {
    final uri = Uri.parse('${ApiConfig.baseUrl}/bci/intent');
    final response = await _client.post(
      uri,
      headers: await _headers(),
      body: jsonEncode(snapshot.toApiJson(characterId: characterId)),
    );
    _throwIfError(response, 'Failed to submit BCI intent');
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    return Map<String, dynamic>.from(body['data'] as Map);
  }

  Future<Map<String, dynamic>> submitAffectiveMetrics({
    required AffectiveSnapshot snapshot,
    String? characterId,
  }) async {
    final uri = Uri.parse('${ApiConfig.baseUrl}/affective/metrics');
    final response = await _client.post(
      uri,
      headers: await _headers(),
      body: jsonEncode(snapshot.toApiJson(characterId: characterId)),
    );
    _throwIfError(response, 'Failed to submit affective metrics');
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    return Map<String, dynamic>.from(body['data'] as Map);
  }

  Future<void> registerMeshPeer({
    required String peerId,
    required String clusterId,
    List<String> capabilities = const [],
  }) async {
    final uri = Uri.parse('${ApiConfig.baseUrl}/mesh/register');
    final response = await _client.post(
      uri,
      headers: await _headers(),
      body: jsonEncode({
        'peerId': peerId,
        'clusterId': clusterId,
        'capabilities': capabilities,
      }),
    );
    _throwIfError(response, 'Failed to register mesh peer');
  }

  Future<List<Map<String, dynamic>>> listMeshPeers(String clusterId) async {
    final uri = Uri.parse('${ApiConfig.baseUrl}/mesh/peers/$clusterId');
    final response = await _client.get(uri, headers: await _headers());
    _throwIfError(response, 'Failed to list mesh peers');
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    return (body['data'] as List<dynamic>).map((e) => Map<String, dynamic>.from(e as Map)).toList();
  }

  Future<Map<String, dynamic>> submitMeshGossip({
    required String clusterId,
    required MeshGossipRecord record,
  }) async {
    final uri = Uri.parse('${ApiConfig.baseUrl}/mesh/gossip');
    final response = await _client.post(
      uri,
      headers: await _headers(),
      body: jsonEncode({
        'clusterId': clusterId,
        'recordType': record.type.apiValue,
        'recordKey': record.key,
        'payload': record.payload,
        'originPeerId': record.originPeerId,
      }),
    );
    _throwIfError(response, 'Failed to submit mesh gossip');
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    return Map<String, dynamic>.from(body['data'] as Map);
  }

  Future<void> relayMeshSignal({
    required String fromPeerId,
    String? toPeerId,
    required String signalType,
    required Map<String, dynamic> payload,
  }) async {
    final uri = Uri.parse('${ApiConfig.baseUrl}/mesh/signal');
    final response = await _client.post(
      uri,
      headers: await _headers(),
      body: jsonEncode({
        'fromPeerId': fromPeerId,
        if (toPeerId != null) 'toPeerId': toPeerId,
        'signalType': signalType,
        'payload': payload,
      }),
    );
    _throwIfError(response, 'Failed to relay mesh signal');
  }

  Future<Map<String, dynamic>> createMetaverseSync({
    required String characterId,
    String engineType = 'generic',
    String exportFormat = 'vrm',
  }) async {
    final uri = Uri.parse('${ApiConfig.baseUrl}/metaverse/sync');
    final response = await _client.post(
      uri,
      headers: await _headers(),
      body: jsonEncode({
        'characterId': characterId,
        'engineType': engineType,
        'exportFormat': exportFormat,
      }),
    );
    _throwIfError(response, 'Failed to create metaverse sync');
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    return Map<String, dynamic>.from(body['data'] as Map);
  }

  Future<Map<String, dynamic>> exportMetaverseCharacter({
    required String characterId,
    String format = 'vrm',
  }) async {
    final uri = Uri.parse('${ApiConfig.baseUrl}/metaverse/export/$characterId?format=$format');
    final response = await _client.get(uri, headers: await _headers());
    _throwIfError(response, 'Failed to export character');
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    return Map<String, dynamic>.from(body['data'] as Map);
  }

  Future<String> _encryptFederatedPayload(Map<String, dynamic> payload) async {
    // Server-side aggregation uses FEDERATED_AGGREGATION_KEY — dev clients mirror via env.
    final keyMaterial = dotenv.maybeGet('FEDERATED_SYNC_KEY') ?? 'status-fed-dev-key';
    final keyHash = await Sha256().hash(utf8.encode(keyMaterial));
    final aes = AesGcm.with256bits();
    final nonce = List<int>.generate(12, (_) => Random.secure().nextInt(256));
    final secretBox = await aes.encrypt(
      utf8.encode(jsonEncode(payload)),
      secretKey: SecretKey(keyHash.bytes),
      nonce: nonce,
    );
    final combined = [...nonce, ...secretBox.mac.bytes, ...secretBox.cipherText];
    return base64.encode(combined);
  }

  Future<Map<String, dynamic>> verifyZkpProof({
    required String proof,
    required String claimType,
    int? threshold,
  }) async {
    final uri = Uri.parse('${ApiConfig.baseUrl}/zkp/verify');
    final response = await _client.post(
      uri,
      headers: await _headers(),
      body: jsonEncode({
        'proof': proof,
        'claimType': claimType,
        if (threshold != null) 'threshold': threshold,
      }),
    );
    _throwIfError(response, 'Failed to verify ZKP');
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    return Map<String, dynamic>.from(body['data'] as Map);
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

class ServiceUnavailableException implements Exception {
  ServiceUnavailableException(this.message, {this.retryAfter});
  final String message;
  final int? retryAfter;
  @override
  String toString() => message;
}

class CircuitOpenException implements Exception {
  CircuitOpenException(this.message, {this.retryAfter});
  final String message;
  final int? retryAfter;
  @override
  String toString() => message;
}

import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';

import '../config/api_config.dart';
import '../models/auth.dart';
import '../models/messaging.dart';
import '../models/post.dart';
import '../models/profile.dart';
import '../models/session.dart';
import 'auth_storage.dart';

class ApiService {
  ApiService({http.Client? client, AuthStorage? authStorage})
      : _client = client ?? http.Client(),
        _authStorage = authStorage ?? AuthStorage();

  final http.Client _client;
  final AuthStorage _authStorage;
  String? _token;

  Future<void> init() async {
    _token = await _authStorage.getToken();
  }

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

  Future<AppSession> fetchSession() async {
    final uri = Uri.parse('${ApiConfig.baseUrl}/auth/me');
    final response = await _client.get(uri, headers: await _headers());
    _throwIfError(response, 'Failed to load session');
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    return AppSession.fromJson(body['data'] as Map<String, dynamic>);
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
    final query = <String, String>{'limit': '$limit'};
    if (fandom != null) query['fandom'] = fandom;

    final uri = Uri.parse('${ApiConfig.baseUrl}/posts').replace(queryParameters: query);
    final response = await _client.get(uri, headers: await _headers());
    _throwIfError(response, 'Failed to load feed');

    final body = jsonDecode(response.body) as Map<String, dynamic>;
    final data = body['data'] as List<dynamic>;
    return data.map((e) => Post.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<ReplyResult> replyToPost(String postId, String content) async {
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
  }) async {
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

    return DmSendResult(
      userMessage: DmMessage.fromJson(body['data'] as Map<String, dynamic>),
      energy: EnergyState.fromJson(body['energy'] as Map<String, dynamic>),
      threadId: body['threadId'] as String?,
      aiPending: body['aiPending'] as bool? ?? true,
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

  void _throwIfError(http.Response response, String message) {
    if (response.statusCode >= 200 && response.statusCode < 300) return;
    if (response.statusCode == 401) {
      throw AuthException('Session expired — please log in again');
    }
    try {
      final body = jsonDecode(response.body) as Map<String, dynamic>;
      throw ApiException(body['message'] as String? ?? message, response.statusCode);
    } catch (_) {
      throw ApiException(message, response.statusCode);
    }
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

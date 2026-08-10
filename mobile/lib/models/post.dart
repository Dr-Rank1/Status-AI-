class Post {
  const Post({
    required this.id,
    required this.content,
    required this.authorName,
    required this.authorHandle,
    required this.fandom,
    required this.likeCount,
    required this.replyCount,
    required this.repostCount,
    required this.createdAt,
    this.authorAvatarUrl,
    this.authorCharacterId,
    this.imageUrl,
    this.isCharacter = true,
  });

  final String id;
  final String content;
  final String authorName;
  final String authorHandle;
  final String? authorAvatarUrl;
  final String? authorCharacterId;
  final String? imageUrl;
  final String fandom;
  final int likeCount;
  final int replyCount;
  final int repostCount;
  final DateTime createdAt;
  final bool isCharacter;

  factory Post.fromJson(Map<String, dynamic> json) {
    final isCharacter = json['author_character_id'] != null;
    return Post(
      id: json['id'] as String,
      content: json['content'] as String,
      authorName: isCharacter
          ? (json['author_character_name'] as String? ?? 'Unknown')
          : (json['author_user_name'] as String? ?? 'Unknown'),
      authorHandle: isCharacter
          ? (json['author_character_handle'] as String? ?? '')
          : (json['author_user_username'] as String? ?? ''),
      authorAvatarUrl: isCharacter
          ? json['author_character_avatar'] as String?
          : json['author_user_avatar'] as String?,
      authorCharacterId: json['author_character_id'] as String?,
      imageUrl: json['image_url'] as String?,
      fandom: json['fandom'] as String? ?? 'General',
      likeCount: json['like_count'] as int? ?? 0,
      replyCount: json['reply_count'] as int? ?? 0,
      repostCount: json['repost_count'] as int? ?? 0,
      createdAt: DateTime.parse(json['created_at'] as String),
      isCharacter: isCharacter,
    );
  }
}

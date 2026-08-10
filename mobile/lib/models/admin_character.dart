class AdminCharacter {
  const AdminCharacter({
    required this.id,
    required this.name,
    required this.handle,
    required this.fandom,
    this.bio,
    this.avatarUrl,
    this.personality = const {},
    this.systemPrompt,
    this.isActive = true,
  });

  final String? id;
  final String name;
  final String handle;
  final String fandom;
  final String? bio;
  final String? avatarUrl;
  final Map<String, dynamic> personality;
  final String? systemPrompt;
  final bool isActive;

  factory AdminCharacter.fromJson(Map<String, dynamic> json) {
    final personality = json['personality'];
    final map = personality is Map<String, dynamic>
        ? personality
        : (personality is Map ? Map<String, dynamic>.from(personality) : <String, dynamic>{});

    return AdminCharacter(
      id: json['id'] as String?,
      name: json['name'] as String,
      handle: json['handle'] as String,
      fandom: json['fandom'] as String,
      bio: json['bio'] as String?,
      avatarUrl: json['avatar_url'] as String?,
      personality: map,
      systemPrompt: map['system_prompt'] as String?,
      isActive: json['is_active'] as bool? ?? true,
    );
  }

  Map<String, dynamic> toPayload() {
    return {
      if (id != null) 'id': id,
      'name': name,
      'handle': handle,
      'fandom': fandom,
      if (bio != null) 'bio': bio,
      if (avatarUrl != null) 'avatarUrl': avatarUrl,
      'personality': personality,
      if (systemPrompt != null && systemPrompt!.isNotEmpty) 'systemPrompt': systemPrompt,
      'isActive': isActive,
    };
  }
}

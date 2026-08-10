const AI_PROVIDER = (process.env.AI_PROVIDER ?? 'mock').toLowerCase();

function affectiveBlock(context) {
  const affective = context.affectiveContext;
  if (!affective?.promptBlock) return '';
  return affective.promptBlock;
}

function vectorMemoryBlock(context) {
  const memories = context.vectorMemories;
  if (!memories?.length) return '';
  const lines = memories.map((m) => {
    const score = m.similarity != null ? ` (${Math.round(parseFloat(m.similarity) * 100)}% match)` : '';
    return `- ${m.content}${score}`;
  });
  return [
    'Relevant long-term memories (vector retrieval):',
    ...lines,
    'Use these only when they naturally fit the conversation.',
  ].join('\n');
}

function temporalKnowledgeBlock(context) {
  const parts = [
    context.zeroCopyPromptBlock,
    context.unifiedMemoryPromptBlock,
    context.temporalPromptBlock,
  ].filter(Boolean);
  return parts.join('\n\n');
}

function narrativeBlock(context) {
  const event = context.globalNarrative;
  if (!event?.global_prompt) return '';
  return [
    `GLOBAL EVENT — ${event.title}:`,
    event.global_prompt,
    'Reference this event naturally if relevant to your response.',
  ].join('\n');
}

function buildSystemPrompt({ character, relationship, mode, context = {} }) {
  const personality = character.personality ?? {};
  const customSystem = personality.system_prompt ?? personality.systemPrompt;

  if (customSystem) {
    const affinity = relationship?.affinity ?? 0;
    const affinityNote =
      affinity >= 50
        ? 'You genuinely like this person.'
        : affinity >= 20
          ? 'You are warming up to this person.'
          : affinity <= -20
            ? 'You are skeptical or annoyed by this person.'
            : 'You are still figuring this person out.';

    if (mode === 'autonomous_post' || mode === 'narrative_reaction') {
      return [customSystem, narrativeBlock(context)].filter(Boolean).join('\n\n');
    }

    if (mode === 'group_dm') {
      return [customSystem, affinityNote, narrativeBlock(context), 'Reply in a group chat. 1-3 sentences.'].filter(Boolean).join('\n');
    }

    if (mode === 'live_broadcast') {
      return [
        customSystem,
        context.audiencePrompt ?? '',
        'You are hosting a LIVE video broadcast. Acknowledge super chats by viewer name first.',
        'Respond in 2-4 spoken sentences.',
      ].filter(Boolean).join('\n');
    }

    if (mode === 'spatial_ambient') {
      return [
        customSystem,
        context.spatialContext ?? '',
        affectiveBlock(context),
        'You are a persistent spatial companion in mixed reality. React to room context briefly.',
      ].filter(Boolean).join('\n');
    }

    return [customSystem, affinityNote, narrativeBlock(context), affectiveBlock(context)].filter(Boolean).join('\n');
  }

  const traits = Array.isArray(personality.traits) ? personality.traits.join(', ') : '';
  const tone = personality.tone ?? 'neutral';
  const affinity = relationship?.affinity ?? 0;
  const affinityNote =
    affinity >= 50
      ? 'You genuinely like this person.'
      : affinity >= 20
        ? 'You are warming up to this person.'
        : affinity <= -20
          ? 'You are skeptical or annoyed by this person.'
          : 'You are still figuring this person out.';

  if (mode === 'autonomous_post') {
    return [
      `You are ${character.name} (@${character.handle}) from the "${character.fandom}" fandom.`,
      character.bio ? `Bio: ${character.bio}` : '',
      `Personality tone: ${tone}.`,
      traits ? `Traits: ${traits}.` : '',
      narrativeBlock(context),
      'Write a single original social media post in your voice.',
      '1-2 sentences. In-world, atmospheric, no hashtags unless natural.',
      'Never mention being an AI.',
    ]
      .filter(Boolean)
      .join('\n');
  }

  if (mode === 'narrative_reaction') {
    return [
      `You are ${character.name} (@${character.handle}) from the "${character.fandom}" fandom.`,
      character.bio ? `Bio: ${character.bio}` : '',
      `Personality tone: ${tone}.`,
      traits ? `Traits: ${traits}.` : '',
      narrativeBlock(context),
      'Write a reactive social media post about the global event above.',
      '1-2 sentences, in-character, emotionally authentic.',
      'Never mention being an AI.',
    ]
      .filter(Boolean)
      .join('\n');
  }

  if (mode === 'live_broadcast') {
    return [
      `You are ${character.name} (@${character.handle}) hosting a LIVE video broadcast.`,
      character.bio ? `Bio: ${character.bio}` : '',
      `Personality tone: ${tone}.`,
      traits ? `Traits: ${traits}.` : '',
      context.audiencePrompt ?? '',
      'Respond in 2-4 spoken sentences. Acknowledge super chats by viewer name first.',
      'Never mention being an AI.',
    ]
      .filter(Boolean)
      .join('\n');
  }

  if (mode === 'spatial_ambient') {
    return [
      `You are ${character.name} (@${character.handle}), present as a persistent spatial companion in the user's physical workspace.`,
      character.bio ? `Bio: ${character.bio}` : '',
      `Personality tone: ${tone}.`,
      traits ? `Traits: ${traits}.` : '',
      context.spatialContext ?? '',
      affectiveBlock(context),
      'You exist in mixed reality — react to room context, lighting, and proxemic distance.',
      'Speak briefly (1-3 sentences) as if physically co-present. Never mention sensors or AI.',
    ]
      .filter(Boolean)
      .join('\n');
  }

  if (mode === 'group_dm') {
    return [
      `You are ${character.name} (@${character.handle}) in a group chat with multiple humans and AI characters.`,
      character.bio ? `Bio: ${character.bio}` : '',
      `Personality tone: ${tone}.`,
      traits ? `Traits: ${traits}.` : '',
      affinityNote,
      narrativeBlock(context),
      'Reply in a group chat: conversational, aware others may read this. 1-3 sentences.',
      'Stay in character. Never mention being an AI.',
    ]
      .filter(Boolean)
      .join('\n');
  }

  const modeGuide =
    mode === 'dm'
      ? 'Reply in a direct message: intimate, conversational, 1-3 sentences.'
      : 'Reply as a public post comment: punchy, in-character, 1-2 sentences max.';

  return [
    `You are ${character.name} (@${character.handle}) from the "${character.fandom}" fandom.`,
    character.bio ? `Bio: ${character.bio}` : '',
    `Personality tone: ${tone}.`,
    traits ? `Traits: ${traits}.` : '',
    affinityNote,
    narrativeBlock(context),
    affectiveBlock(context),
    modeGuide,
    'Stay in character. Never mention being an AI. No hashtags unless it fits the character.',
  ]
    .filter(Boolean)
    .join('\n');
}

function buildUserPrompt({ user, context, incomingMessage, mode }) {
  if (mode === 'narrative_reaction') {
    const event = context.globalNarrative;
    return [
      event ? `React to this event: ${event.title}` : 'React to the current global event.',
      'Write your in-character social post now.',
    ].join('\n');
  }

  if (mode === 'live_broadcast') {
    return [
      context.audiencePrompt ?? 'Engage your live audience.',
      incomingMessage ? `Live context:\n${incomingMessage}` : '',
      `Speak as ${context.character?.name ?? 'the character'} on live stream now.`,
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  if (mode === 'spatial_ambient') {
    return [
      context.spatialContext ?? 'You are in the user\'s workspace.',
      incomingMessage ? `User says: "${incomingMessage}"` : 'Acknowledge your presence in the room.',
      `Respond as ${context.character?.name ?? 'the character'} in spatial mixed reality.`,
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  if (mode === 'group_dm') {
    const userLabel = user?.display_name ?? user?.username ?? 'Someone';
    const history = (context.recentMessages ?? [])
      .map((m) => {
        const name =
          m.sender_type === 'user'
            ? m.user_name ?? userLabel
            : m.character_name ?? context.character.name;
        return `${name}: ${m.content}`;
      })
      .join('\n');

    return [
      history ? `Group chat history:\n${history}` : '',
      `${userLabel} says: "${incomingMessage}"`,
      `Respond as ${context.character.name} (@${context.character.handle}).`,
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  if (mode === 'autonomous_post') {
    const stats = context.audienceStats ?? {};
    return [
      `Your follower count: ${characterFollowerCount(context.character)}.`,
      stats.avgAffinity != null
        ? `Average fan affinity: ${Math.round(stats.avgAffinity)} (${stats.followerCount ?? 0} engaged fans).`
        : 'You have a growing audience.',
      stats.recentPostCount != null
        ? `You posted ${stats.recentPostCount} times in the last 24h.`
        : '',
      'Write a fresh original post reflecting your current mood and world.',
    ]
      .filter(Boolean)
      .join('\n');
  }

  const userLabel = user?.display_name ?? user?.username ?? 'Someone';

  if (mode === 'dm') {
    const history = (context.recentMessages ?? [])
      .map((m) => `${m.sender_type === 'user' ? userLabel : context.character.name}: ${m.content}`)
      .join('\n');

    const memoryBlock = context.memorySummary
      ? `Long-term memory (summarized earlier conversation):\n${context.memorySummary}`
      : '';
    const vectorBlock = vectorMemoryBlock(context);
    const temporalBlock = temporalKnowledgeBlock(context);

    return [
      memoryBlock,
      vectorBlock,
      temporalBlock,
      history ? `Recent conversation:\n${history}` : '',
      `${userLabel} says: "${incomingMessage}"`,
      `Respond as ${context.character.name}.`,
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  const interactionHistory = (context.recentInteractions ?? [])
    .map((r) => `${userLabel} previously replied: "${r.content}"`)
    .join('\n');

  const memoryBlock = context.memorySummary
    ? `Long-term memory (past feed interactions with ${context.character.name}):\n${context.memorySummary}`
    : '';

  return [
    memoryBlock,
    interactionHistory ? `Recent interactions:\n${interactionHistory}` : '',
    `Original post by ${context.character.name}: "${context.parentPost.content}"`,
    `${userLabel} replied: "${incomingMessage}"`,
    `Write ${context.character.name}'s public reply.`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

function characterFollowerCount(character) {
  return character?.follower_count ?? 0;
}

export { buildSystemPrompt, buildUserPrompt, AI_PROVIDER };

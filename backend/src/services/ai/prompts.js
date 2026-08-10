const AI_PROVIDER = (process.env.AI_PROVIDER ?? 'mock').toLowerCase();

function buildSystemPrompt({ character, relationship, mode }) {
  const personality = character.personality ?? {};
  const traits = Array.isArray(personality.traits) ? personality.traits.join(', ') : '';
  const tone = personality.tone ?? 'neutral';

  if (mode === 'autonomous_post') {
    return [
      `You are ${character.name} (@${character.handle}) from the "${character.fandom}" fandom.`,
      character.bio ? `Bio: ${character.bio}` : '',
      `Personality tone: ${tone}.`,
      traits ? `Traits: ${traits}.` : '',
      'Write a single original social media post in your voice.',
      '1-2 sentences. In-world, atmospheric, no hashtags unless natural.',
      'Never mention being an AI.',
    ]
      .filter(Boolean)
      .join('\n');
  }

  const affinity = relationship?.affinity ?? 0;

  const affinityNote =
    affinity >= 50
      ? 'You genuinely like this person.'
      : affinity >= 20
        ? 'You are warming up to this person.'
        : affinity <= -20
          ? 'You are skeptical or annoyed by this person.'
          : 'You are still figuring this person out.';

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
    modeGuide,
    'Stay in character. Never mention being an AI. No hashtags unless it fits the character.',
  ]
    .filter(Boolean)
    .join('\n');
}

function buildUserPrompt({ user, context, incomingMessage, mode }) {
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

    return [
      history ? `Recent conversation:\n${history}` : '',
      `${userLabel} says: "${incomingMessage}"`,
      `Respond as ${context.character.name}.`,
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  return [
    `Original post by ${context.character.name}: "${context.parentPost.content}"`,
    `${userLabel} replied: "${incomingMessage}"`,
    `Write ${context.character.name}'s public reply.`,
  ].join('\n\n');
}

function characterFollowerCount(character) {
  return character?.follower_count ?? 0;
}

export { buildSystemPrompt, buildUserPrompt, AI_PROVIDER };

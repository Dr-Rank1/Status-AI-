import { buildSystemPrompt, buildUserPrompt } from './prompts.js';
import { logger } from '../../utils/logger.js';

const MOCK_POSTS = [
  'The stars align differently tonight. Pay attention.',
  'Some days the mission writes itself. Today is not one of them.',
  'Heard rumors on the lower decks. Might investigate.',
  'Coffee cold. Clues colder. Story of my life.',
  'If you know, you know. If you don\'t — stay curious.',
  'Another chapter unfolding. I intend to be in it.',
];

export async function generateAutonomousMockPost({ character, context }) {
  const idx = (Date.now() + character.name.length) % MOCK_POSTS.length;
  const content = MOCK_POSTS[idx];

  logger.info('[AI mock autonomous]', character.handle, content);

  return {
    content,
    provider: 'mock',
    model: 'mock-autonomous-v1',
  };
}

export async function generateMockReply({ character, user, context, incomingMessage, mode }) {
  if (mode === 'autonomous_post' || mode === 'narrative_reaction') {
    return generateAutonomousMockPost({ character, context });
  }

  buildSystemPrompt({ character, relationship: context.relationship, mode, context });
  buildUserPrompt({ user, context, incomingMessage, mode });

  logger.info('[AI mock]', character.handle, mode);

  const name = character.name.split(' ')[0];
  const snippets = [
    `Interesting take. ${name} is listening.`,
    'Ha. You might be onto something.',
    "I'll remember you said that.",
    'Bold move. I respect it.',
  ];
  const idx = (incomingMessage?.length ?? 0) % snippets.length;

  return {
    content: snippets[idx],
    provider: 'mock',
    model: 'mock-v1',
    usage: { promptTokens: 0, completionTokens: 40 },
  };
}

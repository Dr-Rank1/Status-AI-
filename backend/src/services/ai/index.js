import { AI_PROVIDER } from './prompts.js';
import { generateMockReply } from './mockProvider.js';
import { generateOpenAIReply } from './openaiProvider.js';
import { generateAnthropicReply } from './anthropicProvider.js';

async function callProvider(args) {
  const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);
  const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY);

  if (AI_PROVIDER === 'openai' && hasOpenAI) {
    return generateOpenAIReply(args);
  }

  if (AI_PROVIDER === 'anthropic' && hasAnthropic) {
    return generateAnthropicReply(args);
  }

  if (AI_PROVIDER === 'auto') {
    if (hasAnthropic) return generateAnthropicReply(args);
    if (hasOpenAI) return generateOpenAIReply(args);
  }

  return generateMockReply(args);
}

export async function generateCharacterReply(args) {
  try {
    return await callProvider(args);
  } catch (err) {
    console.error('[AI] Provider failed, falling back to mock:', err.message);
    return generateMockReply(args);
  }
}

export { AI_PROVIDER };

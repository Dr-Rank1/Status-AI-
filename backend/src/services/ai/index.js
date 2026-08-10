import { AI_PROVIDER } from './prompts.js';
import { generateMockReply } from './mockProvider.js';
import { generateOpenAIReply } from './openaiProvider.js';
import { generateAnthropicReply } from './anthropicProvider.js';
import { generateGeminiReply } from './geminiProvider.js';
import { enrichArgsWithRouting, selectProvider } from './router.js';
import { shouldUseAgentWorkflow, runAgentWorkflow } from './agentWorkflowService.js';
import { logger } from '../../utils/logger.js';

async function callRoutedProvider(args) {
  const enriched = enrichArgsWithRouting(args);
  const { provider, reason, complexity } = enriched.route;

  logger.info(`[AI Router] mode=${args.mode} provider=${provider} reason=${reason} complexity=${complexity}`);

  switch (provider) {
    case 'anthropic':
      return generateAnthropicReply(enriched);
    case 'gemini':
      return generateGeminiReply(enriched);
    case 'openai':
      return generateOpenAIReply(enriched);
    default:
      return generateMockReply(enriched);
  }
}

async function callLegacyProvider(args) {
  const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);
  const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY);
  const hasGemini = Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);

  if (AI_PROVIDER === 'openai' && hasOpenAI) return generateOpenAIReply(args);
  if (AI_PROVIDER === 'anthropic' && hasAnthropic) return generateAnthropicReply(args);
  if (AI_PROVIDER === 'gemini' && hasGemini) return generateGeminiReply(args);

  if (AI_PROVIDER === 'auto') {
    return callRoutedProvider(args);
  }

  return generateMockReply(args);
}

export async function generateCharacterReply(args) {
  try {
    if (shouldUseAgentWorkflow(args.mode)) {
      return await runAgentWorkflow(args);
    }

    if (AI_PROVIDER === 'auto' || AI_PROVIDER === 'router') {
      return await callRoutedProvider(args);
    }
    return await callLegacyProvider(args);
  } catch (err) {
    logger.error('[AI] Provider failed, falling back to mock:', err.message);
    return generateMockReply(args);
  }
}

export { AI_PROVIDER, selectProvider };

/**
 * Multi-LLM router — selects the most cost-effective model per task.
 *
 * Routing strategy (2026):
 * - Self-hosted vLLM (Llama 3)     → preferred when SELF_HOSTED_AI_PREFERRED=true
 * - DM with memory / long context  → Anthropic Claude (quality)
 * - DM quick / short               → Gemini 2.5 Flash (cost)
 * - Feed posts & replies           → Gemini 2.5 Flash (speed)
 * - Image prompt synthesis         → Gemini 2.5 Flash
 */

import { isVllmConfigured } from './vllmProvider.js';

const COMPLEXITY = {
  dm: 'conversational',
  post_reply: 'social',
  autonomous_post: 'social',
};

export function selectProvider({ mode, context = {} }) {
  const hasVllm = isVllmConfigured();
  const preferSelfHosted = process.env.SELF_HOSTED_AI_PREFERRED === 'true';
  const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY);
  const hasGemini = Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
  const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);

  if (hasVllm && preferSelfHosted && (mode === 'dm' || mode === 'post_reply' || mode === 'autonomous_post')) {
    return { provider: 'vllm', reason: 'self_hosted_llama3', complexity: COMPLEXITY[mode] ?? 'medium' };
  }

  const recentCount = context.recentMessages?.length ?? 0;
  const hasMemory = Boolean(context.memorySummary);
  const hasVectorMemory = Boolean(context.vectorMemories?.length);
  const incomingLength = context.incomingLength ?? 0;

  if (mode === 'dm') {
    const isDeep =
      recentCount >= 4 ||
      hasMemory ||
      hasVectorMemory ||
      incomingLength > 120;

    if (isDeep && hasAnthropic) {
      return { provider: 'anthropic', reason: 'deep_dm_context', complexity: 'high' };
    }
    if (hasGemini) {
      return { provider: 'gemini', reason: isDeep ? 'dm_fallback_fast' : 'dm_quick', complexity: 'medium' };
    }
    if (hasAnthropic) {
      return { provider: 'anthropic', reason: 'dm_only_provider', complexity: 'high' };
    }
    if (hasOpenAI) {
      return { provider: 'openai', reason: 'dm_openai_fallback', complexity: 'medium' };
    }
    return { provider: 'mock', reason: 'no_keys', complexity: COMPLEXITY.dm };
  }

  if (mode === 'group_dm') {
    if (hasGemini) {
      return { provider: 'gemini', reason: 'group_chat', complexity: 'medium' };
    }
    if (hasAnthropic) {
      return { provider: 'anthropic', reason: 'group_chat', complexity: 'medium' };
    }
    if (hasOpenAI) {
      return { provider: 'openai', reason: 'group_chat', complexity: 'medium' };
    }
    return { provider: 'mock', reason: 'no_keys', complexity: 'medium' };
  }

  if (mode === 'autonomous_post' || mode === 'post_reply' || mode === 'narrative_reaction') {
    if (hasGemini) {
      return { provider: 'gemini', reason: 'feed_generation', complexity: 'low' };
    }
    if (hasOpenAI) {
      return { provider: 'openai', reason: 'feed_openai_fallback', complexity: 'low' };
    }
    if (hasAnthropic) {
      return { provider: 'anthropic', reason: 'feed_anthropic_fallback', complexity: 'low' };
    }
    return { provider: 'mock', reason: 'no_keys', complexity: COMPLEXITY[mode] ?? 'low' };
  }

  return { provider: 'mock', reason: 'unknown_mode', complexity: 'low' };
}

export function enrichArgsWithRouting(args) {
  const incomingLength = args.incomingMessage?.length ?? 0;
  const route = selectProvider({
    mode: args.mode,
    context: { ...args.context, incomingLength },
  });

  return { ...args, route };
}

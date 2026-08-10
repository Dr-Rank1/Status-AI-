import { AI_PROVIDER } from './prompts.js';
import { generateMockReply } from './mockProvider.js';
import { generateOpenAIReply } from './openaiProvider.js';
import { generateAnthropicReply } from './anthropicProvider.js';
import { generateGeminiReply } from './geminiProvider.js';
import { generateVllmReply } from './vllmProvider.js';
import { enrichArgsWithRouting, selectProvider } from './router.js';
import { shouldUseAgentWorkflow, runAgentWorkflow } from './agentWorkflowService.js';
import { resolveRoutingWithFlags } from './flagRouting.js';
import { recordAiTelemetry } from '../aiTelemetryService.js';
import { withCircuitBreaker } from '../circuitBreaker.js';
import { getCachedAiResponse, setCachedAiResponse } from './responseCache.js';
import { logger } from '../../utils/logger.js';

const BREAKER_OPTIONS = {
  failureThreshold: parseInt(process.env.AI_CB_FAILURE_THRESHOLD ?? '5', 10),
  latencyThresholdMs: parseInt(process.env.AI_CB_LATENCY_MS ?? '10000', 10),
  resetTimeoutMs: parseInt(process.env.AI_CB_RESET_MS ?? '30000', 10),
};

async function invokeProviderRaw(provider, args) {
  switch (provider) {
    case 'anthropic':
      return generateAnthropicReply(args);
    case 'gemini':
      return generateGeminiReply(args);
    case 'openai':
      return generateOpenAIReply(args);
    case 'vllm':
      return generateVllmReply(args);
    default:
      return generateMockReply(args);
  }
}

async function cachedFallback(args, provider, meta) {
  const cached = await getCachedAiResponse({
    provider,
    mode: args.mode,
    characterId: args.character?.id,
    incomingMessage: args.incomingMessage,
  });

  if (cached) {
    logger.warn(`[AI Circuit] ${provider} fallback=cached reason=${meta.reason}`);
    return {
      ...cached,
      provider: cached.provider ?? provider,
      degraded: true,
      circuitState: meta.breaker?.state ?? 'OPEN',
    };
  }

  logger.warn(`[AI Circuit] ${provider} fallback=mock reason=${meta.reason}`);
  const mock = await generateMockReply(args);
  return {
    ...mock,
    degraded: true,
    circuitState: meta.breaker?.state ?? 'OPEN',
  };
}

async function invokeProvider(provider, args) {
  if (provider === 'mock') {
    return generateMockReply(args);
  }

  const breakerName = `llm-${provider}`;

  const result = await withCircuitBreaker(
    breakerName,
    () => invokeProviderRaw(provider, args),
    (meta) => cachedFallback(args, provider, meta),
    BREAKER_OPTIONS,
  );

  if (!result.degraded) {
    await setCachedAiResponse({
      provider,
      mode: args.mode,
      characterId: args.character?.id,
      incomingMessage: args.incomingMessage,
      response: result,
    });
  }

  return result;
}

async function callRoutedProvider(args) {
  const enriched = enrichArgsWithRouting(args);
  const userId = args.user?.id;

  const { route, flagProperties } = await resolveRoutingWithFlags({
    userId,
    user: args.user,
    mode: args.mode,
    baseRoute: enriched.route,
  });

  const { provider, reason } = route;
  logger.info(`[AI Router] mode=${args.mode} provider=${provider} reason=${reason}`);

  const started = Date.now();
  let result;
  let status = 'success';

  try {
    result = await invokeProvider(provider, enriched);
    if (result.degraded) status = 'degraded';
  } catch (err) {
    status = 'error';
    recordAiTelemetry({
      userId,
      mode: args.mode,
      provider,
      model: null,
      usage: null,
      latencyMs: Date.now() - started,
      status,
      flagProperties,
      routeReason: reason,
    });
    throw err;
  }

  recordAiTelemetry({
    userId,
    mode: args.mode,
    provider: result.provider ?? provider,
    model: result.model,
    usage: result.usage,
    latencyMs: Date.now() - started,
    status,
    flagProperties,
    routeReason: reason,
  });

  return result;
}

async function callLegacyProvider(args) {
  const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);
  const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY);
  const hasGemini = Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);

  if (AI_PROVIDER === 'openai' && hasOpenAI) return invokeProvider('openai', args);
  if (AI_PROVIDER === 'anthropic' && hasAnthropic) return invokeProvider('anthropic', args);
  if (AI_PROVIDER === 'gemini' && hasGemini) return invokeProvider('gemini', args);

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

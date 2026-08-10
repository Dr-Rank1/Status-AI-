import { AI_PROVIDER } from './prompts.js';
import { generateMockReply } from './mockProvider.js';
import { generateOpenAIReply } from './openaiProvider.js';
import { generateAnthropicReply } from './anthropicProvider.js';
import { generateGeminiReply } from './geminiProvider.js';
import { generateVllmReply } from './vllmProvider.js';
import { enrichArgsWithRouting, selectProvider } from './router.js';
import { selectProviderCostAware, recordEstimatedSpend } from '../aiCostOptimizer.js';
import { shouldUseAgentWorkflow, runAgentWorkflow } from './agentWorkflowService.js';
import { shouldUseMultiAgent, runMultiAgentCoordinator } from './multiAgentCoordinator.js';
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
  const baseEnriched = enrichArgsWithRouting(args);
  const costRoute = selectProviderCostAware({
    mode: args.mode,
    context: { ...args.context, incomingLength: args.incomingMessage?.length ?? 0 },
  });
  const enriched = {
    ...baseEnriched,
    route: {
      ...baseEnriched.route,
      ...costRoute,
    },
  };
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

  const usage = result.usage ?? {};
  recordEstimatedSpend({
    provider: result.provider ?? provider,
    promptTokens: usage.prompt_tokens ?? usage.input_tokens ?? 0,
    completionTokens: usage.completion_tokens ?? usage.output_tokens ?? 0,
  });

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

  try {
    const { logModelDecision } = await import('../aiGovernanceService.js');
    const { analyzeAiOutput } = await import('../aiAnomalyDetectionService.js');

    await logModelDecision({
      userId,
      characterId: args.character?.id,
      provider: result.provider ?? provider,
      model: result.model,
      mode: args.mode,
      routeReason: reason,
      inputSummary: args.incomingMessage,
      outputSummary: result.content,
      toolResults: result.toolResults,
      multiAgent: result.multiAgent,
      latencyMs: Date.now() - started,
      humanOversight: Boolean(result.degraded),
    });

    await analyzeAiOutput({
      mode: args.mode,
      provider: result.provider ?? provider,
      model: result.model,
      latencyMs: Date.now() - started,
      inputText: args.incomingMessage ?? '',
      outputText: result.content ?? '',
      userId,
    });
  } catch {
    // non-fatal compliance telemetry
  }

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
    let result;
    if (shouldUseAgentWorkflow(args.mode)) {
      if (shouldUseMultiAgent(args.mode)) {
        result = await runMultiAgentCoordinator(args);
      } else {
        result = await runAgentWorkflow(args);
      }
    } else if (AI_PROVIDER === 'auto' || AI_PROVIDER === 'router') {
      result = await callRoutedProvider(args);
    } else {
      result = await callLegacyProvider(args);
    }

    if (process.env.AGI_REFLECTION_ENABLED !== 'false' && result?.content) {
      try {
        const { runReflectionLoop } = await import('../agi/reflectionLoopService.js');
        const reflected = await runReflectionLoop({
          draft: result,
          character: args.character,
          incomingMessage: args.incomingMessage ?? '',
          context: args.context ?? {},
        });
        if (reflected.content && reflected.content !== result.content) {
          result = {
            ...result,
            content: reflected.content,
            reflection: {
              iterations: reflected.iterations,
              issues: reflected.issues,
              chainOfThought: reflected.chainOfThought,
            },
          };
        }

        if (process.env.KNOWLEDGE_MESH_AUTO_PUBLISH === 'true' && args.character?.id) {
          const { linkMemoriesToMesh } = await import('../knowledgeMesh/knowledgeMeshService.js');
          await linkMemoriesToMesh({
            characterId: args.character.id,
            memoryContent: reflected.content,
            fandom: args.character.fandom,
            tenantId: args.user?.tenant_id,
          }).catch(() => {});
        }
      } catch {
        // reflection is best-effort
      }
    }

    return result;
  } catch (err) {
    logger.error('[AI] Provider failed, falling back to mock:', err.message);
    return generateMockReply(args);
  }
}

export { AI_PROVIDER, selectProvider };

/**
 * AI token usage, latency, and cost observability (Prometheus + PostHog).
 */

import client from 'prom-client';
import { register } from '../observability/metrics.js';
import { captureEvent } from './posthogService.js';
import { logger } from '../utils/logger.js';

const COST_PER_MILLION = {
  'gemini-2.5-flash': { input: 0.075, output: 0.3 },
  'claude-3-5-haiku-20241022': { input: 0.25, output: 1.25 },
  'claude-3-5-sonnet-20241022': { input: 3.0, output: 15.0 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4o': { input: 2.5, output: 10.0 },
};

export const aiRequestDuration = new client.Histogram({
  name: 'ai_request_duration_seconds',
  help: 'AI provider request latency in seconds',
  labelNames: ['provider', 'mode', 'model'],
  buckets: [0.1, 0.25, 0.5, 1, 2, 5, 10, 30],
  registers: [register],
});

export const aiTokensTotal = new client.Counter({
  name: 'ai_tokens_total',
  help: 'Total AI tokens consumed',
  labelNames: ['provider', 'model', 'direction'],
  registers: [register],
});

export const aiCostUsdTotal = new client.Counter({
  name: 'ai_estimated_cost_usd_total',
  help: 'Estimated AI spend in USD',
  labelNames: ['provider', 'model'],
  registers: [register],
});

export const aiRequestsTotal = new client.Counter({
  name: 'ai_requests_total',
  help: 'Total AI generation requests',
  labelNames: ['provider', 'mode', 'status'],
  registers: [register],
});

export function extractTokenUsage(provider, usage) {
  if (!usage) return { inputTokens: 0, outputTokens: 0 };

  if (provider === 'gemini') {
    return {
      inputTokens: usage.promptTokenCount ?? usage.prompt_token_count ?? 0,
      outputTokens: usage.candidatesTokenCount ?? usage.candidates_token_count ?? 0,
    };
  }

  if (provider === 'anthropic' || provider === 'openai') {
    return {
      inputTokens: usage.input_tokens ?? usage.prompt_tokens ?? 0,
      outputTokens: usage.output_tokens ?? usage.completion_tokens ?? 0,
    };
  }

  return { inputTokens: 0, outputTokens: 0 };
}

export function estimateCostUsd(model, inputTokens, outputTokens) {
  const rates = COST_PER_MILLION[model] ?? { input: 0.1, output: 0.4 };
  return (inputTokens / 1_000_000) * rates.input + (outputTokens / 1_000_000) * rates.output;
}

export function recordAiTelemetry({
  userId,
  mode,
  provider,
  model,
  usage,
  latencyMs,
  status = 'success',
  flagProperties = {},
  routeReason,
}) {
  const { inputTokens, outputTokens } = extractTokenUsage(provider, usage);
  const latencySec = latencyMs / 1000;
  const estimatedCostUsd = estimateCostUsd(model ?? 'unknown', inputTokens, outputTokens);

  aiRequestDuration.observe({ provider, mode, model: model ?? 'unknown' }, latencySec);

  if (inputTokens > 0) {
    aiTokensTotal.inc({ provider, model: model ?? 'unknown', direction: 'input' }, inputTokens);
  }
  if (outputTokens > 0) {
    aiTokensTotal.inc({ provider, model: model ?? 'unknown', direction: 'output' }, outputTokens);
  }

  if (estimatedCostUsd > 0) {
    aiCostUsdTotal.inc({ provider, model: model ?? 'unknown' }, estimatedCostUsd);
  }

  aiRequestsTotal.inc({ provider, mode, status });

  if (userId) {
    captureEvent(userId, 'ai_request_completed', {
      mode,
      provider,
      model,
      latency_ms: latencyMs,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: inputTokens + outputTokens,
      estimated_cost_usd: Number(estimatedCostUsd.toFixed(6)),
      status,
      route_reason: routeReason,
      ...flagProperties,
    });
  }

  logger.info(
    `[AI Telemetry] mode=${mode} provider=${provider} model=${model} ` +
      `latency=${latencyMs}ms tokens=${inputTokens}+${outputTokens} cost=$${estimatedCostUsd.toFixed(4)}`,
  );
}

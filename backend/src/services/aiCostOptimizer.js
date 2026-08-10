/**
 * Phase 30 — Dynamic cost-aware load balancing between self-hosted and cloud LLMs.
 */

import { selectProvider } from './ai/router.js';
import { isVllmConfigured } from './ai/vllmProvider.js';
import { logger } from '../utils/logger.js';

/** Approximate USD per 1K tokens (input+output blended). */
export const PROVIDER_COST_PER_1K = {
  mock: 0,
  vllm: parseFloat(process.env.AI_COST_VLLM_PER_1K ?? '0.002'),
  gemini: parseFloat(process.env.AI_COST_GEMINI_PER_1K ?? '0.02'),
  openai: parseFloat(process.env.AI_COST_OPENAI_PER_1K ?? '0.15'),
  anthropic: parseFloat(process.env.AI_COST_ANTHROPIC_PER_1K ?? '0.40'),
};

const BUDGET_MODE = (process.env.AI_COST_MODE ?? 'balanced').toLowerCase(); // thrifty | balanced | quality
const DAILY_BUDGET_USD = parseFloat(process.env.AI_DAILY_BUDGET_USD ?? '50');

let spendUsdToday = 0;
let spendDayKey = utcDayKey();

function utcDayKey() {
  return new Date().toISOString().slice(0, 10);
}

function refreshBudgetWindow() {
  const key = utcDayKey();
  if (key !== spendDayKey) {
    spendDayKey = key;
    spendUsdToday = 0;
  }
}

export function recordEstimatedSpend({ provider, promptTokens = 0, completionTokens = 0 }) {
  refreshBudgetWindow();
  const tokens = promptTokens + completionTokens;
  const rate = PROVIDER_COST_PER_1K[provider] ?? PROVIDER_COST_PER_1K.openai;
  spendUsdToday += (tokens / 1000) * rate;
}

export function getCostSnapshot() {
  refreshBudgetWindow();
  return {
    mode: BUDGET_MODE,
    day: spendDayKey,
    spendUsdToday,
    dailyBudgetUsd: DAILY_BUDGET_USD,
    remainingUsd: Math.max(0, DAILY_BUDGET_USD - spendUsdToday),
    budgetExhausted: spendUsdToday >= DAILY_BUDGET_USD,
  };
}

/**
 * Selects provider with cost pressure applied on top of quality routing.
 */
export function selectProviderCostAware({ mode, context = {} }) {
  refreshBudgetWindow();
  const base = selectProvider({ mode, context });
  const budget = getCostSnapshot();
  const hasVllm = isVllmConfigured();

  if (process.env.AI_COST_OPTIMIZER_ENABLED === 'false') {
    return { ...base, costMode: BUDGET_MODE, budget };
  }

  // Hard thrift: prefer vLLM / Gemini when daily budget nearly exhausted
  if (budget.budgetExhausted || BUDGET_MODE === 'thrifty') {
    if (hasVllm) {
      return {
        provider: 'vllm',
        reason: 'cost_thrifty_self_hosted',
        complexity: base.complexity,
        costMode: BUDGET_MODE,
        budget,
      };
    }
    if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) {
      return {
        provider: 'gemini',
        reason: 'cost_thrifty_cloud',
        complexity: base.complexity,
        costMode: BUDGET_MODE,
        budget,
      };
    }
  }

  // Balanced: demote expensive Anthropic for non-deep DMs when spend > 70% budget
  if (
    BUDGET_MODE === 'balanced' &&
    budget.spendUsdToday / budget.dailyBudgetUsd >= 0.7 &&
    base.provider === 'anthropic' &&
    (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)
  ) {
    logger.info('[CostOptimizer] Demoting anthropic → gemini (budget pressure)');
    return {
      provider: 'gemini',
      reason: 'cost_budget_pressure',
      complexity: base.complexity,
      costMode: BUDGET_MODE,
      budget,
    };
  }

  // Prefer self-hosted when configured and mode is balanced/thrifty for feed tasks
  if (
    hasVllm &&
    BUDGET_MODE !== 'quality' &&
    (mode === 'autonomous_post' || mode === 'post_reply' || mode === 'narrative_reaction')
  ) {
    return {
      provider: 'vllm',
      reason: 'cost_feed_self_hosted',
      complexity: base.complexity,
      costMode: BUDGET_MODE,
      budget,
    };
  }

  return { ...base, costMode: BUDGET_MODE, budget };
}

export function estimateRouteCost(provider, approxTokens = 500) {
  const rate = PROVIDER_COST_PER_1K[provider] ?? 0;
  return (approxTokens / 1000) * rate;
}

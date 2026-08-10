/**
 * Phase 33 — ContextEngine: first-class context engineering layer.
 * Owns prompt assembly + dynamic RAG weighting (affective / BCI signals).
 */

import {
  buildSystemPrompt as legacyBuildSystemPrompt,
  buildUserPrompt as legacyBuildUserPrompt,
} from '../ai/prompts.js';
import { enrichDmContextWithVectorMemories } from '../vectorMemoryService.js';
import { logger } from '../../utils/logger.js';

const BASE_MIN_SCORE = parseFloat(process.env.MEMORY_MIN_SCORE ?? '0.72');
const BASE_TOP_K = parseInt(process.env.MEMORY_TOP_K ?? '5', 10);

/**
 * Derive live RAG weights from Phase 24 biometric / BCI intent signals.
 * High arousal → broader recall (lower threshold, higher k)
 * Focused intent → tighter similarity (higher threshold)
 */
export function computeDynamicRagWeights({
  affectiveContext = null,
  bciIntent = null,
  mode = 'dm',
} = {}) {
  let minScore = BASE_MIN_SCORE;
  let topK = BASE_TOP_K;
  const reasons = [];

  const stress = affectiveContext?.promptBlock
    ? extractStressProxy(affectiveContext)
    : affectiveContext?.voiceStress ?? null;
  const empathy = affectiveContext?.empathyLevel ?? null;

  const arousal = bciIntent?.arousal ?? null;
  const focus = bciIntent?.focusLevel ?? bciIntent?.focus_level ?? null;
  const intentType = bciIntent?.intentType ?? bciIntent?.intent_type ?? null;

  if (arousal != null) {
    if (arousal >= 0.7) {
      minScore -= 0.08;
      topK += 3;
      reasons.push('high_arousal_broaden');
    } else if (arousal <= 0.25) {
      minScore += 0.04;
      reasons.push('low_arousal_tighten');
    }
  }

  if (focus != null && focus >= 0.65) {
    minScore += 0.06;
    topK = Math.max(3, topK - 1);
    reasons.push('high_focus_precision');
  }

  if (stress != null && stress >= 0.65) {
    minScore -= 0.05;
    topK += 2;
    reasons.push('elevated_stress_support_recall');
  }

  if (empathy != null && empathy >= 0.75) {
    topK += 1;
    reasons.push('high_empathy_extra_memory');
  }

  if (intentType === 'search' || intentType === 'recall') {
    minScore -= 0.04;
    topK += 2;
    reasons.push('recall_intent');
  }

  if (mode === 'spatial_ambient' || mode === 'wearable') {
    minScore -= 0.03;
    reasons.push('edge_spatial_latency_bias');
  }

  minScore = clamp(minScore, 0.45, 0.92);
  topK = Math.max(2, Math.min(12, topK));

  return {
    minScore,
    topK,
    baseMinScore: BASE_MIN_SCORE,
    baseTopK: BASE_TOP_K,
    reasons,
  };
}

function extractStressProxy(affectiveContext) {
  const block = affectiveContext?.promptBlock ?? '';
  const m = block.match(/Stress level:[^\n]*\(([\d.]+)\)/i);
  return m ? parseFloat(m[1]) : null;
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

export class ContextEngine {
  /**
   * Assemble full generation context: window + narrative + dynamic RAG.
   */
  async assembleDmContext({
    user,
    character,
    threadId,
    userMessageContent,
    relationship,
    recentMessages,
    memorySummary,
    globalNarrative,
    affectiveContext = null,
    bciIntent = null,
    req = null,
  }) {
    const rag = computeDynamicRagWeights({
      affectiveContext,
      bciIntent,
      mode: 'dm',
    });

    const base = {
      character,
      relationship,
      recentMessages,
      memorySummary,
      globalNarrative,
      threadId,
      affectiveContext,
      bciIntent,
      ragWeights: rag,
    };

    const enriched = await enrichDmContextWithVectorMemories({
      userId: user.id,
      characterId: character.id,
      userMessageContent,
      context: base,
      req,
      ragOptions: rag,
    });

    logger.info(
      `[ContextEngine] rag minScore=${rag.minScore.toFixed(2)} topK=${rag.topK} reasons=${rag.reasons.join(',') || 'default'}`,
    );

    return enriched;
  }

  buildSystemPrompt(args) {
    return legacyBuildSystemPrompt(args);
  }

  buildUserPrompt(args) {
    return legacyBuildUserPrompt(args);
  }

  /**
   * Package prompts + RAG metadata for providers / MCP agents.
   */
  materialize({ character, user, context, incomingMessage, mode }) {
    const system = this.buildSystemPrompt({
      character,
      relationship: context.relationship,
      mode,
      context,
    });
    const userPrompt = this.buildUserPrompt({
      user,
      context,
      incomingMessage,
      mode,
    });

    return {
      system,
      userPrompt,
      ragWeights: context.ragWeights ?? computeDynamicRagWeights({
        affectiveContext: context.affectiveContext,
        bciIntent: context.bciIntent,
        mode,
      }),
      memoryCount: context.vectorMemories?.length ?? 0,
      engine: 'ContextEngine/v1',
    };
  }

  /**
   * Phase 34 — Stateless materialize (MCP 2026-07-28).
   * No session affinity; all context must be supplied in the request.
   */
  materializeStateless({
    character,
    user,
    context,
    incomingMessage,
    mode,
    protocolVersion = '2026-07-28',
  }) {
    const pack = this.materialize({ character, user, context, incomingMessage, mode });
    return {
      ...pack,
      engine: 'ContextEngine/stateless',
      protocolVersion,
      session: null,
      transport: 'header-routed',
    };
  }
}

export const contextEngine = new ContextEngine();

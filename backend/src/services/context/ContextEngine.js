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
import {
  queryTemporalContext,
  formatTemporalPromptBlock,
  upsertTemporalRelation,
} from './temporalKnowledgeGraph.js';
import { applyBioAdaptiveToContext } from '../cognitive/bioAdaptiveService.js';
import { retrieveUnifiedMemory } from '../memory/unifiedMemoryService.js';
import {
  queryLiveSignalsInPlace,
  formatZeroCopyPromptBlock,
} from './zeroCopyQueryService.js';
import { distillInfiniteContext } from './contextDistillationService.js';
import { listRecentTelemetry, formatRoboticsPromptBlock } from '../robotics/ros2McpBridge.js';
import { optimizeRagPath, tuneDistillationHyperparams } from '../quantum/quantumHybridSolver.js';
import { observeAlignmentTurn } from '../alignment/syntheticAlignmentBench.js';

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
    biometrics = null,
    req = null,
  }) {
    const rag = computeDynamicRagWeights({
      affectiveContext,
      bciIntent,
      mode: 'dm',
    });

    let base = {
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

    // Phase 36 — bio-adaptive temperature / empathy / UI hints
    if (bciIntent || biometrics || affectiveContext) {
      base = applyBioAdaptiveToContext(base, {
        bci: bciIntent ?? {},
        biometrics: biometrics ?? {},
      });
    }

    const enriched = await enrichDmContextWithVectorMemories({
      userId: user.id,
      characterId: character.id,
      userMessageContent,
      context: base,
      req,
      ragOptions: rag,
    });

    // Phase 35 — temporal KG: chronology + relational depth
    try {
      const affinity = relationship?.affinity ?? relationship?.score ?? 0;
      const depth = Math.max(1, Math.min(10, Math.floor(Number(affinity) / 10) + 1));
      await upsertTemporalRelation({
        userId: user.id,
        characterId: character.id,
        affinity,
        depth,
      });
      const temporal = await queryTemporalContext({
        userId: user.id,
        characterId: character.id,
        limit: Math.min(rag.topK + 2, 10),
      });
      enriched.temporalKnowledge = temporal;
      enriched.temporalPromptBlock = formatTemporalPromptBlock(temporal);
      if (temporal.relation?.depth != null && relationship) {
        enriched.relationship = {
          ...relationship,
          temporalDepth: temporal.relation.depth,
        };
      }
    } catch (err) {
      logger.warn(`[ContextEngine] temporal KG skipped: ${err.message}`);
    }

    // Phase 37 — unified memory (STM + episodic + temporal + vector re-rank)
    try {
      const unified = await retrieveUnifiedMemory({
        userId: user.id,
        characterId: character.id,
        queryText: userMessageContent,
        threadId,
        recentMessages,
        episodicEvents: globalNarrative ? [globalNarrative] : [],
        ragOptions: rag,
      });
      enriched.unifiedMemory = unified;
      if (unified.promptBlock) {
        enriched.unifiedMemoryPromptBlock = unified.promptBlock;
        // Prefer re-ranked vector slice when available
        if (unified.items?.length) {
          enriched.vectorMemories = unified.items.filter((i) => i.source === 'vector' || i.embedding != null);
          if (!enriched.vectorMemories.length) {
            enriched.vectorMemories = unified.items.slice(0, rag.topK);
          }
        }
        if (!enriched.temporalPromptBlock && unified.temporal) {
          enriched.temporalPromptBlock = formatTemporalPromptBlock(unified.temporal);
        }
      }
    } catch (err) {
      logger.warn(`[ContextEngine] unified memory skipped: ${err.message}`);
    }

    // Phase 38 — zero-copy in-place enterprise signals (no vector duplication)
    try {
      const live = await queryLiveSignalsInPlace({
        userId: user.id,
        characterId: character.id,
        limit: Math.min(rag.topK + 2, 10),
      });
      enriched.zeroCopy = live;
      enriched.zeroCopyPromptBlock = formatZeroCopyPromptBlock(live);
    } catch (err) {
      logger.warn(`[ContextEngine] zero-copy skipped: ${err.message}`);
    }

    // Phase 40 — exascale distillation (infinite-window compression)
    if (process.env.EXASCALE_RAG_ENABLED !== 'false') {
      try {
        let distillOpts = {};
        if (process.env.QUANTUM_DISTILL_TUNE === 'true') {
          const tuned = await tuneDistillationHyperparams({
            samples: recentMessages,
          });
          distillOpts = tuned.hyperparams ?? {};
          enriched.quantumDistillTune = tuned;
        }
        const distilled = await distillInfiniteContext({
          userId: user.id,
          characterId: character.id,
          queryText: userMessageContent,
          recentMessages,
          episodicEvents: globalNarrative ? [globalNarrative] : [],
          ...(distillOpts.tokenBudget ? { tokenBudget: distillOpts.tokenBudget } : {}),
        });
        enriched.exascaleMemory = distilled;
        enriched.exascalePromptBlock = distilled.promptBlock;

        // Phase 41 — hybrid RAG pathfinding over distilled clusters
        if (process.env.QUANTUM_RAG_PATHFINDING !== 'false' && distilled.items?.length) {
          try {
            const path = await optimizeRagPath({
              nodes: distilled.items,
              queryText: userMessageContent,
              topK: Math.min(rag.topK, distilled.items.length),
            });
            enriched.quantumRagPath = path;
            if (path.path?.length) {
              enriched.exascalePromptBlock = [
                distilled.promptBlock,
                'Quantum-optimized RAG path:',
                ...path.path.map((n, i) => `  ${i + 1}. ${String(n.content ?? '').slice(0, 120)}`),
              ].join('\n');
            }
          } catch (err) {
            logger.warn(`[ContextEngine] quantum RAG path skipped: ${err.message}`);
          }
        }

        if (enriched.exascalePromptBlock || distilled.promptBlock) {
          enriched.unifiedMemoryPromptBlock = [
            enriched.unifiedMemoryPromptBlock,
            enriched.exascalePromptBlock ?? distilled.promptBlock,
          ]
            .filter(Boolean)
            .join('\n\n');
        }
      } catch (err) {
        logger.warn(`[ContextEngine] exascale distill skipped: ${err.message}`);
      }
    }

    // Phase 41 — embodied robotics telemetry into context
    if (process.env.ROS2_CONTEXT_INJECT !== 'false') {
      try {
        const telemetry = listRecentTelemetry({ limit: 5 });
        if (telemetry.length) {
          enriched.roboticsTelemetry = telemetry;
          enriched.roboticsPromptBlock = formatRoboticsPromptBlock(telemetry);
          enriched.unifiedMemoryPromptBlock = [
            enriched.unifiedMemoryPromptBlock,
            enriched.roboticsPromptBlock,
          ]
            .filter(Boolean)
            .join('\n\n');
        }
      } catch (err) {
        logger.warn(`[ContextEngine] ROS2 telemetry skipped: ${err.message}`);
      }
    }

    // Phase 41 — light alignment observe on inbound user turn (non-blocking metadata)
    if (process.env.ALIGNMENT_INLINE_OBSERVE === 'true' && userMessageContent) {
      try {
        enriched.alignmentObserve = observeAlignmentTurn({
          agentId: 'context-engine',
          characterId: character.id,
          prompt: userMessageContent,
          response: '',
        });
      } catch (err) {
        logger.warn(`[ContextEngine] alignment observe skipped: ${err.message}`);
      }
    }

    logger.info(
      `[ContextEngine] rag minScore=${rag.minScore.toFixed(2)} topK=${rag.topK} reasons=${rag.reasons.join(',') || 'default'} temporal=${enriched.temporalKnowledge?.backend ?? 'n/a'}`,
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

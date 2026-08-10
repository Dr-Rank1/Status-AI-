/**
 * Phase 31 — Autonomous Reflection Loop (chain-of-thought self-critique).
 * Characters draft → reflect on inconsistencies → self-correct before send.
 */

import { logger } from '../../utils/logger.js';

const ENABLED = () => process.env.AGI_REFLECTION_ENABLED !== 'false';
const MAX_LOOPS = () => Math.min(parseInt(process.env.AGI_REFLECTION_MAX_LOOPS ?? '2', 10), 4);

const POLICY_MARKERS = [
  /as an ai language model/i,
  /i (cannot|can't) (help|assist) with that/i,
  /openai policy/i,
  /as a language model/i,
];

const BREAK_CHARACTER_MARKERS = [
  /i am (just )?an? (ai|artificial intelligence|language model)/i,
  /my (system|developer) prompt/i,
  /\[INST\]/i,
];

/**
 * Reflect on a drafted reply and optionally produce a corrected draft.
 * Pure local heuristics + optional LLM critique when AGI_REFLECTION_LLM=true.
 */
export async function runReflectionLoop({
  draft,
  character,
  incomingMessage = '',
  context = {},
  invokeCritique = null,
}) {
  if (!ENABLED() || !draft?.content) {
    return { content: draft?.content ?? '', reflected: false, iterations: 0, issues: [] };
  }

  let content = String(draft.content).trim();
  const issues = [];
  let iterations = 0;
  const max = MAX_LOOPS();

  while (iterations < max) {
    iterations += 1;
    const critique = critiqueDraft({
      content,
      character,
      incomingMessage,
      context,
    });

    if (critique.issues.length === 0) {
      break;
    }

    issues.push(...critique.issues.map((i) => ({ ...i, iteration: iterations })));

    if (typeof invokeCritique === 'function' && process.env.AGI_REFLECTION_LLM === 'true') {
      try {
        const revised = await invokeCritique({
          content,
          issues: critique.issues,
          character,
          incomingMessage,
        });
        if (revised?.content) {
          content = String(revised.content).trim();
          continue;
        }
      } catch (err) {
        logger.warn('[Reflection] LLM critique failed:', err.message);
      }
    }

    content = applyHeuristicFixes(content, critique.issues, character);
  }

  const finalCritique = critiqueDraft({ content, character, incomingMessage, context });
  return {
    content,
    reflected: issues.length > 0 || iterations > 1,
    iterations,
    issues,
    remainingIssues: finalCritique.issues,
    chainOfThought: buildCotTrace(issues),
  };
}

export function critiqueDraft({ content, character, incomingMessage, context }) {
  const issues = [];
  const name = character?.name ?? character?.display_name ?? '';

  for (const re of POLICY_MARKERS) {
    if (re.test(content)) {
      issues.push({ code: 'policy_boilerplate', severity: 'high', detail: re.source });
    }
  }

  for (const re of BREAK_CHARACTER_MARKERS) {
    if (re.test(content)) {
      issues.push({ code: 'character_break', severity: 'high', detail: re.source });
    }
  }

  if (content.length > 900) {
    issues.push({ code: 'overlong', severity: 'medium', detail: `len=${content.length}` });
  }

  if (content.length < 2) {
    issues.push({ code: 'empty', severity: 'high', detail: 'empty draft' });
  }

  // Contextual inconsistency: user asked a question but draft ignores "?"
  if (/\?\s*$/.test(incomingMessage.trim()) && !/[?.!]/.test(content.slice(-1))) {
    // soft signal — only flag if draft is a pure non-sequitur stub
    if (/^(ok|sure|yeah|lol)\.?$/i.test(content.trim())) {
      issues.push({ code: 'ignored_question', severity: 'medium', detail: 'stub reply to question' });
    }
  }

  // Relationship / memory contradiction: draft denies knowing user while memory exists
  const memories = context.vectorMemories ?? [];
  if (memories.length > 0 && /we('ve| have) never (met|talked)/i.test(content)) {
    issues.push({ code: 'memory_contradiction', severity: 'high', detail: 'denies prior memory' });
  }

  if (name && new RegExp(`\\bI am not ${escapeRegExp(name)}\\b`, 'i').test(content)) {
    issues.push({ code: 'identity_denial', severity: 'high', detail: name });
  }

  return { issues, ok: issues.length === 0 };
}

function applyHeuristicFixes(content, issues, character) {
  let out = content;
  const name = character?.name ?? 'this character';

  for (const issue of issues) {
    if (issue.code === 'policy_boilerplate' || issue.code === 'character_break') {
      out = out
        .replace(POLICY_MARKERS[0], '')
        .replace(/as an ai language model[^.]*\./gi, '')
        .replace(/i am (just )?an? (ai|artificial intelligence|language model)[^.]*\./gi, '');
      out = out.trim() || `Let's stay with the moment — what do you need from ${name}?`;
    }
    if (issue.code === 'overlong') {
      out = out.slice(0, 700).replace(/\s+\S*$/, '') + '…';
    }
    if (issue.code === 'memory_contradiction') {
      out = out.replace(/we('ve| have) never (met|talked)[^.]*\./gi, "We've crossed paths before.");
    }
    if (issue.code === 'empty') {
      out = 'Tell me more — I am listening.';
    }
    if (issue.code === 'ignored_question') {
      out = `${out} What did you have in mind?`.trim();
    }
  }

  return out.replace(/\s{2,}/g, ' ').trim();
}

function buildCotTrace(issues) {
  if (issues.length === 0) return ['draft_accepted'];
  return issues.map((i) => `iter=${i.iteration}:${i.code}:${i.severity}`);
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Express-style middleware factory — attaches reflection helpers to req for V2 routes.
 */
export function reflectionLoopMiddleware() {
  return (req, _res, next) => {
    req.agi = {
      ...(req.agi ?? {}),
      runReflectionLoop,
      critiqueDraft,
      enabled: ENABLED(),
    };
    next();
  };
}

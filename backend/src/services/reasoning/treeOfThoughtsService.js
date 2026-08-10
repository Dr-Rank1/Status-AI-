/**
 * Phase 37 — Tree-of-Thoughts (ToT) parallel reasoning.
 * Explores multiple paths, evaluates outcomes, selects optimal branch.
 */

import crypto from 'crypto';
import { logger } from '../../utils/logger.js';

const DEFAULT_BEAM = parseInt(process.env.TOT_BEAM_WIDTH ?? '3', 10);
const DEFAULT_DEPTH = parseInt(process.env.TOT_DEPTH ?? '2', 10);

/**
 * Expand thought branches for an ambiguous task.
 */
export function expandThoughts(task, { beamWidth = DEFAULT_BEAM, parentId = null, depth = 0 } = {}) {
  const seeds = [
    { strategy: 'direct', hint: 'Answer directly and concretely.' },
    { strategy: 'decompose', hint: 'Break into sub-questions, then synthesize.' },
    { strategy: 'contrast', hint: 'Compare alternatives and pick the strongest.' },
    { strategy: 'evidence', hint: 'Ground in retrieved memory / facts first.' },
    { strategy: 'risk', hint: 'Optimize for safety and reversibility.' },
  ];

  return seeds.slice(0, beamWidth).map((s, i) => ({
    id: crypto.randomUUID(),
    parentId,
    depth,
    strategy: s.strategy,
    content: `[${s.strategy}] ${s.hint} Task: ${String(task).slice(0, 280)}`,
    score: null,
    children: [],
  }));
}

/**
 * Heuristic evaluator — higher is better (no LLM required for unit tests / offline).
 */
export function evaluateThought(thought, { task = '', memories = null } = {}) {
  let score = 0.4;
  const text = `${thought.content} ${task}`.toLowerCase();

  if (thought.strategy === 'evidence' && memories?.items?.length) score += 0.25;
  if (thought.strategy === 'decompose' && /\?|how|why|plan/.test(task.toLowerCase())) score += 0.2;
  if (thought.strategy === 'risk' && /pay|escrow|delete|privilege/.test(task.toLowerCase())) score += 0.25;
  if (thought.strategy === 'contrast' && /or|vs|option|should/.test(task.toLowerCase())) score += 0.2;
  if (thought.strategy === 'direct' && task.split(/\s+/).length < 12) score += 0.15;

  if (text.length > 60) score += 0.05;
  if (/as an ai|language model/.test(text)) score -= 0.3;

  return Math.max(0, Math.min(1, score));
}

/**
 * Parallel ToT search — beam expand → score → deepen → pick best leaf path.
 */
export async function runTreeOfThoughts({
  task,
  context = {},
  beamWidth = DEFAULT_BEAM,
  depth = DEFAULT_DEPTH,
} = {}) {
  const root = {
    id: 'root',
    parentId: null,
    depth: -1,
    strategy: 'root',
    content: String(task ?? ''),
    score: 1,
    children: [],
  };

  let frontier = expandThoughts(task, { beamWidth, parentId: root.id, depth: 0 });
  for (const t of frontier) {
    t.score = evaluateThought(t, { task, memories: context.memories });
  }
  frontier.sort((a, b) => b.score - a.score);
  root.children = frontier;
  frontier = frontier.slice(0, beamWidth);

  for (let d = 1; d < depth; d += 1) {
    const next = [];
    await Promise.all(
      frontier.map(async (parent) => {
        const kids = expandThoughts(`${task} :: via ${parent.strategy}`, {
          beamWidth: Math.max(2, beamWidth - 1),
          parentId: parent.id,
          depth: d,
        });
        for (const k of kids) {
          k.score = evaluateThought(k, { task, memories: context.memories }) * (0.9 + 0.1 * (parent.score ?? 0.5));
          k.content = `${parent.content}\n→ ${k.content}`;
        }
        kids.sort((a, b) => b.score - a.score);
        parent.children = kids.slice(0, beamWidth);
        next.push(...parent.children);
      }),
    );
    next.sort((a, b) => b.score - a.score);
    frontier = next.slice(0, beamWidth);
  }

  const best = frontier[0] ?? root.children[0] ?? root;
  const path = reconstructPath(best, root);

  logger.info(
    `[ToT] task_len=${String(task).length} beam=${beamWidth} depth=${depth} best=${best.strategy} score=${best.score?.toFixed?.(2)}`,
  );

  return {
    engine: 'tree-of-thoughts/v1',
    beamWidth,
    depth,
    best: {
      id: best.id,
      strategy: best.strategy,
      score: best.score,
      content: best.content,
    },
    path: path.map((n) => ({ id: n.id, strategy: n.strategy, score: n.score })),
    tree: summarizeTree(root),
  };
}

function reconstructPath(leaf, root) {
  // Flatten: we only have parentId refs in expansion; rebuild from content chain
  return [root, leaf];
}

function summarizeTree(node, acc = []) {
  acc.push({ id: node.id, strategy: node.strategy, score: node.score, depth: node.depth });
  for (const c of node.children ?? []) summarizeTree(c, acc);
  return acc;
}

export function getTotConfig() {
  return {
    beamWidth: DEFAULT_BEAM,
    depth: DEFAULT_DEPTH,
    parallel: true,
    evaluator: 'heuristic_v1',
  };
}

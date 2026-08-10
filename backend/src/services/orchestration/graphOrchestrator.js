/**
 * Phase 37 — Graph-based state orchestration (LangGraph-style patterns).
 * Cyclical multi-actor workflows with checkpoints + HITL interrupt nodes.
 */

import crypto from 'crypto';
import { logger } from '../../utils/logger.js';
import { AppError } from '../../utils/errors.js';
import { discoverAndDelegate, listAgentCards } from '../a2a/a2aProtocol.js';
import { runTreeOfThoughts } from '../reasoning/treeOfThoughtsService.js';
import { pauseForHuman, resumeFromHuman } from '../mcp/mrtrStateService.js';
import { retrieveUnifiedMemory } from '../memory/unifiedMemoryService.js';

const graphs = new Map(); // graphRunId -> run state
const DEFAULT_GRAPH = 'status.multi_actor.v1';

/**
 * Compile a default multi-actor graph:
 *   start → retrieve → plan → (branch) tot|a2a_delegate → synthesize → [hitl?] → end
 *   Cycles: synthesize → plan when qualityGate fails (maxLoops).
 */
export function compileDefaultGraph() {
  return {
    id: DEFAULT_GRAPH,
    nodes: {
      start: { type: 'passthrough' },
      retrieve: { type: 'retrieve' },
      plan: { type: 'plan' },
      tot: { type: 'tree_of_thoughts' },
      a2a_delegate: { type: 'a2a' },
      synthesize: { type: 'synthesize' },
      hitl: { type: 'interrupt', reason: 'human_validation' },
      end: { type: 'end' },
    },
    edges: [
      { from: 'start', to: 'retrieve' },
      { from: 'retrieve', to: 'plan' },
      { from: 'plan', to: 'tot', when: 'ambiguous' },
      { from: 'plan', to: 'a2a_delegate', when: 'delegate' },
      { from: 'plan', to: 'synthesize', when: 'simple' },
      { from: 'tot', to: 'synthesize' },
      { from: 'a2a_delegate', to: 'synthesize' },
      { from: 'synthesize', to: 'plan', when: 'retry' },
      { from: 'synthesize', to: 'hitl', when: 'needs_approval' },
      { from: 'synthesize', to: 'end', when: 'done' },
      { from: 'hitl', to: 'end', when: 'approved' },
      { from: 'hitl', to: 'plan', when: 'revise' },
    ],
    maxLoops: parseInt(process.env.GRAPH_MAX_LOOPS ?? '3', 10),
  };
}

export function createGraphRun({
  input,
  userId = null,
  characterId = null,
  graph = null,
  threadId = null,
}) {
  const runId = crypto.randomUUID();
  const compiled = graph ?? compileDefaultGraph();
  const state = {
    runId,
    graphId: compiled.id,
    graph: compiled,
    status: 'running',
    node: 'start',
    loop: 0,
    checkpoint: null,
    values: {
      input,
      userId,
      characterId,
      threadId,
      memories: null,
      plan: null,
      branch: null,
      tot: null,
      a2a: null,
      draft: null,
      quality: null,
      hitl: null,
    },
    history: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  graphs.set(runId, state);
  return state;
}

/**
 * Advance graph until interrupt, end, or step budget.
 */
export async function stepGraph(runId, { maxSteps = 12 } = {}) {
  const state = graphs.get(runId);
  if (!state) throw new AppError('Graph run not found', 404, 'GRAPH_NOT_FOUND');
  if (state.status === 'interrupted') {
    return { state, note: 'awaiting_human — call resumeGraph' };
  }
  if (state.status === 'completed') return { state };

  let steps = 0;
  while (steps < maxSteps && state.status === 'running') {
    steps += 1;
    await executeNode(state);
    if (state.status === 'interrupted' || state.status === 'completed') break;
    const next = resolveNext(state);
    if (!next) {
      state.status = 'completed';
      state.node = 'end';
      break;
    }
    if (next === 'plan' && state.node === 'synthesize') {
      state.loop += 1;
      if (state.loop >= state.graph.maxLoops) {
        state.values.branch = 'done';
        state.node = 'end';
        state.status = 'completed';
        break;
      }
    }
    state.node = next;
    checkpoint(state);
  }

  state.updatedAt = new Date().toISOString();
  return { state, steps };
}

export async function runGraphToCompletion(args) {
  const state = createGraphRun(args);
  return stepGraph(state.runId);
}

async function executeNode(state) {
  const nodeId = state.node;
  const def = state.graph.nodes[nodeId];
  state.history.push({ node: nodeId, at: Date.now() });
  logger.info(`[Graph] run=${state.runId.slice(0, 8)} node=${nodeId}`);

  switch (def?.type) {
    case 'passthrough':
      state.values.branch = 'continue';
      break;

    case 'retrieve': {
      const mem = await retrieveUnifiedMemory({
        userId: state.values.userId,
        characterId: state.values.characterId,
        queryText: state.values.input,
        threadId: state.values.threadId,
      });
      state.values.memories = mem;
      break;
    }

    case 'plan': {
      const text = String(state.values.input ?? '').toLowerCase();
      const ambiguous = /\?|maybe|unsure|what if|should i|options|ambiguous/.test(text)
        || text.split(/\s+/).length > 40;
      const needsDelegate = /search|research|calendar|escrow|enterprise|external/.test(text);
      const needsApproval = /pay|escrow|delete|privileged|transfer/.test(text);

      if (ambiguous) state.values.branch = 'ambiguous';
      else if (needsDelegate) state.values.branch = 'delegate';
      else state.values.branch = 'simple';

      state.values.plan = {
        branch: state.values.branch,
        needsApproval,
        agents: listAgentCards().map((c) => c.agentId),
      };
      break;
    }

    case 'tree_of_thoughts': {
      state.values.tot = await runTreeOfThoughts({
        task: state.values.input,
        context: { memories: state.values.memories },
      });
      state.values.draft = state.values.tot.best?.content ?? state.values.draft;
      break;
    }

    case 'a2a': {
      try {
        state.values.a2a = await discoverAndDelegate({
          task: state.values.input,
          from: 'status.graph',
          ctx: {
            userId: state.values.userId,
            characterId: state.values.characterId,
          },
        });
        state.values.draft = JSON.stringify(state.values.a2a.result).slice(0, 500);
      } catch (err) {
        state.values.a2a = { error: err.message };
      }
      break;
    }

    case 'synthesize': {
      const parts = [
        state.values.tot?.best?.content,
        state.values.a2a?.result ? `A2A: ${state.values.a2a.chosen?.agentId}` : null,
        state.values.memories?.promptBlock,
      ].filter(Boolean);
      state.values.draft = parts.join('\n\n') || `Acknowledged: ${state.values.input}`;
      state.values.quality = scoreDraft(state.values.draft);

      if (state.values.plan?.needsApproval) state.values.branch = 'needs_approval';
      else if (state.values.quality < 0.35 && state.loop < state.graph.maxLoops) {
        state.values.branch = 'retry';
      } else {
        state.values.branch = 'done';
      }
      break;
    }

    case 'interrupt': {
      const paused = await pauseForHuman({
        reason: def.reason ?? 'graph_hitl',
        prompt: `Approve graph output?\n\n${state.values.draft ?? ''}`.slice(0, 800),
        pendingAction: { type: 'noop', graphRunId: state.runId },
        userId: state.values.userId,
        characterId: state.values.characterId,
      });
      state.values.hitl = paused;
      state.status = 'interrupted';
      state.checkpoint = serializeCheckpoint(state);
      break;
    }

    case 'end':
      state.status = 'completed';
      break;

    default:
      break;
  }
}

function resolveNext(state) {
  if (state.status !== 'running') return null;
  const branch = state.values.branch;
  const edges = state.graph.edges.filter((e) => e.from === state.node);
  const match = edges.find((e) => !e.when || e.when === branch || e.when === 'continue')
    ?? edges.find((e) => !e.when);
  return match?.to ?? null;
}

function scoreDraft(draft) {
  if (!draft) return 0;
  const len = draft.length;
  if (len < 20) return 0.2;
  if (len > 80) return 0.8;
  return 0.5;
}

function checkpoint(state) {
  state.checkpoint = serializeCheckpoint(state);
}

function serializeCheckpoint(state) {
  return {
    runId: state.runId,
    node: state.node,
    loop: state.loop,
    status: state.status,
    values: {
      input: state.values.input,
      draft: state.values.draft,
      branch: state.values.branch,
      plan: state.values.plan,
      quality: state.values.quality,
      hitl: state.values.hitl,
      totBest: state.values.tot?.best ?? null,
      a2aChosen: state.values.a2a?.chosen ?? null,
    },
    at: new Date().toISOString(),
  };
}

export function getGraphRun(runId) {
  const state = graphs.get(runId);
  if (!state) throw new AppError('Graph run not found', 404, 'GRAPH_NOT_FOUND');
  return state;
}

export async function resumeGraph(runId, { decision = 'approve', userResponse = null } = {}) {
  const state = getGraphRun(runId);
  if (state.status !== 'interrupted') {
    throw new AppError('Graph is not interrupted', 409, 'GRAPH_NOT_INTERRUPTED');
  }

  if (state.values.hitl?.requestStateId) {
    await resumeFromHuman({
      requestStateId: state.values.hitl.requestStateId,
      decision,
      userResponse,
    });
  }

  state.values.branch = decision === 'approve' || decision === 'approved' ? 'approved' : 'revise';
  state.status = 'running';
  if (state.values.branch === 'approved') {
    state.node = 'end';
    state.status = 'completed';
  } else {
    state.node = 'plan';
  }
  checkpoint(state);
  if (state.status === 'running') {
    return stepGraph(runId);
  }
  return { state };
}

/**
 * Express-friendly middleware factory — attaches graph helpers to req.
 */
export function graphOrchestratorMiddleware() {
  return (req, _res, next) => {
    req.graphOrchestrator = {
      create: (input) => createGraphRun({
        input,
        userId: req.user?.id,
        characterId: req.body?.characterId,
        threadId: req.body?.threadId,
      }),
      step: stepGraph,
      resume: resumeGraph,
      get: getGraphRun,
      compile: compileDefaultGraph,
    };
    next();
  };
}

export function getGraphConfig() {
  const g = compileDefaultGraph();
  return {
    defaultGraphId: g.id,
    nodes: Object.keys(g.nodes),
    edgeCount: g.edges.length,
    maxLoops: g.maxLoops,
    features: ['checkpoints', 'cycles', 'hitl_interrupt', 'a2a', 'tot'],
  };
}

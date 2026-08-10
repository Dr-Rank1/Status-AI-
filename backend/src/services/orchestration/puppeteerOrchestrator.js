/**
 * Phase 39 — Puppeteer Pattern: dynamic swarm topology assembly.
 * Primary orchestrator assembles / reconfigures / disbands agent graphs by prompt cost×speed.
 */

import crypto from 'crypto';
import { logger } from '../../utils/logger.js';
import { AppError } from '../../utils/errors.js';
import { listAgentCards, discoverAndDelegate } from '../a2a/a2aProtocol.js';
import { runTreeOfThoughts } from '../reasoning/treeOfThoughtsService.js';
import { assertAgentsNotKilled } from '../security/globalKillSwitchService.js';
import { appendAuditEvent } from '../security/immutableAuditLedger.js';
import { recordHandoff, recordAllocation } from '../ops/agentCommandCenterService.js';
import { proposeDagOperation, getDagQuorumConfig } from '../consensus/dagQuorumLedger.js';
import { emitSwarmTopologyEvent } from '../spatial/holographicSwarmService.js';

const topologies = new Map(); // topologyId -> state

/** Cost / latency weights per role (relative). */
const ROLE_COST = {
  dialogue: { cost: 1, latencyMs: 200 },
  research: { cost: 3, latencyMs: 800 },
  tools: { cost: 2, latencyMs: 400 },
  transaction: { cost: 4, latencyMs: 600 },
  coordinator: { cost: 1, latencyMs: 100 },
};

/**
 * Score prompt complexity → topology shape.
 */
export function analyzePromptComplexity(prompt = '') {
  const text = String(prompt).toLowerCase();
  const words = text.split(/\s+/).filter(Boolean).length;
  let score = Math.min(1, words / 80);
  const signals = [];

  if (/search|research|lore|wiki|compare|analyze/.test(text)) {
    score += 0.2;
    signals.push('research');
  }
  if (/calendar|schedule|remind|book/.test(text)) {
    score += 0.15;
    signals.push('tools');
  }
  if (/pay|escrow|wallet|hire|transfer/.test(text)) {
    score += 0.25;
    signals.push('transaction');
  }
  if (/\?|maybe|options|should|what if|ambiguous/.test(text) || words > 40) {
    score += 0.2;
    signals.push('tot');
  }
  if (/enterprise|external|crm|delegate/.test(text)) {
    score += 0.15;
    signals.push('enterprise');
  }

  score = Math.min(1, score);
  let shape = 'flat';
  if (score >= 0.75) shape = 'hierarchical';
  else if (score >= 0.45) shape = 'hub_spoke';
  else if (signals.includes('enterprise')) shape = 'federated';

  return {
    score,
    shape,
    signals: [...new Set(signals)],
    words,
    optimize: score >= 0.6 ? 'quality' : 'speed',
  };
}

/**
 * Assemble a live topology (Puppeteer pulls strings).
 */
export function assembleTopology({
  prompt,
  userId = null,
  characterId = null,
  preferCost = null,
}) {
  assertAgentsNotKilled();
  const analysis = analyzePromptComplexity(prompt);
  const optimize = preferCost ?? analysis.optimize;

  const nodes = [{ id: 'puppeteer', role: 'coordinator', status: 'active' }];
  const edges = [];

  const add = (role) => {
    const id = `status.${role}`;
    if (!nodes.find((n) => n.id === id)) {
      nodes.push({ id, role, status: 'standby', ...ROLE_COST[role] });
    }
    edges.push({ from: 'puppeteer', to: id, type: 'command' });
  };

  add('dialogue');
  if (analysis.signals.includes('research') || analysis.shape !== 'flat') add('research');
  if (analysis.signals.includes('tools')) add('tools');
  if (analysis.signals.includes('transaction')) add('transaction');

  if (analysis.shape === 'hierarchical' && nodes.some((n) => n.role === 'research')) {
    edges.push({ from: 'status.research', to: 'status.dialogue', type: 'handoff' });
  }
  if (analysis.shape === 'hub_spoke') {
    for (const n of nodes.filter((n) => n.role !== 'coordinator' && n.role !== 'dialogue')) {
      edges.push({ from: n.id, to: 'status.dialogue', type: 'handoff' });
    }
  }

  // Cost prune for speed optimization
  if (optimize === 'speed' && nodes.length > 3) {
    const pruned = nodes.filter((n) => n.role !== 'tools' || analysis.signals.includes('tools'));
    nodes.length = 0;
    nodes.push(...pruned);
  }

  const estimate = estimateTopologyCost(nodes);
  const topologyId = crypto.randomUUID();
  const state = {
    topologyId,
    pattern: 'puppeteer',
    analysis,
    optimize,
    nodes,
    edges,
    estimate,
    status: 'assembled',
    userId,
    characterId,
    prompt: String(prompt).slice(0, 500),
    createdAt: new Date().toISOString(),
    history: [{ event: 'assemble', at: Date.now() }],
  };

  topologies.set(topologyId, state);
  emitSwarmTopologyEvent({ type: 'topology_assembled', topology: summarize(state) });
  logger.info(
    `[Puppeteer] assembled ${topologyId.slice(0, 8)} shape=${analysis.shape} nodes=${nodes.length} cost=${estimate.cost}`,
  );
  return state;
}

function estimateTopologyCost(nodes) {
  const cost = nodes.reduce((s, n) => s + (ROLE_COST[n.role]?.cost ?? 1), 0);
  const latencyMs = Math.max(...nodes.map((n) => ROLE_COST[n.role]?.latencyMs ?? 200));
  return { cost, latencyMs, parallelizable: nodes.length - 1 };
}

/**
 * Reconfigure topology mid-flight (add/remove agents).
 */
export function reconfigureTopology(topologyId, { addRoles = [], removeRoles = [], reason = 'adaptive' } = {}) {
  const state = getTopology(topologyId);
  for (const role of addRoles) {
    const id = `status.${role}`;
    if (!state.nodes.find((n) => n.id === id)) {
      state.nodes.push({ id, role, status: 'standby', ...ROLE_COST[role] });
      state.edges.push({ from: 'puppeteer', to: id, type: 'command' });
      recordAllocation({ agentId: id, task: reason, status: 'joined' });
    }
  }
  for (const role of removeRoles) {
    const id = `status.${role}`;
    state.nodes = state.nodes.filter((n) => n.id !== id);
    state.edges = state.edges.filter((e) => e.to !== id && e.from !== id);
  }
  state.estimate = estimateTopologyCost(state.nodes);
  state.status = 'reconfigured';
  state.history.push({ event: 'reconfigure', reason, at: Date.now() });
  emitSwarmTopologyEvent({ type: 'topology_reconfigured', topology: summarize(state) });
  return state;
}

export function disbandTopology(topologyId, { reason = 'complete' } = {}) {
  const state = getTopology(topologyId);
  state.status = 'disbanded';
  state.disbandedAt = new Date().toISOString();
  state.history.push({ event: 'disband', reason, at: Date.now() });
  for (const n of state.nodes) n.status = 'idle';
  emitSwarmTopologyEvent({ type: 'topology_disbanded', topology: summarize(state) });
  topologies.delete(topologyId);
  return state;
}

export function getTopology(topologyId) {
  const state = topologies.get(topologyId);
  if (!state) throw new AppError('Topology not found', 404, 'PUPPETEER_NOT_FOUND');
  return state;
}

/**
 * Execute puppeteer-directed swarm: handoffs emit spatial events; high-stakes need DAG quorum.
 */
export async function runPuppeteerSwarm({
  prompt,
  userId = null,
  characterId = null,
  preferCost = null,
  requireQuorum = null,
}) {
  assertAgentsNotKilled();
  const topology = assembleTopology({ prompt, userId, characterId, preferCost });

  await appendAuditEvent({
    type: 'puppeteer.assemble',
    actor: 'puppeteer',
    action: 'assemble_topology',
    decision: topology.analysis.shape,
    metadata: { topologyId: topology.topologyId, estimate: topology.estimate },
    userId,
    characterId,
  });

  const results = [];
  const roles = topology.nodes.filter((n) => n.role !== 'coordinator').map((n) => n.role);

  // Activate research → dialogue handoff animation path
  if (roles.includes('research')) {
    const researchNode = topology.nodes.find((n) => n.role === 'research');
    researchNode.status = 'active';
    emitSwarmTopologyEvent({
      type: 'agent_activate',
      agentId: 'status.research',
      topologyId: topology.topologyId,
    });
    recordHandoff({ from: 'puppeteer', to: 'status.research', task: prompt });

    try {
      const delegated = await discoverAndDelegate({
        task: prompt,
        from: 'status.puppeteer',
        requiredCapabilities: ['web:search'],
        ctx: { userId, characterId },
      });
      results.push({ role: 'research', result: delegated.result });
    } catch (err) {
      results.push({ role: 'research', error: err.message });
    }

    emitSwarmTopologyEvent({
      type: 'agent_handoff',
      from: 'status.research',
      to: 'status.dialogue',
      topologyId: topology.topologyId,
      animation: 'beam_transfer',
    });
    recordHandoff({ from: 'status.research', to: 'status.dialogue', task: prompt });
  }

  if (topology.analysis.signals.includes('tot')) {
    const tot = await runTreeOfThoughts({ task: prompt });
    results.push({ role: 'tot', result: tot.best });
  }

  // High-stakes: DAG quorum before transaction activation
  if (roles.includes('transaction')) {
    const needsQuorum = requireQuorum !== false;
    if (needsQuorum) {
      const proposal = await proposeDagOperation({
        operation: 'transaction_activate',
        payload: { prompt: String(prompt).slice(0, 200), characterId },
        proposerId: 'status.puppeteer',
        voterIds: topology.nodes.filter((n) => n.role !== 'coordinator').map((n) => n.id),
      });
      results.push({ role: 'quorum', result: proposal });
      if (!proposal.committed) {
        topology.nodes.find((n) => n.role === 'transaction').status = 'quarantined';
        emitSwarmTopologyEvent({
          type: 'agent_quarantine',
          agentId: 'status.transaction',
          topologyId: topology.topologyId,
          reason: 'quorum_pending_or_failed',
        });
      } else {
        topology.nodes.find((n) => n.role === 'transaction').status = 'active';
      }
    }
  }

  const dialogue = topology.nodes.find((n) => n.role === 'dialogue');
  if (dialogue) {
    dialogue.status = 'active';
    emitSwarmTopologyEvent({
      type: 'agent_activate',
      agentId: 'status.dialogue',
      topologyId: topology.topologyId,
    });
  }

  const synthesis = {
    content: results.map((r) => r.result?.content ?? r.result?.output ?? r.role).join(' | ').slice(0, 800)
      || `Puppeteer completed (${topology.analysis.shape})`,
    topologyId: topology.topologyId,
    shape: topology.analysis.shape,
    results,
  };

  disbandTopology(topology.topologyId, { reason: 'run_complete' });
  return { topology: summarize(topology), synthesis, dag: getDagQuorumConfig() };
}

function summarize(state) {
  return {
    topologyId: state.topologyId,
    pattern: state.pattern,
    shape: state.analysis?.shape,
    status: state.status,
    nodes: state.nodes,
    edges: state.edges,
    estimate: state.estimate,
  };
}

/**
 * Express middleware — attach puppeteer helpers.
 */
export function puppeteerOrchestratorMiddleware() {
  return (req, _res, next) => {
    req.puppeteer = {
      assemble: (prompt) => assembleTopology({
        prompt,
        userId: req.user?.id,
        characterId: req.body?.characterId,
      }),
      reconfigure: reconfigureTopology,
      disband: disbandTopology,
      run: (prompt) => runPuppeteerSwarm({
        prompt,
        userId: req.user?.id,
        characterId: req.body?.characterId,
        preferCost: req.body?.preferCost,
      }),
      analyze: analyzePromptComplexity,
    };
    next();
  };
}

export function getPuppeteerConfig() {
  return {
    pattern: 'puppeteer',
    shapes: ['flat', 'hub_spoke', 'hierarchical', 'federated'],
    activeTopologies: topologies.size,
    roleCosts: ROLE_COST,
    cards: listAgentCards().length,
  };
}

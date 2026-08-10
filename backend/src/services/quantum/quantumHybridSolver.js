/**
 * Phase 41 — Quantum-classical hybrid optimization wrappers.
 * Qiskit / PennyLane-style interfaces with simulated annealing fallback
 * for multi-agent resource allocation, combinatorial RAG pathfinding,
 * and context-distillation hyper-parameter tuning.
 */

import crypto from 'crypto';
import { logger } from '../../utils/logger.js';

const BACKEND = () => (process.env.QUANTUM_HYBRID_BACKEND ?? 'sim_anneal').toLowerCase();
const ANNEAL_STEPS = parseInt(process.env.QUANTUM_ANNEAL_STEPS ?? '64', 10);
const QISKIT_ENABLED = () => process.env.QISKIT_BRIDGE_ENABLED === 'true';
const PENNYLANE_ENABLED = () => process.env.PENNYLANE_BRIDGE_ENABLED === 'true';

/**
 * Map cost vector → classical energy for annealing.
 */
function energyOf(assignment, costMatrix) {
  let e = 0;
  for (let i = 0; i < assignment.length; i += 1) {
    const j = assignment[i];
    e += costMatrix[i]?.[j] ?? 1;
  }
  return e;
}

function shuffleAssignment(n, rng) {
  const a = Array.from({ length: n }, (_, i) => i % n);
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Simulated quantum annealing (classical fallback when no QPU / SDK bridge).
 */
export function simulateQuantumAnnealing({
  costMatrix,
  steps = ANNEAL_STEPS,
  seed = null,
} = {}) {
  const n = costMatrix?.length ?? 0;
  if (!n) {
    return { assignment: [], energy: 0, steps: 0, backend: 'sim_anneal', method: 'empty' };
  }
  const rng = mulberry32(
    seed ?? crypto.createHash('sha256').update(JSON.stringify(costMatrix)).digest().readUInt32BE(0),
  );
  let current = shuffleAssignment(n, rng);
  let best = current.slice();
  let bestE = energyOf(best, costMatrix);
  let curE = bestE;

  for (let s = 0; s < steps; s += 1) {
    const temp = 1 - s / steps;
    const i = Math.floor(rng() * n);
    const j = Math.floor(rng() * n);
    const next = current.slice();
    [next[i], next[j]] = [next[j], next[i]];
    const nextE = energyOf(next, costMatrix);
    const accept = nextE <= curE || rng() < Math.exp((curE - nextE) / Math.max(temp, 1e-6));
    if (accept) {
      current = next;
      curE = nextE;
      if (curE < bestE) {
        best = current.slice();
        bestE = curE;
      }
    }
  }

  return {
    assignment: best,
    energy: bestE,
    steps,
    backend: 'sim_anneal',
    method: 'simulated_quantum_annealing',
  };
}

/**
 * Build cost matrix for multi-agent resource allocation.
 * agents[i] × resources[j] → cost (lower is better).
 */
export function buildAllocationCostMatrix(agents = [], resources = []) {
  const n = Math.max(agents.length, resources.length, 1);
  const matrix = [];
  for (let i = 0; i < n; i += 1) {
    const row = [];
    const agent = agents[i % Math.max(agents.length, 1)] ?? { load: 0.5, priority: 1 };
    for (let j = 0; j < n; j += 1) {
      const res = resources[j % Math.max(resources.length, 1)] ?? { capacity: 1, latencyMs: 50 };
      const load = Number(agent.load ?? 0.5);
      const cap = Math.max(0.01, Number(res.capacity ?? 1));
      const lat = Number(res.latencyMs ?? 50) / 100;
      const prio = Number(agent.priority ?? 1);
      row.push(load / cap + lat / prio);
    }
    matrix.push(row);
  }
  return matrix;
}

/**
 * Combinatorial RAG pathfinding — choose ordered memory node indices minimizing cost.
 */
export function buildRagPathCostMatrix(nodes = [], queryEmbeddingHint = null) {
  const n = Math.max(nodes.length, 1);
  const matrix = Array.from({ length: n }, () => Array(n).fill(1));
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = 0; j < nodes.length; j += 1) {
      if (i === j) {
        matrix[i][j] = 0.01;
        continue;
      }
      const a = nodes[i];
      const b = nodes[j];
      const simPenalty = 1 - Math.min(1, Number(a.similarity ?? a.score ?? 0.5));
      const hop = Math.abs(i - j) * 0.05;
      const queryBias = queryEmbeddingHint
        ? Math.abs((Number(a.hash ?? i) % 100) / 100 - queryEmbeddingHint) * 0.2
        : 0;
      matrix[i][j] = simPenalty + hop + queryBias + (1 - Number(b.importance ?? 0.5)) * 0.3;
    }
  }
  return matrix;
}

/**
 * Resolve hybrid backend: optional external Qiskit/PennyLane bridge, else anneal.
 */
export async function runHybridOptimize(problem) {
  const backend = BACKEND();
  const t0 = process.hrtime.bigint();

  if (backend === 'qiskit' && QISKIT_ENABLED()) {
    try {
      const out = await invokeExternalBridge('qiskit', problem);
      return finalize(out, t0, 'qiskit');
    } catch (err) {
      logger.warn(`[QuantumHybrid] qiskit bridge failed, annealing: ${err.message}`);
    }
  }
  if (backend === 'pennylane' && PENNYLANE_ENABLED()) {
    try {
      const out = await invokeExternalBridge('pennylane', problem);
      return finalize(out, t0, 'pennylane');
    } catch (err) {
      logger.warn(`[QuantumHybrid] pennylane bridge failed, annealing: ${err.message}`);
    }
  }

  const annealed = simulateQuantumAnnealing({
    costMatrix: problem.costMatrix,
    steps: problem.steps,
    seed: problem.seed,
  });
  return finalize(annealed, t0, annealed.backend);
}

async function invokeExternalBridge(kind, problem) {
  // Placeholder for process spawn / HTTP to Qiskit Runtime or PennyLane Lightning.
  // Without SDK installed, refuse so caller falls back to annealing.
  const endpoint = process.env[`${kind.toUpperCase()}_BRIDGE_URL`];
  if (!endpoint) {
    throw new Error(`${kind} bridge URL unset`);
  }
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ problem: { ...problem, costMatrix: problem.costMatrix?.slice?.(0, 32) } }),
    signal: AbortSignal.timeout(parseInt(process.env.QUANTUM_BRIDGE_TIMEOUT_MS ?? '5000', 10)),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function finalize(result, t0, backend) {
  const elapsedMs = Number(process.hrtime.bigint() - t0) / 1e6;
  return {
    ...result,
    backend,
    elapsedMs,
    hybrid: true,
    classicalFallback: backend === 'sim_anneal',
  };
}

/**
 * Multi-agent resource allocation via hybrid solver.
 */
export async function allocateAgentResources({ agents = [], resources = [], seed } = {}) {
  const costMatrix = buildAllocationCostMatrix(agents, resources);
  const solved = await runHybridOptimize({ costMatrix, seed, kind: 'resource_allocation' });
  const mapping = solved.assignment.map((resIdx, agentIdx) => ({
    agent: agents[agentIdx % Math.max(agents.length, 1)]?.id ?? `agent-${agentIdx}`,
    resource: resources[resIdx % Math.max(resources.length, 1)]?.id ?? `res-${resIdx}`,
    cost: costMatrix[agentIdx]?.[resIdx] ?? null,
  }));
  return { ...solved, mapping, problem: 'multi_agent_allocation' };
}

/**
 * Combinatorial RAG path selection.
 */
export async function optimizeRagPath({ nodes = [], queryText = '', topK = 5 } = {}) {
  const hint = crypto.createHash('sha1').update(queryText).digest()[0] / 255;
  const costMatrix = buildRagPathCostMatrix(nodes, hint);
  const solved = await runHybridOptimize({ costMatrix, kind: 'rag_pathfinding' });
  const ordered = solved.assignment
    .map((idx) => nodes[idx])
    .filter(Boolean)
    .slice(0, topK);
  return { ...solved, path: ordered, problem: 'rag_pathfinding' };
}

/**
 * Hyper-parameter tuning for context distillation via annealing.
 * Searches tokenBudget × clusterSize neighborhood.
 */
export async function tuneDistillationHyperparams({
  samples = [],
  budgetMin = 800,
  budgetMax = 2400,
  clusterMin = 4,
  clusterMax = 16,
} = {}) {
  const gridBudget = [budgetMin, Math.round((budgetMin + budgetMax) / 2), budgetMax];
  const gridCluster = [clusterMin, Math.round((clusterMin + clusterMax) / 2), clusterMax];
  const candidates = [];
  for (const tokenBudget of gridBudget) {
    for (const clusterSize of gridCluster) {
      candidates.push({ tokenBudget, clusterSize });
    }
  }

  // Cost = estimated overflow risk + under-recall
  const costMatrix = candidates.map((c, i) =>
    candidates.map((d, j) => {
      const overflow = Math.max(0, c.tokenBudget - 1800) / 1800;
      const under = Math.max(0, 8 - c.clusterSize) / 8;
      const samplePenalty = samples.length
        ? Math.abs((samples.length % 7) - (c.clusterSize % 7)) * 0.05
        : 0;
      return overflow + under + samplePenalty + Math.abs(i - j) * 0.01;
    }),
  );

  const solved = await runHybridOptimize({ costMatrix, kind: 'distill_hparams' });
  const best = candidates[solved.assignment[0]] ?? candidates[0];
  return {
    ...solved,
    hyperparams: best,
    problem: 'distillation_hyperparams',
    candidatesEvaluated: candidates.length,
  };
}

export function getQuantumHybridConfig() {
  return {
    backend: BACKEND(),
    annealSteps: ANNEAL_STEPS,
    qiskit: QISKIT_ENABLED(),
    pennylane: PENNYLANE_ENABLED(),
    techniques: [
      'simulated_quantum_annealing',
      'multi_agent_allocation',
      'rag_pathfinding',
      'distillation_hparam_tuning',
    ],
  };
}

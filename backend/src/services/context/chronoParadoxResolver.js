/**
 * Phase 44 — Temporal paradox resolution & chrono-state synchronization.
 * Reconciles non-linear memory branches from deep-space / deep-sea edge nodes.
 */

import crypto from 'crypto';
import { logger } from '../../utils/logger.js';
import { recordTemporalMemory } from '../context/temporalKnowledgeGraph.js';

const branches = new Map(); // branchId → { nodeId, memories[], vectorClock }

/**
 * Register a disconnected edge node's memory branch (non-linear time).
 */
export function openChronoBranch({
  nodeId,
  environment = 'deep-space',
  baseVectorClock = {},
} = {}) {
  const branchId = crypto.randomUUID();
  const branch = {
    branchId,
    nodeId,
    environment,
    vectorClock: { ...baseVectorClock, [nodeId]: 0 },
    memories: [],
    status: 'open',
    openedAt: new Date().toISOString(),
  };
  branches.set(branchId, branch);
  return branch;
}

/**
 * Append a memory event on a branch with vector-clock tick.
 */
export function appendChronoEvent(branchId, {
  content,
  validFrom = new Date().toISOString(),
  importance = 0.5,
  characterId = null,
  userId = null,
} = {}) {
  const branch = branches.get(branchId);
  if (!branch) throw new Error(`Unknown chrono branch ${branchId}`);
  branch.vectorClock[branch.nodeId] = (branch.vectorClock[branch.nodeId] ?? 0) + 1;
  const event = {
    id: crypto.randomUUID(),
    content,
    validFrom,
    importance,
    characterId,
    userId,
    vectorClock: { ...branch.vectorClock },
    branchId,
  };
  branch.memories.push(event);
  return event;
}

/**
 * Detect chronological conflicts between two memory events (same logical key, divergent clocks).
 */
export function detectChronoConflicts(localEvents = [], remoteEvents = []) {
  const conflicts = [];
  const byContentKey = (e) =>
    crypto.createHash('sha1').update(String(e.content ?? '').slice(0, 80)).digest('hex').slice(0, 12);

  const localMap = new Map(localEvents.map((e) => [byContentKey(e), e]));
  for (const remote of remoteEvents) {
    const key = byContentKey(remote);
    const local = localMap.get(key);
    if (!local) continue;
    if (local.validFrom !== remote.validFrom || JSON.stringify(local.vectorClock) !== JSON.stringify(remote.vectorClock)) {
      const concurrent = isConcurrent(local.vectorClock, remote.vectorClock);
      if (concurrent || local.validFrom !== remote.validFrom) {
        conflicts.push({ key, local, remote, concurrent });
      }
    }
  }
  return conflicts;
}

function isConcurrent(a = {}, b = {}) {
  let aDom = false;
  let bDom = false;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const av = a[k] ?? 0;
    const bv = b[k] ?? 0;
    if (av > bv) aDom = true;
    if (bv > av) bDom = true;
  }
  return aDom && bDom;
}

/**
 * Resolve conflicts: last-writer-wins by validFrom, with importance tie-break;
 * concurrent → merge branch via EVOLVED_INTO-style synthetic memory.
 */
export function resolveChronoConflicts(conflicts = []) {
  const resolutions = [];
  for (const c of conflicts) {
    const { local, remote } = c;
    let winner;
    let strategy;
    if (c.concurrent) {
      strategy = 'merge_branch';
      winner = {
        content: `[chrono-merge] ${local.content} ‖ ${remote.content}`,
        validFrom: new Date(
          Math.max(Date.parse(local.validFrom), Date.parse(remote.validFrom)),
        ).toISOString(),
        importance: Math.max(local.importance ?? 0, remote.importance ?? 0) + 0.05,
        characterId: local.characterId ?? remote.characterId,
        userId: local.userId ?? remote.userId,
        parents: [local.id, remote.id],
      };
    } else {
      const localT = Date.parse(local.validFrom);
      const remoteT = Date.parse(remote.validFrom);
      if (remoteT > localT || (remoteT === localT && (remote.importance ?? 0) >= (local.importance ?? 0))) {
        winner = remote;
        strategy = 'lww_remote';
      } else {
        winner = local;
        strategy = 'lww_local';
      }
    }
    resolutions.push({ key: c.key, strategy, winner, concurrent: c.concurrent });
  }
  return resolutions;
}

/**
 * Sync a remote branch into the global substrate (temporal KG + conflict resolve).
 */
export async function syncChronoBranchToGlobal({
  branchId,
  globalMemories = [],
  persist = true,
} = {}) {
  const branch = branches.get(branchId);
  if (!branch) throw new Error(`Unknown chrono branch ${branchId}`);

  const conflicts = detectChronoConflicts(globalMemories, branch.memories);
  const resolutions = resolveChronoConflicts(conflicts);

  const applied = [];
  if (persist) {
    for (const r of resolutions) {
      const w = r.winner;
      try {
        const recorded = await recordTemporalMemory({
          characterId: w.characterId ?? 'chrono-global',
          userId: w.userId,
          content: w.content,
          importance: w.importance ?? 0.5,
          previousMemoryId: w.parents?.[0] ?? null,
          evolutionReason: r.strategy,
          at: w.validFrom,
          topics: ['chrono-sync', branch.environment],
        });
        applied.push({ strategy: r.strategy, memoryId: recorded?.memoryId ?? recorded?.id ?? null });
      } catch (err) {
        applied.push({ strategy: r.strategy, error: err.message });
      }
    }
    // Also ingest non-conflicting remote-only memories
    const conflictKeys = new Set(conflicts.map((c) => c.key));
    const keyOf = (e) =>
      crypto.createHash('sha1').update(String(e.content ?? '').slice(0, 80)).digest('hex').slice(0, 12);
    for (const m of branch.memories) {
      if (conflictKeys.has(keyOf(m))) continue;
      try {
        await recordTemporalMemory({
          characterId: m.characterId ?? 'chrono-global',
          userId: m.userId,
          content: m.content,
          importance: m.importance,
          at: m.validFrom,
          topics: ['chrono-sync', branch.environment],
        });
        applied.push({ strategy: 'append_remote', id: m.id });
      } catch (err) {
        applied.push({ strategy: 'append_remote', error: err.message });
      }
    }
  }

  branch.status = 'synced';
  branch.syncedAt = new Date().toISOString();

  logger.info(
    `[Chrono] sync branch=${branchId.slice(0, 8)} conflicts=${conflicts.length} applied=${applied.length}`,
  );

  return {
    branchId,
    environment: branch.environment,
    conflicts: conflicts.length,
    resolutions,
    applied,
    vectorClock: branch.vectorClock,
    engine: 'chrono-paradox/v1',
  };
}

export function getChronoConfig() {
  return {
    openBranches: [...branches.values()].filter((b) => b.status === 'open').length,
    totalBranches: branches.size,
    strategies: ['lww_local', 'lww_remote', 'merge_branch'],
    environments: ['deep-space', 'deep-sea', 'orbital', 'maritime'],
  };
}

/** Test helper */
export function resetChronoBranches() {
  branches.clear();
}

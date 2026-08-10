/**
 * Phase 37 — Agent-to-Agent (A2A) discovery + Agent Communication Protocol (ACP).
 * Local sub-agents discover capabilities and delegate to enterprise agents without glue code.
 */

import crypto from 'crypto';
import { AppError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { AGENT_ROLES, issueAgentIdentity } from '../mcp/agentIdentityService.js';
import { executeAgentTool } from '../ai/agentTools.js';

const ACP_VERSION = '1.0';
const registry = new Map(); // agentId -> AgentCard

/** Built-in local cards (Status swarm). */
const LOCAL_CARDS = [
  {
    agentId: 'status.research',
    name: 'Research Agent',
    version: '37.0.0',
    role: 'research',
    endpoint: 'local://research',
    capabilities: ['web:search', 'memory:read', 'mesh:read', 'lore:retrieve'],
    acp: { version: ACP_VERSION, methods: ['task/delegate', 'capability/query', 'ping'] },
    enterprise: false,
  },
  {
    agentId: 'status.dialogue',
    name: 'Dialogue Agent',
    version: '37.0.0',
    role: 'dialogue',
    endpoint: 'local://dialogue',
    capabilities: ['memory:read', 'memory:write', 'messages:write'],
    acp: { version: ACP_VERSION, methods: ['task/delegate', 'capability/query', 'ping'] },
    enterprise: false,
  },
  {
    agentId: 'status.tools',
    name: 'Tools Agent',
    version: '37.0.0',
    role: 'tools',
    endpoint: 'local://tools',
    capabilities: ['calendar:write', 'links:write', 'sandbox:execute'],
    acp: { version: ACP_VERSION, methods: ['task/delegate', 'capability/query', 'ping'] },
    enterprise: false,
  },
  {
    agentId: 'status.transaction',
    name: 'Transaction Agent',
    version: '37.0.0',
    role: 'transaction',
    endpoint: 'local://transaction',
    capabilities: ['wallet:debit', 'escrow:create', 'compute:hire'],
    acp: { version: ACP_VERSION, methods: ['task/delegate', 'capability/query', 'ping'] },
    enterprise: false,
  },
];

function ensureLocals() {
  for (const card of LOCAL_CARDS) {
    if (!registry.has(card.agentId)) {
      registry.set(card.agentId, { ...card, registeredAt: new Date().toISOString() });
    }
  }
}

/**
 * Register an agent card (local or external enterprise).
 */
export function registerAgentCard(card) {
  if (!card?.agentId || !card?.capabilities) {
    throw new AppError('agentId and capabilities required', 400, 'A2A_INVALID_CARD');
  }
  const entry = {
    agentId: card.agentId,
    name: card.name ?? card.agentId,
    version: card.version ?? '1.0.0',
    role: card.role ?? 'external',
    endpoint: card.endpoint ?? null,
    capabilities: [...card.capabilities],
    acp: {
      version: ACP_VERSION,
      methods: card.acp?.methods ?? ['task/delegate', 'capability/query', 'ping'],
    },
    enterprise: Boolean(card.enterprise ?? card.endpoint?.startsWith('https://')),
    metadata: card.metadata ?? {},
    registeredAt: new Date().toISOString(),
  };
  registry.set(entry.agentId, entry);
  logger.info(`[A2A] registered ${entry.agentId} caps=${entry.capabilities.length}`);
  return entry;
}

export function listAgentCards({ capability = null, enterprise = null } = {}) {
  ensureLocals();
  let cards = [...registry.values()];
  if (capability) {
    cards = cards.filter((c) => c.capabilities.includes(capability));
  }
  if (enterprise === true) cards = cards.filter((c) => c.enterprise);
  if (enterprise === false) cards = cards.filter((c) => !c.enterprise);
  return cards;
}

export function discoverAgentsForTask({ task, requiredCapabilities = [] }) {
  ensureLocals();
  const text = String(task ?? '').toLowerCase();
  const needed = new Set(requiredCapabilities);

  if (/search|research|lore|wiki/.test(text)) needed.add('web:search');
  if (/calendar|schedule|remind/.test(text)) needed.add('calendar:write');
  if (/pay|escrow|wallet|hire/.test(text)) needed.add('escrow:create');

  const scored = listAgentCards().map((card) => {
    const overlap = needed.size === 0
      ? []
      : card.capabilities.filter((c) => needed.has(c));
    let score = needed.size === 0 ? 1 : overlap.length;
    if (needed.size === 0 && !card.enterprise) score += 0.1;
    if (card.enterprise && overlap.length) score += 0.5;
    return { card, score, matched: overlap };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((s) => ({
      agentId: s.card.agentId,
      name: s.card.name,
      endpoint: s.card.endpoint,
      enterprise: s.card.enterprise,
      matchedCapabilities: s.matched,
      score: s.score,
    }));
}

/**
 * ACP envelope — standard message between agents.
 */
export function createAcpMessage({
  from,
  to,
  method,
  params = {},
  correlationId = null,
}) {
  return {
    acp: ACP_VERSION,
    id: crypto.randomUUID(),
    correlationId: correlationId ?? crypto.randomUUID(),
    from,
    to,
    method,
    params,
    ts: Date.now(),
  };
}

/**
 * Dispatch ACP method to local or remote agent.
 */
export async function dispatchAcp(message, ctx = {}) {
  const { assertAgentsNotKilled } = await import('../security/globalKillSwitchService.js');
  assertAgentsNotKilled();

  ensureLocals();
  const card = registry.get(message.to);
  if (!card) {
    throw new AppError(`Unknown A2A agent: ${message.to}`, 404, 'A2A_AGENT_NOT_FOUND');
  }

  if (!card.acp.methods.includes(message.method) && message.method !== 'ping') {
    throw new AppError(`Method ${message.method} not supported by ${card.agentId}`, 400, 'ACP_METHOD');
  }

  logger.info(`[ACP] ${message.from} → ${message.to} method=${message.method}`);

  switch (message.method) {
    case 'ping':
      return { ok: true, agentId: card.agentId, acp: ACP_VERSION };

    case 'capability/query':
      return { agentId: card.agentId, capabilities: card.capabilities, role: card.role };

    case 'task/delegate':
      return executeDelegatedTask(card, message.params, ctx);

    default:
      throw new AppError(`Unhandled ACP method ${message.method}`, 400, 'ACP_UNKNOWN');
  }
}

async function executeDelegatedTask(card, params, ctx) {
  const task = params.task ?? params.message ?? '';
  const tool = params.tool;

  // External enterprise — HTTP ACP
  if (card.enterprise && card.endpoint?.startsWith('http')) {
    const res = await fetch(card.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Acp-Version': ACP_VERSION,
        'A2A-Agent-Id': card.agentId,
      },
      body: JSON.stringify({ method: 'task/delegate', params }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new AppError(`Enterprise agent error ${res.status}: ${text}`, 502, 'A2A_REMOTE_ERROR');
    }
    return { delegated: true, enterprise: true, result: await res.json() };
  }

  // Local — map role to tools / identity
  const identity = issueAgentIdentity({
    agentRole: AGENT_ROLES[card.role] ? card.role : 'research',
    characterId: ctx.characterId,
    userId: ctx.userId,
  });

  if (tool) {
    const output = await executeAgentTool(tool, params.arguments ?? {}, {
      userId: ctx.userId,
      characterId: ctx.characterId,
      mcpIdentity: identity.identity,
    });
    return { delegated: true, enterprise: false, agentId: card.agentId, tool, output };
  }

  // Capability-driven auto tool
  if (card.capabilities.includes('web:search') && task) {
    const output = await executeAgentTool('web_search', { query: task, max_results: 3 }, {
      userId: ctx.userId,
      characterId: ctx.characterId,
      mcpIdentity: identity.identity,
    });
    return { delegated: true, enterprise: false, agentId: card.agentId, tool: 'web_search', output };
  }

  return {
    delegated: true,
    enterprise: false,
    agentId: card.agentId,
    result: { acknowledged: true, task, role: card.role },
  };
}

/**
 * Discover + delegate in one shot (no custom glue).
 */
export async function discoverAndDelegate({
  task,
  requiredCapabilities = [],
  from = 'status.coordinator',
  preferEnterprise = false,
  ctx = {},
  tool = null,
  arguments: args = {},
}) {
  const candidates = discoverAgentsForTask({ task, requiredCapabilities });
  if (!candidates.length) {
    throw new AppError('No A2A agents match task', 404, 'A2A_NO_CANDIDATES');
  }

  let chosen = candidates[0];
  if (preferEnterprise) {
    chosen = candidates.find((c) => c.enterprise) ?? chosen;
  }

  const message = createAcpMessage({
    from,
    to: chosen.agentId,
    method: 'task/delegate',
    params: { task, tool, arguments: args },
  });

  const result = await dispatchAcp(message, ctx);
  return { discovery: candidates, chosen, message, result };
}

export function getA2aConfig() {
  ensureLocals();
  return {
    acpVersion: ACP_VERSION,
    registered: registry.size,
    local: LOCAL_CARDS.length,
    discovery: 'capability-match',
  };
}

/** Test helper */
export function _resetA2aRegistry() {
  registry.clear();
  ensureLocals();
}

export { ACP_VERSION, LOCAL_CARDS };

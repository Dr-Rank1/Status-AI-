/**
 * Phase 34 — MCP tool/resource discovery cache (ttlMs + cacheScope).
 * Backed by Redis when available; process-local Map otherwise (serverless-safe per isolate).
 */

import crypto from 'crypto';
import { getRedis } from '../../config/redis.js';
import { AGENT_TOOL_DEFINITIONS } from '../ai/agentTools.js';
import { AGENT_ROLES } from './agentIdentityService.js';

const DEFAULT_TTL_MS = parseInt(process.env.MCP_TOOL_CACHE_TTL_MS ?? '120000', 10);
const memory = new Map();

export function getCacheMeta({ cacheScope = 'global', ttlMs = DEFAULT_TTL_MS } = {}) {
  return {
    cache: {
      cacheScope,
      ttlMs,
      protocol: '2026-07-28',
      cacheableListResults: true,
    },
  };
}

function cacheKey({ cacheScope, tenantId, agentRole }) {
  const parts = ['mcp:tools', cacheScope, tenantId ?? '-', agentRole ?? '-'];
  return parts.join(':');
}

function toolsForRole(agentRole) {
  if (!agentRole || !AGENT_ROLES[agentRole]) {
    return AGENT_TOOL_DEFINITIONS;
  }

  const scopes = new Set(AGENT_ROLES[agentRole].scopes);
  return AGENT_TOOL_DEFINITIONS.filter((def) => {
    const name = def.function?.name;
    if (name === 'web_search') return scopes.has('web:search') || scopes.has('memory:read');
    if (name === 'create_calendar_event') return scopes.has('calendar:write');
    if (name === 'generate_external_link') return scopes.has('links:write');
    if (name === 'run_sandboxed_script') return scopes.has('sandbox:execute');
    if (name === 'ros2_read_sensors') return scopes.has('robot:sense');
    if (name === 'ros2_publish_cmd') return scopes.has('robot:actuate');
    if (name === 'ros2_bind_embodiment') return scopes.has('robot:embody');
    if (name === 'quantum_hybrid_optimize') return scopes.has('compute:hybrid');
    return true;
  });
}

/**
 * Cacheable tools/list — MCP 2026-07-28 list results with ttlMs / cacheScope.
 */
export async function listCachedTools({
  cacheScope = 'global',
  tenantId = null,
  agentRole = null,
  ttlMs = DEFAULT_TTL_MS,
} = {}) {
  const key = cacheKey({ cacheScope, tenantId, agentRole });
  const ttl = Math.max(1_000, Math.min(ttlMs ?? DEFAULT_TTL_MS, 3_600_000));

  const cached = await readCache(key);
  if (cached) {
    return {
      ...cached,
      _meta: {
        ...getCacheMeta({ cacheScope, ttlMs: ttl }),
        cacheHit: true,
      },
    };
  }

  const tools = toolsForRole(agentRole).map((t) => ({
    name: t.function.name,
    description: t.function.description,
    inputSchema: t.function.parameters,
  }));

  const payload = {
    tools,
    nextCursor: null,
    etag: crypto.createHash('sha256').update(JSON.stringify(tools)).digest('hex').slice(0, 16),
  };

  await writeCache(key, payload, ttl);

  return {
    ...payload,
    _meta: {
      ...getCacheMeta({ cacheScope, ttlMs: ttl }),
      cacheHit: false,
    },
  };
}

async function readCache(key) {
  const redis = getRedis();
  if (redis) {
    try {
      const raw = await redis.get(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      /* fall through */
    }
  }
  const entry = memory.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    memory.delete(key);
    return null;
  }
  return entry.value;
}

async function writeCache(key, value, ttlMs) {
  const redis = getRedis();
  if (redis) {
    try {
      await redis.set(key, JSON.stringify(value), { PX: ttlMs });
      return;
    } catch {
      /* fall through */
    }
  }
  memory.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export async function invalidateToolCache(pattern = 'mcp:tools:*') {
  const redis = getRedis();
  if (redis) {
    try {
      const keys = await redis.keys(pattern);
      if (keys.length) await redis.del(keys);
    } catch {
      /* ignore */
    }
  }
  for (const k of memory.keys()) {
    if (k.startsWith('mcp:tools')) memory.delete(k);
  }
  return { invalidated: true, pattern };
}

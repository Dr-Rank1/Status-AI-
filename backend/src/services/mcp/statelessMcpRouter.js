/**
 * Phase 34 — Stateless MCP router (protocol 2026-07-28).
 * Header-based routing: Mcp-Method + Mcp-Name (no persistent sessions).
 */

import { AppError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { AGENT_TOOL_DEFINITIONS, executeAgentTool } from '../ai/agentTools.js';
import { contextEngine, computeDynamicRagWeights } from '../context/ContextEngine.js';
import { verifyAgentIdentity, assertAgentScope } from './agentIdentityService.js';
import {
  listCachedTools,
  invalidateToolCache,
  getCacheMeta,
} from './toolDiscoveryCache.js';
import {
  pauseForHuman,
  resumeFromHuman,
  getMrtrState,
} from './mrtrStateService.js';

export const MCP_PROTOCOL_VERSION = '2026-07-28';

const SUPPORTED_METHODS = new Set([
  'initialize',
  'tools/list',
  'tools/call',
  'resources/list',
  'resources/read',
  'prompts/get',
  'context/assemble',
  'mrtr/pause',
  'mrtr/resume',
  'mrtr/get',
  'ping',
]);

/**
 * Normalize MCP headers (Express lowercases them).
 */
export function extractMcpHeaders(req) {
  const h = req.headers ?? {};
  return {
    method: h['mcp-method'] ?? req.body?.method ?? null,
    name: h['mcp-name'] ?? req.body?.name ?? req.body?.params?.name ?? null,
    protocolVersion: h['mcp-protocol-version'] ?? MCP_PROTOCOL_VERSION,
    sessionHint: h['mcp-session-id'] ?? null, // ignored in stateless mode
    requestId: h['mcp-request-id'] ?? req.body?.id ?? null,
    cacheScope: h['mcp-cache-scope'] ?? req.body?.cacheScope ?? 'global',
  };
}

export function assertStateless(req) {
  const session = req.headers?.['mcp-session-id'];
  if (session && process.env.MCP_ALLOW_LEGACY_SESSIONS !== 'true') {
    throw new AppError(
      'MCP 2026-07-28 is stateless; omit Mcp-Session-Id (use MRTR requestState instead)',
      400,
      'MCP_STATEFUL_REJECTED',
    );
  }
}

/**
 * Dispatch a single stateless MCP invocation.
 */
export async function dispatchMcp({
  method,
  name = null,
  params = {},
  identity = null,
  user = null,
  tenantId = null,
  cacheScope = 'global',
  requestId = null,
}) {
  if (!method || !SUPPORTED_METHODS.has(method)) {
    throw new AppError(
      `Unsupported Mcp-Method: ${method ?? '(missing)'}`,
      400,
      'MCP_UNKNOWN_METHOD',
    );
  }

  logger.info(`[MCP/${MCP_PROTOCOL_VERSION}] method=${method} name=${name ?? '-'} req=${requestId ?? '-'}`);

  switch (method) {
    case 'initialize':
      return {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {
          tools: { listChanged: false, cacheable: true },
          resources: { subscribe: false, cacheable: true },
          prompts: {},
          mrtr: { humanInTheLoop: true },
          experimental: { serverlessSwarm: true },
        },
        serverInfo: {
          name: 'status-mcp-gateway',
          version: '34.0.0',
          mode: 'stateless',
        },
        instructions:
          'Stateless MCP: route every call with Mcp-Method / Mcp-Name headers. Use mrtr/* for HITL.',
      };

    case 'ping':
      return { ok: true, protocolVersion: MCP_PROTOCOL_VERSION, ts: Date.now() };

    case 'tools/list': {
      const listed = await listCachedTools({
        cacheScope,
        tenantId,
        agentRole: identity?.role ?? null,
        ttlMs: params.ttlMs,
      });
      return listed;
    }

    case 'tools/call': {
      const toolName = name ?? params.name;
      if (!toolName) {
        throw new AppError('Mcp-Name required for tools/call', 400, 'MCP_NAME_REQUIRED');
      }
      if (identity) {
        const scopeHint = toolScopeFor(toolName);
        if (scopeHint) assertAgentScope(identity, scopeHint);
      }
      const args = params.arguments ?? params.args ?? {};
      const result = await executeAgentTool(toolName, args, {
        userId: user?.id ?? identity?.userId,
        characterId: params.characterId ?? identity?.characterId,
        threadId: params.threadId,
        mcpIdentity: identity,
      });
      return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
    }

    case 'resources/list':
      return {
        resources: [
          {
            uri: 'status://context/engine',
            name: 'ContextEngine',
            description: 'Stateless prompt + dynamic RAG assembly',
            mimeType: 'application/json',
          },
          {
            uri: 'status://agents/roles',
            name: 'AgentRoles',
            description: 'MCP RBAC role catalog',
            mimeType: 'application/json',
          },
        ],
        _meta: getCacheMeta({ cacheScope, ttlMs: params.ttlMs ?? 60_000 }),
      };

    case 'resources/read': {
      const uri = name ?? params.uri;
      if (uri === 'status://context/engine') {
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify({
                engine: 'ContextEngine/v1',
                protocol: MCP_PROTOCOL_VERSION,
                rag: computeDynamicRagWeights(params),
              }),
            },
          ],
        };
      }
      if (uri === 'status://agents/roles') {
        const { AGENT_ROLES } = await import('./agentIdentityService.js');
        return {
          contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(AGENT_ROLES) }],
        };
      }
      throw new AppError(`Unknown resource: ${uri}`, 404, 'MCP_RESOURCE_NOT_FOUND');
    }

    case 'prompts/get':
    case 'context/assemble': {
      const character = params.character ?? {
        name: params.characterName ?? 'Guide',
        personality: {},
      };
      const mode = params.mode ?? 'dm';
      const pack = contextEngine.materializeStateless({
        character,
        user: user ?? { display_name: 'User' },
        context: {
          character,
          relationship: params.relationship ?? { affinity: 0 },
          vectorMemories: params.vectorMemories ?? [],
          recentMessages: params.recentMessages ?? [],
          affectiveContext: params.affectiveContext,
          bciIntent: params.bciIntent,
        },
        incomingMessage: params.message ?? params.incomingMessage ?? '',
        mode,
        protocolVersion: MCP_PROTOCOL_VERSION,
      });
      return pack;
    }

    case 'mrtr/pause':
      return pauseForHuman({
        reason: params.reason ?? 'human_validation',
        prompt: params.prompt ?? 'Please confirm this agent action.',
        pendingAction: params.pendingAction ?? {},
        identity,
        userId: user?.id ?? identity?.userId,
        characterId: params.characterId ?? identity?.characterId,
        ttlMs: params.ttlMs,
      });

    case 'mrtr/resume':
      return resumeFromHuman({
        requestStateId: params.requestStateId ?? params.id ?? name,
        decision: params.decision ?? 'approve',
        userResponse: params.userResponse ?? null,
        identity,
      });

    case 'mrtr/get':
      return getMrtrState(params.requestStateId ?? params.id ?? name);

    default:
      throw new AppError(`Unhandled method ${method}`, 500, 'MCP_DISPATCH_ERROR');
  }
}

function toolScopeFor(toolName) {
  const map = {
    web_search: 'web:search',
    create_calendar_event: 'calendar:write',
    generate_external_link: 'links:write',
    run_sandboxed_script: 'sandbox:execute',
  };
  return map[toolName] ?? null;
}

/**
 * Express middleware — single MCP gateway endpoint.
 * Reads Mcp-Method / Mcp-Name; optional MCP agent token.
 */
export function mcpStatelessRouterMiddleware() {
  return async (req, res, next) => {
    try {
      assertStateless(req);
      const headers = extractMcpHeaders(req);

      let identity = req.mcpAgent ?? null;
      const auth = req.headers.authorization ?? '';
      const token =
        (auth.startsWith('MCP ') ? auth.slice(4) : null)
        ?? req.headers['x-mcp-agent-token']
        ?? null;
      if (token && !identity) {
        identity = verifyAgentIdentity(token);
        req.mcpAgent = identity;
      }

      const params = {
        ...(req.body?.params ?? {}),
        ...(req.body ?? {}),
      };
      delete params.params;
      delete params.method;
      delete params.jsonrpc;

      const result = await dispatchMcp({
        method: headers.method,
        name: headers.name,
        params,
        identity,
        user: req.user ?? null,
        tenantId: req.tenantId ?? null,
        cacheScope: headers.cacheScope,
        requestId: headers.requestId,
      });

      const cacheMeta = result?._meta?.cache;
      if (cacheMeta?.ttlMs) {
        res.setHeader('Cache-Control', `public, max-age=${Math.floor(cacheMeta.ttlMs / 1000)}`);
        res.setHeader('Mcp-Cache-Scope', cacheMeta.cacheScope ?? headers.cacheScope);
        res.setHeader('Mcp-Cache-Ttl-Ms', String(cacheMeta.ttlMs));
      }

      res.setHeader('Mcp-Protocol-Version', MCP_PROTOCOL_VERSION);
      res.setHeader('Mcp-Transport', 'stateless-http');
      if (headers.requestId) res.setHeader('Mcp-Request-Id', String(headers.requestId));

      res.json({
        jsonrpc: '2.0',
        id: headers.requestId ?? null,
        result,
      });
    } catch (err) {
      next(err);
    }
  };
}

export function invalidateMcpToolCache(scope) {
  return invalidateToolCache(scope);
}

export { AGENT_TOOL_DEFINITIONS, SUPPORTED_METHODS };

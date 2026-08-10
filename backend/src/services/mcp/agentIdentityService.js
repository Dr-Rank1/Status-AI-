/**
 * Phase 33 — MCP agent identity + cryptographic RBAC scopes.
 */

import crypto from 'crypto';
import { AppError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';

const MCP_PEPPER = process.env.MCP_IDENTITY_PEPPER ?? process.env.JWT_SECRET ?? 'status-mcp-pepper';

/** Sub-agent role catalog — least privilege. */
export const AGENT_ROLES = {
  research: {
    role: 'research',
    scopes: ['memory:read', 'web:search', 'mesh:read', 'characters:read'],
    dbPermissions: ['SELECT'],
    description: 'Read-only research / lore retrieval',
  },
  dialogue: {
    role: 'dialogue',
    scopes: ['memory:read', 'memory:write', 'messages:write', 'characters:read'],
    dbPermissions: ['SELECT', 'INSERT'],
    description: 'Conversational synthesis',
  },
  tools: {
    role: 'tools',
    scopes: [
      'calendar:write',
      'links:write',
      'sandbox:execute',
      'robot:sense',
      'robot:actuate',
      'robot:embody',
      'compute:hybrid',
    ],
    dbPermissions: ['SELECT'],
    description: 'Calendar / link / sandbox / ROS2 / hybrid-compute tools',
  },
  transaction: {
    role: 'transaction',
    scopes: [
      'wallet:read',
      'wallet:debit',
      'wallet:credit',
      'escrow:create',
      'escrow:release',
      'compute:hire',
    ],
    dbPermissions: ['SELECT', 'UPDATE'],
    description: 'Wallet / escrow / compute marketplace',
  },
  coordinator: {
    role: 'coordinator',
    scopes: ['agents:spawn', 'memory:read', 'mesh:read'],
    dbPermissions: ['SELECT'],
    description: 'Multi-agent orchestration',
  },
};

export function issueAgentIdentity({
  agentRole,
  characterId = null,
  userId = null,
  ttlSec = 3600,
  extraScopes = [],
}) {
  const catalog = AGENT_ROLES[agentRole];
  if (!catalog) {
    throw new AppError(`Unknown agent role: ${agentRole}`, 400, 'MCP_UNKNOWN_ROLE');
  }

  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + ttlSec;
  const scopes = [...new Set([...catalog.scopes, ...extraScopes])];

  const body = {
    v: 1,
    role: catalog.role,
    scopes,
    dbPermissions: catalog.dbPermissions,
    characterId,
    userId,
    iat: issuedAt,
    exp: expiresAt,
    jti: crypto.randomUUID(),
  };

  const payload = Buffer.from(JSON.stringify(body)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', MCP_PEPPER)
    .update(payload)
    .digest('base64url');

  return {
    token: `mcp.${payload}.${signature}`,
    identity: body,
    role: catalog.role,
  };
}

export function verifyAgentIdentity(token) {
  if (!token || typeof token !== 'string' || !token.startsWith('mcp.')) {
    throw new AppError('Invalid MCP identity token', 401, 'MCP_UNAUTHORIZED');
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new AppError('Malformed MCP identity token', 401, 'MCP_UNAUTHORIZED');
  }

  const [, payload, signature] = parts;
  const expected = crypto.createHmac('sha256', MCP_PEPPER).update(payload).digest('base64url');
  try {
    if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) {
      throw new AppError('MCP signature mismatch', 401, 'MCP_UNAUTHORIZED');
    }
  } catch (err) {
    if (err.code === 'MCP_UNAUTHORIZED') throw err;
    throw new AppError('MCP signature mismatch', 401, 'MCP_UNAUTHORIZED');
  }

  const identity = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  if (identity.exp < Math.floor(Date.now() / 1000)) {
    throw new AppError('MCP identity expired', 401, 'MCP_EXPIRED');
  }

  return identity;
}

export function assertAgentScope(identity, requiredScope) {
  if (!identity?.scopes?.includes(requiredScope)) {
    throw new AppError(
      `Agent role '${identity?.role}' missing scope '${requiredScope}'`,
      403,
      'MCP_FORBIDDEN',
    );
  }
}

export function assertAgentDbPermission(identity, permission) {
  if (!identity?.dbPermissions?.includes(permission)) {
    throw new AppError(
      `Agent role '${identity?.role}' cannot ${permission} on database`,
      403,
      'MCP_DB_FORBIDDEN',
    );
  }
}

/**
 * Express middleware — reads Authorization: MCP <token> or X-MCP-Agent-Token.
 */
export function mcpAuthMiddleware(requiredScopes = []) {
  return (req, _res, next) => {
    try {
      const header = req.headers.authorization ?? '';
      const token =
        (header.startsWith('MCP ') ? header.slice(4) : null)
        ?? req.headers['x-mcp-agent-token']
        ?? null;

      if (!token) {
        throw new AppError('MCP agent identity required', 401, 'MCP_UNAUTHORIZED');
      }

      const identity = verifyAgentIdentity(token);
      for (const scope of requiredScopes) {
        assertAgentScope(identity, scope);
      }

      req.mcpAgent = identity;
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Wrap subagent execution with issued identity.
 */
export function withAgentIdentity(agentRole, ctx, fn) {
  const { token, identity } = issueAgentIdentity({
    agentRole,
    characterId: ctx.characterId ?? ctx.character?.id,
    userId: ctx.userId ?? ctx.user?.id,
  });

  logger.info(`[MCP] issued role=${agentRole} jti=${identity.jti}`);
  return fn({ token, identity });
}

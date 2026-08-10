/**
 * Phase 34 — Serverless agent swarm dispatcher.
 * Scales out via Cloudflare Workers / Cloud Run when MCP_SWARM_BACKEND is set;
 * otherwise executes in-process (scale-to-zero friendly: no sticky sessions).
 */

import { logger } from '../../utils/logger.js';
import { dispatchMcp } from './statelessMcpRouter.js';
import { planSubagents } from '../ai/multiAgentCoordinator.js';
import { withAgentIdentity } from './agentIdentityService.js';

const BACKEND = process.env.MCP_SWARM_BACKEND ?? 'local'; // local | cloudflare | cloudrun
const WORKER_URL = process.env.MCP_SWARM_WORKER_URL ?? '';
const CLOUDRUN_URL = process.env.MCP_SWARM_CLOUDRUN_URL ?? '';

export function getSwarmConfig() {
  return {
    backend: BACKEND,
    workerUrl: WORKER_URL || null,
    cloudRunUrl: CLOUDRUN_URL || null,
    scaleToZero: BACKEND !== 'local',
    protocolVersion: '2026-07-28',
    stickySessions: false,
  };
}

/**
 * Fan-out parallel MCP tool/agent calls across serverless workers when configured.
 */
export async function dispatchSwarm({
  incomingMessage,
  mode = 'dm',
  user = null,
  character = null,
  params = {},
}) {
  const plan = planSubagents({ incomingMessage, mode });
  const cfg = getSwarmConfig();

  logger.info(`[Swarm] backend=${cfg.backend} plan=${plan.join('+')} scaleToZero=${cfg.scaleToZero}`);

  const tasks = plan.map((role) =>
    withAgentIdentity(role === 'transaction' ? 'transaction' : role === 'dialogue' ? 'dialogue' : role, {
      characterId: character?.id,
      userId: user?.id,
    }, async ({ identity, token }) => {
      const payload = {
        method: role === 'research' ? 'tools/call' : 'context/assemble',
        name: role === 'research' ? 'web_search' : null,
        params: {
          ...params,
          message: incomingMessage,
          character,
          arguments: role === 'research' ? { query: incomingMessage, max_results: 3 } : undefined,
        },
        identity,
        user,
        role,
      };

      if (cfg.backend === 'cloudflare' && WORKER_URL) {
        return invokeRemote(WORKER_URL, payload, token);
      }
      if (cfg.backend === 'cloudrun' && CLOUDRUN_URL) {
        return invokeRemote(CLOUDRUN_URL, payload, token);
      }

      const result = await dispatchMcp({
        method: payload.method,
        name: payload.name,
        params: payload.params,
        identity,
        user,
      });
      return { role, result, backend: 'local' };
    }),
  );

  const results = await Promise.all(tasks);
  return {
    swarm: cfg,
    agents: results,
  };
}

async function invokeRemote(baseUrl, payload, mcpToken) {
  const url = `${baseUrl.replace(/\/$/, '')}/mcp`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Mcp-Method': payload.method,
      'Mcp-Protocol-Version': '2026-07-28',
      ...(payload.name ? { 'Mcp-Name': payload.name } : {}),
      ...(mcpToken ? { 'X-MCP-Agent-Token': mcpToken } : {}),
    },
    body: JSON.stringify(payload.params ?? {}),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Swarm remote ${res.status}: ${text}`);
  }

  const body = await res.json();
  return { role: payload.role, result: body.result ?? body, backend: BACKEND };
}

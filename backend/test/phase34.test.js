import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import {
  MCP_PROTOCOL_VERSION,
  extractMcpHeaders,
  assertStateless,
  dispatchMcp,
  SUPPORTED_METHODS,
} from '../src/services/mcp/statelessMcpRouter.js';
import { listCachedTools, invalidateToolCache } from '../src/services/mcp/toolDiscoveryCache.js';
import {
  pauseForHuman,
  resumeFromHuman,
  getMrtrState,
  _clearMrtrMemory,
} from '../src/services/mcp/mrtrStateService.js';
import { getSwarmConfig, dispatchSwarm } from '../src/services/mcp/serverlessSwarmDispatcher.js';
import { contextEngine } from '../src/services/context/ContextEngine.js';
import { issueAgentIdentity } from '../src/services/mcp/agentIdentityService.js';
import { AppError } from '../src/utils/errors.js';

describe('Phase 34 — Stateless MCP 2026-07-28', () => {
  it('exports protocol version and methods', () => {
    assert.equal(MCP_PROTOCOL_VERSION, '2026-07-28');
    assert.ok(SUPPORTED_METHODS.has('tools/list'));
    assert.ok(SUPPORTED_METHODS.has('mrtr/pause'));
  });

  it('extracts Mcp-Method / Mcp-Name headers', () => {
    const h = extractMcpHeaders({
      headers: {
        'mcp-method': 'tools/call',
        'mcp-name': 'web_search',
        'mcp-protocol-version': '2026-07-28',
      },
      body: {},
    });
    assert.equal(h.method, 'tools/call');
    assert.equal(h.name, 'web_search');
  });

  it('rejects legacy session headers in strict mode', () => {
    const prev = process.env.MCP_ALLOW_LEGACY_SESSIONS;
    delete process.env.MCP_ALLOW_LEGACY_SESSIONS;
    assert.throws(
      () => assertStateless({ headers: { 'mcp-session-id': 'abc' } }),
      (err) => err instanceof AppError && err.code === 'MCP_STATEFUL_REJECTED',
    );
    if (prev != null) process.env.MCP_ALLOW_LEGACY_SESSIONS = prev;
  });

  it('initialize returns stateless capabilities', async () => {
    const result = await dispatchMcp({ method: 'initialize' });
    assert.equal(result.protocolVersion, '2026-07-28');
    assert.equal(result.serverInfo.mode, 'stateless');
    assert.equal(result.capabilities.tools.cacheable, true);
    assert.equal(result.capabilities.mrtr.humanInTheLoop, true);
  });

  it('ContextEngine materializeStateless drops session', () => {
    const character = { name: 'Nova', personality: {} };
    const pack = contextEngine.materializeStateless({
      character,
      user: { display_name: 'Ada' },
      context: {
        character,
        relationship: { affinity: 1 },
        vectorMemories: [],
        recentMessages: [],
      },
      incomingMessage: 'hi',
      mode: 'dm',
    });
    assert.equal(pack.engine, 'ContextEngine/stateless');
    assert.equal(pack.session, null);
    assert.equal(pack.protocolVersion, '2026-07-28');
  });
});

describe('Phase 34 — Tool discovery cache', () => {
  before(async () => {
    await invalidateToolCache();
  });

  it('caches tools/list with ttlMs and cacheScope', async () => {
    const first = await listCachedTools({
      cacheScope: 'tenant',
      tenantId: 't1',
      agentRole: 'research',
      ttlMs: 60_000,
    });
    assert.ok(first.tools.length >= 1);
    assert.equal(first._meta.cache.cacheScope, 'tenant');
    assert.equal(first._meta.cache.ttlMs, 60_000);
    assert.equal(first._meta.cacheHit, false);

    const second = await listCachedTools({
      cacheScope: 'tenant',
      tenantId: 't1',
      agentRole: 'research',
      ttlMs: 60_000,
    });
    assert.equal(second._meta.cacheHit, true);
    assert.equal(second.etag, first.etag);
  });
});

describe('Phase 34 — MRTR pause / resume', () => {
  before(() => {
    _clearMrtrMemory();
  });

  it('pauses and resumes on shared requestState', async () => {
    const { identity } = issueAgentIdentity({ agentRole: 'transaction', userId: 'u-mrtr' });
    const paused = await pauseForHuman({
      reason: 'confirm_escrow',
      prompt: 'Authorize 3 tokens?',
      pendingAction: { type: 'noop', note: 'dry-run' },
      identity,
      userId: 'u-mrtr',
      characterId: null,
      ttlMs: 120_000,
    });

    assert.equal(paused.status, 'awaiting_human');
    assert.ok(paused.requestStateId);

    const peeked = await getMrtrState(paused.requestStateId);
    assert.equal(peeked.requestState.status, 'awaiting_human');

    const resumed = await resumeFromHuman({
      requestStateId: paused.requestStateId,
      decision: 'approve',
      userResponse: 'ok',
      identity,
    });
    assert.equal(resumed.status, 'completed');
    assert.equal(resumed.result.acknowledged, true);
  });

  it('rejects on human deny', async () => {
    const paused = await pauseForHuman({
      prompt: 'Deny me',
      pendingAction: { type: 'noop' },
      ttlMs: 60_000,
    });
    const denied = await resumeFromHuman({
      requestStateId: paused.requestStateId,
      decision: 'reject',
    });
    assert.equal(denied.status, 'rejected');
  });
});

describe('Phase 34 — Serverless swarm config', () => {
  it('exposes scale-to-zero config', () => {
    const cfg = getSwarmConfig();
    assert.ok(['local', 'cloudflare', 'cloudrun'].includes(cfg.backend));
    assert.equal(cfg.stickySessions, false);
    assert.equal(cfg.protocolVersion, '2026-07-28');
  });

  it('dispatches local swarm without sticky sessions', async () => {
    const out = await dispatchSwarm({
      incomingMessage: 'hello there',
      mode: 'dm',
      user: { id: 'u1' },
      character: { id: null, name: 'Guide' },
    });
    assert.equal(out.swarm.stickySessions, false);
    assert.ok(out.agents.length >= 1);
    assert.ok(out.agents.every((a) => a.backend === 'local'));
  });
});

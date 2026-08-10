import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeDynamicRagWeights,
  contextEngine,
} from '../src/services/context/ContextEngine.js';
import {
  issueAgentIdentity,
  verifyAgentIdentity,
  assertAgentScope,
  AGENT_ROLES,
} from '../src/services/mcp/agentIdentityService.js';
import { getEdgeVectorConfig } from '../src/services/edge/edgeVectorStore.js';
import {
  deriveEscrowContractAddress,
  getEscrowConfig,
} from '../src/services/agents/agentEscrowService.js';
import { AppError } from '../src/utils/errors.js';

describe('Phase 33 — ContextEngine', () => {
  it('broadens RAG under high arousal', () => {
    const base = computeDynamicRagWeights({});
    const high = computeDynamicRagWeights({
      bciIntent: { arousal: 0.9, focusLevel: 0.2 },
    });
    assert.ok(high.minScore < base.minScore);
    assert.ok(high.topK > base.topK);
    assert.ok(high.reasons.includes('high_arousal_broaden'));
  });

  it('tightens RAG under high focus', () => {
    const focused = computeDynamicRagWeights({
      bciIntent: { arousal: 0.4, focusLevel: 0.9 },
    });
    assert.ok(focused.reasons.includes('high_focus_precision'));
    assert.ok(focused.minScore >= parseFloat(process.env.MEMORY_MIN_SCORE ?? '0.72'));
  });

  it('materializes prompts via ContextEngine', () => {
    const character = { name: 'Nova', personality: { tone: 'warm' } };
    const pack = contextEngine.materialize({
      character,
      user: { display_name: 'Ada' },
      context: {
        character,
        relationship: { affinity: 10 },
        vectorMemories: [],
        recentMessages: [],
      },
      incomingMessage: 'hey',
      mode: 'dm',
    });
    assert.equal(pack.engine, 'ContextEngine/v1');
    assert.ok(pack.system.length > 0);
    assert.ok(pack.userPrompt.includes('Nova'));
  });
});

describe('Phase 33 — MCP agent identity', () => {
  it('issues and verifies research vs transaction scopes', () => {
    const research = issueAgentIdentity({ agentRole: 'research', userId: 'u1' });
    const tx = issueAgentIdentity({ agentRole: 'transaction', userId: 'u1' });
    const rId = verifyAgentIdentity(research.token);
    const tId = verifyAgentIdentity(tx.token);

    assert.ok(rId.scopes.includes('memory:read'));
    assert.ok(!rId.scopes.includes('escrow:create'));
    assert.ok(tId.scopes.includes('escrow:create'));
    assert.ok(tId.scopes.includes('compute:hire'));

    assert.throws(
      () => assertAgentScope(rId, 'wallet:debit'),
      (err) => err instanceof AppError && err.code === 'MCP_FORBIDDEN',
    );
  });

  it('catalog includes distinct RBAC roles', () => {
    assert.ok(AGENT_ROLES.research.dbPermissions.includes('SELECT'));
    assert.ok(!AGENT_ROLES.research.dbPermissions.includes('UPDATE'));
    assert.ok(AGENT_ROLES.transaction.dbPermissions.includes('UPDATE'));
  });
});

describe('Phase 33 — edge vectors & escrow', () => {
  it('exposes edge vector config', () => {
    const cfg = getEdgeVectorConfig();
    assert.ok(cfg.backend);
    assert.ok(Array.isArray(cfg.regions));
  });

  it('derives deterministic escrow contract addresses', () => {
    const a = deriveEscrowContractAddress({
      characterId: 'char-1',
      counterparty: 'node-a',
      salt: 'salt',
    });
    const b = deriveEscrowContractAddress({
      characterId: 'char-1',
      counterparty: 'node-a',
      salt: 'salt',
    });
    assert.equal(a, b);
    assert.ok(a.startsWith('0x'));
    assert.equal(a.length, 42);
  });

  it('exports escrow hire config', () => {
    const cfg = getEscrowConfig();
    assert.ok(cfg.queueHireThreshold > 0);
    assert.ok(cfg.hireTokenCost > 0);
  });
});

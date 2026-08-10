import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import {
  initializeAgentWithGovernance,
  evaluateGovernance,
  getGovernancePolicy,
  governanceAsCodeMiddleware,
  NIST_AI_RMF,
} from '../src/services/governance/governanceAsCode.js';
import {
  appendAuditEvent,
  verifyAuditChain,
  listAuditEvents,
  _resetAuditMemory,
} from '../src/services/security/immutableAuditLedger.js';
import {
  engageKillSwitch,
  releaseKillSwitch,
  assertAgentsNotKilled,
  getKillSwitchState,
} from '../src/services/security/globalKillSwitchService.js';
import { getZeroCopyConfig, formatZeroCopyPromptBlock } from '../src/services/context/zeroCopyQueryService.js';
import { getCommandCenterSnapshot, recordHandoff, recordAllocation, recordConflict } from '../src/services/ops/agentCommandCenterService.js';
import { AppError } from '../src/utils/errors.js';

describe('Phase 38 — Governance-as-Code', () => {
  it('initializes agents with least-privilege scopes', () => {
    const binding = initializeAgentWithGovernance({ agentRole: 'research' });
    assert.equal(binding.agentRole, 'research');
    assert.ok(binding.scopes.includes('memory:read'));
    assert.ok(!binding.scopes.includes('escrow:create'));
    assert.equal(binding.framework, 'NIST-AI-RMF-1.0');
    assert.ok(NIST_AI_RMF.MANAGE);
  });

  it('escalates high-amount financial actions to HITL', () => {
    const low = evaluateGovernance({ action: 'escrow:create', amount: 3 });
    assert.equal(low.requireHitl, false);

    const high = evaluateGovernance({ action: 'escrow:create', amount: 50 });
    assert.equal(high.requireHitl, true);
    assert.ok(['MAP', 'MANAGE'].includes(high.nistFunction));
  });

  it('exposes versioned policy document', () => {
    const policy = getGovernancePolicy();
    assert.ok(policy.version.startsWith('38'));
    assert.ok(policy.rules.length >= 3);
  });

  it('middleware attaches governance decision', async () => {
    const mw = governanceAsCodeMiddleware();
    const req = {
      headers: {},
      body: { action: 'web:search', agentRole: 'research', autoEscalate: false },
      user: { id: 'u1' },
    };
    await new Promise((resolve, reject) => {
      mw(req, {}, (err) => (err ? reject(err) : resolve()));
    });
    assert.equal(req.governanceDecision.requireHitl, false);
  });
});

describe('Phase 38 — Immutable audit + kill switch', () => {
  before(async () => {
    _resetAuditMemory();
    await releaseKillSwitch({ by: 'test' });
  });

  it('appends hash-chained audit events', async () => {
    const a = await appendAuditEvent({ type: 'test.a', actor: 't', action: 'x', decision: 'ok' });
    const b = await appendAuditEvent({ type: 'test.b', actor: 't', action: 'y', decision: 'ok' });
    assert.equal(b.prevHash, a.entryHash);
    const events = await listAuditEvents({ limit: 10 });
    const integrity = verifyAuditChain(
      [...events].reverse().filter((e) => (e.event_type ?? e.type)?.startsWith('test.')),
    );
    assert.equal(integrity.valid, true);
  });

  it('engages and releases global kill switch', async () => {
    await engageKillSwitch({ by: 'test', reason: 'unit_test' });
    assert.equal(getKillSwitchState().killed, true);
    assert.throws(() => assertAgentsNotKilled(), (err) => err instanceof AppError && err.code === 'AGENT_KILL_SWITCH');
    await releaseKillSwitch({ by: 'test' });
    assert.equal(getKillSwitchState().killed, false);
    assert.doesNotThrow(() => assertAgentsNotKilled());
  });
});

describe('Phase 38 — Zero-copy + command center', () => {
  it('exposes zero-copy config', () => {
    const cfg = getZeroCopyConfig();
    assert.ok(cfg.sources.length >= 1);
    const block = formatZeroCopyPromptBlock({
      items: [{ source: 'live_wallet', content: 'tokens=1' }],
    });
    assert.ok(block.includes('zero-copy'));
  });

  it('aggregates command center snapshot', async () => {
    recordHandoff({ from: 'coordinator', to: 'status.research', task: 'lore' });
    recordAllocation({ agentId: 'status.research', task: 'lore' });
    recordConflict({ agents: ['research', 'dialogue'], reason: 'overlap', resolution: 'dialogue_wins' });
    const snap = await getCommandCenterSnapshot();
    assert.ok(snap.swarm.cards.length >= 1);
    assert.ok(snap.observability.handoffs.length >= 1);
    assert.ok(snap.killSwitch);
  });
});

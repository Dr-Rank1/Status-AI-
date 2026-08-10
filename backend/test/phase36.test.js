import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  proveAgentCompliance,
  verifyAgentComplianceProof,
  zkAgentGovernanceMiddleware,
  GOVERNANCE_POLICIES,
  getZkGovernanceConfig,
} from '../src/services/governance/zkAgentGovernanceService.js';
import {
  assessCognitiveState,
  modulateCognitiveControls,
  applyBioAdaptiveToContext,
} from '../src/services/cognitive/bioAdaptiveService.js';
import {
  getConsensusConfig,
  registerPeer,
  startElection,
  recommendQuorumScale,
} from '../src/services/consensus/raftConsensusMesh.js';
import { AppError } from '../src/utils/errors.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('Phase 36 — zk-SNARK agent governance', () => {
  it('proves and verifies compliance without leaking private context', () => {
    const issued = proveAgentCompliance({
      policyId: 'safety_guardrails',
      agentRole: 'transaction',
      action: 'escrow:create',
      userContext: { secret: 'never-expose', memories: ['private'] },
      memoryBankDigest: 'abc',
      guardrailPassed: true,
      privacyPassed: true,
    });

    assert.ok(issued.proofToken);
    assert.equal(issued.proof.protocol, 'groth16');
    assert.ok(!JSON.stringify(issued).includes('never-expose'));

    const ok = verifyAgentComplianceProof(issued.proofToken);
    assert.equal(ok.valid, true);
    assert.equal(ok.policyId, 'safety_guardrails');
  });

  it('rejects invalid proofs via middleware', () => {
    const mw = zkAgentGovernanceMiddleware({ required: true });
    const req = { headers: {}, body: {}, path: '/x' };
    let err;
    mw(req, { setHeader() {} }, (e) => { err = e; });
    assert.ok(err instanceof AppError);
    assert.equal(err.code, 'ZK_GOVERNANCE_REQUIRED');
    assert.ok(GOVERNANCE_POLICIES.privacy_minimization);
    assert.equal(getZkGovernanceConfig().header, 'X-ZK-Agent-Proof');
  });
});

describe('Phase 36 — bio-adaptive cognitive controls', () => {
  it('raises declutter under high cognitive load', () => {
    const state = assessCognitiveState({
      bci: { arousal: 0.9, focusLevel: 0.2, valence: -0.2 },
      biometrics: { stress: 0.8, heartRate: 110, hrv: 20, blinkRate: 30 },
    });
    assert.ok(state.highLoad);
    const controls = modulateCognitiveControls(state);
    assert.ok(controls.ui.declutter || controls.ui.simplifyLayout);
    assert.ok(controls.llm.temperature < 0.75);
    assert.ok(controls.llm.empathy > 0.5);
  });

  it('applies bio-adaptive layer onto context', () => {
    const ctx = applyBioAdaptiveToContext(
      { affectiveContext: { empathyLevel: 0.4 } },
      { bci: { focusLevel: 0.9, arousal: 0.3 }, biometrics: { stress: 0.1 } },
    );
    assert.equal(ctx.bioCognitive.engine, 'bio-adaptive/v1');
    assert.ok(ctx.affectiveContext.bioAdaptive);
  });
});

describe('Phase 36 — planetary consensus mesh', () => {
  it('registers peers and elects a leader', () => {
    registerPeer({ peerId: 'eu-1', region: 'eu-west' });
    registerPeer({ peerId: 'us-1', region: 'us-east' });
    const elected = startElection();
    assert.ok(['leader', 'follower', 'candidate'].includes(elected.role));
    assert.ok(elected.term >= 1);
  });

  it('recommends quorum scale from traffic', () => {
    const rec = recommendQuorumScale({ 'us-east': 50, 'eu-west': 30, 'ap-south': 20 });
    assert.ok(rec.targetQuorum >= 3);
    assert.ok(rec.placement.length === 3);
  });

  it('exposes consensus config', () => {
    const cfg = getConsensusConfig();
    assert.equal(cfg.protocol, 'raft-webrtc');
    assert.ok(cfg.nodeId);
  });

  it('ships Ubuntu deploy_consensus_mesh.sh', () => {
    const script = path.join(__dirname, '../../scripts/deploy_consensus_mesh.sh');
    assert.ok(fs.existsSync(script));
    const body = fs.readFileSync(script, 'utf8');
    assert.match(body, /Raft/);
    assert.match(body, /--scale/);
    assert.match(body, /Ubuntu/);
  });
});

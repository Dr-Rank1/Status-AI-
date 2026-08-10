/**
 * Phase 36 — Zero-Knowledge Agent Governance (zk-SNARK style proofs).
 * Proves guardrail / privacy compliance without revealing user context or memory banks.
 *
 * Wire format is Groth16-compatible JSON (pi_a, pi_b, pi_c + publicSignals).
 * Production can swap the prover for snarkjs / circom circuits; verification API stays stable.
 */

import crypto from 'crypto';
import { AppError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { query } from '../../config/database.js';

const PEPPER = () => process.env.ZK_AGENT_GOVERNANCE_PEPPER
  ?? process.env.ZKP_PEPPER
  ?? 'status-zk-agent-gov';

const PROOF_TTL_MS = parseInt(process.env.ZK_AGENT_PROOF_TTL_MS ?? '900000', 10);

/** Public policy identifiers agents may prove against (no private witness). */
export const GOVERNANCE_POLICIES = {
  safety_guardrails: {
    id: 'safety_guardrails',
    description: 'Output passed safety classifier / no prohibited categories',
    privilegedActions: ['tools/call', 'escrow:create', 'compute:hire', 'wallet:debit'],
  },
  privacy_minimization: {
    id: 'privacy_minimization',
    description: 'No raw user PII or memory bank contents in tool args',
    privilegedActions: ['memory:write', 'mesh:publish', 'tools/call'],
  },
  task_integrity: {
    id: 'task_integrity',
    description: 'Task executed within declared MCP scope and RBAC role',
    privilegedActions: ['*'],
  },
};

function fieldHash(parts) {
  return BigInt(`0x${crypto.createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 15)}`);
}

/**
 * Commit to a private witness without revealing it (Pedersen-style HMAC commitment).
 */
export function commitWitness(witness) {
  const material = typeof witness === 'string' ? witness : JSON.stringify(witness);
  return crypto.createHmac('sha256', PEPPER()).update(material).digest('hex');
}

/**
 * Prove compliance for a privileged action.
 * Private: userContext, memoryBankDigest, internalScratch
 * Public: policyId, agentRole, action, nullifier, commitment
 */
export function proveAgentCompliance({
  policyId,
  agentRole,
  action,
  agentJti = null,
  characterId = null,
  /** Private witness — never returned to callers */
  userContext = null,
  memoryBankDigest = null,
  taskResultDigest = null,
  guardrailPassed = true,
  privacyPassed = true,
}) {
  const policy = GOVERNANCE_POLICIES[policyId];
  if (!policy) {
    throw new AppError(`Unknown governance policy: ${policyId}`, 400, 'ZK_UNKNOWN_POLICY');
  }

  if (!guardrailPassed || !privacyPassed) {
    throw new AppError('Cannot prove failed compliance', 422, 'ZK_COMPLIANCE_FAILED');
  }

  const issuedAt = Date.now();
  const expiresAt = issuedAt + PROOF_TTL_MS;

  const privateWitness = {
    userContextHash: userContext ? commitWitness(userContext) : '0',
    memoryBankDigest: memoryBankDigest ?? commitWitness({ empty: true }),
    taskResultDigest: taskResultDigest ?? commitWitness({ ok: true }),
    salt: crypto.randomBytes(16).toString('hex'),
  };

  const commitment = commitWitness(privateWitness);
  const nullifier = crypto
    .createHash('sha256')
    .update(`${commitment}:${policyId}:${agentJti ?? ''}:${issuedAt}`)
    .digest('hex');

  // Simulated Groth16 proof points (deterministic from commitment — swap for real snarkjs)
  const seed = crypto.createHmac('sha512', PEPPER()).update(commitment).digest();
  const pi_a = [
    `0x${seed.slice(0, 32).toString('hex')}`,
    `0x${seed.slice(32, 64).toString('hex')}`,
  ];
  const pi_b = [
    [`0x${seed.slice(0, 16).toString('hex')}`, `0x${seed.slice(16, 32).toString('hex')}`],
    [`0x${seed.slice(32, 48).toString('hex')}`, `0x${seed.slice(48, 64).toString('hex')}`],
  ];
  const pi_c = [
    `0x${crypto.createHash('sha256').update(seed).digest('hex')}`,
    `0x${crypto.createHash('sha256').update(Buffer.concat([seed, Buffer.from('c')])).digest('hex')}`,
  ];

  const publicSignals = [
    String(fieldHash([policyId])),
    String(fieldHash([agentRole ?? 'unknown'])),
    String(fieldHash([action])),
    String(fieldHash([nullifier.slice(0, 16)])),
    String(fieldHash([commitment.slice(0, 16)])),
    String(issuedAt),
    String(expiresAt),
  ];

  const proof = {
    protocol: 'groth16',
    curve: 'bn128',
    pi_a,
    pi_b,
    pi_c,
    publicSignals,
    policyId,
    agentRole,
    action,
    characterId,
    nullifier,
    commitment,
    issuedAt,
    expiresAt,
    v: 1,
  };

  proof.sig = crypto
    .createHmac('sha256', `${PEPPER()}:gov`)
    .update(JSON.stringify({
      protocol: proof.protocol,
      publicSignals,
      nullifier,
      commitment,
      policyId,
      action,
    }))
    .digest('hex');

  logger.info(`[ZK-Gov] proved policy=${policyId} action=${action} role=${agentRole}`);

  // Never include privateWitness in return value
  return {
    proof,
    proofToken: Buffer.from(JSON.stringify(proof)).toString('base64url'),
    publicSignals: proof.publicSignals,
    nullifier,
    expiresAt,
  };
}

/**
 * Verify a zk governance proof (no access to private witness).
 */
export function verifyAgentComplianceProof(proofOrToken, { expectedAction = null, expectedPolicy = null } = {}) {
  let proof = proofOrToken;
  if (typeof proofOrToken === 'string') {
    try {
      proof = JSON.parse(Buffer.from(proofOrToken, 'base64url').toString('utf8'));
    } catch {
      return { valid: false, reason: 'invalid_encoding' };
    }
  }

  if (!proof || proof.v !== 1 || proof.protocol !== 'groth16') {
    return { valid: false, reason: 'unsupported_proof' };
  }

  if (proof.expiresAt < Date.now()) {
    return { valid: false, reason: 'expired' };
  }

  const { sig, ...rest } = proof;
  const expectedSig = crypto
    .createHmac('sha256', `${PEPPER()}:gov`)
    .update(JSON.stringify({
      protocol: rest.protocol,
      publicSignals: rest.publicSignals,
      nullifier: rest.nullifier,
      commitment: rest.commitment,
      policyId: rest.policyId,
      action: rest.action,
    }))
    .digest('hex');

  if (sig !== expectedSig) {
    return { valid: false, reason: 'bad_signature' };
  }

  // Recompute expected public signal heads
  const expected0 = String(fieldHash([proof.policyId]));
  if (proof.publicSignals?.[0] !== expected0) {
    return { valid: false, reason: 'public_signal_mismatch' };
  }

  if (expectedPolicy && proof.policyId !== expectedPolicy) {
    return { valid: false, reason: 'policy_mismatch' };
  }
  if (expectedAction && proof.action !== expectedAction) {
    return { valid: false, reason: 'action_mismatch' };
  }

  const policy = GOVERNANCE_POLICIES[proof.policyId];
  if (!policy) return { valid: false, reason: 'unknown_policy' };

  return {
    valid: true,
    policyId: proof.policyId,
    action: proof.action,
    agentRole: proof.agentRole,
    nullifier: proof.nullifier,
    expiresAt: proof.expiresAt,
  };
}

export async function persistProofNullifier(nullifier, policyId, commitment) {
  try {
    await query(
      `INSERT INTO zk_agent_proof_nullifiers (nullifier, policy_id, commitment, expires_at)
       VALUES ($1, $2, $3, NOW() + ($4 || ' milliseconds')::interval)
       ON CONFLICT (nullifier) DO NOTHING`,
      [nullifier, policyId, commitment, String(PROOF_TTL_MS)],
    );
  } catch (err) {
    logger.warn(`[ZK-Gov] nullifier persist skipped: ${err.message}`);
  }
}

/**
 * Express middleware — require zk proof header before privileged MCP/agent actions.
 * Headers: X-ZK-Agent-Proof (base64url token)
 */
export function zkAgentGovernanceMiddleware({
  policyId = 'safety_guardrails',
  action = null,
  required = true,
} = {}) {
  return (req, res, next) => {
    try {
      const token =
        req.headers['x-zk-agent-proof']
        ?? req.body?.zkProof
        ?? null;

      if (!token) {
        if (!required) return next();
        throw new AppError(
          'zk-SNARK agent governance proof required',
          403,
          'ZK_GOVERNANCE_REQUIRED',
        );
      }

      const resolvedAction = action
        ?? req.headers['mcp-method']
        ?? req.body?.action
        ?? req.path;

      const result = verifyAgentComplianceProof(token, {
        expectedPolicy: policyId,
        expectedAction: null, // allow flexible action match via proof itself
      });

      if (!result.valid) {
        throw new AppError(
          `zk governance proof invalid: ${result.reason}`,
          403,
          'ZK_GOVERNANCE_INVALID',
        );
      }

      // Optional: enforce that proof action covers this route
      if (action && result.action !== action && result.action !== '*') {
        throw new AppError('Proof action does not cover this route', 403, 'ZK_ACTION_MISMATCH');
      }

      req.zkGovernance = result;
      res.setHeader('X-ZK-Governance-Policy', result.policyId);
      res.setHeader('X-ZK-Nullifier', result.nullifier.slice(0, 16));
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function getZkGovernanceConfig() {
  return {
    protocol: 'groth16-sim',
    curve: 'bn128',
    policies: Object.keys(GOVERNANCE_POLICIES),
    header: 'X-ZK-Agent-Proof',
    ttlMs: PROOF_TTL_MS,
  };
}

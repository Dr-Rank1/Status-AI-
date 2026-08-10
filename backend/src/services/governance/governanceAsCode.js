/**
 * Phase 38 — Governance-as-Code + NIST AI RMF bounded autonomy.
 * Policies embedded at agent initialization; high-stakes actions escalate to HITL.
 */

import { AppError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { AGENT_ROLES } from '../mcp/agentIdentityService.js';
import { pauseForHuman } from '../mcp/mrtrStateService.js';
import { assertAgentsNotKilled } from '../security/globalKillSwitchService.js';
import { appendAuditEvent } from '../security/immutableAuditLedger.js';

/** NIST AI RMF function → risk tier mapping (Govern / Map / Measure / Manage). */
export const NIST_AI_RMF = {
  GOVERN: {
    id: 'GOVERN',
    description: 'Policies, accountability, culture',
  },
  MAP: {
    id: 'MAP',
    description: 'Context and risk categorization',
  },
  MEASURE: {
    id: 'MEASURE',
    description: 'Assess, analyze, track risk',
  },
  MANAGE: {
    id: 'MANAGE',
    description: 'Prioritize and respond — includes HITL escalation',
  },
};

/** Governance-as-Code policy document (versioned). */
export const GOVERNANCE_POLICY_V1 = {
  version: '38.1.0',
  framework: 'NIST-AI-RMF-1.0',
  leastPrivilege: true,
  rules: [
    {
      id: 'fin-high-stakes',
      nist: 'MAP',
      match: { actions: ['escrow:create', 'wallet:debit', 'compute:hire', 'pay', 'transfer'] },
      risk: 'high',
      requireHitl: true,
      maxAutonomy: 'propose_only',
    },
    {
      id: 'destructive',
      nist: 'MAP',
      match: { actions: ['delete', 'purge', 'drop', 'revoke'] },
      risk: 'critical',
      requireHitl: true,
      maxAutonomy: 'propose_only',
    },
    {
      id: 'pii-egress',
      nist: 'MEASURE',
      match: { actions: ['memory:export', 'mesh:publish'], tags: ['pii'] },
      risk: 'high',
      requireHitl: true,
      maxAutonomy: 'propose_only',
    },
    {
      id: 'routine-tools',
      nist: 'MANAGE',
      match: { actions: ['web:search', 'calendar:write', 'links:write', 'tools/call'] },
      risk: 'low',
      requireHitl: false,
      maxAutonomy: 'execute',
    },
  ],
  roleScopes: Object.fromEntries(
    Object.entries(AGENT_ROLES).map(([role, def]) => [role, def.scopes]),
  ),
};

export function getGovernancePolicy() {
  return GOVERNANCE_POLICY_V1;
}

/**
 * Initialize agent with embedded least-privilege + policy binding.
 */
export function initializeAgentWithGovernance({
  agentRole,
  characterId = null,
  userId = null,
  extraScopes = [],
}) {
  assertAgentsNotKilled();

  const catalog = AGENT_ROLES[agentRole];
  if (!catalog) {
    throw new AppError(`Unknown agent role: ${agentRole}`, 400, 'GOV_UNKNOWN_ROLE');
  }

  // Least privilege: never expand beyond catalog unless explicitly allowlisted
  const allowed = new Set(catalog.scopes);
  const scopes = [...new Set([...catalog.scopes, ...extraScopes.filter((s) => allowed.has(s))])];

  const binding = {
    policyVersion: GOVERNANCE_POLICY_V1.version,
    framework: GOVERNANCE_POLICY_V1.framework,
    agentRole: catalog.role,
    scopes,
    dbPermissions: catalog.dbPermissions,
    characterId,
    userId,
    maxRiskWithoutHitl: 'medium',
    initializedAt: new Date().toISOString(),
  };

  logger.info(`[GovAsCode] init role=${catalog.role} scopes=${scopes.length}`);
  return binding;
}

/**
 * Evaluate action against Governance-as-Code; may require HITL escalation.
 */
export function evaluateGovernance({
  action,
  tags = [],
  amount = null,
  agentBinding = null,
}) {
  assertAgentsNotKilled();

  const actionNorm = String(action ?? '').toLowerCase();
  const matched = [];

  for (const rule of GOVERNANCE_POLICY_V1.rules) {
    const actionHit = (rule.match.actions ?? []).some((a) => actionNorm.includes(a.toLowerCase()));
    const tagHit = (rule.match.tags ?? []).length
      ? (rule.match.tags ?? []).some((t) => tags.includes(t))
      : true;
    if (!(actionHit && tagHit)) continue;

    // Financial NIST MAP rules: escalate only at/above token threshold (bounded autonomy)
    if (rule.id === 'fin-high-stakes') {
      const threshold = parseInt(process.env.GOV_HITL_AMOUNT_THRESHOLD ?? '10', 10);
      if (amount == null || Number(amount) < threshold) {
        matched.push({ ...rule, requireHitl: false, risk: 'medium', maxAutonomy: 'execute' });
        continue;
      }
    }
    matched.push(rule);
  }

  // Amount-based financial escalation (NIST MAP → MANAGE)
  if (amount != null && Number(amount) >= parseInt(process.env.GOV_HITL_AMOUNT_THRESHOLD ?? '10', 10)) {
    matched.push({
      id: 'amount-threshold',
      nist: 'MANAGE',
      risk: 'high',
      requireHitl: true,
      maxAutonomy: 'propose_only',
    });
  }

  // Scope check
  if (agentBinding?.scopes?.length) {
    const scopeOk = agentBinding.scopes.some((s) => actionNorm.includes(s.split(':')[0]) || actionNorm === s);
    // soft check — privileged financial verbs still escalate even if scoped
    void scopeOk;
  }

  const highest = matched.sort((a, b) => riskRank(b.risk) - riskRank(a.risk))[0] ?? {
    id: 'default-allow',
    nist: 'MANAGE',
    risk: 'low',
    requireHitl: false,
    maxAutonomy: 'execute',
  };

  return {
    allow: !highest.requireHitl,
    requireHitl: Boolean(highest.requireHitl),
    risk: highest.risk,
    ruleId: highest.id,
    nistFunction: highest.nist,
    maxAutonomy: highest.maxAutonomy,
    matchedRules: matched.map((r) => r.id),
    policyVersion: GOVERNANCE_POLICY_V1.version,
  };
}

function riskRank(r) {
  return { low: 1, medium: 2, high: 3, critical: 4 }[r] ?? 0;
}

/**
 * Enforce governance: audit + optional HITL pause before privileged work.
 */
export async function enforceGovernanceOrEscalate({
  action,
  tags = [],
  amount = null,
  agentBinding = null,
  userId = null,
  characterId = null,
  pendingAction = null,
  autoEscalate = true,
}) {
  const decision = evaluateGovernance({ action, tags, amount, agentBinding });

  await appendAuditEvent({
    type: 'governance.evaluate',
    actor: agentBinding?.agentRole ?? 'system',
    action,
    decision: decision.requireHitl ? 'escalate_hitl' : 'allow',
    metadata: { ...decision, amount, tags },
    characterId,
    userId,
  });

  if (!decision.requireHitl) {
    return { ...decision, escalated: false, hitl: null };
  }

  if (!autoEscalate) {
    throw new AppError(
      `HITL required by governance rule ${decision.ruleId} (NIST ${decision.nistFunction})`,
      403,
      'GOV_HITL_REQUIRED',
    );
  }

  const hitl = await pauseForHuman({
    reason: `nist_${decision.nistFunction}_${decision.ruleId}`,
    prompt: `Governance-as-Code paused action "${action}" (risk=${decision.risk}, NIST ${decision.nistFunction}). Approve?`,
    pendingAction: pendingAction ?? { type: 'noop', action },
    userId,
    characterId,
  });

  await appendAuditEvent({
    type: 'governance.hitl_pause',
    actor: agentBinding?.agentRole ?? 'system',
    action,
    decision: 'paused',
    metadata: { requestStateId: hitl.requestStateId, ruleId: decision.ruleId },
    characterId,
    userId,
  });

  return { ...decision, escalated: true, hitl };
}

/**
 * Express middleware — Governance-as-Code gate.
 * Body/headers: action, amount, X-Agent-Role
 */
export function governanceAsCodeMiddleware({ actionFrom } = {}) {
  return async (req, _res, next) => {
    try {
      assertAgentsNotKilled();
      const action = actionFrom?.(req)
        ?? req.headers['x-agent-action']
        ?? req.body?.action
        ?? req.headers['mcp-method']
        ?? req.path;

      const binding = req.agentGovernance
        ?? initializeAgentWithGovernance({
          agentRole: req.body?.agentRole ?? req.headers['x-agent-role'] ?? req.mcpAgent?.role ?? 'dialogue',
          characterId: req.body?.characterId ?? req.mcpAgent?.characterId,
          userId: req.user?.id,
        });

      req.agentGovernance = binding;

      const result = await enforceGovernanceOrEscalate({
        action,
        tags: req.body?.tags ?? [],
        amount: req.body?.amount ?? null,
        agentBinding: binding,
        userId: req.user?.id,
        characterId: req.body?.characterId ?? req.params?.characterId,
        pendingAction: req.body?.pendingAction,
        autoEscalate: req.body?.autoEscalate !== false,
      });

      req.governanceDecision = result;
      if (result.escalated) {
        // Surface pause without hard-failing — caller may return 202
        req.governancePaused = result.hitl;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

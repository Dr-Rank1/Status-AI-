/**
 * Phase 38 — Agentic Command Center telemetry aggregate.
 */

import { listAgentCards, getA2aConfig } from '../a2a/a2aProtocol.js';
import { getEconomyVelocity } from '../mcp/mcpPaymentService.js';
import { getKillSwitchState } from '../security/globalKillSwitchService.js';
import { listAuditEvents, getAuditTip } from '../security/immutableAuditLedger.js';
import { getGraphConfig } from '../orchestration/graphOrchestrator.js';
import { getGovernancePolicy } from '../governance/governanceAsCode.js';
import { getConsensusConfig } from '../consensus/raftConsensusMesh.js';

const handoffs = [];
const allocations = [];
const conflicts = [];

export function recordHandoff({ from, to, task = null, meta = {} }) {
  handoffs.push({
    id: `${Date.now()}-${handoffs.length}`,
    from,
    to,
    task,
    meta,
    at: new Date().toISOString(),
  });
  if (handoffs.length > 200) handoffs.shift();
}

export function recordAllocation({ agentId, task, status = 'assigned' }) {
  allocations.push({
    id: `${Date.now()}-${allocations.length}`,
    agentId,
    task,
    status,
    at: new Date().toISOString(),
  });
  if (allocations.length > 200) allocations.shift();
}

export function recordConflict({ agents = [], reason, resolution = null }) {
  conflicts.push({
    id: `${Date.now()}-${conflicts.length}`,
    agents,
    reason,
    resolution,
    at: new Date().toISOString(),
  });
  if (conflicts.length > 100) conflicts.shift();
}

export async function getCommandCenterSnapshot() {
  const [economy, audit] = await Promise.all([
    getEconomyVelocity({ sinceHours: 24 }),
    listAuditEvents({ limit: 30 }),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    killSwitch: getKillSwitchState(),
    governance: {
      policyVersion: getGovernancePolicy().version,
      framework: getGovernancePolicy().framework,
      ruleCount: getGovernancePolicy().rules.length,
    },
    swarm: {
      a2a: getA2aConfig(),
      cards: listAgentCards().map((c) => ({
        agentId: c.agentId,
        role: c.role,
        enterprise: c.enterprise,
        capabilities: c.capabilities.length,
      })),
      graph: getGraphConfig(),
      consensus: getConsensusConfig(),
    },
    observability: {
      handoffs: handoffs.slice(-40).reverse(),
      allocations: allocations.slice(-40).reverse(),
      conflicts: conflicts.slice(-20).reverse(),
      tokenExpenditure: {
        txCount: economy.txCount,
        totalVolume: economy.totalVolume,
        tokenVelocity: economy.tokenVelocity,
        edges: economy.edges,
      },
    },
    audit: {
      tip: getAuditTip(),
      recent: audit,
    },
  };
}

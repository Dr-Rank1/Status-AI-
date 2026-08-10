/**
 * Multi-agent coordinator — spawns parallel subagents with isolated context windows.
 */

import { runResearchSubagent } from './subagents/researchAgent.js';
import { runDialogueSubagent } from './subagents/dialogueAgent.js';
import { executeAgentTool } from './agentTools.js';
import { withAgentIdentity, assertAgentScope } from '../mcp/agentIdentityService.js';
import { logger } from '../../utils/logger.js';
import { hireMicroInferenceNode } from '../agents/agentEscrowService.js';
import { assertAgentsNotKilled } from '../security/globalKillSwitchService.js';
import { appendAuditEvent } from '../security/immutableAuditLedger.js';
import { recordHandoff, recordAllocation } from '../ops/agentCommandCenterService.js';
import { initializeAgentWithGovernance } from '../governance/governanceAsCode.js';

const COORDINATOR_MODES = new Set(['dm', 'group_dm', 'post_reply']);

export function shouldUseMultiAgent(mode) {
  if (process.env.MULTI_AGENT_ENABLED === 'false') return false;
  return COORDINATOR_MODES.has(mode);
}

export function planSubagents({ incomingMessage, mode }) {
  const text = (incomingMessage ?? '').toLowerCase();
  const agents = ['dialogue'];

  if (/search|lore|what is|who is|look up|canon|wiki|history/.test(text)) {
    agents.unshift('research');
  }

  if (/calendar|schedule|meet|remind|event/.test(text)) {
    agents.push('tools');
  }

  if (/pay|tip|escrow|hire|compute|wallet/.test(text)) {
    agents.push('transaction');
  }

  if (mode === 'post_reply') {
    if (!agents.includes('research')) agents.unshift('research');
  }

  return [...new Set(agents)];
}

async function runToolsSubagent({ character, user, incomingMessage, context, mcpIdentity }) {
  if (mcpIdentity) assertAgentScope(mcpIdentity, 'calendar:write');

  const text = (incomingMessage ?? '').toLowerCase();
  const toolResults = [];
  const toolCtx = { userId: user?.id, characterId: character?.id, threadId: context?.threadId };

  if (/calendar|schedule|meet|remind|event/.test(text)) {
    const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
    start.setHours(18, 0, 0, 0);
    const output = await executeAgentTool(
      'create_calendar_event',
      {
        title: `Plans with ${character.name}`,
        description: incomingMessage,
        start_at: start.toISOString(),
        duration_minutes: 45,
      },
      toolCtx,
    );
    toolResults.push({ tool: 'create_calendar_event', output });
  }

  return { role: 'tools', toolResults, mcpRole: mcpIdentity?.role };
}

async function runTransactionSubagent({ character, context, mcpIdentity }) {
  if (mcpIdentity) assertAgentScope(mcpIdentity, 'compute:hire');
  const queueDepth = context?.queueDepth ?? parseInt(process.env.AGENT_LOCAL_QUEUE_DEPTH ?? '0', 10);
  const hire = await hireMicroInferenceNode({
    characterId: character.id,
    queueDepth,
    mcpIdentity,
  });
  return { role: 'transaction', hire, mcpRole: mcpIdentity?.role };
}

/**
 * Coordinator runs research + tools in parallel, then dialogue synthesizes.
 */
export async function runMultiAgentCoordinator(args) {
  assertAgentsNotKilled();
  const plan = planSubagents(args);
  logger.info(`[MultiAgent] plan=${plan.join('+')} mode=${args.mode} character=${args.character?.handle}`);

  for (const role of plan) {
    initializeAgentWithGovernance({
      agentRole: role === 'transaction' ? 'transaction' : role,
      characterId: args.character?.id,
      userId: args.user?.id,
    });
    recordAllocation({ agentId: `status.${role}`, task: args.incomingMessage, status: 'assigned' });
  }

  await appendAuditEvent({
    type: 'agent.plan',
    actor: 'coordinator',
    action: 'multi_agent_run',
    decision: 'start',
    metadata: { plan },
    characterId: args.character?.id,
    userId: args.user?.id,
  });

  const parallelAgents = plan.filter((a) => a !== 'dialogue');
  const parallelTasks = parallelAgents.map((agent) =>
    withAgentIdentity(agent === 'transaction' ? 'transaction' : agent, args, async ({ identity }) => {
      recordHandoff({ from: 'coordinator', to: `status.${agent}`, task: args.incomingMessage });
      switch (agent) {
        case 'research':
          return runResearchSubagent({ ...args, mcpIdentity: identity });
        case 'tools':
          return runToolsSubagent({ ...args, mcpIdentity: identity });
        case 'transaction':
          return runTransactionSubagent({ ...args, mcpIdentity: identity });
        default:
          return Promise.resolve(null);
      }
    }),
  );

  const parallelResults = await Promise.all(parallelTasks);

  const research = parallelResults.find((r) => r?.role === 'research');
  const tools = parallelResults.find((r) => r?.role === 'tools');
  const transaction = parallelResults.find((r) => r?.role === 'transaction');
  const researchSummary = research?.summary ?? '';

  const dialogue = await withAgentIdentity('dialogue', args, async ({ identity }) =>
    runDialogueSubagent({ ...args, mcpIdentity: identity }, { researchSummary }),
  );

  let content = dialogue.content;
  const toolResults = tools?.toolResults ?? [];

  if (toolResults.some((t) => t.tool === 'create_calendar_event')) {
    content = `${content} I've added that to your calendar.`;
  }

  return {
    content,
    provider: dialogue.provider ?? 'multi-agent',
    model: dialogue.model ?? 'coordinator',
    usage: dialogue.usage ?? null,
    agentSteps: parallelAgents.length + 1,
    multiAgent: {
      plan,
      subagents: [
        research && { role: 'research', summaryLength: researchSummary.length, mcpRole: research.mcpRole },
        tools && { role: 'tools', toolCount: toolResults.length, mcpRole: tools.mcpRole },
        transaction && { role: 'transaction', hire: transaction.hire, mcpRole: transaction.mcpRole },
        { role: 'dialogue', provider: dialogue.provider },
      ].filter(Boolean),
    },
    toolResults,
    researchSummary: researchSummary.slice(0, 200),
    escrowHire: transaction?.hire ?? null,
  };
}

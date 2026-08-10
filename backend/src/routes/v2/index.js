/**
 * Phase 31 — API v2 Beta (REST + GraphQL + AGI/mesh endpoints).
 */

import { Router } from 'express';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { authMiddleware } from '../../middleware/auth.js';
import { getSlaSnapshot } from '../../observability/slaTelemetry.js';
import { getCostSnapshot } from '../../services/aiCostOptimizer.js';
import { reflectionLoopMiddleware, runReflectionLoop } from '../../services/agi/reflectionLoopService.js';
import {
  publishInsight,
  fetchCollectiveInsights,
  getMeshBackend,
} from '../../services/knowledgeMesh/knowledgeMeshService.js';
import { executeGraphql, graphqlSchemaSDL } from '../../services/v2/graphqlService.js';
import { getSandboxConfig, warmWasmIsolate } from '../../services/wasm/wasmToolSandbox.js';
import { adminMiddleware } from '../../middleware/admin.js';
import {
  getTrafficState,
  setV2TrafficPercent,
  setShadowPercent,
  clearRollback,
} from '../../services/traffic/blueGreenTrafficService.js';
import { getAipsRecent } from '../../services/security/aipsService.js';
import {
  establishQkdChannel,
  ratchetQkdKey,
  isQkdEnabled,
} from '../../services/security/qkdService.js';
import { SOVEREIGN_ZONES } from '../../services/sovereign/sovereignCloudService.js';

const router = Router();

router.use((_req, res, next) => {
  res.setHeader('X-API-Version', '2');
  res.setHeader('X-API-Compat', 'v1-clients-supported');
  res.setHeader('X-API-Channel', process.env.V2_GA_ENABLED === 'true' ? 'ga' : 'beta');
  next();
});

router.use(reflectionLoopMiddleware());

router.get('/version', (_req, res) => {
  res.json({
    data: {
      version: '2.0.0',
      status: process.env.V2_GA_ENABLED === 'true' ? 'ga' : 'beta',
      v1Base: '/api/v1',
      traffic: getTrafficState(),
      capabilities: {
        multimodal: {
          status: 'ga',
          modalities: ['text', 'image', 'audio', 'spatial'],
          endpoints: ['/api/v2/ai/multimodal', '/api/v2/ai/reflect'],
        },
        reflection: {
          status: 'live',
          endpoints: ['/api/v2/ai/reflect'],
        },
        knowledgeMesh: {
          status: 'live',
          backend: getMeshBackend(),
          endpoints: ['/api/v2/mesh/insights', '/api/v2/graphql'],
        },
        graphql: {
          status: 'ga',
          endpoints: ['/api/v2/graphql'],
          subscriptions: 'socket.io event v2_graphql_subscribe',
        },
        sovereignCloud: {
          status: 'live',
          zones: Object.keys(SOVEREIGN_ZONES),
        },
        neuromorphic: {
          status: 'live',
          client: 'flutter_neuromorphic_bridge',
        },
        aips: { status: 'live' },
        qkd: { status: isQkdEnabled() ? 'live' : 'standby' },
        spatialComputing: {
          status: 'preview',
          endpoints: ['/api/v2/spatial/session'],
        },
        wasmSandbox: {
          status: 'live',
          config: getSandboxConfig(),
        },
        sla: { status: 'live', endpoints: ['/api/v2/ops/sla'] },
        costTelemetry: { status: 'live', endpoints: ['/api/v2/ops/cost'] },
        blueGreen: {
          status: 'live',
          endpoints: ['/api/v2/ops/traffic'],
        },
        mcpStateless: {
          status: 'live',
          protocolVersion: '2026-07-28',
          endpoints: ['/api/v2/mcp', '/api/v2/mcp/swarm', '/api/v2/mcp/mrtr'],
        },
      },
      deprecations: [],
      migrationGuide: 'See docs/V2_ARCHITECTURE.md',
    },
  });
});

router.get('/ops/sla', authMiddleware, asyncHandler(async (_req, res) => {
  res.json({ data: getSlaSnapshot() });
}));

router.get('/ops/cost', authMiddleware, asyncHandler(async (_req, res) => {
  res.json({ data: getCostSnapshot() });
}));

router.get('/graphql/schema', (_req, res) => {
  res.type('text/plain').send(graphqlSchemaSDL());
});

router.post(
  '/graphql',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { query, variables, operationName } = req.body ?? {};
    const result = await executeGraphql({
      query,
      variables,
      context: { userId: req.user?.id, operationName },
    });
    res.json(result);
  }),
);

router.post(
  '/ai/reflect',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { draft, character, incomingMessage, context } = req.body ?? {};
    const result = await runReflectionLoop({
      draft: { content: draft ?? req.body?.content },
      character: character ?? { name: req.body?.characterName ?? 'Character' },
      incomingMessage: incomingMessage ?? '',
      context: context ?? {},
    });
    res.json({ data: result });
  }),
);

router.post(
  '/ai/multimodal',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const text = req.body?.prompt ?? req.body?.text ?? '';
    const reflected = await runReflectionLoop({
      draft: { content: text },
      character: { name: req.body?.characterName ?? 'Guide' },
      incomingMessage: text,
      context: {},
    });

    res.json({
      data: {
        status: 'beta',
        modalities: req.body?.modalities ?? ['text'],
        content: reflected.content,
        reflection: {
          iterations: reflected.iterations,
          issues: reflected.issues,
          chainOfThought: reflected.chainOfThought,
        },
        note: 'Image/audio fusion remains progressive; text path uses AGI reflection.',
      },
    });
  }),
);

router.get(
  '/mesh/insights',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const insights = await fetchCollectiveInsights({
      characterId: req.query.characterId ?? null,
      fandom: req.query.fandom ?? null,
      limit: Math.min(parseInt(req.query.limit ?? '10', 10), 50),
    });
    res.json({ data: { backend: getMeshBackend(), insights } });
  }),
);

router.post(
  '/mesh/insights',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const result = await publishInsight({
      characterId: req.body.characterId,
      tenantId: req.tenantId ?? null,
      content: req.body.content ?? req.body.topic,
      fandom: req.body.fandom,
      tags: req.body.tags ?? [],
      importance: req.body.importance ?? 0.5,
    });
    res.status(201).json({ data: result });
  }),
);

router.get(
  '/ops/sandbox',
  authMiddleware,
  asyncHandler(async (_req, res) => {
    const ping = await warmWasmIsolate();
    res.json({ data: { ...getSandboxConfig(), ping } });
  }),
);

router.post(
  '/spatial/session',
  authMiddleware,
  asyncHandler(async (req, res) => {
    res.status(501).json({
      error: {
        code: 'V2_SPATIAL_PREVIEW',
        message: 'Use /api/v1/spatial/* for production spatial APIs; V2 sessions coming soon.',
        receivedKeys: Object.keys(req.body ?? {}),
      },
    });
  }),
);

router.get('/health', (_req, res) => {
  res.json({ data: { ok: true, api: 'v2', channel: process.env.V2_GA_ENABLED === 'true' ? 'ga' : 'beta', compat: 'v1' } });
});

router.get(
  '/ops/traffic',
  authMiddleware,
  adminMiddleware,
  asyncHandler(async (_req, res) => {
    res.json({ data: getTrafficState() });
  }),
);

router.post(
  '/ops/traffic',
  authMiddleware,
  adminMiddleware,
  asyncHandler(async (req, res) => {
    if (req.body?.shadowPercent != null) setShadowPercent(req.body.shadowPercent);
    if (req.body?.clearRollback) {
      return res.json({ data: clearRollback({ restorePercent: req.body.v2Percent ?? 0 }) });
    }
    const result = setV2TrafficPercent(req.body?.v2Percent ?? 0, { force: Boolean(req.body?.force) });
    res.json({ data: result });
  }),
);

router.get(
  '/ops/aips/recent',
  authMiddleware,
  adminMiddleware,
  asyncHandler(async (req, res) => {
    res.json({ data: getAipsRecent({ limit: parseInt(req.query.limit ?? '20', 10) }) });
  }),
);

router.get(
  '/ops/sovereign/zones',
  authMiddleware,
  asyncHandler(async (_req, res) => {
    res.json({ data: { zones: SOVEREIGN_ZONES, current: _req.sovereign ?? null } });
  }),
);

router.post(
  '/ops/qkd/channel',
  authMiddleware,
  adminMiddleware,
  asyncHandler(async (req, res) => {
    const channel = establishQkdChannel({
      localPeerId: req.body.localPeerId ?? `api-${req.user.id}`,
      remotePeerId: req.body.remotePeerId ?? 'peer',
      metadata: req.body.metadata ?? {},
    });
    res.status(201).json({ data: channel });
  }),
);

router.post(
  '/ops/qkd/channel/:channelId/ratchet',
  authMiddleware,
  adminMiddleware,
  asyncHandler(async (req, res) => {
    res.json({ data: ratchetQkdKey(req.params.channelId) });
  }),
);

router.post(
  '/context/assemble',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { computeDynamicRagWeights, contextEngine } = await import(
      '../../services/context/ContextEngine.js'
    );
    const rag = computeDynamicRagWeights({
      affectiveContext: req.body.affectiveContext,
      bciIntent: req.body.bciIntent,
      mode: req.body.mode ?? 'dm',
    });
    res.json({
      data: {
        rag,
        engine: 'ContextEngine/v1',
        sampleMaterialize: contextEngine.materialize({
          character: { name: req.body.characterName ?? 'Guide', personality: {} },
          user: req.user,
          context: {
            relationship: { affinity: 0 },
            affectiveContext: req.body.affectiveContext,
            bciIntent: req.body.bciIntent,
            ragWeights: rag,
          },
          incomingMessage: req.body.message ?? 'hello',
          mode: req.body.mode ?? 'dm',
        }),
      },
    });
  }),
);

router.post(
  '/mcp/token',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { issueAgentIdentity, AGENT_ROLES } = await import(
      '../../services/mcp/agentIdentityService.js'
    );
    const role = req.body.role ?? 'research';
    if (!AGENT_ROLES[role]) {
      return res.status(400).json({ error: { code: 'MCP_UNKNOWN_ROLE', message: `Unknown role ${role}` } });
    }
    const issued = issueAgentIdentity({
      agentRole: role,
      characterId: req.body.characterId,
      userId: req.user.id,
      ttlSec: req.body.ttlSec ?? 3600,
    });
    res.status(201).json({ data: issued });
  }),
);

router.get(
  '/mcp/roles',
  authMiddleware,
  asyncHandler(async (_req, res) => {
    const { AGENT_ROLES } = await import('../../services/mcp/agentIdentityService.js');
    res.json({ data: AGENT_ROLES });
  }),
);

router.post(
  '/agents/:characterId/escrow',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { createEscrow } = await import('../../services/agents/agentEscrowService.js');
    const { withAgentIdentity } = await import('../../services/mcp/agentIdentityService.js');
    const escrow = await withAgentIdentity(
      'transaction',
      { characterId: req.params.characterId, userId: req.user.id },
      async ({ identity }) =>
        createEscrow({
          characterId: req.params.characterId,
          counterparty: req.body.counterparty ?? 'compute-market',
          amount: req.body.amount ?? 3,
          currency: req.body.currency ?? 'token',
          purpose: req.body.purpose ?? 'compute_hire',
          metadata: req.body.metadata ?? {},
          mcpIdentity: identity,
        }),
    );
    res.status(201).json({ data: escrow });
  }),
);

router.post(
  '/agents/:characterId/hire-compute',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { hireMicroInferenceNode } = await import('../../services/agents/agentEscrowService.js');
    const result = await hireMicroInferenceNode({
      characterId: req.params.characterId,
      queueDepth: req.body.queueDepth ?? 10,
      nodeId: req.body.nodeId,
    });
    res.json({ data: result });
  }),
);

router.get(
  '/edge/vectors/status',
  authMiddleware,
  asyncHandler(async (_req, res) => {
    const { getEdgeVectorConfig } = await import('../../services/edge/edgeVectorStore.js');
    res.json({ data: getEdgeVectorConfig() });
  }),
);

/** Phase 34 — Stateless MCP gateway (header-routed) */
router.post(
  '/mcp',
  authMiddleware,
  asyncHandler(async (req, res, next) => {
    const { mcpStatelessRouterMiddleware } = await import(
      '../../services/mcp/statelessMcpRouter.js'
    );
    return mcpStatelessRouterMiddleware()(req, res, next);
  }),
);

router.get(
  '/mcp/swarm',
  authMiddleware,
  asyncHandler(async (_req, res) => {
    const { getSwarmConfig } = await import('../../services/mcp/serverlessSwarmDispatcher.js');
    res.json({ data: getSwarmConfig() });
  }),
);

router.post(
  '/mcp/swarm',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { dispatchSwarm } = await import('../../services/mcp/serverlessSwarmDispatcher.js');
    const result = await dispatchSwarm({
      incomingMessage: req.body.message ?? req.body.incomingMessage ?? '',
      mode: req.body.mode ?? 'dm',
      user: req.user,
      character: req.body.character ?? { id: req.body.characterId, name: req.body.characterName ?? 'Guide' },
      params: req.body.params ?? {},
    });
    res.json({ data: result });
  }),
);

router.post(
  '/mcp/mrtr/pause',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { pauseForHuman } = await import('../../services/mcp/mrtrStateService.js');
    const { withAgentIdentity } = await import('../../services/mcp/agentIdentityService.js');
    const paused = await withAgentIdentity(
      req.body.role ?? 'transaction',
      { characterId: req.body.characterId, userId: req.user.id },
      async ({ identity }) =>
        pauseForHuman({
          reason: req.body.reason ?? 'human_validation',
          prompt: req.body.prompt ?? 'Confirm this agent action?',
          pendingAction: req.body.pendingAction ?? { type: 'noop' },
          identity,
          userId: req.user.id,
          characterId: req.body.characterId,
          ttlMs: req.body.ttlMs,
        }),
    );
    res.status(202).json({ data: paused });
  }),
);

router.post(
  '/mcp/mrtr/resume',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { resumeFromHuman } = await import('../../services/mcp/mrtrStateService.js');
    const result = await resumeFromHuman({
      requestStateId: req.body.requestStateId ?? req.body.id,
      decision: req.body.decision ?? 'approve',
      userResponse: req.body.userResponse ?? null,
      identity: req.mcpAgent ?? null,
    });
    res.json({ data: result });
  }),
);

router.get(
  '/mcp/mrtr/:id',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { getMrtrState } = await import('../../services/mcp/mrtrStateService.js');
    res.json({ data: await getMrtrState(req.params.id) });
  }),
);

export default router;

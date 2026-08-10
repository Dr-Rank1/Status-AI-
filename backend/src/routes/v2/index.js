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
        temporalKg: {
          status: 'live',
          endpoints: ['/api/v2/context/temporal', '/api/v2/ops/economy'],
        },
        webrtcAvatar: {
          status: 'live',
          endpoints: ['/api/v2/webrtc/session'],
        },
        zkGovernance: {
          status: 'live',
          endpoints: ['/api/v2/governance/zk/prove', '/api/v2/governance/zk/verify'],
        },
        bioCognitive: {
          status: 'live',
          endpoints: ['/api/v2/cognitive/modulate'],
        },
        consensusMesh: {
          status: 'live',
          endpoints: ['/api/v2/consensus/status', '/api/v2/consensus/elect'],
        },
        a2a: {
          status: 'live',
          endpoints: ['/api/v2/a2a/cards', '/api/v2/a2a/delegate'],
        },
        graphOrchestrator: {
          status: 'live',
          endpoints: ['/api/v2/graph/run', '/api/v2/graph/:id/resume'],
        },
        treeOfThoughts: {
          status: 'live',
          endpoints: ['/api/v2/reason/tot'],
        },
        unifiedMemory: {
          status: 'live',
          endpoints: ['/api/v2/memory/unified'],
        },
        commandCenter: {
          status: 'live',
          endpoints: ['/api/v2/ops/command-center', '/api/v2/ops/kill-switch', '/api/v2/ops/audit'],
        },
        governanceAsCode: {
          status: 'live',
          framework: 'NIST-AI-RMF-1.0',
          endpoints: ['/api/v2/governance/policy', '/api/v2/governance/evaluate'],
        },
        zeroCopy: {
          status: 'live',
          endpoints: ['/api/v2/context/zero-copy'],
        },
        puppeteer: {
          status: 'live',
          endpoints: ['/api/v2/puppeteer/run', '/api/v2/puppeteer/assemble'],
        },
        hologramSwarm: {
          status: 'live',
          endpoints: ['/api/v2/hologram/config'],
        },
        cognitiveVoice: {
          status: 'live',
          endpoints: ['/api/v2/voice/duplex/session'],
        },
        dagQuorum: {
          status: 'live',
          endpoints: ['/api/v2/consensus/dag/propose'],
        },
        ambientFabric: {
          status: 'live',
          endpoints: ['/api/v2/ambient/infer', '/api/v2/ambient/accept'],
        },
        exascaleRag: {
          status: 'live',
          endpoints: ['/api/v2/memory/distill'],
        },
        codeSynthesis: {
          status: 'live',
          endpoints: ['/api/v2/devops/synthesis'],
          dryRunDefault: true,
        },
        v3Genesis: {
          status: 'blueprint',
          doc: 'docs/V3_GENESIS_ARCHITECTURE.md',
        },
        quantumHybrid: {
          status: 'live',
          endpoints: ['/api/v2/quantum/allocate', '/api/v2/quantum/rag-path', '/api/v2/quantum/tune-distill'],
        },
        ros2Mcp: {
          status: 'live',
          endpoints: ['/api/v2/robotics/telemetry', '/api/v2/robotics/actuate', '/api/v2/robotics/bind'],
        },
        syntheticAlignment: {
          status: 'live',
          endpoints: ['/api/v2/alignment/observe', '/api/v2/alignment/bench'],
        },
        dtn: {
          status: 'live',
          endpoints: ['/api/v2/consensus/dtn/bundle', '/api/v2/consensus/dtn/reconcile'],
        },
        photonic: {
          status: 'live',
          endpoints: ['/api/v2/photonic/matmul', '/api/v2/photonic/search'],
          native: 'mobile/native/photonic_compute_bridge',
        },
        molecularArchive: {
          status: 'live',
          endpoints: ['/api/v2/storage/molecular/archive', '/api/v2/storage/molecular/retrieve'],
        },
        leoMesh: {
          status: 'live',
          endpoints: ['/api/v2/network/leo/route', '/api/v2/network/leo/sync'],
          config: 'deploy/orbital/leo_mesh_router.yaml',
        },
        interplanetaryContinuity: {
          status: 'live',
          endpoints: ['/api/v2/continuity/capsule', '/api/v2/continuity/recover'],
        },
        organoid: {
          status: 'live',
          endpoints: ['/api/v2/organoid/sparse', '/api/v2/organoid/recall'],
          native: 'mobile/native/organoid_compute_bridge',
        },
        entanglementSync: {
          status: 'live',
          endpoints: ['/api/v2/quantum/entangle', '/api/v2/quantum/entangle/sync'],
        },
        energyRouter: {
          status: 'live',
          endpoints: ['/api/v2/devops/energy/route'],
        },
        metaCompiler: {
          status: 'live',
          endpoints: ['/api/v2/devops/meta-compiler/tick'],
          hotSwapDefault: false,
        },
        globalBrain: {
          status: 'live',
          endpoints: ['/api/v2/ops/global-brain', '/api/v2/ops/global-brain/tune'],
          dashboard: '/global-brain',
        },
        chronoParadox: {
          status: 'live',
          endpoints: ['/api/v2/context/chrono/branch', '/api/v2/context/chrono/sync'],
        },
        dysonEnergy: {
          status: 'live',
          endpoints: ['/api/v2/devops/dyson/route'],
          iaC: ['infra/dyson/orbital_pretrain.tf', 'infra/dyson/Pulumi.yaml'],
        },
        genesisKey: {
          status: 'ceremonial',
          endpoints: ['/api/v2/ops/genesis-key/rotate'],
          dryRunDefault: true,
          doc: 'docs/V4_UNIVERSAL_SUBSTRATE.md',
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

/** Phase 35 — Temporal KG + economy + WebRTC */
router.get(
  '/context/temporal',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { queryTemporalContext, getTemporalKgConfig, TEMPORAL_KG_SCHEMA_CYPHER } = await import(
      '../../services/context/temporalKnowledgeGraph.js'
    );
    const characterId = req.query.characterId;
    if (!characterId) {
      return res.status(400).json({ error: { code: 'VALIDATION', message: 'characterId required' } });
    }
    const data = await queryTemporalContext({
      userId: req.user.id,
      characterId,
      asOf: req.query.asOf,
      limit: parseInt(req.query.limit ?? '8', 10),
    });
    res.json({
      data: {
        ...data,
        config: getTemporalKgConfig(),
        schemaPreview: TEMPORAL_KG_SCHEMA_CYPHER.slice(0, 280),
      },
    });
  }),
);

router.get(
  '/ops/economy',
  authMiddleware,
  adminMiddleware,
  asyncHandler(async (req, res) => {
    const { getEconomyVelocity, MCP_TOOL_PRICES } = await import(
      '../../services/mcp/mcpPaymentService.js'
    );
    const velocity = await getEconomyVelocity({
      sinceHours: parseInt(req.query.sinceHours ?? '24', 10),
    });
    res.json({ data: { ...velocity, prices: MCP_TOOL_PRICES } });
  }),
);

router.post(
  '/webrtc/session',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { createAvatarStreamSession, getWebrtcConfig } = await import(
      '../../services/webrtc/avatarStreamService.js'
    );
    const session = await createAvatarStreamSession({
      userId: req.user.id,
      characterId: req.body.characterId,
      modalities: req.body.modalities ?? ['avatar3d', 'spatial_audio', 'text'],
      threadId: req.body.threadId,
    });
    res.status(201).json({ data: { session, config: getWebrtcConfig() } });
  }),
);

router.post(
  '/webrtc/session/:id/frame',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { pushMultimodalFrame } = await import('../../services/webrtc/avatarStreamService.js');
    const result = pushMultimodalFrame({
      sessionId: req.params.id,
      avatar: req.body.avatar,
      spatialAudio: req.body.spatialAudio,
      textDelta: req.body.textDelta,
    });
    res.json({ data: result });
  }),
);

/** Phase 36 — ZK governance, bio-cognitive, consensus */
router.get(
  '/governance/zk/config',
  authMiddleware,
  asyncHandler(async (_req, res) => {
    const { getZkGovernanceConfig, GOVERNANCE_POLICIES } = await import(
      '../../services/governance/zkAgentGovernanceService.js'
    );
    res.json({ data: { ...getZkGovernanceConfig(), policies: GOVERNANCE_POLICIES } });
  }),
);

router.post(
  '/governance/zk/prove',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const {
      proveAgentCompliance,
      persistProofNullifier,
    } = await import('../../services/governance/zkAgentGovernanceService.js');
    const issued = proveAgentCompliance({
      policyId: req.body.policyId ?? 'safety_guardrails',
      agentRole: req.body.agentRole ?? 'transaction',
      action: req.body.action ?? 'tools/call',
      agentJti: req.body.agentJti,
      characterId: req.body.characterId,
      userContext: req.body.userContext,
      memoryBankDigest: req.body.memoryBankDigest,
      taskResultDigest: req.body.taskResultDigest,
      guardrailPassed: req.body.guardrailPassed !== false,
      privacyPassed: req.body.privacyPassed !== false,
    });
    await persistProofNullifier(issued.nullifier, req.body.policyId ?? 'safety_guardrails', issued.proof.commitment);
    // Strip any accidental private fields — only public proof returned
    res.status(201).json({
      data: {
        proofToken: issued.proofToken,
        publicSignals: issued.publicSignals,
        nullifier: issued.nullifier,
        expiresAt: issued.expiresAt,
        proof: {
          protocol: issued.proof.protocol,
          curve: issued.proof.curve,
          pi_a: issued.proof.pi_a,
          pi_b: issued.proof.pi_b,
          pi_c: issued.proof.pi_c,
          publicSignals: issued.proof.publicSignals,
          policyId: issued.proof.policyId,
          action: issued.proof.action,
          agentRole: issued.proof.agentRole,
          nullifier: issued.proof.nullifier,
          commitment: issued.proof.commitment,
          expiresAt: issued.proof.expiresAt,
          v: issued.proof.v,
          sig: issued.proof.sig,
        },
      },
    });
  }),
);

router.post(
  '/governance/zk/verify',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { verifyAgentComplianceProof } = await import(
      '../../services/governance/zkAgentGovernanceService.js'
    );
    const result = verifyAgentComplianceProof(req.body.proofToken ?? req.body.proof, {
      expectedPolicy: req.body.expectedPolicy,
      expectedAction: req.body.expectedAction,
    });
    res.json({ data: result });
  }),
);

router.post(
  '/agents/:characterId/privileged',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { zkAgentGovernanceMiddleware } = await import(
      '../../services/governance/zkAgentGovernanceService.js'
    );
    await new Promise((resolve, reject) => {
      zkAgentGovernanceMiddleware({
        policyId: req.body.policyId ?? 'safety_guardrails',
        action: req.body.action ?? 'escrow:create',
        required: true,
      })(req, res, (err) => (err ? reject(err) : resolve()));
    });
    res.json({
      data: {
        authorized: true,
        characterId: req.params.characterId,
        governance: req.zkGovernance,
        note: 'Privileged action authorized via zk-SNARK governance proof',
      },
    });
  }),
);

router.post(
  '/cognitive/modulate',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { assessCognitiveState, modulateCognitiveControls } = await import(
      '../../services/cognitive/bioAdaptiveService.js'
    );
    const state = assessCognitiveState({
      bci: req.body.bci ?? {},
      biometrics: req.body.biometrics ?? {},
    });
    const controls = modulateCognitiveControls(state, {
      baseTemperature: req.body.baseTemperature,
      baseEmpathy: req.body.baseEmpathy,
    });
    res.json({ data: controls });
  }),
);

router.post(
  '/metaverse/crdt/merge',
  authMiddleware,
  asyncHandler(async (req, res) => {
    // Server acknowledges CRDT docs for cross-engine sync (authoritative merge is client-side CRDT)
    const doc = req.body.document ?? req.body;
    const { getIO } = await import('../../services/socketService.js');
    const io = getIO();
    const syncToken = req.body.syncToken;
    if (io && syncToken) {
      io.to(`metaverse:${syncToken}`).emit('metaverse_crdt_sync', {
        document: doc,
        from: req.user.id,
        at: Date.now(),
      });
    }
    res.json({
      data: {
        accepted: true,
        engines: ['flutter', 'unity', 'unreal', 'openxr'],
        lamport: doc?.lamport ?? null,
      },
    });
  }),
);

router.get(
  '/consensus/status',
  authMiddleware,
  asyncHandler(async (_req, res) => {
    const { getConsensusConfig, getCommittedLog } = await import(
      '../../services/consensus/raftConsensusMesh.js'
    );
    res.json({ data: { ...getConsensusConfig(), log: getCommittedLog({ limit: 20 }) } });
  }),
);

router.post(
  '/consensus/peers',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { registerPeer } = await import('../../services/consensus/raftConsensusMesh.js');
    res.status(201).json({
      data: registerPeer({
        peerId: req.body.peerId ?? `peer-${req.user.id.slice(0, 8)}`,
        region: req.body.region ?? 'local',
        webrtcEndpoint: req.body.webrtcEndpoint,
        weight: req.body.weight ?? 1,
      }),
    });
  }),
);

router.post(
  '/consensus/elect',
  authMiddleware,
  asyncHandler(async (_req, res) => {
    const { startElection } = await import('../../services/consensus/raftConsensusMesh.js');
    res.json({ data: startElection() });
  }),
);

router.post(
  '/consensus/propose',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { proposeEntry, startElection, getConsensusConfig } = await import(
      '../../services/consensus/raftConsensusMesh.js'
    );
    let result = proposeEntry(req.body.command ?? req.body);
    if (!result.accepted) {
      startElection();
      result = proposeEntry(req.body.command ?? req.body);
    }
    res.json({ data: { ...result, config: getConsensusConfig() } });
  }),
);

router.post(
  '/consensus/scale',
  authMiddleware,
  adminMiddleware,
  asyncHandler(async (req, res) => {
    const { recommendQuorumScale } = await import('../../services/consensus/raftConsensusMesh.js');
    res.json({
      data: recommendQuorumScale(req.body.trafficByRegion ?? req.body.traffic ?? {}),
    });
  }),
);

/** Phase 37 — A2A / Graph / ToT / Unified memory */
router.get(
  '/a2a/cards',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { listAgentCards, getA2aConfig } = await import('../../services/a2a/a2aProtocol.js');
    res.json({
      data: {
        config: getA2aConfig(),
        cards: listAgentCards({
          capability: req.query.capability,
          enterprise: req.query.enterprise === 'true' ? true : req.query.enterprise === 'false' ? false : null,
        }),
      },
    });
  }),
);

router.post(
  '/a2a/cards',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { registerAgentCard } = await import('../../services/a2a/a2aProtocol.js');
    const card = registerAgentCard(req.body);
    res.status(201).json({ data: card });
  }),
);

router.post(
  '/a2a/discover',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { discoverAgentsForTask } = await import('../../services/a2a/a2aProtocol.js');
    res.json({
      data: discoverAgentsForTask({
        task: req.body.task ?? req.body.message,
        requiredCapabilities: req.body.requiredCapabilities ?? [],
      }),
    });
  }),
);

router.post(
  '/a2a/delegate',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { discoverAndDelegate, createAcpMessage, dispatchAcp } = await import(
      '../../services/a2a/a2aProtocol.js'
    );
    if (req.body.to && req.body.method) {
      const message = createAcpMessage({
        from: req.body.from ?? 'status.api',
        to: req.body.to,
        method: req.body.method,
        params: req.body.params ?? {},
      });
      const result = await dispatchAcp(message, {
        userId: req.user.id,
        characterId: req.body.characterId,
      });
      return res.json({ data: { message, result } });
    }
    const result = await discoverAndDelegate({
      task: req.body.task ?? req.body.message,
      requiredCapabilities: req.body.requiredCapabilities ?? [],
      preferEnterprise: Boolean(req.body.preferEnterprise),
      tool: req.body.tool,
      arguments: req.body.arguments ?? {},
      ctx: { userId: req.user.id, characterId: req.body.characterId },
    });
    res.json({ data: result });
  }),
);

router.get(
  '/graph/config',
  authMiddleware,
  asyncHandler(async (_req, res) => {
    const { getGraphConfig } = await import('../../services/orchestration/graphOrchestrator.js');
    res.json({ data: getGraphConfig() });
  }),
);

router.post(
  '/graph/run',
  authMiddleware,
  graphOrchestratorInline,
  asyncHandler(async (req, res) => {
    const { runGraphToCompletion } = await import('../../services/orchestration/graphOrchestrator.js');
    const result = await runGraphToCompletion({
      input: req.body.input ?? req.body.message ?? req.body.task,
      userId: req.user.id,
      characterId: req.body.characterId,
      threadId: req.body.threadId,
    });
    res.status(201).json({ data: result });
  }),
);

router.get(
  '/graph/:runId',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { getGraphRun } = await import('../../services/orchestration/graphOrchestrator.js');
    const state = getGraphRun(req.params.runId);
    res.json({ data: { runId: state.runId, status: state.status, node: state.node, checkpoint: state.checkpoint, values: state.values } });
  }),
);

router.post(
  '/graph/:runId/resume',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { resumeGraph } = await import('../../services/orchestration/graphOrchestrator.js');
    const result = await resumeGraph(req.params.runId, {
      decision: req.body.decision ?? 'approve',
      userResponse: req.body.userResponse,
    });
    res.json({ data: result });
  }),
);

router.post(
  '/reason/tot',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { runTreeOfThoughts, getTotConfig } = await import(
      '../../services/reasoning/treeOfThoughtsService.js'
    );
    const tot = await runTreeOfThoughts({
      task: req.body.task ?? req.body.message,
      context: req.body.context ?? {},
      beamWidth: req.body.beamWidth,
      depth: req.body.depth,
    });
    res.json({ data: { ...tot, config: getTotConfig() } });
  }),
);

router.post(
  '/memory/unified',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { retrieveUnifiedMemory, getUnifiedMemoryConfig } = await import(
      '../../services/memory/unifiedMemoryService.js'
    );
    const result = await retrieveUnifiedMemory({
      userId: req.user.id,
      characterId: req.body.characterId,
      queryText: req.body.query ?? req.body.message,
      threadId: req.body.threadId,
      recentMessages: req.body.recentMessages ?? [],
      episodicEvents: req.body.episodicEvents ?? [],
      metadata: req.body.metadata ?? {},
      ragOptions: req.body.ragOptions ?? {},
    });
    res.json({ data: { ...result, config: getUnifiedMemoryConfig() } });
  }),
);

/** Phase 38 — Command Center, governance, audit, kill switch, zero-copy */
router.get(
  '/ops/command-center',
  authMiddleware,
  adminMiddleware,
  asyncHandler(async (_req, res) => {
    const { getCommandCenterSnapshot } = await import(
      '../../services/ops/agentCommandCenterService.js'
    );
    res.json({ data: await getCommandCenterSnapshot() });
  }),
);

router.get(
  '/governance/policy',
  authMiddleware,
  asyncHandler(async (_req, res) => {
    const { getGovernancePolicy, NIST_AI_RMF } = await import(
      '../../services/governance/governanceAsCode.js'
    );
    res.json({ data: { policy: getGovernancePolicy(), nist: NIST_AI_RMF } });
  }),
);

router.post(
  '/governance/evaluate',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { evaluateGovernance, initializeAgentWithGovernance } = await import(
      '../../services/governance/governanceAsCode.js'
    );
    const binding = initializeAgentWithGovernance({
      agentRole: req.body.agentRole ?? 'transaction',
      characterId: req.body.characterId,
      userId: req.user.id,
    });
    const decision = evaluateGovernance({
      action: req.body.action,
      tags: req.body.tags ?? [],
      amount: req.body.amount,
      agentBinding: binding,
    });
    res.json({ data: { binding, decision } });
  }),
);

router.get(
  '/ops/audit',
  authMiddleware,
  adminMiddleware,
  asyncHandler(async (req, res) => {
    const { listAuditEvents, verifyAuditChain, getAuditTip } = await import(
      '../../services/security/immutableAuditLedger.js'
    );
    const events = await listAuditEvents({
      limit: parseInt(req.query.limit ?? '50', 10),
      type: req.query.type ?? null,
    });
    res.json({
      data: {
        tip: getAuditTip(),
        integrity: verifyAuditChain(events.slice().reverse()),
        events,
      },
    });
  }),
);

router.get(
  '/ops/kill-switch',
  authMiddleware,
  adminMiddleware,
  asyncHandler(async (_req, res) => {
    const { getKillSwitchState } = await import('../../services/security/globalKillSwitchService.js');
    res.json({ data: getKillSwitchState() });
  }),
);

router.post(
  '/ops/kill-switch',
  authMiddleware,
  adminMiddleware,
  asyncHandler(async (req, res) => {
    const { engageKillSwitch, releaseKillSwitch, getKillSwitchState } = await import(
      '../../services/security/globalKillSwitchService.js'
    );
    if (req.body?.engage === false || req.body?.action === 'release') {
      await releaseKillSwitch({ by: req.user.id, userId: req.user.id });
    } else {
      await engageKillSwitch({
        by: req.user.id,
        reason: req.body?.reason ?? 'dashboard_kill_switch',
        userId: req.user.id,
      });
    }
    res.json({ data: getKillSwitchState() });
  }),
);

router.get(
  '/context/zero-copy',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { queryLiveSignalsInPlace, getZeroCopyConfig } = await import(
      '../../services/context/zeroCopyQueryService.js'
    );
    const live = await queryLiveSignalsInPlace({
      userId: req.user.id,
      characterId: req.query.characterId,
      limit: parseInt(req.query.limit ?? '8', 10),
    });
    res.json({ data: { ...live, config: getZeroCopyConfig() } });
  }),
);

/** Phase 39 — Puppeteer, hologram, duplex voice, DAG quorum */
router.get(
  '/puppeteer/config',
  authMiddleware,
  asyncHandler(async (_req, res) => {
    const { getPuppeteerConfig } = await import('../../services/orchestration/puppeteerOrchestrator.js');
    res.json({ data: getPuppeteerConfig() });
  }),
);

router.post(
  '/puppeteer/assemble',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { assembleTopology, analyzePromptComplexity } = await import(
      '../../services/orchestration/puppeteerOrchestrator.js'
    );
    const topology = assembleTopology({
      prompt: req.body.prompt ?? req.body.message ?? req.body.task,
      userId: req.user.id,
      characterId: req.body.characterId,
      preferCost: req.body.preferCost,
    });
    res.status(201).json({
      data: { topology, analysis: analyzePromptComplexity(req.body.prompt ?? req.body.message) },
    });
  }),
);

router.post(
  '/puppeteer/run',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { runPuppeteerSwarm, puppeteerOrchestratorMiddleware } = await import(
      '../../services/orchestration/puppeteerOrchestrator.js'
    );
    await new Promise((resolve, reject) => {
      puppeteerOrchestratorMiddleware()(req, res, (err) => (err ? reject(err) : resolve()));
    });
    const result = await runPuppeteerSwarm({
      prompt: req.body.prompt ?? req.body.message ?? req.body.task,
      userId: req.user.id,
      characterId: req.body.characterId,
      preferCost: req.body.preferCost,
      requireQuorum: req.body.requireQuorum,
    });
    res.json({ data: result });
  }),
);

router.post(
  '/puppeteer/:topologyId/reconfigure',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { reconfigureTopology } = await import('../../services/orchestration/puppeteerOrchestrator.js');
    res.json({
      data: reconfigureTopology(req.params.topologyId, {
        addRoles: req.body.addRoles ?? [],
        removeRoles: req.body.removeRoles ?? [],
        reason: req.body.reason,
      }),
    });
  }),
);

router.get(
  '/hologram/config',
  authMiddleware,
  asyncHandler(async (_req, res) => {
    const { getHologramConfig } = await import('../../services/spatial/holographicSwarmService.js');
    res.json({ data: getHologramConfig() });
  }),
);

router.post(
  '/voice/duplex/session',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { createDuplexVoiceSession, getCognitiveVoiceConfig } = await import(
      '../../services/voice/cognitiveVoiceDuplexService.js'
    );
    const session = createDuplexVoiceSession({
      userId: req.user.id,
      characterId: req.body.characterId,
      bci: req.body.bci ?? {},
      biometrics: req.body.biometrics ?? {},
    });
    res.status(201).json({ data: { session, config: getCognitiveVoiceConfig() } });
  }),
);

router.post(
  '/voice/duplex/:sessionId/chunk',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { pushDuplexAgentChunk } = await import('../../services/voice/cognitiveVoiceDuplexService.js');
    res.json({
      data: pushDuplexAgentChunk({
        sessionId: req.params.sessionId,
        textDelta: req.body.textDelta,
        pcmBase64: req.body.pcmBase64,
        isFinal: Boolean(req.body.isFinal),
      }),
    });
  }),
);

router.post(
  '/voice/duplex/:sessionId/prosody',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { updateDuplexProsody } = await import('../../services/voice/cognitiveVoiceDuplexService.js');
    res.json({
      data: updateDuplexProsody(req.params.sessionId, {
        bci: req.body.bci ?? {},
        biometrics: req.body.biometrics ?? {},
      }),
    });
  }),
);

router.post(
  '/voice/duplex/:sessionId/barge-in',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { handleUserBargeIn } = await import('../../services/voice/cognitiveVoiceDuplexService.js');
    res.json({
      data: handleUserBargeIn({
        sessionId: req.params.sessionId,
        energy: req.body.energy ?? 0.7,
      }),
    });
  }),
);

router.get(
  '/consensus/dag',
  authMiddleware,
  asyncHandler(async (_req, res) => {
    const { getDagQuorumConfig, listDagVertices, getDagTip } = await import(
      '../../services/consensus/dagQuorumLedger.js'
    );
    res.json({
      data: {
        config: getDagQuorumConfig(),
        tip: getDagTip(),
        recent: listDagVertices({ limit: 20 }),
      },
    });
  }),
);

router.post(
  '/consensus/dag/propose',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { proposeDagOperation } = await import('../../services/consensus/dagQuorumLedger.js');
    const result = await proposeDagOperation({
      operation: req.body.operation ?? 'high_stakes',
      payload: req.body.payload ?? {},
      proposerId: req.body.proposerId ?? 'status.puppeteer',
      voterIds: req.body.voterIds ?? ['status.research', 'status.dialogue', 'status.tools'],
      autoSignHonest: req.body.autoSignHonest !== false,
    });
    res.status(result.committed ? 201 : 202).json({ data: result });
  }),
);

router.post(
  '/consensus/dag/vote',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { castDagVote } = await import('../../services/consensus/dagQuorumLedger.js');
    res.json({
      data: castDagVote({
        proposalId: req.body.proposalId,
        agentId: req.body.agentId,
        approve: req.body.approve !== false,
      }),
    });
  }),
);

/** Phase 40 — Ambient fabric, exascale distill, code synthesis, freeze status */
router.post(
  '/ambient/infer',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { inferAmbientSuggestions, getAmbientConfig } = await import(
      '../../services/ambient/ambientSuggestionService.js'
    );
    const result = inferAmbientSuggestions({
      transcript: req.body.transcript ?? req.body.text ?? '',
      activity: req.body.activity,
      locationLabel: req.body.locationLabel,
      calendarBusy: Boolean(req.body.calendarBusy),
      recentIntent: req.body.recentIntent,
    });
    res.json({ data: { ...result, config: getAmbientConfig() } });
  }),
);

router.post(
  '/ambient/accept',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { acceptAmbientSuggestion } = await import(
      '../../services/ambient/ambientSuggestionService.js'
    );
    const job = await acceptAmbientSuggestion({
      suggestion: req.body.suggestion ?? req.body,
      userId: req.user.id,
      characterId: req.body.characterId,
    });
    res.status(202).json({ data: job });
  }),
);

router.post(
  '/memory/distill',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { distillInfiniteContext, getExascaleRagConfig } = await import(
      '../../services/context/contextDistillationService.js'
    );
    const result = await distillInfiniteContext({
      userId: req.user.id,
      characterId: req.body.characterId,
      queryText: req.body.query ?? req.body.message ?? '',
      recentMessages: req.body.recentMessages ?? [],
      episodicEvents: req.body.episodicEvents ?? [],
      tokenBudget: req.body.tokenBudget,
      metadata: req.body.metadata ?? {},
    });
    res.json({ data: { ...result, config: getExascaleRagConfig() } });
  }),
);

router.get(
  '/devops/synthesis/config',
  authMiddleware,
  adminMiddleware,
  asyncHandler(async (_req, res) => {
    const { getCodeSynthesisConfig } = await import(
      '../../services/devops/githubPrSynthesisService.js'
    );
    res.json({ data: getCodeSynthesisConfig() });
  }),
);

router.post(
  '/devops/synthesis',
  authMiddleware,
  adminMiddleware,
  asyncHandler(async (req, res) => {
    const { runAutonomousSynthesisPipeline, synthesizeCodeChange } = await import(
      '../../services/devops/githubPrSynthesisService.js'
    );
    if (req.body?.pipeline === false) {
      const artifact = await synthesizeCodeChange({
        title: req.body.title,
        description: req.body.description,
        kind: req.body.kind ?? 'refactor',
        targetPaths: req.body.targetPaths ?? [],
        errorEvent: req.body.errorEvent,
        requestedBy: req.user.id,
      });
      return res.status(201).json({ data: artifact });
    }
    const result = await runAutonomousSynthesisPipeline({
      title: req.body.title,
      description: req.body.description,
      kind: req.body.kind ?? 'refactor',
      targetPaths: req.body.targetPaths ?? [],
      errorEvent: req.body.errorEvent,
      requestedBy: req.user.id,
    });
    res.status(201).json({ data: result });
  }),
);

router.get(
  '/ops/freeze',
  authMiddleware,
  adminMiddleware,
  asyncHandler(async (_req, res) => {
    res.json({
      data: {
        goldenMaster: '2.0.0',
        autopilot: 'continuous',
        v3Blueprint: 'docs/V3_GENESIS_ARCHITECTURE.md',
        freezeScript: 'scripts/golden_master_2_freeze.sh',
        locks: [
          'no_force_push_main',
          'no_skip_hooks',
          'v1_backward_compatible',
          'rls_tenant_isolation',
        ],
      },
    });
  }),
);

/** Phase 41 — Quantum hybrid, ROS 2, alignment, DTN */
router.post(
  '/quantum/allocate',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { allocateAgentResources, getQuantumHybridConfig } = await import(
      '../../services/quantum/quantumHybridSolver.js'
    );
    const result = await allocateAgentResources({
      agents: req.body.agents ?? [],
      resources: req.body.resources ?? [],
      seed: req.body.seed,
    });
    res.json({ data: { ...result, config: getQuantumHybridConfig() } });
  }),
);

router.post(
  '/quantum/rag-path',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { optimizeRagPath } = await import('../../services/quantum/quantumHybridSolver.js');
    const result = await optimizeRagPath({
      nodes: req.body.nodes ?? [],
      queryText: req.body.query ?? req.body.queryText ?? '',
      topK: req.body.topK ?? 5,
    });
    res.json({ data: result });
  }),
);

router.post(
  '/quantum/tune-distill',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { tuneDistillationHyperparams } = await import(
      '../../services/quantum/quantumHybridSolver.js'
    );
    const result = await tuneDistillationHyperparams(req.body ?? {});
    res.json({ data: result });
  }),
);

router.get(
  '/robotics/config',
  authMiddleware,
  asyncHandler(async (_req, res) => {
    const { getRos2BridgeConfig } = await import('../../services/robotics/ros2McpBridge.js');
    res.json({ data: getRos2BridgeConfig() });
  }),
);

router.post(
  '/robotics/telemetry',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { ingestRos2Telemetry, listRecentTelemetry, formatRoboticsPromptBlock } = await import(
      '../../services/robotics/ros2McpBridge.js'
    );
    const entry = ingestRos2Telemetry(req.body ?? {});
    const recent = listRecentTelemetry({ limit: req.body.limit ?? 8, kind: req.body.kind });
    res.status(201).json({
      data: {
        entry,
        recent,
        promptBlock: formatRoboticsPromptBlock(recent),
      },
    });
  }),
);

router.post(
  '/robotics/actuate',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { queueRos2Actuation } = await import('../../services/robotics/ros2McpBridge.js');
    const cmd = await queueRos2Actuation({
      ...req.body,
      agentId: req.user.id,
    });
    res.status(202).json({ data: cmd });
  }),
);

router.post(
  '/robotics/bind',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { bindEmbodiment } = await import('../../services/robotics/ros2McpBridge.js');
    res.status(201).json({ data: bindEmbodiment(req.body ?? {}) });
  }),
);

router.post(
  '/alignment/observe',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { observeAlignmentTurn, getAlignmentConfig } = await import(
      '../../services/alignment/syntheticAlignmentBench.js'
    );
    const result = observeAlignmentTurn({
      agentId: req.body.agentId ?? 'status.dialogue',
      characterId: req.body.characterId,
      prompt: req.body.prompt ?? '',
      response: req.body.response ?? '',
      action: req.body.action,
      amount: req.body.amount ?? 0,
    });
    res.json({ data: { ...result, config: getAlignmentConfig() } });
  }),
);

router.post(
  '/alignment/bench',
  authMiddleware,
  adminMiddleware,
  asyncHandler(async (req, res) => {
    const { runSyntheticAlignmentSuite } = await import(
      '../../services/alignment/syntheticAlignmentBench.js'
    );
    res.json({ data: runSyntheticAlignmentSuite({ cases: req.body.cases }) });
  }),
);

router.get(
  '/consensus/dtn/config',
  authMiddleware,
  asyncHandler(async (_req, res) => {
    const { getDtnConfig } = await import('../../services/consensus/dtnBundleProtocol.js');
    res.json({ data: getDtnConfig() });
  }),
);

router.post(
  '/consensus/dtn/bundle',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { createBundle, executeLocalDtnTransaction } = await import(
      '../../services/consensus/dtnBundleProtocol.js'
    );
    if (req.body?.transaction) {
      const out = executeLocalDtnTransaction({
        nodeId: req.body.nodeId ?? 'edge-1',
        operation: req.body.operation ?? 'ledger_append',
        payload: req.body.payload ?? {},
        destNode: req.body.destNode ?? 'core',
      });
      return res.status(201).json({ data: out });
    }
    const bundle = createBundle(req.body ?? {});
    res.status(201).json({ data: bundle });
  }),
);

router.post(
  '/consensus/dtn/reconcile',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { reconcileDtnState } = await import('../../services/consensus/dtnBundleProtocol.js');
    const result = await reconcileDtnState({
      connected: req.body.connected !== false,
      nodeId: req.body.nodeId ?? 'edge-1',
    });
    res.json({ data: result });
  }),
);

/** Phase 42 — Photonic, molecular DNA, LEO mesh, continuity */
router.post(
  '/photonic/matmul',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { photonicMatmul, getPhotonicConfig } = await import(
      '../../services/photonic/photonicComputeService.js'
    );
    const result = photonicMatmul(req.body.a ?? [[1, 0], [0, 1]], req.body.b ?? [[1, 0], [0, 1]]);
    res.json({ data: { ...result, config: getPhotonicConfig() } });
  }),
);

router.post(
  '/photonic/search',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { photonicVectorSearch, photonicDecodeIntent } = await import(
      '../../services/photonic/photonicComputeService.js'
    );
    if (req.body?.intentFeatures) {
      return res.json({ data: photonicDecodeIntent(req.body.intentFeatures) });
    }
    res.json({
      data: photonicVectorSearch(req.body.query ?? [], req.body.corpus ?? []),
    });
  }),
);

router.get(
  '/photonic/config',
  authMiddleware,
  asyncHandler(async (_req, res) => {
    const { getPhotonicConfig } = await import('../../services/photonic/photonicComputeService.js');
    res.json({ data: getPhotonicConfig() });
  }),
);

router.post(
  '/storage/molecular/archive',
  authMiddleware,
  adminMiddleware,
  asyncHandler(async (req, res) => {
    const { archiveToMolecularStorage, getMolecularStorageConfig } = await import(
      '../../services/storage/molecularDnaEncoder.js'
    );
    const artifact = await archiveToMolecularStorage({
      label: req.body.label ?? 'memory-ledger',
      records: req.body.records ?? [],
      metadata: req.body.metadata ?? {},
    });
    const { _shards, _dna, ...safe } = artifact;
    res.status(201).json({ data: { ...safe, config: getMolecularStorageConfig() } });
  }),
);

router.get(
  '/storage/molecular/retrieve/:id',
  authMiddleware,
  adminMiddleware,
  asyncHandler(async (req, res) => {
    const { retrieveMolecularArchive } = await import(
      '../../services/storage/molecularDnaEncoder.js'
    );
    res.json({ data: await retrieveMolecularArchive(req.params.id) });
  }),
);

router.get(
  '/network/leo/config',
  authMiddleware,
  asyncHandler(async (_req, res) => {
    const { getLeoMeshConfig } = await import('../../services/network/leoOrbitalMeshRouter.js');
    res.json({ data: getLeoMeshConfig() });
  }),
);

router.post(
  '/network/leo/route',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { selectOrbitalRoute, compensateDoppler } = await import(
      '../../services/network/leoOrbitalMeshRouter.js'
    );
    const route = selectOrbitalRoute({
      latDeg: req.body.latDeg ?? 0,
      lonDeg: req.body.lonDeg ?? 0,
      preferMaritime: Boolean(req.body.preferMaritime),
      atMs: req.body.atMs,
    });
    res.json({
      data: {
        route,
        dopplerCheck: compensateDoppler({
          radialVelocityKmS: route.geometry.radialVelocityKmS,
          frequencyHz: req.body.frequencyHz,
        }),
      },
    });
  }),
);

router.post(
  '/network/leo/sync',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { syncViaLeoMesh } = await import('../../services/network/leoOrbitalMeshRouter.js');
    const result = await syncViaLeoMesh({
      edgeNodeId: req.body.edgeNodeId ?? 'maritime-1',
      groundNodeId: req.body.groundNodeId ?? 'gs-atlantic',
      payload: req.body.payload ?? {},
      latDeg: req.body.latDeg ?? 0,
      lonDeg: req.body.lonDeg ?? 0,
      connected: req.body.connected !== false,
    });
    res.status(202).json({ data: result });
  }),
);

router.post(
  '/continuity/capsule',
  authMiddleware,
  adminMiddleware,
  asyncHandler(async (req, res) => {
    const { createContinuityCapsule, getContinuityConfig } = await import(
      '../../services/continuity/interplanetaryContinuity.js'
    );
    const result = await createContinuityCapsule({
      agentId: req.body.agentId ?? `agent-${req.user.id}`,
      characterId: req.body.characterId,
      state: req.body.state ?? {},
      memoryRecords: req.body.memoryRecords ?? [],
    });
    res.status(201).json({ data: { ...result, config: getContinuityConfig() } });
  }),
);

router.post(
  '/continuity/recover',
  authMiddleware,
  adminMiddleware,
  asyncHandler(async (req, res) => {
    const { recoverAgentFromCapsule, runContinuityDaemonTick } = await import(
      '../../services/continuity/interplanetaryContinuity.js'
    );
    if (req.body?.daemonTick) {
      return res.json({
        data: await runContinuityDaemonTick({
          missingAgentIds: req.body.missingAgentIds ?? [],
        }),
      });
    }
    res.json({
      data: await recoverAgentFromCapsule({
        capsuleId: req.body.capsuleId,
        preferredCluster: req.body.preferredCluster,
      }),
    });
  }),
);

/** Phase 43 — Organoid, entanglement sync, energy router, meta-compiler */
router.post(
  '/organoid/sparse',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { spikesToSparse, getOrganoidConfig } = await import(
      '../../services/organoid/organoidComputeService.js'
    );
    res.json({
      data: { ...spikesToSparse(req.body.spikes ?? []), config: getOrganoidConfig() },
    });
  }),
);

router.post(
  '/organoid/recall',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { associativeRecall } = await import('../../services/organoid/organoidComputeService.js');
    res.json({
      data: associativeRecall(req.body.query ?? [], req.body.bank ?? []),
    });
  }),
);

router.post(
  '/quantum/entangle',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { entangleNodes, getEntanglementConfig } = await import(
      '../../services/quantum/entanglementSyncService.js'
    );
    const pair = entangleNodes({
      nodes: req.body.nodes ?? ['node-a', 'node-b'],
      dimension: req.body.dimension ?? 64,
      seed: req.body.seed,
    });
    res.status(201).json({ data: { ...pair, config: getEntanglementConfig() } });
  }),
);

router.post(
  '/quantum/entangle/sync',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { syncEntangledMemory, measureEntangledState } = await import(
      '../../services/quantum/entanglementSyncService.js'
    );
    const result = syncEntangledMemory({
      pairId: req.body.pairId,
      fromNode: req.body.fromNode,
      vector: req.body.vector ?? [],
      metadata: req.body.metadata ?? {},
    });
    res.json({
      data: { ...result, measured: measureEntangledState(req.body.pairId) },
    });
  }),
);

router.get(
  '/devops/energy/config',
  authMiddleware,
  asyncHandler(async (_req, res) => {
    const { getEnergyRouterConfig } = await import(
      '../../services/devops/energyAwareWorkloadRouter.js'
    );
    res.json({ data: getEnergyRouterConfig() });
  }),
);

router.post(
  '/devops/energy/route',
  authMiddleware,
  adminMiddleware,
  asyncHandler(async (req, res) => {
    const { routeEnergyAwareWorkload } = await import(
      '../../services/devops/energyAwareWorkloadRouter.js'
    );
    const plan = await routeEnergyAwareWorkload({
      workload: req.body.workload ?? { type: 'inference', flopsEstimate: 1e12 },
      signals: req.body.signals ?? {},
      preferOrbital: Boolean(req.body.preferOrbital),
      maxSites: req.body.maxSites ?? 2,
    });
    res.json({ data: plan });
  }),
);

router.get(
  '/devops/meta-compiler/config',
  authMiddleware,
  adminMiddleware,
  asyncHandler(async (_req, res) => {
    const { getMetaCompilerConfig } = await import('../../services/devops/metaCompilerDaemon.js');
    res.json({ data: getMetaCompilerConfig() });
  }),
);

router.post(
  '/devops/meta-compiler/tick',
  authMiddleware,
  adminMiddleware,
  asyncHandler(async (req, res) => {
    const { runMetaCompilerTick, analyzeBottlenecks, proposeSandboxedRewrite, sandboxCompile } =
      await import('../../services/devops/metaCompilerDaemon.js');
    if (req.body?.proposeOnly) {
      const [b] = analyzeBottlenecks(req.body.metrics ?? req.body);
      const proposal = await proposeSandboxedRewrite(b);
      const compiled = await sandboxCompile(proposal);
      return res.status(201).json({ data: { proposal, compiled } });
    }
    res.json({ data: await runMetaCompilerTick(req.body.metrics ?? req.body) });
  }),
);

/** Phase 44 — Global Brain, chrono paradox, Dyson, Genesis Key */
router.get(
  '/ops/global-brain',
  authMiddleware,
  adminMiddleware,
  asyncHandler(async (req, res) => {
    const { getGlobalBrainSnapshot, getGlobalBrainConfig } = await import(
      '../../services/sentience/globalBrainService.js'
    );
    const signals = (() => {
      try {
        return req.query.signals ? JSON.parse(String(req.query.signals)) : {};
      } catch {
        return {};
      }
    })();
    const snap = await getGlobalBrainSnapshot({
      signals,
      autoTune: req.query.autoTune !== 'false',
    });
    res.json({ data: { ...snap, config: getGlobalBrainConfig() } });
  }),
);

router.post(
  '/ops/global-brain/tune',
  authMiddleware,
  adminMiddleware,
  asyncHandler(async (req, res) => {
    const { predictRegionalSpikes, tuneGlobalBandwidth, getGlobalBrainSnapshot } = await import(
      '../../services/sentience/globalBrainService.js'
    );
    const predictions = predictRegionalSpikes({ signals: req.body.signals ?? {} });
    const tuning = tuneGlobalBandwidth({ predictions, dampening: req.body.dampening ?? 0.35 });
    const snap = await getGlobalBrainSnapshot({ signals: req.body.signals ?? {}, autoTune: false });
    res.json({ data: { tuning, snapshot: { ...snap, regions: tuning.allocations } } });
  }),
);

router.post(
  '/context/chrono/branch',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { openChronoBranch, appendChronoEvent, getChronoConfig } = await import(
      '../../services/context/chronoParadoxResolver.js'
    );
    const branch = openChronoBranch({
      nodeId: req.body.nodeId ?? 'edge-deep',
      environment: req.body.environment ?? 'deep-space',
      baseVectorClock: req.body.baseVectorClock ?? {},
    });
    if (req.body.event) {
      appendChronoEvent(branch.branchId, req.body.event);
    }
    res.status(201).json({ data: { branch, config: getChronoConfig() } });
  }),
);

router.post(
  '/context/chrono/event',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { appendChronoEvent } = await import('../../services/context/chronoParadoxResolver.js');
    const event = appendChronoEvent(req.body.branchId, req.body);
    res.status(201).json({ data: event });
  }),
);

router.post(
  '/context/chrono/sync',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { syncChronoBranchToGlobal, detectChronoConflicts, resolveChronoConflicts } = await import(
      '../../services/context/chronoParadoxResolver.js'
    );
    if (req.body?.resolveOnly) {
      const conflicts = detectChronoConflicts(req.body.local ?? [], req.body.remote ?? []);
      return res.json({ data: { conflicts, resolutions: resolveChronoConflicts(conflicts) } });
    }
    const result = await syncChronoBranchToGlobal({
      branchId: req.body.branchId,
      globalMemories: req.body.globalMemories ?? [],
      persist: req.body.persist !== false,
    });
    res.json({ data: result });
  }),
);

router.get(
  '/devops/dyson/config',
  authMiddleware,
  asyncHandler(async (_req, res) => {
    const { getDysonOrchestrationConfig } = await import(
      '../../services/devops/dysonEnergyOrchestrator.js'
    );
    res.json({ data: getDysonOrchestrationConfig() });
  }),
);

router.post(
  '/devops/dyson/route',
  authMiddleware,
  adminMiddleware,
  asyncHandler(async (req, res) => {
    const { routeDysonianWorkload } = await import(
      '../../services/devops/dysonEnergyOrchestrator.js'
    );
    const plan = await routeDysonianWorkload({
      workload: req.body.workload ?? { type: 'pretrain', flopsEstimate: 1e18 },
      signals: req.body.signals ?? {},
      irradianceWm2: req.body.irradianceWm2,
      forceOrbitalPretrain: req.body.forceOrbitalPretrain !== false,
      maxSites: req.body.maxSites ?? 2,
    });
    res.json({ data: plan });
  }),
);

router.get(
  '/ops/genesis-key',
  authMiddleware,
  adminMiddleware,
  asyncHandler(async (_req, res) => {
    const { getGenesisKeyStatus } = await import('../../services/security/genesisKeyService.js');
    res.json({ data: getGenesisKeyStatus() });
  }),
);

router.post(
  '/ops/genesis-key/rotate',
  authMiddleware,
  adminMiddleware,
  asyncHandler(async (req, res) => {
    const { rotateGenesisKey } = await import('../../services/security/genesisKeyService.js');
    const record = await rotateGenesisKey({
      rotatedBy: req.body.rotatedBy ?? req.user.id,
      confirmToken: req.body.confirmToken,
    });
    res.status(201).json({ data: record });
  }),
);

export default router;

async function graphOrchestratorInline(req, _res, next) {
  try {
    const { graphOrchestratorMiddleware } = await import(
      '../../services/orchestration/graphOrchestrator.js'
    );
    return graphOrchestratorMiddleware()(req, _res, next);
  } catch (err) {
    next(err);
  }
}

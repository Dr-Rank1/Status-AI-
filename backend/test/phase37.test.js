import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import {
  registerAgentCard,
  listAgentCards,
  discoverAgentsForTask,
  createAcpMessage,
  dispatchAcp,
  discoverAndDelegate,
  getA2aConfig,
  _resetA2aRegistry,
  ACP_VERSION,
} from '../src/services/a2a/a2aProtocol.js';
import {
  compileDefaultGraph,
  runGraphToCompletion,
  resumeGraph,
  getGraphConfig,
  graphOrchestratorMiddleware,
} from '../src/services/orchestration/graphOrchestrator.js';
import {
  expandThoughts,
  evaluateThought,
  runTreeOfThoughts,
  getTotConfig,
} from '../src/services/reasoning/treeOfThoughtsService.js';
import {
  filterByMetadata,
  rerankMemories,
  retrieveUnifiedMemory,
  getUnifiedMemoryConfig,
} from '../src/services/memory/unifiedMemoryService.js';

describe('Phase 37 — A2A / ACP', () => {
  before(() => _resetA2aRegistry());

  it('lists local agent cards and discovers by capability', () => {
    const cards = listAgentCards();
    assert.ok(cards.length >= 4);
    assert.equal(getA2aConfig().acpVersion, ACP_VERSION);

    const found = discoverAgentsForTask({ task: 'search the lore wiki' });
    assert.ok(found.some((c) => c.agentId === 'status.research'));
  });

  it('registers enterprise cards and dispatches ACP ping', async () => {
    registerAgentCard({
      agentId: 'enterprise.crm',
      name: 'CRM Agent',
      capabilities: ['crm:read'],
      endpoint: 'https://example.com/acp',
      enterprise: true,
    });
    assert.ok(listAgentCards({ enterprise: true }).some((c) => c.agentId === 'enterprise.crm'));

    const msg = createAcpMessage({
      from: 'status.api',
      to: 'status.research',
      method: 'ping',
    });
    const pong = await dispatchAcp(msg);
    assert.equal(pong.ok, true);
  });

  it('discoverAndDelegate routes to a matching agent', async () => {
    const out = await discoverAndDelegate({
      task: 'hello world',
      from: 'status.test',
      ctx: {},
    });
    assert.ok(out.chosen.agentId);
    assert.ok(out.result.delegated);
  });
});

describe('Phase 37 — Graph orchestrator', () => {
  it('compiles cyclical graph with HITL node', () => {
    const g = compileDefaultGraph();
    assert.ok(g.nodes.hitl);
    assert.ok(g.edges.some((e) => e.when === 'retry'));
    assert.ok(getGraphConfig().features.includes('checkpoints'));
  });

  it('runs a simple graph to completion', async () => {
    const { state } = await runGraphToCompletion({
      input: 'Say hello briefly',
      userId: null,
      characterId: null,
    });
    assert.ok(['completed', 'interrupted', 'running'].includes(state.status));
    assert.ok(state.checkpoint || state.status === 'completed');
  });

  it('attaches middleware helpers', () => {
    const req = { user: { id: 'u1' }, body: {} };
    let ok = false;
    graphOrchestratorMiddleware()(req, {}, () => { ok = true; });
    assert.ok(req.graphOrchestrator.create);
    assert.equal(ok, true);
  });
});

describe('Phase 37 — Tree-of-Thoughts', () => {
  it('expands and scores parallel thoughts', () => {
    const thoughts = expandThoughts('Should I pay now or later?', { beamWidth: 3 });
    assert.equal(thoughts.length, 3);
    const scored = evaluateThought(thoughts.find((t) => t.strategy === 'risk') ?? thoughts[0], {
      task: 'Should I pay now or later?',
    });
    assert.ok(scored > 0);
  });

  it('selects an optimal path', async () => {
    const tot = await runTreeOfThoughts({
      task: 'What if we compare two options for the schedule?',
      beamWidth: 3,
      depth: 2,
    });
    assert.equal(tot.engine, 'tree-of-thoughts/v1');
    assert.ok(tot.best.strategy);
    assert.ok(tot.path.length >= 1);
    assert.ok(getTotConfig().parallel);
  });
});

describe('Phase 37 — Unified memory RAG', () => {
  it('filters by metadata and re-ranks', () => {
    const items = [
      { content: 'alpha coffee', memory_type: 'dm_turn', importance: 0.9, similarity: 0.5, created_at: new Date().toISOString() },
      { content: 'beta tea', memory_type: 'episodic', importance: 0.2, similarity: 0.9, created_at: '2020-01-01' },
    ];
    const filtered = filterByMetadata(items, { memoryTypes: ['dm_turn'] });
    assert.equal(filtered.length, 1);
    const ranked = rerankMemories(items, { queryText: 'coffee please', topK: 2 });
    assert.equal(ranked[0].content.includes('coffee'), true);
    assert.ok(ranked[0].rerankScore >= ranked[1].rerankScore);
  });

  it('retrieves unified layers', async () => {
    const result = await retrieveUnifiedMemory({
      queryText: 'hello',
      recentMessages: [{ content: 'hi there' }],
      episodicEvents: [{ content: 'met at cafe', importance: 0.7 }],
    });
    assert.equal(result.engine, 'unified-memory/v1');
    assert.ok(result.counts.shortTerm >= 1);
    assert.ok(getUnifiedMemoryConfig().features.includes('rerank'));
  });
});

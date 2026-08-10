import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  TEMPORAL_KG_SCHEMA_CYPHER,
  formatTemporalPromptBlock,
  getTemporalKgConfig,
} from '../src/services/context/temporalKnowledgeGraph.js';
import {
  priceForTool,
  recordEconomyLedger,
  getEconomyVelocity,
  settleMcpToolPayment,
  MCP_TOOL_PRICES,
} from '../src/services/mcp/mcpPaymentService.js';
import {
  getWebrtcConfig,
  createAvatarStreamSession,
  signalAvatarStream,
  pushMultimodalFrame,
} from '../src/services/webrtc/avatarStreamService.js';
import { AppError } from '../src/utils/errors.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('Phase 35 — Temporal Knowledge Graph', () => {
  it('exports Neo4j schema with temporal relationship types', () => {
    assert.match(TEMPORAL_KG_SCHEMA_CYPHER, /RELATES_TO/);
    assert.match(TEMPORAL_KG_SCHEMA_CYPHER, /REMEMBERS/);
    assert.match(TEMPORAL_KG_SCHEMA_CYPHER, /validFrom/);
  });

  it('formats temporal prompt blocks', () => {
    const block = formatTemporalPromptBlock({
      relation: { depth: 3, affinity: 22, validFrom: '2026-01-01' },
      memories: [{ validFrom: '2026-01-02', content: 'Liked coffee' }],
    });
    assert.ok(block.includes('depth=3'));
    assert.ok(block.includes('Liked coffee'));
  });

  it('reports temporal KG config', () => {
    const cfg = getTemporalKgConfig();
    assert.ok(cfg.schemaVersion);
    assert.ok(['neo4j', 'postgres'].includes(cfg.backend));
  });
});

describe('Phase 35 — MCP HTTP 402 micro-economy', () => {
  it('prices specialized tools', () => {
    assert.equal(priceForTool('web_search')?.payeeRole, 'research');
    assert.ok(MCP_TOOL_PRICES.web_search.amount >= 1);
  });

  it('requires payment when payer character missing', async () => {
    process.env.MCP_HTTP_402_ENABLED = 'true';
    await assert.rejects(
      () => settleMcpToolPayment({ toolName: 'web_search', payerCharacterId: null }),
      (err) => err instanceof AppError && err.status === 402 && err.code === 'MCP_PAYMENT_REQUIRED',
    );
  });

  it('records ledger entries and computes velocity', async () => {
    await recordEconomyLedger({
      payerRole: 'dialogue',
      payeeRole: 'research',
      payerCharacterId: null,
      payeeCharacterId: null,
      amount: 2,
      currency: 'token',
      method: 'web_search',
      requestId: 'test-1',
    });
    const velocity = await getEconomyVelocity({ sinceHours: 24 });
    assert.ok(velocity.txCount >= 0);
    assert.ok(typeof velocity.tokenVelocity === 'number');
  });
});

describe('Phase 35 — WebRTC avatar streaming', () => {
  it('exposes ICE / signaling config', () => {
    const cfg = getWebrtcConfig();
    assert.equal(cfg.signaling, 'socket.io');
    assert.ok(Array.isArray(cfg.iceServers));
  });

  it('creates sessions and rejects signal without socket when closed path', async () => {
    const session = await createAvatarStreamSession({
      userId: 'user-1',
      characterId: 'char-1',
      modalities: ['avatar3d', 'spatial_audio'],
    });
    assert.ok(session.id);
    assert.equal(session.status, 'open');

    // Without Socket.IO init, signal should throw SOCKET_UNAVAILABLE
    assert.throws(
      () => signalAvatarStream({
        sessionId: session.id,
        from: 'user-1',
        type: 'offer',
        payload: { type: 'offer', sdp: 'v=0' },
      }),
      (err) => err instanceof AppError && err.code === 'SOCKET_UNAVAILABLE',
    );

    const pushed = pushMultimodalFrame({
      sessionId: session.id,
      textDelta: 'hello',
      avatar: { fps: 30, blendshapes: [] },
    });
    assert.equal(pushed.emitted, false);
  });
});

describe('Phase 35 — planetary mesh script', () => {
  it('ships Ubuntu-optimized deploy_planetary_mesh.sh', () => {
    const script = path.join(__dirname, '../../scripts/deploy_planetary_mesh.sh');
    assert.ok(fs.existsSync(script));
    const body = fs.readFileSync(script, 'utf8');
    assert.match(body, /LATENCY_BUDGET_MS/);
    assert.match(body, /spin_edge_inference/);
    assert.match(body, /Ubuntu/);
  });
});

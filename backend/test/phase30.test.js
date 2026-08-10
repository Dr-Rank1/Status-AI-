import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  recordHttpSample,
  recordAiAnomalySample,
  getSlaSnapshot,
  __resetSlaStateForTests,
} from '../src/observability/slaTelemetry.js';
import {
  selectProviderCostAware,
  estimateRouteCost,
  PROVIDER_COST_PER_1K,
} from '../src/services/aiCostOptimizer.js';

describe('Phase 30 — SLA telemetry', () => {
  beforeEach(() => {
    __resetSlaStateForTests();
  });

  it('tracks healthy uptime under success samples', () => {
    for (let i = 0; i < 25; i++) {
      recordHttpSample({ statusCode: 200, durationMs: 40 + i, route: 'GET /health' });
    }
    const snap = getSlaSnapshot();
    assert.equal(snap.uptime, 1);
    assert.ok(snap.latencyP95Ms > 0);
    assert.equal(snap.healthy, true);
  });

  it('detects error-rate pressure from 5xx samples', () => {
    for (let i = 0; i < 20; i++) {
      recordHttpSample({ statusCode: i < 5 ? 500 : 200, durationMs: 50, route: 'GET /x' });
    }
    const snap = getSlaSnapshot();
    assert.ok(snap.errorRate >= 0.2);
  });

  it('records hallucination samples into AI SLA window', () => {
    for (let i = 0; i < 12; i++) {
      recordAiAnomalySample({ type: i < 3 ? 'model_hallucination' : 'latency_spike' });
    }
    const snap = getSlaSnapshot();
    assert.ok(snap.hallucinationRate > 0);
  });
});

describe('Phase 30 — AI cost optimizer', () => {
  it('exposes provider cost table', () => {
    assert.ok(PROVIDER_COST_PER_1K.vllm < PROVIDER_COST_PER_1K.anthropic);
    assert.ok(estimateRouteCost('gemini', 1000) > 0);
  });

  it('selects a provider with cost metadata', () => {
    process.env.AI_COST_OPTIMIZER_ENABLED = 'true';
    process.env.AI_COST_MODE = 'balanced';
    process.env.SELF_HOSTED_AI_PREFERRED = 'false';
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.VLLM_BASE_URL;

    const route = selectProviderCostAware({ mode: 'dm', context: {} });
    assert.ok(route.provider);
    assert.ok(route.costMode);
    assert.ok(route.budget);
  });
});

describe('Phase 30 — V2 scaffolding', () => {
  it('exports v2 router with version discovery', async () => {
    const v2 = (await import('../src/routes/v2/index.js')).default;
    assert.ok(v2);
    const stack = v2.stack ?? [];
    const paths = stack
      .filter((l) => l.route)
      .map((l) => `${Object.keys(l.route.methods)[0].toUpperCase()} ${l.route.path}`);
    assert.ok(paths.some((p) => p.includes('/version')));
    assert.ok(paths.some((p) => p.includes('/ai/multimodal')));
    assert.ok(paths.some((p) => p.includes('/spatial/session')));
  });
});

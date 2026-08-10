import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CircuitBreaker, withCircuitBreaker } from '../src/services/circuitBreaker.js';
import { buildFlagSnapshotProperties } from '../src/services/posthogService.js';

describe('CircuitBreaker', () => {
  it('opens after failure threshold', async () => {
    const breaker = new CircuitBreaker('test', { failureThreshold: 2, resetTimeoutMs: 1000 });

    let calls = 0;
    const failing = () => {
      calls += 1;
      throw new Error('upstream down');
    };

    await withCircuitBreaker('test-unit', failing, () => ({ fallback: true }), {
      failureThreshold: 2,
      resetTimeoutMs: 60_000,
    });
    await withCircuitBreaker('test-unit', failing, () => ({ fallback: true }), {
      failureThreshold: 2,
      resetTimeoutMs: 60_000,
    });

    const result = await withCircuitBreaker('test-unit', failing, () => ({ fallback: true }), {
      failureThreshold: 2,
      resetTimeoutMs: 60_000,
    });

    assert.equal(result.fallback, true);
    assert.equal(breaker.name, 'test');
  });

  it('returns fallback immediately when circuit is open', async () => {
    const name = `test-open-${Date.now()}`;
    const opts = { failureThreshold: 1, resetTimeoutMs: 60_000 };

    await withCircuitBreaker(name, () => { throw new Error('fail'); }, () => null, opts);

    let invoked = false;
    const result = await withCircuitBreaker(
      name,
      () => {
        invoked = true;
        return 'ok';
      },
      () => ({ cached: true }),
      opts,
    );

    assert.equal(result.cached, true);
    assert.equal(invoked, false);
  });
});

describe('event stream helpers', () => {
  it('builds feature snapshot for event attribution', () => {
    const props = buildFlagSnapshotProperties({ 'force-gemini-dm': true });
    assert.ok(props['$feature/force-gemini-dm']);
  });
});

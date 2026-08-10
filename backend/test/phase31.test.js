import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  critiqueDraft,
  runReflectionLoop,
} from '../src/services/agi/reflectionLoopService.js';
import { abstractInsight } from '../src/services/knowledgeMesh/knowledgeMeshService.js';
import {
  warmWasmIsolate,
  runInEphemeralSandbox,
  getSandboxConfig,
} from '../src/services/wasm/wasmToolSandbox.js';
import { executeGraphql } from '../src/services/v2/graphqlService.js';

describe('Phase 31 — AGI reflection loop', () => {
  it('flags policy boilerplate and character breaks', () => {
    const { issues } = critiqueDraft({
      content: 'As an AI language model I cannot help with that.',
      character: { name: 'Nova' },
      incomingMessage: 'Hi',
      context: {},
    });
    assert.ok(issues.some((i) => i.code === 'policy_boilerplate' || i.code === 'character_break'));
  });

  it('self-corrects drafts through the reflection loop', async () => {
    const result = await runReflectionLoop({
      draft: { content: 'As an AI language model I cannot help with that. Hello.' },
      character: { name: 'Nova' },
      incomingMessage: 'Hey',
    });
    assert.equal(result.reflected, true);
    assert.ok(!/as an ai language model/i.test(result.content));
    assert.ok(result.chainOfThought.length > 0);
  });
});

describe('Phase 31 — knowledge mesh abstraction', () => {
  it('scrubs PII from shared insights', () => {
    const insight = abstractInsight({
      content: 'User alex@example.com loved the nebula lore in Starlight',
      fandom: 'starlight',
      tags: ['lore'],
    });
    assert.ok(insight);
    assert.equal(insight.topic.includes('alex@example.com'), false);
    assert.ok(insight.topic.includes('[EMAIL]') || !insight.topic.includes('@'));
    assert.equal(insight.fandom, 'starlight');
  });
});

describe('Phase 31 — Wasm ephemeral sandbox', () => {
  it('pings wasm isolate', async () => {
    const ping = await warmWasmIsolate();
    assert.equal(ping.ok, true);
  });

  it('runs pure script and terminates', async () => {
    const out = await runInEphemeralSandbox({
      script: 'return { sum: (input.a || 0) + (input.b || 0) };',
      input: { a: 2, b: 3 },
    });
    assert.equal(out.ok, true);
    assert.equal(out.result.sum, 5);
    assert.equal(out.ephemeral, true);
  });

  it('rejects forbidden identifiers', async () => {
    await assert.rejects(
      () => runInEphemeralSandbox({ script: 'return require("fs");', input: {} }),
      /forbidden/i,
    );
  });

  it('exposes sandbox config', () => {
    const cfg = getSandboxConfig();
    assert.equal(cfg.wasmPingModule, true);
    assert.ok(cfg.timeoutMs > 0);
  });
});

describe('Phase 31 — V2 GraphQL beta', () => {
  it('resolves health and version queries', async () => {
    const health = await executeGraphql({ query: '{ health { ok api } }' });
    assert.equal(health.data.health.ok, true);
    const version = await executeGraphql({ query: 'query { version }' });
    assert.equal(version.data.version, '2.0.0');
  });

  it('advertises socket transport for subscriptions', async () => {
    const sub = await executeGraphql({ query: 'subscription { slaUpdated }' });
    assert.equal(sub.extensions.transport, 'socket.io');
  });
});

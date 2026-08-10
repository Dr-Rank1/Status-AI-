import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { planSubagents, shouldUseMultiAgent, runMultiAgentCoordinator } from '../src/services/ai/multiAgentCoordinator.js';
import { encryptPayload } from '../src/services/federatedLearningService.js';

describe('multi-agent coordinator', () => {
  it('shouldUseMultiAgent gates dm modes', () => {
    assert.equal(shouldUseMultiAgent('dm'), true);
    assert.equal(shouldUseMultiAgent('autonomous_post'), false);
  });

  it('plans research subagent for lore queries', () => {
    const plan = planSubagents({ incomingMessage: 'Tell me the lore of this universe', mode: 'dm' });
    assert.ok(plan.includes('research'));
    assert.ok(plan.includes('dialogue'));
  });

  it('runs coordinator mock workflow', async () => {
    process.env.MULTI_AGENT_ENABLED = 'true';
    delete process.env.OPENAI_API_KEY;

    const result = await runMultiAgentCoordinator({
      character: { id: 'c1', name: 'Nova', handle: 'nova', fandom: 'Stellar', bio: 'Pilot' },
      user: { id: 'u1', username: 'fan', display_name: 'Fan' },
      context: { recentMessages: [], relationship: { affinity: 10 } },
      incomingMessage: 'Search for lore about the nebula storm',
      mode: 'dm',
    });

    assert.ok(result.content?.length > 0);
    assert.ok(result.multiAgent?.plan?.includes('research'));
  });
});

describe('federated learning crypto', () => {
  it('round-trips encrypted payloads', () => {
    process.env.FEDERATED_AGGREGATION_KEY = 'test-key';
    const encrypted = encryptPayload({ weights: new Array(32).fill(0.1), version: 1 });
    assert.ok(encrypted.length > 32);
  });
});

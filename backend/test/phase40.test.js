import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  estimateTokens,
  compressVector,
  clusterMemoriesForExascale,
  distillInfiniteContext,
  getExascaleRagConfig,
} from '../src/services/context/contextDistillationService.js';
import {
  inferAmbientSuggestions,
  acceptAmbientSuggestion,
  getAmbientConfig,
} from '../src/services/ambient/ambientSuggestionService.js';
import {
  synthesizeCodeChange,
  getCodeSynthesisConfig,
  openSynthesisPullRequest,
} from '../src/services/devops/githubPrSynthesisService.js';
import { releaseKillSwitch } from '../src/services/security/globalKillSwitchService.js';

describe('Phase 40 — Exascale RAG / context distillation', () => {
  it('estimates tokens and compresses vectors', () => {
    assert.ok(estimateTokens('abcd') >= 1);
    const identity = compressVector([0.1, 0.2], 8);
    assert.equal(identity.method, 'identity');
    const topk = compressVector(Array.from({ length: 128 }, (_, i) => i / 128), 16);
    assert.equal(topk.compressedDim, 16);
    assert.equal(topk.method, 'magnitude_topk');
    const hash = compressVector(null, 32);
    assert.equal(hash.method, 'hash_projection');
    assert.equal(hash.dims.length, 32);
  });

  it('clusters memories for exascale compression', () => {
    const items = [
      { content: 'Meeting about lore canon', created_at: '2024-01-15T00:00:00Z' },
      { content: 'Meeting about lore canon again', created_at: '2024-01-16T00:00:00Z' },
      { content: 'Unrelated cooking tip', created_at: '2025-06-01T00:00:00Z' },
    ];
    const clusters = clusterMemoriesForExascale(items, 4);
    assert.ok(clusters.length >= 1);
    assert.ok(clusters.every((c) => c.memory_type === 'distilled_cluster'));
  });

  it('distills infinite context into a budgeted prompt block', async () => {
    const out = await distillInfiniteContext({
      userId: 'u-phase40',
      characterId: 'c-phase40',
      queryText: 'what did we discuss about schedule',
      recentMessages: [
        { role: 'user', content: 'remind me to reply tomorrow' },
        { role: 'assistant', content: 'Noted.' },
      ],
      episodicEvents: [{ content: 'User prefers short replies', created_at: new Date().toISOString() }],
      tokenBudget: 400,
    });
    assert.equal(out.engine, 'exascale-rag/v1');
    assert.ok(out.promptBlock.includes('Exascale distilled'));
    assert.ok(out.stats.tokensUsed <= out.stats.tokenBudget || out.stats.selectedCount <= 1);
    assert.ok(getExascaleRagConfig().techniques.includes('continuous_distillation'));
  });
});

describe('Phase 40 — Ambient fabric', () => {
  it('infers proactive suggestions without wake word', () => {
    const out = inferAmbientSuggestions({
      transcript: 'Can you schedule lunch tomorrow and reply to that email?',
      locationLabel: 'office',
      calendarBusy: true,
    });
    assert.equal(out.wakeWordRequired, false);
    assert.ok(out.suggestions.length >= 2);
    assert.ok(out.suggestions.some((s) => s.type === 'schedule' || s.action === 'create_calendar_event'));
    assert.ok(out.suggestions.some((s) => s.type === 'draft_reply' || s.action === 'draft_message'));
    assert.equal(getAmbientConfig().privacy, 'on_device_first');
  });

  it('queues accepted ambient jobs', async () => {
    await releaseKillSwitch({ by: 'test' });
    const job = await acceptAmbientSuggestion({
      suggestion: { type: 'remind', action: 'draft_reminder', title: 'x' },
      userId: 'u1',
    });
    assert.equal(job.status, 'queued');
    assert.ok(job.id);
  });
});

describe('Phase 40 — GitHub PR code synthesis', () => {
  it('drafts sandboxed synthesis artifacts in dry-run', async () => {
    await releaseKillSwitch({ by: 'test' });
    const artifact = await synthesizeCodeChange({
      title: 'Minor refactor for logging',
      description: 'Tighten ambient logger noise',
      kind: 'refactor',
      targetPaths: ['backend/src/services/ambient/ambientSuggestionService.js'],
      requestedBy: 'test',
    });
    assert.equal(artifact.status, 'drafted');
    assert.ok(artifact.branch.startsWith('autopilot/'));
    assert.ok(artifact.artifactPath);

    const pr = await openSynthesisPullRequest(artifact, { runTests: false });
    assert.equal(pr.opened, false);
    assert.equal(pr.dryRun, true);

    const cfg = getCodeSynthesisConfig();
    assert.equal(cfg.requiresHumanReview, true);
    assert.equal(cfg.forbidsForcePush, true);
  });
});

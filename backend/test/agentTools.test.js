import test from 'node:test';
import assert from 'node:assert/strict';
import { executeAgentTool, getOpenAiToolDefinitions } from '../src/services/ai/agentTools.js';
import { shouldUseAgentWorkflow } from '../src/services/ai/agentWorkflowService.js';

test('agent tool definitions include calendar, search, and link tools', () => {
  const tools = getOpenAiToolDefinitions();
  const names = tools.map((t) => t.function.name);
  assert.deepEqual(names, [
    'create_calendar_event',
    'web_search',
    'generate_external_link',
    'run_sandboxed_script',
  ]);
});

test('create_calendar_event returns ICS-backed event payload', async () => {
  const result = await executeAgentTool(
    'create_calendar_event',
    {
      title: 'Story meetup',
      start_at: '2026-08-15T18:00:00.000Z',
      duration_minutes: 45,
    },
    { userId: 'user-1', characterId: 'char-1' }
  );

  assert.equal(result.success, true);
  assert.equal(result.event.title, 'Story meetup');
  assert.ok(result.event.ics_url.startsWith('data:text/calendar'));
});

test('generate_external_link validates https URLs', async () => {
  const result = await executeAgentTool('generate_external_link', {
    url: 'https://example.com/lore',
    title: 'Lore drop',
    description: 'Read this',
    link_type: 'article',
  });

  assert.equal(result.success, true);
  assert.equal(result.link.url, 'https://example.com/lore');
});

test('shouldUseAgentWorkflow gates dm modes', () => {
  assert.equal(shouldUseAgentWorkflow('dm'), true);
  assert.equal(shouldUseAgentWorkflow('autonomous_post'), false);
});

import { buildSystemPrompt, buildUserPrompt } from './prompts.js';
import { getOpenAiToolDefinitions, executeAgentTool } from './agentTools.js';
import { generateMockReply } from './mockProvider.js';
import { logger } from '../../utils/logger.js';

const MAX_AGENT_STEPS = parseInt(process.env.AGENT_MAX_STEPS ?? '5', 10);

const AGENT_MODES = new Set(['dm', 'group_dm', 'post_reply']);

export function shouldUseAgentWorkflow(mode) {
  if (process.env.AGENT_TOOLS_ENABLED === 'false') return false;
  return AGENT_MODES.has(mode);
}

/**
 * Run a multi-step agentic workflow with autonomous tool calling.
 */
export async function runAgentWorkflow({ character, user, context, incomingMessage, mode }) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return runMockAgentWorkflow({ character, user, context, incomingMessage, mode });
  }

  return runOpenAiAgentWorkflow({ character, user, context, incomingMessage, mode, apiKey });
}

async function runOpenAiAgentWorkflow({ character, user, context, incomingMessage, mode, apiKey }) {
  const model = process.env.OPENAI_AGENT_MODEL ?? process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
  const system = [
    buildSystemPrompt({ character, relationship: context.relationship, mode, context }),
    '',
    'You may call tools to help the user: create calendar events, search the web, or share external links.',
    'After using tools, synthesize results into a natural in-character reply (1-4 sentences).',
    'Never mention tool names or being an AI.',
  ].join('\n');

  const userPrompt = buildUserPrompt({ user, context, incomingMessage, mode });

  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: userPrompt },
  ];

  const toolCtx = {
    userId: user?.id,
    characterId: character?.id,
    threadId: context.threadId,
  };

  const toolResults = [];
  let steps = 0;

  while (steps < MAX_AGENT_STEPS) {
    steps += 1;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 400,
        temperature: 0.75,
        messages,
        tools: getOpenAiToolDefinitions(),
        tool_choice: 'auto',
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`OpenAI agent error ${response.status}: ${errBody}`);
    }

    const data = await response.json();
    const choice = data.choices?.[0]?.message;
    if (!choice) break;

    if (choice.tool_calls?.length) {
      messages.push(choice);

      for (const call of choice.tool_calls) {
        const fn = call.function;
        let args = {};
        try {
          args = JSON.parse(fn.arguments ?? '{}');
        } catch {
          args = {};
        }

        let output;
        try {
          output = await executeAgentTool(fn.name, args, toolCtx);
        } catch (err) {
          output = { error: err.message };
        }

        toolResults.push({ tool: fn.name, args, output });

        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify(output),
        });
      }
      continue;
    }

    const content = choice.content?.trim();
    if (!content) break;

    return {
      content,
      provider: 'openai-agent',
      model,
      usage: data.usage ?? null,
      agentSteps: steps,
      toolResults,
    };
  }

  throw new Error('Agent workflow exceeded max steps without a final reply');
}

async function runMockAgentWorkflow({ character, user, context, incomingMessage, mode }) {
  const text = (incomingMessage ?? '').toLowerCase();
  const toolResults = [];
  const toolCtx = { userId: user?.id, characterId: character?.id };

  if (/calendar|schedule|meet|remind|event|appointment/.test(text)) {
    const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
    start.setHours(18, 0, 0, 0);
    const output = await executeAgentTool(
      'create_calendar_event',
      {
        title: `Hangout with ${character.name}`,
        description: incomingMessage,
        start_at: start.toISOString(),
        duration_minutes: 60,
      },
      toolCtx
    );
    toolResults.push({ tool: 'create_calendar_event', output });
  }

  if (/search|look up|find out|what is|who is/.test(text)) {
    const query = incomingMessage.replace(/^(search|look up|find out)\s*/i, '').trim();
    const output = await executeAgentTool(
      'web_search',
      { query: query || incomingMessage, max_results: 2 },
      toolCtx
    );
    toolResults.push({ tool: 'web_search', output });
  }

  if (/link|url|website|watch|listen|read/.test(text)) {
    const output = await executeAgentTool(
      'generate_external_link',
      {
        url: 'https://status.dev/lore',
        title: `${character.fandom} — curated by ${character.name}`,
        description: 'A link picked for you based on our chat.',
        link_type: 'article',
      },
      toolCtx
    );
    toolResults.push({ tool: 'generate_external_link', output });
  }

  const base = await generateMockReply({ character, user, context, incomingMessage, mode });

  let suffix = '';
  if (toolResults.some((t) => t.tool === 'create_calendar_event')) {
    suffix = " I've penciled that into your calendar — check the event I set up.";
  } else if (toolResults.some((t) => t.tool === 'web_search')) {
    suffix = ' I looked it up — want me to share what I found?';
  } else if (toolResults.some((t) => t.tool === 'generate_external_link')) {
    suffix = " Here's a link I think you'll like.";
  }

  logger.info(`[Agent mock] ${character.handle} tools=${toolResults.length}`);

  return {
    ...base,
    provider: 'mock-agent',
    agentSteps: toolResults.length > 0 ? 2 : 1,
    toolResults,
    content: `${base.content}${suffix}`,
  };
}

import { logger } from '../../utils/logger.js';
import { logEvent } from '../analyticsService.js';

/**
 * Agent tool registry — each tool has an OpenAI-compatible schema and executor.
 */
export const AGENT_TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'create_calendar_event',
      description:
        'Create a calendar event for the user based on conversation context (meetups, reminders, story beats).',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Event title' },
          description: { type: 'string', description: 'Optional details' },
          start_at: { type: 'string', description: 'ISO 8601 start datetime' },
          duration_minutes: { type: 'number', description: 'Duration in minutes', default: 60 },
          location: { type: 'string', description: 'Optional location or virtual link label' },
        },
        required: ['title', 'start_at'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'web_search',
      description:
        'Search the web for factual information to enrich in-character responses (lore, news, references).',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          max_results: { type: 'number', description: 'Max snippets to return', default: 3 },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_external_link',
      description:
        'Generate a shareable external link URL with title and description for the user.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'Destination URL (https)' },
          title: { type: 'string', description: 'Link card title' },
          description: { type: 'string', description: 'Short preview text' },
          link_type: {
            type: 'string',
            enum: ['article', 'video', 'music', 'map', 'shop', 'other'],
          },
        },
        required: ['url', 'title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_sandboxed_script',
      description:
        'Execute a short pure JavaScript transform in a zero-trust ephemeral Wasm-backed sandbox. No network or filesystem.',
      parameters: {
        type: 'object',
        properties: {
          script: {
            type: 'string',
            description:
              'Function body using `input`. Must return a value. Example: return { ok: true, echo: input };',
          },
          input: { type: 'object', description: 'JSON input frozen into the sandbox' },
        },
        required: ['script'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ros2_read_sensors',
      description:
        'Read recent ROS 2 lidar / depth / pose telemetry for embodied agents (MCP robotics bridge).',
      parameters: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['lidar', 'depth', 'pose'], description: 'Filter sensor kind' },
          limit: { type: 'number', default: 5 },
          ingest: {
            type: 'object',
            description: 'Optional telemetry sample to buffer before read',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ros2_publish_cmd',
      description:
        'Queue a sandboxed ROS 2 cmd_vel / actuation command for a physical embodiment (clamped, audited).',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'stop | move | turn | custom' },
          linear: {
            type: 'object',
            properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } },
          },
          angular: {
            type: 'object',
            properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } },
          },
          durationSec: { type: 'number', default: 1 },
          embodimentId: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ros2_bind_embodiment',
      description:
        'Bind a spatial avatar identity to a ROS 2 robot namespace for physical embodiment handoff.',
      parameters: {
        type: 'object',
        properties: {
          avatarId: { type: 'string' },
          robotNamespace: { type: 'string' },
          capabilities: { type: 'array', items: { type: 'string' } },
        },
        required: ['avatarId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'quantum_hybrid_optimize',
      description:
        'Run quantum-classical hybrid optimization (annealing / optional Qiskit|PennyLane) for agent allocation or RAG pathfinding.',
      parameters: {
        type: 'object',
        properties: {
          problem: {
            type: 'string',
            enum: ['resource_allocation', 'rag_pathfinding', 'distill_hparams'],
          },
          agents: { type: 'array', items: { type: 'object' } },
          resources: { type: 'array', items: { type: 'object' } },
          nodes: { type: 'array', items: { type: 'object' } },
          queryText: { type: 'string' },
          topK: { type: 'number' },
        },
        required: ['problem'],
      },
    },
  },
];

export async function executeAgentTool(toolName, args, ctx = {}) {
  logger.info(`[AgentTool] ${toolName}`, args);

  const { executeToolInSandbox } = await import('../wasm/wasmToolSandbox.js');

  return executeToolInSandbox(toolName, args, async () => {
    let result;
    switch (toolName) {
      case 'create_calendar_event':
        result = await executeCreateCalendarEvent(args, ctx);
        break;
      case 'web_search':
        result = await executeWebSearch(args, ctx);
        break;
      case 'generate_external_link':
        result = executeGenerateExternalLink(args, ctx);
        break;
      case 'run_sandboxed_script':
        result = await executeSandboxedScript(args, ctx);
        break;
      case 'ros2_read_sensors':
      case 'ros2_publish_cmd':
      case 'ros2_bind_embodiment': {
        const { executeRos2McpTool } = await import('../robotics/ros2McpBridge.js');
        result = await executeRos2McpTool(toolName, args, ctx);
        break;
      }
      case 'quantum_hybrid_optimize': {
        const {
          allocateAgentResources,
          optimizeRagPath,
          tuneDistillationHyperparams,
        } = await import('../quantum/quantumHybridSolver.js');
        if (args.problem === 'resource_allocation') {
          result = await allocateAgentResources({
            agents: args.agents ?? [],
            resources: args.resources ?? [],
          });
        } else if (args.problem === 'rag_pathfinding') {
          result = await optimizeRagPath({
            nodes: args.nodes ?? [],
            queryText: args.queryText ?? '',
            topK: args.topK ?? 5,
          });
        } else {
          result = await tuneDistillationHyperparams({});
        }
        result = { success: true, ...result };
        break;
      }
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }

    await logEvent({
      userId: ctx.userId,
      eventType: 'agent_tool_executed',
      metadata: { toolName, characterId: ctx.characterId, args, resultSummary: summarize(result) },
    }).catch(() => {});

    return result;
  });
}

async function executeSandboxedScript(args) {
  const { runInEphemeralSandbox } = await import('../wasm/wasmToolSandbox.js');
  const out = await runInEphemeralSandbox({
    script: args.script,
    input: args.input ?? {},
  });
  return { success: true, sandbox: out };
}

function summarize(result) {
  if (!result) return null;
  if (result.title) return result.title;
  if (result.query) return result.query;
  if (result.url) return result.url;
  return typeof result === 'object' ? Object.keys(result).slice(0, 3).join(',') : String(result);
}

async function executeCreateCalendarEvent(args, ctx) {
  const startAt = new Date(args.start_at);
  if (Number.isNaN(startAt.getTime())) {
    throw new Error('Invalid start_at datetime');
  }

  const durationMinutes = args.duration_minutes ?? 60;
  const endAt = new Date(startAt.getTime() + durationMinutes * 60 * 1000);

  const event = {
    id: `cal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: args.title,
    description: args.description ?? '',
    start_at: startAt.toISOString(),
    end_at: endAt.toISOString(),
    duration_minutes: durationMinutes,
    location: args.location ?? null,
    created_for_user_id: ctx.userId ?? null,
    character_id: ctx.characterId ?? null,
    ics_url: buildIcsDataUri({ title: args.title, startAt, endAt, description: args.description }),
  };

  return { success: true, event };
}

function buildIcsDataUri({ title, startAt, endAt, description }) {
  const fmt = (d) =>
    d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Status//Agent Calendar//EN',
    'BEGIN:VEVENT',
    `DTSTART:${fmt(startAt)}`,
    `DTEND:${fmt(endAt)}`,
    `SUMMARY:${title}`,
    description ? `DESCRIPTION:${description.replace(/\n/g, '\\n')}` : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .filter(Boolean)
    .join('\r\n');

  return `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;
}

async function executeWebSearch(args) {
  const query = args.query?.trim();
  const maxResults = Math.min(args.max_results ?? 3, 5);
  if (!query) throw new Error('query is required');

  const apiKey = process.env.SERPER_API_KEY;

  if (apiKey) {
    try {
      const response = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: {
          'X-API-KEY': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ q: query, num: maxResults }),
      });

      if (response.ok) {
        const data = await response.json();
        const results = (data.organic ?? []).slice(0, maxResults).map((r) => ({
          title: r.title,
          snippet: r.snippet,
          url: r.link,
        }));
        return { query, results, provider: 'serper' };
      }
    } catch (err) {
      logger.warn('[AgentTool] Serper search failed:', err.message);
    }
  }

  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`;
    const response = await fetch(url);
    if (response.ok) {
      const data = await response.json();
      const results = [];
      if (data.AbstractText) {
        results.push({
          title: data.Heading || query,
          snippet: data.AbstractText,
          url: data.AbstractURL || null,
        });
      }
      for (const topic of (data.RelatedTopics ?? []).slice(0, maxResults - results.length)) {
        if (topic.Text) {
          results.push({ title: query, snippet: topic.Text, url: topic.FirstURL ?? null });
        }
      }
      if (results.length > 0) {
        return { query, results, provider: 'duckduckgo' };
      }
    }
  } catch (err) {
    logger.warn('[AgentTool] DuckDuckGo search failed:', err.message);
  }

  return {
    query,
    results: [
      {
        title: `Search: ${query}`,
        snippet: `No live search results — use in-character knowledge for "${query}".`,
        url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
      },
    ],
    provider: 'mock',
  };
}

function executeGenerateExternalLink(args) {
  const url = args.url?.trim();
  if (!url || !/^https?:\/\//i.test(url)) {
    throw new Error('url must be a valid http(s) URL');
  }

  return {
    success: true,
    link: {
      url,
      title: args.title,
      description: args.description ?? '',
      link_type: args.link_type ?? 'other',
      preview_url: `${process.env.API_BASE_URL ?? 'http://localhost:3000'}/api/v1/agent/link-preview?url=${encodeURIComponent(url)}`,
    },
  };
}

export function getOpenAiToolDefinitions() {
  return AGENT_TOOL_DEFINITIONS;
}

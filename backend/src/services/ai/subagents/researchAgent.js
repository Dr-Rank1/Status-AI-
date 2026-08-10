/**
 * Research subagent — fetches lore/context in an isolated window.
 */

import { executeAgentTool } from '../agentTools.js';

export async function runResearchSubagent({ character, incomingMessage, context }) {
  const text = (incomingMessage ?? '').toLowerCase();
  const needsWeb = /search|look up|find out|what is|who is|lore|canon|wiki/.test(text);
  const needsLore = /lore|backstory|history|universe|fandom|world/.test(text);

  const findings = [];

  if (needsWeb) {
    const query = incomingMessage.replace(/^(search|look up|find out)\s*/i, '').trim();
    try {
      const output = await executeAgentTool(
        'web_search',
        { query: query || incomingMessage, max_results: 3 },
        { characterId: character?.id },
      );
      findings.push({ source: 'web_search', output });
    } catch (err) {
      findings.push({ source: 'web_search', error: err.message });
    }
  }

  if (needsLore || character?.fandom) {
    findings.push({
      source: 'lore_cache',
      output: {
        fandom: character?.fandom ?? 'General',
        personality: character?.personality ?? {},
        bio: character?.bio ?? '',
        vectorMemories: (context?.vectorMemories ?? []).slice(0, 3).map((m) => m.content),
      },
    });
  }

  if (findings.length === 0) {
    findings.push({
      source: 'context_scan',
      output: {
        recentMessages: (context?.recentMessages ?? []).slice(-3),
        memorySummary: context?.memorySummary ?? null,
      },
    });
  }

  return {
    role: 'research',
    findings,
    summary: summarizeFindings(findings),
  };
}

function summarizeFindings(findings) {
  const parts = [];
  for (const f of findings) {
    if (f.source === 'web_search' && f.output?.results) {
      parts.push(
        f.output.results
          .slice(0, 2)
          .map((r) => r.snippet ?? r.title)
          .join(' '),
      );
    }
    if (f.source === 'lore_cache') {
      parts.push(`Fandom: ${f.output.fandom}. ${f.output.bio ?? ''}`.trim());
    }
  }
  return parts.join('\n').slice(0, 600) || 'No external research required.';
}

export async function runResearchSubagentMock(args) {
  return runResearchSubagent(args);
}

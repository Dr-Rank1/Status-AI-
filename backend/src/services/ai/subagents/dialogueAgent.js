/**
 * Dialogue subagent — drafts in-character reply using only its subagent context.
 */

import { buildSystemPrompt, buildUserPrompt } from '../prompts.js';
import { generateMockReply } from '../mockProvider.js';
import { generateOpenAIReply } from '../openaiProvider.js';
import { generateVllmReply } from '../vllmProvider.js';
import { isVllmConfigured } from '../vllmProvider.js';

export async function runDialogueSubagent(args, { researchSummary = '' } = {}) {
  const { character, user, context, incomingMessage, mode } = args;

  const isolatedContext = {
    ...context,
    character,
    recentMessages: (context?.recentMessages ?? []).slice(-4),
    memorySummary: researchSummary || context?.memorySummary,
    subagentNote: 'Synthesized by dialogue subagent — use research brief below.',
    researchBrief: researchSummary,
  };

  const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);
  const preferVllm = isVllmConfigured() && process.env.SELF_HOSTED_AI_PREFERRED === 'true';

  if (preferVllm) {
    const result = await generateVllmReply({
      character,
      user,
      context: isolatedContext,
      incomingMessage: wrapWithResearch(incomingMessage, researchSummary),
      mode,
    });
    return { role: 'dialogue', ...result };
  }

  if (hasOpenAI) {
    const result = await generateOpenAIReply({
      character,
      user,
      context: isolatedContext,
      incomingMessage: wrapWithResearch(incomingMessage, researchSummary),
      mode,
    });
    return { role: 'dialogue', ...result };
  }

  const base = await generateMockReply({
    character,
    user,
    context: isolatedContext,
    incomingMessage,
    mode,
  });

  let content = base.content;
  if (researchSummary && researchSummary.length > 20) {
    content = `${base.content} (I've got some lore context ready if you want to go deeper.)`;
  }

  return { role: 'dialogue', ...base, content };
}

function wrapWithResearch(message, researchSummary) {
  if (!researchSummary?.trim()) return message;
  return `[Research brief — subagent]\n${researchSummary}\n\n[User message]\n${message}`;
}

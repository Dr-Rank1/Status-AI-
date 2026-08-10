import { buildSystemPrompt, buildUserPrompt } from './prompts.js';

export async function generateAnthropicReply({ character, user, context, incomingMessage, mode }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured');
  }

  const model = process.env.ANTHROPIC_MODEL ?? 'claude-3-5-haiku-20241022';
  const system = buildSystemPrompt({ character, relationship: context.relationship, mode });
  const userPrompt = buildUserPrompt({ user, context, incomingMessage, mode });

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 180,
      system,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${errBody}`);
  }

  const data = await response.json();
  const content = data.content?.[0]?.text?.trim();

  if (!content) {
    throw new Error('Anthropic returned an empty response');
  }

  return {
    content,
    provider: 'anthropic',
    model,
    usage: data.usage ?? null,
  };
}

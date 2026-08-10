import { buildSystemPrompt, buildUserPrompt } from './prompts.js';

export async function generateOpenAIReply({ character, user, context, incomingMessage, mode }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
  const system = buildSystemPrompt({ character, relationship: context.relationship, mode });
  const userPrompt = buildUserPrompt({ user, context, incomingMessage, mode });

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 180,
      temperature: 0.85,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${errBody}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content?.trim();

  if (!content) {
    throw new Error('OpenAI returned an empty response');
  }

  return {
    content,
    provider: 'openai',
    model,
    usage: data.usage ?? null,
  };
}

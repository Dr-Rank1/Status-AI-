import { buildSystemPrompt, buildUserPrompt } from './prompts.js';

const DEFAULT_BASE = 'http://127.0.0.1:8000/v1';

export function getVllmConfig() {
  return {
    baseUrl: (process.env.VLLM_BASE_URL ?? DEFAULT_BASE).replace(/\/$/, ''),
    model: process.env.VLLM_MODEL ?? 'meta-llama/Meta-Llama-3-8B-Instruct',
    apiKey: process.env.VLLM_API_KEY ?? 'status-vllm-local',
  };
}

export function isVllmConfigured() {
  return Boolean(process.env.VLLM_BASE_URL);
}

export async function generateVllmReply({ character, user, context, incomingMessage, mode }) {
  const { baseUrl, model, apiKey } = getVllmConfig();
  const system = buildSystemPrompt({ character, relationship: context.relationship, mode, context });
  const userPrompt = buildUserPrompt({ user, context, incomingMessage, mode });

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: mode === 'autonomous_post' ? 120 : 180,
      temperature: 0.85,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`vLLM API error ${response.status}: ${errBody}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content?.trim();

  if (!content) {
    throw new Error('vLLM returned an empty response');
  }

  return {
    content,
    provider: 'vllm',
    model,
    usage: data.usage ?? null,
  };
}

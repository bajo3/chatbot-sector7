import { env } from '../../env.js';

export type ChatMessage = { role: 'system' | 'developer' | 'user' | 'assistant'; content: string };

type ChatCompletionOpts = {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
};

function getApiKey(): string {
  const k = (env.OPENAI_API_KEY || '').trim();
  return k;
}

export async function chatCompletionText(opts: ChatCompletionOpts): Promise<string> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set');

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: opts.model,
      messages: opts.messages,
      temperature: opts.temperature ?? 0.2,
      max_tokens: opts.max_tokens ?? 500
    })
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`OpenAI error ${res.status}: ${txt.slice(0, 500)}`);
  }

  const json: any = await res.json();
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error('OpenAI: missing message content');
  return content;
}

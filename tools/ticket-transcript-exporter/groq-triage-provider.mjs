import { buildTriageMessages, TRIAGE_OUTPUT_SCHEMA } from './llm-triage-prompt.mjs';
import { sanitizeSupportPlannerPayload } from './support-runtime-privacy.mjs';

export const DEFAULT_GROQ_TRIAGE_MODEL = 'openai/gpt-oss-120b';
export const DEFAULT_GROQ_REASONING_EFFORT = 'low';

export function createGroqTriageProvider({
  apiKey,
  model = DEFAULT_GROQ_TRIAGE_MODEL,
  baseUrl = 'https://api.groq.com/openai/v1',
  timeoutMs = 30_000,
  maxCompletionTokens = 400,
  reasoningEffort = DEFAULT_GROQ_REASONING_EFFORT,
  fetchImpl = globalThis.fetch
} = {}) {
  if (!apiKey) throw new Error('GROQ_API_KEY is required');
  if (typeof fetchImpl !== 'function') throw new Error('fetch implementation is required');
  if (!['low', 'medium', 'high'].includes(reasoningEffort)) throw new Error('reasoningEffort must be low, medium, or high');

  const root = new URL(baseUrl);
  if (root.protocol !== 'https:' || root.hostname !== 'api.groq.com' || root.pathname.replace(/\/$/u, '') !== '/openai/v1') {
    throw new Error('Groq benchmark provider must use https://api.groq.com/openai/v1');
  }
  const endpoint = new URL('/openai/v1/chat/completions', root.origin);

  return async (input) => {
    const sanitizedInput = sanitizeSupportPlannerPayload(input);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model,
          messages: buildTriageMessages(sanitizedInput),
          temperature: 0,
          max_completion_tokens: maxCompletionTokens,
          stream: false,
          reasoning_effort: reasoningEffort,
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'cm_support_triage',
              strict: true,
              schema: TRIAGE_OUTPUT_SCHEMA
            }
          }
        }),
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`Groq triage provider returned HTTP ${response.status}`);
      const payload = await response.json();
      const content = payload?.choices?.[0]?.message?.content;
      if (typeof content !== 'string') throw new Error('Groq triage response did not contain message.content');
      return content;
    } finally {
      clearTimeout(timer);
    }
  };
}

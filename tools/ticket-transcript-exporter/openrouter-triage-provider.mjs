import { buildTriageMessages, TRIAGE_OUTPUT_SCHEMA } from './llm-triage-prompt.mjs';
import { sanitizeSupportPlannerPayload } from './support-runtime-privacy.mjs';

export const DEFAULT_OPENROUTER_TRIAGE_MODEL = 'google/gemma-4-26b-a4b-it:free';

export function createOpenRouterTriageProvider({
  apiKey,
  model = DEFAULT_OPENROUTER_TRIAGE_MODEL,
  baseUrl = 'https://openrouter.ai/api/v1',
  dataCollection = 'allow',
  timeoutMs = 30_000,
  maxTokens = 400,
  fetchImpl = globalThis.fetch
} = {}) {
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is required');
  if (typeof fetchImpl !== 'function') throw new Error('fetch implementation is required');
  if (!['allow', 'deny'].includes(dataCollection)) throw new Error('dataCollection must be allow or deny');

  const root = new URL(baseUrl);
  if (root.protocol !== 'https:' || root.hostname !== 'openrouter.ai') {
    throw new Error('OpenRouter benchmark provider must use https://openrouter.ai');
  }
  const endpoint = new URL(root.pathname.replace(/\/$/u, '') + '/chat/completions', root.origin);

  return async (input) => {
    const sanitizedInput = sanitizeSupportPlannerPayload(input);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
          'http-referer': 'https://cheaters.market',
          'x-title': "Cheater's Market Support Triage Benchmark"
        },
        body: JSON.stringify({
          model,
          messages: buildTriageMessages(sanitizedInput),
          temperature: 0,
          max_tokens: maxTokens,
          stream: false,
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'cm_support_triage',
              strict: true,
              schema: TRIAGE_OUTPUT_SCHEMA
            }
          },
          provider: {
            require_parameters: true,
            data_collection: dataCollection
          }
        }),
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`OpenRouter triage provider returned HTTP ${response.status}`);
      const payload = await response.json();
      const content = payload?.choices?.[0]?.message?.content;
      if (typeof content !== 'string') throw new Error('OpenRouter triage response did not contain message.content');
      return content;
    } finally {
      clearTimeout(timer);
    }
  };
}

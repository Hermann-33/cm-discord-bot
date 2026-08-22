import { buildTriageMessages, TRIAGE_OUTPUT_SCHEMA } from './llm-triage-prompt.mjs';

function assertLocalUrl(value) {
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  if (!['localhost','127.0.0.1','::1'].includes(host)) throw new Error('Triage provider must use a localhost endpoint; private CM support data must not be sent to a remote provider by this tooling.');
  return url;
}

export function createLocalOpenAiCompatibleTriageProvider({ baseUrl = 'http://127.0.0.1:11434/v1', model, apiKey = null, fetchImpl = globalThis.fetch, timeoutMs = 30_000, useJsonSchema = false } = {}) {
  if (!model) throw new Error('model is required');
  if (typeof fetchImpl !== 'function') throw new Error('fetch implementation is required');
  const root = assertLocalUrl(baseUrl);
  const endpoint = new URL(root.pathname.replace(/\/$/u, '') + '/chat/completions', root.origin);
  return async (input) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const body = {
        model,
        messages: buildTriageMessages(input),
        temperature: 0,
        stream: false
      };
      if (useJsonSchema) body.response_format = { type: 'json_schema', json_schema: { name: 'cm_support_triage', strict: true, schema: TRIAGE_OUTPUT_SCHEMA } };
      const headers = { 'content-type': 'application/json' };
      if (apiKey) headers.authorization = `Bearer ${apiKey}`;
      const response = await fetchImpl(endpoint, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal });
      if (!response.ok) throw new Error(`local triage provider returned HTTP ${response.status}`);
      const payload = await response.json();
      const content = payload?.choices?.[0]?.message?.content;
      if (typeof content !== 'string') throw new Error('local triage provider response did not contain message.content');
      return content;
    } finally {
      clearTimeout(timer);
    }
  };
}

export function isLocalTriageEndpoint(value) {
  try { assertLocalUrl(value); return true; }
  catch { return false; }
}

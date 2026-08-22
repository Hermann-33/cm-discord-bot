import type { OpenRouterConfig } from "../config/env";
import { sanitizeTriagePlannerPayload } from "./privacy";
import {
  TRIAGE_DECISION_JSON_SCHEMA,
  chooseSupportTriageFallback,
  triageDecisionSchema,
  validateSupportTriageDecision,
  type SupportTriageDecision,
  type SupportTriageInput
} from "./supportTriage";

const SYSTEM_PROMPT = [
  "You are the Cheater's Market support triage planner.",
  "Choose only the safest next support action from the canonical options supplied in the user payload.",
  "Never invent product, account, order, payment, policy, or technical state.",
  "If the customer has not provided enough information, ask one supplied canonical clarification instead of guessing.",
  "Use only case, clarification, lookup, policy, family, and entity IDs present in the payload.",
  "Prefer current-data lookup when the answer depends on live order, payment, fulfillment, wallet, Aura, stock, or status state.",
  "Do not autonomously answer restricted support topics.",
  "Return only the JSON object required by the response schema."
].join(" ");

export type OpenRouterTriageResult = {
  accepted: boolean;
  decision: SupportTriageDecision;
  validationErrors: readonly string[];
  fallbackUsed: boolean;
  model: string;
  requestId?: string;
};

type OpenRouterChatResponse = {
  id?: string;
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
};

function safeErrorCode(error: unknown): string {
  if (error instanceof DOMException && error.name === "AbortError") return "openrouter_timeout";
  if (error instanceof Error && error.name === "AbortError") return "openrouter_timeout";
  return "openrouter_transport_error";
}

export class OpenRouterTriageClient {
  constructor(
    private readonly config: OpenRouterConfig,
    private readonly fetchImpl: typeof fetch = globalThis.fetch
  ) {}

  async triage(
    input: SupportTriageInput,
    options: { directCaseConfidence?: number } = {}
  ): Promise<OpenRouterTriageResult> {
    const fallback = () => chooseSupportTriageFallback(input);
    const sanitizedInput = sanitizeTriagePlannerPayload(input);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await this.fetchImpl(`${this.config.origin}/api/v1/chat/completions`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.config.apiKey}`,
          "content-type": "application/json",
          "http-referer": "https://cheaters.market",
          "x-title": "Cheater's Market Discord Bot"
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: JSON.stringify(sanitizedInput) }
          ],
          temperature: 0,
          max_tokens: this.config.maxTokens,
          stream: false,
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "cm_support_triage",
              strict: true,
              schema: TRIAGE_DECISION_JSON_SCHEMA
            }
          },
          provider: {
            require_parameters: true,
            data_collection: this.config.dataCollection
          }
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        return {
          accepted: false,
          decision: fallback(),
          validationErrors: [`openrouter_http_${response.status}`],
          fallbackUsed: true,
          model: this.config.model,
          requestId: response.headers.get("x-request-id") ?? undefined
        };
      }

      let payload: OpenRouterChatResponse;
      try {
        payload = await response.json() as OpenRouterChatResponse;
      } catch {
        return {
          accepted: false,
          decision: fallback(),
          validationErrors: ["openrouter_invalid_response_json"],
          fallbackUsed: true,
          model: this.config.model,
          requestId: response.headers.get("x-request-id") ?? undefined
        };
      }

      const content = payload.choices?.[0]?.message?.content;
      if (typeof content !== "string") {
        return {
          accepted: false,
          decision: fallback(),
          validationErrors: ["openrouter_missing_message_content"],
          fallbackUsed: true,
          model: this.config.model,
          requestId: payload.id
        };
      }

      let candidate: unknown;
      try {
        candidate = JSON.parse(content);
      } catch {
        return {
          accepted: false,
          decision: fallback(),
          validationErrors: ["openrouter_invalid_structured_json"],
          fallbackUsed: true,
          model: this.config.model,
          requestId: payload.id
        };
      }

      const parsed = triageDecisionSchema.safeParse(candidate);
      if (!parsed.success) {
        return {
          accepted: false,
          decision: fallback(),
          validationErrors: ["openrouter_schema_validation_failed"],
          fallbackUsed: true,
          model: this.config.model,
          requestId: payload.id
        };
      }

      const validation = validateSupportTriageDecision(
        parsed.data,
        input,
        options.directCaseConfidence ?? 0.8
      );
      if (!validation.valid) {
        return {
          accepted: false,
          decision: fallback(),
          validationErrors: validation.errors,
          fallbackUsed: true,
          model: this.config.model,
          requestId: payload.id
        };
      }

      return {
        accepted: true,
        decision: parsed.data,
        validationErrors: [],
        fallbackUsed: false,
        model: this.config.model,
        requestId: payload.id
      };
    } catch (error) {
      return {
        accepted: false,
        decision: fallback(),
        validationErrors: [safeErrorCode(error)],
        fallbackUsed: true,
        model: this.config.model
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

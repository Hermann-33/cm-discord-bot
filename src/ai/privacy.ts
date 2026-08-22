const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu;
const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/giu;
const DISCORD_MENTION_PATTERN = /<@!?\d{5,32}>/gu;
const SNOWFLAKE_PATTERN = /(?<!\d)\d{17,20}(?!\d)/gu;
const URL_PATTERN = /https?:\/\/[^\s<>()]+/giu;
const OPENROUTER_KEY_PATTERN = /\bsk-or-[A-Za-z0-9_-]{12,}\b/gu;

const SENSITIVE_CONTEXT_KEY = /(?:^|_)(?:email|discord(?:user)?id|customerid|userid|orderid|purchaseid|purchaseintentid|selector|token|credential|password|secret|apikey|api_key|reference|url)(?:$|_)/iu;

export function sanitizeSupportText(value: string): string {
  return String(value)
    .replace(OPENROUTER_KEY_PATTERN, "[secret omitted]")
    .replace(EMAIL_PATTERN, "[email omitted]")
    .replace(DISCORD_MENTION_PATTERN, "[discord mention omitted]")
    .replace(UUID_PATTERN, "[uuid omitted]")
    .replace(SNOWFLAKE_PATTERN, "[numeric id omitted]")
    .replace(URL_PATTERN, "[url omitted]")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function sanitizeContextValue(value: unknown, key = ""): unknown {
  if (SENSITIVE_CONTEXT_KEY.test(key)) return "[sensitive context omitted]";
  if (typeof value === "string") return sanitizeSupportText(value);
  if (Array.isArray(value)) return value.map((item) => sanitizeContextValue(item));
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([childKey, childValue]) => [
      childKey,
      sanitizeContextValue(childValue, childKey)
    ])
  );
}

export function sanitizeTriagePlannerPayload<T>(value: T): T {
  if (!value || typeof value !== "object") return value;
  const cloned = structuredClone(value) as Record<string, unknown>;

  if (typeof cloned.customerText === "string") {
    cloned.customerText = sanitizeSupportText(cloned.customerText);
  }

  if (cloned.state && typeof cloned.state === "object" && !Array.isArray(cloned.state)) {
    const state = cloned.state as Record<string, unknown>;
    if (state.knownContext && typeof state.knownContext === "object") {
      state.knownContext = sanitizeContextValue(state.knownContext);
    }
    if (state.dynamicLookupResults && typeof state.dynamicLookupResults === "object") {
      state.dynamicLookupResults = sanitizeContextValue(state.dynamicLookupResults);
    }
  }

  return cloned as T;
}

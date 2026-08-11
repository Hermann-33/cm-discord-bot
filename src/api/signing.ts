import { createHash, createHmac } from "node:crypto";

export const SIGNATURE_VERSION = "cm-integrations-v1";

export type CanonicalRequestInput = {
  clientId: string;
  keyId: string;
  timestamp: string;
  nonce: string;
  method: string;
  pathname: string;
  rawBody: Uint8Array;
};

export function buildCanonicalRequest(input: CanonicalRequestInput): string {
  const bodyHash = createHash("sha256").update(input.rawBody).digest("hex");
  return [
    SIGNATURE_VERSION,
    input.clientId,
    input.keyId,
    input.timestamp,
    input.nonce,
    input.method.toUpperCase(),
    input.pathname,
    bodyHash
  ].join("\n");
}

export function signInternalApiRequest(
  secret: Uint8Array,
  input: CanonicalRequestInput
): string {
  return createHmac("sha256", secret)
    .update(buildCanonicalRequest(input), "utf8")
    .digest("hex");
}

export function createSignedHeaders(
  secret: Uint8Array,
  input: CanonicalRequestInput
): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "X-CM-Client-Id": input.clientId,
    "X-CM-Key-Id": input.keyId,
    "X-CM-Timestamp": input.timestamp,
    "X-CM-Nonce": input.nonce,
    "X-CM-Signature": signInternalApiRequest(secret, input)
  };
}

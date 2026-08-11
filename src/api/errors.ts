import type { InternalApiErrorCode } from "./schemas";

export type InternalApiClientErrorCode =
  | InternalApiErrorCode
  | "INVALID_REQUEST"
  | "INVALID_RESPONSE"
  | "NETWORK_FAILURE"
  | "REQUEST_TIMEOUT";

function safeErrorText(code: InternalApiClientErrorCode): string {
  switch (code) {
    case "NOT_FOUND":
      return "The requested record was not found.";
    case "OPERATION_FORBIDDEN":
      return "This integration is not permitted to perform the operation.";
    case "RATE_LIMITED":
      return "Too many requests.";
    case "REQUEST_TIMEOUT":
      return "The internal service timed out.";
    case "NETWORK_FAILURE":
      return "The internal service is unavailable.";
    case "INVALID_REQUEST":
      return "The internal request is invalid.";
    default:
      return "The internal request could not be processed.";
  }
}

export class InternalApiClientError extends Error {
  constructor(
    readonly code: InternalApiClientErrorCode,
    readonly status?: number
  ) {
    super(safeErrorText(code));
    this.name = "InternalApiClientError";
  }
}

export function isInternalApiError(
  error: unknown,
  code?: InternalApiClientErrorCode
): error is InternalApiClientError {
  return error instanceof InternalApiClientError && (code === undefined || error.code === code);
}

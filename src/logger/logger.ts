type LogMetaValue = string | number | boolean | null | undefined;
type LogMeta = Record<string, LogMetaValue>;

const MAX_LOG_VALUE_LENGTH = 240;

function normalizeLogString(value: string): string {
  const collapsed = value.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
  return collapsed.length > MAX_LOG_VALUE_LENGTH
    ? `${collapsed.slice(0, MAX_LOG_VALUE_LENGTH)}...`
    : collapsed;
}

function normalizeMeta(meta?: LogMeta): LogMeta | undefined {
  if (!meta) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(meta)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [
        key,
        typeof value === "string" ? normalizeLogString(value) : value
      ])
  );
}

function writeLog(level: "info" | "warn" | "error", event: string, meta?: LogMeta): void {
  const entry = {
    level,
    time: new Date().toISOString(),
    event,
    meta: normalizeMeta(meta)
  };

  const serialized = JSON.stringify(entry);

  if (level === "error") {
    console.error(serialized);
    return;
  }

  if (level === "warn") {
    console.warn(serialized);
    return;
  }

  console.log(serialized);
}

export const logger = {
  info(event: string, meta?: LogMeta): void {
    writeLog("info", event, meta);
  },

  warn(event: string, meta?: LogMeta): void {
    writeLog("warn", event, meta);
  },

  error(event: string, meta?: LogMeta): void {
    writeLog("error", event, meta);
  }
};

export function sanitizeError(error: unknown): LogMeta {
  if (error instanceof Error) {
    return {
      errorName: normalizeLogString(error.name),
      errorMessage: normalizeLogString(error.message)
    };
  }

  return {
    errorName: "UnknownError",
    errorMessage: "An unknown error occurred"
  };
}

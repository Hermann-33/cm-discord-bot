#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const TOOL_VERSION = '2.0.0';
const SCHEMA_VERSION = 2;
const DEFAULT_SAMPLE_LIMIT = 5;
const DEFAULT_DELAY_MS = 1250;
const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_PAYLOAD_BYTES = 16 * 1024 * 1024;
const TRANSCRIPT_ID = /^[A-Za-z0-9_-]{6,128}$/;
const API_ORIGIN = 'https://tickety.top';
const API_PATH = '/api/ticketTranscript';

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

function redactErrorText(value) {
  return String(value ?? 'Unknown error')
    .replace(/[A-Za-z0-9_-]{24}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{20,}/g, '[REDACTED_TOKEN]')
    .slice(0, 2000);
}

function parseInteger(value, label, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (!/^\d+$/.test(value ?? '')) throw new Error(`${label} must be an integer.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${label} must be between ${min} and ${max}.`);
  }
  return parsed;
}

export function parseArgs(argv) {
  const options = {
    outputDir: undefined,
    sourceLogs: undefined,
    limit: DEFAULT_SAMPLE_LIMIT,
    all: false,
    resume: true,
    delayMs: DEFAULT_DELAY_MS,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    maxPayloadBytes: DEFAULT_MAX_PAYLOAD_BYTES,
    onlyTranscriptId: undefined
  };
  let explicitLimit = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      if (index + 1 >= argv.length) throw new Error(`${arg} requires a value.`);
      index += 1;
      return argv[index];
    };

    switch (arg) {
      case '--output-dir':
        options.outputDir = next();
        break;
      case '--source-logs':
        options.sourceLogs = next();
        break;
      case '--limit':
        options.limit = parseInteger(next(), '--limit', { min: 1, max: 100_000 });
        explicitLimit = true;
        break;
      case '--all':
        options.all = true;
        break;
      case '--resume':
        options.resume = true;
        break;
      case '--no-resume':
        options.resume = false;
        break;
      case '--delay-ms':
        options.delayMs = parseInteger(next(), '--delay-ms', { min: 0, max: 60_000 });
        break;
      case '--timeout-ms':
        options.timeoutMs = parseInteger(next(), '--timeout-ms', { min: 1000, max: 120_000 });
        break;
      case '--max-payload-bytes':
        options.maxPayloadBytes = parseInteger(next(), '--max-payload-bytes', { min: 1024, max: 100 * 1024 * 1024 });
        break;
      case '--only':
        options.onlyTranscriptId = next();
        if (!TRANSCRIPT_ID.test(options.onlyTranscriptId)) throw new Error('--only must be a valid Tickety transcript ID.');
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (options.all && explicitLimit) throw new Error('Use either --all or --limit, not both.');
  if (options.onlyTranscriptId && (options.all || explicitLimit)) throw new Error('Use --only by itself, without --all or --limit.');
  if (options.all) options.limit = Number.POSITIVE_INFINITY;
  if (options.onlyTranscriptId) options.limit = 1;

  if (!options.help) {
    if (!options.outputDir) throw new Error('--output-dir is required.');
    options.outputDir = resolve(options.outputDir);
    options.sourceLogs = resolve(options.sourceLogs ?? join(options.outputDir, 'source-logs.jsonl'));
  }

  return options;
}

export function helpText() {
  return `CM Tickety Msgpack Transcript Exporter v${TOOL_VERSION}\n\n` +
    'Usage:\n' +
    '  node export-ticket-payloads.mjs --output-dir <CM-Ticket-Transcripts> [options]\n\n' +
    'The tool reads transcript IDs from source-logs.jsonl and fetches Tickety\'s structured Msgpack API.\n' +
    'It does not rescan Discord and does not use the Discord bot token.\n\n' +
    'Options:\n' +
    '  --source-logs <path>       Override source-logs.jsonl location.\n' +
    `  --limit <n>                Process n transcripts (default: ${DEFAULT_SAMPLE_LIMIT}).\n` +
    '  --all                      Process every transcript in source-logs.jsonl.\n' +
    '  --only <transcriptId>      Process exactly one transcript ID.\n' +
    '  --resume                   Skip already-valid Msgpack API records (default).\n' +
    '  --no-resume                Re-fetch already-valid Msgpack API records.\n' +
    `  --delay-ms <n>             Delay between requests (default: ${DEFAULT_DELAY_MS}).\n` +
    `  --timeout-ms <n>           Per-request timeout (default: ${DEFAULT_TIMEOUT_MS}).\n` +
    `  --max-payload-bytes <n>    Per-response cap (default: ${DEFAULT_MAX_PAYLOAD_BYTES}).\n`;
}

function stableTranscriptIdFromSourceLog(value) {
  const id = value?.transcript?.transcriptId;
  return typeof id === 'string' && TRANSCRIPT_ID.test(id) ? id : null;
}

export async function readSourceLogs(filePath) {
  const content = await readFile(filePath, 'utf8');
  const records = new Map();
  let lineNumber = 0;
  for (const line of content.split(/\r?\n/)) {
    lineNumber += 1;
    if (!line.trim()) continue;
    let value;
    try {
      value = JSON.parse(line);
    } catch {
      throw new Error(`Invalid JSON in source logs at line ${lineNumber}.`);
    }
    const id = stableTranscriptIdFromSourceLog(value);
    if (!id) continue;
    records.set(id, value);
  }
  return [...records.values()].sort((a, b) => String(a.discordLog?.timestamp ?? '').localeCompare(String(b.discordLog?.timestamp ?? '')));
}

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function atomicWrite(filePath, content) {
  await mkdir(dirname(filePath), { recursive: true });
  const temp = `${filePath}.${process.pid}.tmp`;
  await writeFile(temp, content);
  await rename(temp, filePath);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function safeTimestamp(value = new Date()) {
  return value.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function transcriptApiUrl(transcriptId) {
  if (!TRANSCRIPT_ID.test(transcriptId)) throw new Error('Invalid transcript ID.');
  const url = new URL(API_PATH, API_ORIGIN);
  url.searchParams.set('id', transcriptId);
  return url.href;
}

function transcriptPageUrl(transcriptId) {
  return `${API_ORIGIN}/transcripts/${transcriptId}`;
}

export async function loadMsgpackDecoder() {
  let module;
  try {
    module = await import('msgpackr');
  } catch {
    throw new Error(
      'The local bulk extractor requires msgpackr. Install it without modifying the repository: ' +
      'npm.cmd install --no-save --package-lock=false --omit=optional msgpackr@2.0.4'
    );
  }

  const { Unpackr, addExtension } = module;
  if (typeof Unpackr !== 'function' || typeof addExtension !== 'function') {
    throw new Error('Installed msgpackr does not expose the required decoder API.');
  }

  const registrationKey = Symbol.for('cm.ticketTranscript.msgpack.extension7');
  if (!globalThis[registrationKey]) {
    addExtension({ type: 7, read: (value) => value });
    globalThis[registrationKey] = true;
  }

  return new Unpackr({ useRecords: true, mapsAsObjects: true, int64AsType: 'string' });
}

async function readResponseCapped(response, maxBytes) {
  const declared = Number(response.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel();
    throw new Error(`Tickety payload exceeds configured limit (${declared} > ${maxBytes} bytes).`);
  }
  if (!response.body) return Buffer.alloc(0);

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error(`Tickety payload exceeds configured limit (${maxBytes} bytes).`);
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

function retryAfterMs(response, attempt) {
  const retryAfter = Number(response.headers.get('retry-after') ?? '0');
  if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.min(Math.ceil(retryAfter * 1000), 60_000);
  return Math.min(1000 * (attempt + 1), 10_000);
}

export async function fetchTicketyMsgpack(transcriptId, options) {
  const url = transcriptApiUrl(transcriptId);
  let lastError;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        redirect: 'error',
        headers: {
          Accept: 'application/vnd.msgpack,*/*;q=0.1',
          Referer: transcriptPageUrl(transcriptId),
          'User-Agent': `Mozilla/5.0 CM-Ticket-Transcript-Exporter/${TOOL_VERSION}`
        }
      });

      if (response.status === 429) {
        const delay = retryAfterMs(response, attempt);
        await response.body?.cancel();
        if (attempt < 4) {
          await sleep(delay);
          continue;
        }
      }

      if (response.status >= 500 && attempt < 4) {
        const delay = retryAfterMs(response, attempt);
        await response.body?.cancel();
        await sleep(delay);
        continue;
      }

      if (response.status === 401 || response.status === 403) {
        throw new Error(`Tickety transcript is private or access-restricted (HTTP ${response.status}).`);
      }
      if (!response.ok) throw new Error(`Tickety transcript API returned HTTP ${response.status}.`);

      const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
      if (!contentType.includes('application/vnd.msgpack')) {
        await response.body?.cancel();
        throw new Error(`Unexpected Tickety transcript content type: ${contentType || 'missing'}.`);
      }

      const buffer = await readResponseCapped(response, options.maxPayloadBytes);
      return {
        buffer,
        endpoint: url,
        contentType,
        rateLimit: {
          limit: response.headers.get('x-ratelimit-limit') ?? undefined,
          remaining: response.headers.get('x-ratelimit-remaining') ?? undefined
        },
        transcriptPrivate: response.headers.get('x-transcript-private') ?? undefined,
        transcriptCanShare: response.headers.get('x-transcript-can-share') ?? undefined
      };
    } catch (error) {
      lastError = error;
      if (attempt < 4 && error?.name === 'AbortError') {
        await sleep(1000 * (attempt + 1));
        continue;
      }
      if (attempt < 4 && /fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND/i.test(String(error?.message ?? error))) {
        await sleep(1000 * (attempt + 1));
        continue;
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error(`Tickety transcript API failed after retries: ${redactErrorText(lastError?.message ?? lastError)}`);
}

function normalizedId(value) {
  if (typeof value === 'string') return value;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value);
  return value == null ? undefined : String(value);
}

export function validateDecodedPayload(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('Decoded Tickety payload is not an object.');
  if (!Array.isArray(payload.users)) throw new Error('Decoded Tickety payload is missing users[].');
  if (!Array.isArray(payload.messages)) throw new Error('Decoded Tickety payload is missing messages[].');
  if (payload.messages.some((message) => !message || typeof message !== 'object')) {
    throw new Error('Decoded Tickety payload contains an invalid message record.');
  }
  return payload;
}

function userSummary(user) {
  if (!user || typeof user !== 'object') return undefined;
  return {
    id: normalizedId(user.id),
    name: typeof user.name === 'string' ? user.name : undefined,
    username: typeof user.username === 'string' ? user.username : undefined,
    bot: Boolean(user.bot)
  };
}

export function normalizeDecodedTranscript(payload) {
  validateDecodedPayload(payload);
  const users = payload.users.map((user) => ({ ...user, id: normalizedId(user.id) }));
  const userMap = new Map(users.map((user) => [normalizedId(user.id), user]));
  const messages = payload.messages.map((message) => {
    const userId = normalizedId(message.userId);
    return {
      ...message,
      id: normalizedId(message.id),
      userId,
      author: userSummary(userMap.get(userId))
    };
  });

  return {
    users,
    messages,
    roles: Array.isArray(payload.roles) ? payload.roles : [],
    channels: Array.isArray(payload.channels) ? payload.channels : [],
    channelId: normalizedId(payload.channelId),
    guildId: normalizedId(payload.guildId),
    exportedAt: payload.exportedAt,
    messageCount: messages.length
  };
}

function embedLines(embed) {
  if (!embed || typeof embed !== 'object') return [];
  const lines = [];
  if (typeof embed.title === 'string' && embed.title.trim()) lines.push(`[embed title] ${embed.title.trim()}`);
  if (typeof embed.description === 'string' && embed.description.trim()) lines.push(embed.description.trim());
  if (Array.isArray(embed.fields)) {
    for (const field of embed.fields) {
      const name = typeof field?.name === 'string' ? field.name.trim() : '';
      const value = typeof field?.value === 'string' ? field.value.trim() : '';
      if (name || value) lines.push(`[embed field] ${name}${name && value ? ': ' : ''}${value}`);
    }
  }
  return lines;
}

export function renderTranscriptText(transcript) {
  const blocks = [];
  for (const message of transcript.messages) {
    const author = message.author?.name || message.author?.username || message.userId || 'Unknown user';
    const username = message.author?.username && message.author.username !== author ? ` (@${message.author.username})` : '';
    const timestamp = typeof message.timestamp === 'string' ? message.timestamp : 'unknown-time';
    const lines = [`[${timestamp}] ${author}${username}`];
    if (typeof message.content === 'string' && message.content.trim()) lines.push(message.content.trim());
    if (Array.isArray(message.embeds)) {
      for (const embed of message.embeds) lines.push(...embedLines(embed));
    }
    if (Array.isArray(message.attachments)) {
      for (const attachment of message.attachments) {
        const name = typeof attachment?.name === 'string' && attachment.name ? attachment.name : 'attachment';
        const url = typeof attachment?.url === 'string' ? attachment.url : '';
        lines.push(`[attachment] ${name}${url ? ` — ${url}` : ''}`);
      }
    }
    if (message.messageReference?.messageId) lines.push(`[reply-to] ${normalizedId(message.messageReference.messageId)}`);
    blocks.push(lines.join('\n'));
  }
  return blocks.join('\n\n').trim();
}

export function buildTranscriptRecord(sourceLog, payload, acquisition) {
  const transcript = normalizeDecodedTranscript(payload);
  const plainText = renderTranscriptText(transcript);
  const transcriptId = sourceLog.transcript.transcriptId;
  return {
    schemaVersion: SCHEMA_VERSION,
    source: {
      discordLog: sourceLog.discordLog,
      ticket: sourceLog.ticket,
      transcriptId,
      transcriptUrl: sourceLog.transcript.url
    },
    acquisition: {
      fetchedAt: new Date().toISOString(),
      method: 'tickety-msgpack-api',
      endpoint: acquisition.endpoint,
      contentType: acquisition.contentType,
      payloadBytes: acquisition.buffer.byteLength,
      payloadSha256: sha256(acquisition.buffer),
      exporterVersion: TOOL_VERSION,
      rateLimit: acquisition.rateLimit,
      transcriptPrivate: acquisition.transcriptPrivate,
      transcriptCanShare: acquisition.transcriptCanShare
    },
    transcript: {
      ...transcript,
      plainText,
      plainTextChars: plainText.length
    }
  };
}

function isValidApiRecord(record, transcriptId) {
  return Boolean(
    record &&
    record.schemaVersion === SCHEMA_VERSION &&
    record.source?.transcriptId === transcriptId &&
    record.acquisition?.method === 'tickety-msgpack-api' &&
    typeof record.acquisition?.payloadSha256 === 'string' &&
    Array.isArray(record.transcript?.messages)
  );
}

async function writeTranscriptRecord(outputDir, record, rawPayload) {
  const id = record.source.transcriptId;
  await Promise.all([
    atomicWrite(join(outputDir, 'raw-msgpack', `${id}.msgpack`), rawPayload),
    atomicWrite(join(outputDir, 'text', `${id}.txt`), `${record.transcript.plainText}\n`),
    atomicWrite(join(outputDir, 'transcripts', `${id}.json`), `${JSON.stringify(record, null, 2)}\n`)
  ]);
}

function indexSummary(record) {
  return {
    schemaVersion: SCHEMA_VERSION,
    transcriptId: record.source.transcriptId,
    transcriptUrl: record.source.transcriptUrl,
    ticketName: record.source.ticket?.name,
    ticketId: record.source.ticket?.ticketId,
    creatorDiscordId: record.source.ticket?.creator?.discordId,
    creatorUsername: record.source.ticket?.creator?.username,
    executorDiscordId: record.source.ticket?.executor?.discordId,
    executorUsername: record.source.ticket?.executor?.username,
    closeReason: record.source.ticket?.closeReason,
    discordLogMessageId: record.source.discordLog?.messageId,
    discordLogTimestamp: record.source.discordLog?.timestamp,
    fetchedAt: record.acquisition.fetchedAt,
    messageCount: record.transcript.messageCount,
    plainTextChars: record.transcript.plainTextChars,
    channelId: record.transcript.channelId,
    guildId: record.transcript.guildId,
    files: {
      normalized: `transcripts/${record.source.transcriptId}.json`,
      text: `text/${record.source.transcriptId}.txt`,
      rawMsgpack: `raw-msgpack/${record.source.transcriptId}.msgpack`
    }
  };
}

async function rebuildIndex(outputDir) {
  const transcriptsDir = join(outputDir, 'transcripts');
  await mkdir(transcriptsDir, { recursive: true });
  const names = (await readdir(transcriptsDir)).filter((name) => name.endsWith('.json')).sort();
  const summaries = [];
  for (const name of names) {
    try {
      const record = JSON.parse(await readFile(join(transcriptsDir, name), 'utf8'));
      if (record?.acquisition?.method === 'tickety-msgpack-api' && Array.isArray(record?.transcript?.messages)) {
        summaries.push(indexSummary(record));
      }
    } catch {
      // Malformed and legacy shell records are intentionally omitted from the v2 index.
    }
  }
  summaries.sort((a, b) => String(a.discordLogTimestamp ?? '').localeCompare(String(b.discordLogTimestamp ?? '')));
  const jsonl = summaries.map((item) => JSON.stringify(item)).join('\n');
  await atomicWrite(join(outputDir, 'index.jsonl'), jsonl ? `${jsonl}\n` : '');
  return summaries;
}

async function runExport(options) {
  const allSourceLogs = await readSourceLogs(options.sourceLogs);
  if (allSourceLogs.length === 0) throw new Error(`No transcript IDs were found in ${options.sourceLogs}.`);

  let sourceLogs = allSourceLogs;
  if (options.onlyTranscriptId) {
    sourceLogs = allSourceLogs.filter((item) => item.transcript.transcriptId === options.onlyTranscriptId);
    if (sourceLogs.length === 0) throw new Error(`Transcript ${options.onlyTranscriptId} is not present in source logs.`);
  } else if (!options.all) {
    sourceLogs = allSourceLogs.slice(0, options.limit);
  }

  const decoder = await loadMsgpackDecoder();
  await mkdir(options.outputDir, { recursive: true });
  const runId = `msgpack-${safeTimestamp()}`;
  const startedAt = new Date().toISOString();
  const failures = [];
  let fetched = 0;
  let skipped = 0;

  console.log(`[transcripts] structured extraction: ${sourceLogs.length}/${allSourceLogs.length} transcript IDs selected.`);

  for (let index = 0; index < sourceLogs.length; index += 1) {
    const sourceLog = sourceLogs[index];
    const id = sourceLog.transcript.transcriptId;
    const recordPath = join(options.outputDir, 'transcripts', `${id}.json`);

    if (options.resume) {
      const existing = await readJsonIfExists(recordPath);
      if (isValidApiRecord(existing, id)) {
        skipped += 1;
        console.log(`[transcripts] ${index + 1}/${sourceLogs.length} ${id}: valid Msgpack record already present, skipped.`);
        continue;
      }
    }

    try {
      console.log(`[transcripts] ${index + 1}/${sourceLogs.length} ${id}: fetching structured payload...`);
      const acquisition = await fetchTicketyMsgpack(id, options);
      let decoded;
      try {
        decoded = decoder.unpack(acquisition.buffer);
      } catch (error) {
        throw new Error(`Msgpack decode failed: ${redactErrorText(error?.message ?? error)}`);
      }
      const record = buildTranscriptRecord(sourceLog, decoded, acquisition);
      await writeTranscriptRecord(options.outputDir, record, acquisition.buffer);
      fetched += 1;
      console.log(`[transcripts] ${id}: saved ${record.transcript.messageCount} messages (${acquisition.buffer.byteLength} bytes).`);
    } catch (error) {
      const failure = {
        schemaVersion: SCHEMA_VERSION,
        runId,
        timestamp: new Date().toISOString(),
        stage: 'tickety-msgpack-api',
        transcriptId: id,
        transcriptUrl: sourceLog.transcript.url,
        discordLogMessageId: sourceLog.discordLog?.messageId,
        error: redactErrorText(error?.message ?? error)
      };
      failures.push(failure);
      console.error(`[transcripts] ${id}: FAILED: ${failure.error}`);
    }

    if (options.delayMs > 0 && index < sourceLogs.length - 1) await sleep(options.delayMs);
  }

  const summaries = await rebuildIndex(options.outputDir);
  const failureText = failures.map((item) => JSON.stringify(item)).join('\n');
  await atomicWrite(join(options.outputDir, 'failures', `${runId}.jsonl`), failureText ? `${failureText}\n` : '');

  const run = {
    schemaVersion: SCHEMA_VERSION,
    runId,
    exporterVersion: TOOL_VERSION,
    method: 'tickety-msgpack-api',
    startedAt,
    completedAt: new Date().toISOString(),
    sourceLogCount: allSourceLogs.length,
    selectedCount: sourceLogs.length,
    fetched,
    skipped,
    failed: failures.length,
    structuredCorpusRecordsAfterRun: summaries.length,
    delayMs: options.delayMs,
    resume: options.resume
  };
  await atomicWrite(join(options.outputDir, 'runs', `${runId}.json`), `${JSON.stringify(run, null, 2)}\n`);

  const manifest = {
    schemaVersion: SCHEMA_VERSION,
    corpus: "Cheater's Market Tickety ticket transcripts",
    updatedAt: new Date().toISOString(),
    extractionMethod: 'tickety-msgpack-api',
    sourceTranscriptCount: allSourceLogs.length,
    structuredRecordCount: summaries.length,
    lastRun: run,
    layout: {
      index: 'index.jsonl',
      sourceLogs: 'source-logs.jsonl',
      normalizedRecords: 'transcripts/<transcriptId>.json',
      plainText: 'text/<transcriptId>.txt',
      rawMsgpack: 'raw-msgpack/<transcriptId>.msgpack',
      legacyHtmlShells: 'raw/<transcriptId>.html',
      runs: 'runs/<runId>.json',
      failures: 'failures/<runId>.jsonl'
    }
  };
  await atomicWrite(join(options.outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(`[transcripts] structured extraction complete: fetched=${fetched} skipped=${skipped} failed=${failures.length} structuredCorpus=${summaries.length}/${allSourceLogs.length}`);
  return run;
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`Error: ${redactErrorText(error?.message ?? error)}\n`);
    console.error(helpText());
    process.exitCode = 2;
    return;
  }

  if (options.help) {
    console.log(helpText());
    return;
  }

  try {
    await runExport(options);
  } catch (error) {
    console.error(`Fatal: ${redactErrorText(error?.message ?? error)}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

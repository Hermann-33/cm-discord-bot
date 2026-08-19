#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { decodeTicketyMsgpackr } from './tickety-msgpackr-decoder.mjs';

const TOOL_VERSION = '2.0.0';
const SCHEMA_VERSION = 2;
const DEFAULT_LIMIT = 1;
const DEFAULT_DELAY_MS = 650;
const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_PAYLOAD_BYTES = 16 * 1024 * 1024;
const TICKETY_API_ORIGIN = 'https://tickety.top';
const TRANSCRIPT_ID = /^[A-Za-z0-9_-]{6,128}$/;

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

function parseInteger(value, label, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (!/^\d+$/.test(value ?? '')) throw new Error(`${label} must be an integer.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${label} must be between ${min} and ${max}.`);
  }
  return parsed;
}

export function parsePayloadArgs(argv) {
  const options = {
    inputDir: undefined,
    limit: DEFAULT_LIMIT,
    all: false,
    resume: true,
    delayMs: DEFAULT_DELAY_MS,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    maxPayloadBytes: DEFAULT_MAX_PAYLOAD_BYTES
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
      case '--input-dir':
      case '--output-dir':
        options.inputDir = next();
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
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (options.all && explicitLimit) throw new Error('Use either --all or --limit, not both.');
  if (options.all) options.limit = Number.POSITIVE_INFINITY;
  if (!options.help && !options.inputDir) throw new Error('--input-dir is required.');
  return options;
}

export function payloadHelpText() {
  return `CM Tickety Transcript Payload Extractor v${TOOL_VERSION}\n\n` +
    'Usage:\n' +
    '  npm run extract:ticket-transcripts -- --input-dir <CM-Ticket-Transcripts> [options]\n\n' +
    'Reads transcript IDs from source-logs.jsonl, fetches Tickety /api/ticketTranscript,\n' +
    'decodes the msgpackr payload, and replaces incomplete schema-v1 transcript records.\n\n' +
    'Options:\n' +
    '  --limit <n>              Decode n transcript payloads (default: 1).\n' +
    '  --all                    Decode every transcript in source-logs.jsonl.\n' +
    '  --resume                 Skip already-complete schema-v2 payload records (default).\n' +
    '  --no-resume              Re-fetch all selected transcripts.\n' +
    `  --delay-ms <n>           Delay between API calls (default: ${DEFAULT_DELAY_MS}).\n` +
    `  --timeout-ms <n>         API request timeout (default: ${DEFAULT_TIMEOUT_MS}).\n` +
    `  --max-payload-bytes <n>  Per-transcript binary cap (default: ${DEFAULT_MAX_PAYLOAD_BYTES}).\n`;
}

function safeTimestamp(value = new Date()) {
  return value.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function atomicWrite(filePath, content) {
  await mkdir(dirname(filePath), { recursive: true });
  const temp = `${filePath}.${process.pid}.tmp`;
  await writeFile(temp, content);
  await rename(temp, filePath);
}

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function redactError(value) {
  return String(value ?? 'Unknown error').slice(0, 2000);
}

export function parseSourceLogs(text) {
  const records = [];
  const seen = new Set();
  for (const [index, line] of String(text ?? '').split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      throw new Error(`source-logs.jsonl line ${index + 1} is not valid JSON.`);
    }
    const transcriptId = record?.transcript?.transcriptId;
    if (typeof transcriptId !== 'string' || !TRANSCRIPT_ID.test(transcriptId)) {
      throw new Error(`source-logs.jsonl line ${index + 1} has an invalid transcript ID.`);
    }
    if (seen.has(transcriptId)) continue;
    seen.add(transcriptId);
    records.push(record);
  }
  return records;
}

export function isCompletePayloadRecord(record, transcriptId) {
  return Boolean(
    record &&
    record.schemaVersion === SCHEMA_VERSION &&
    record.source?.transcriptId === transcriptId &&
    record.acquisition?.method === 'tickety-msgpack-api-v1' &&
    Array.isArray(record.transcript?.messages) &&
    Array.isArray(record.transcript?.users)
  );
}

export function validateDecodedTranscript(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Decoded Tickety payload is not an object.');
  if (!Array.isArray(value.users)) throw new Error('Decoded Tickety payload does not contain a users array.');
  if (!Array.isArray(value.messages)) throw new Error('Decoded Tickety payload does not contain a messages array.');
  if (!Array.isArray(value.roles)) throw new Error('Decoded Tickety payload does not contain a roles array.');
  if (!Array.isArray(value.channels)) throw new Error('Decoded Tickety payload does not contain a channels array.');
  for (const [index, message] of value.messages.entries()) {
    if (!message || typeof message !== 'object' || Array.isArray(message)) throw new Error(`Decoded message ${index} is invalid.`);
    if (typeof message.id !== 'string') throw new Error(`Decoded message ${index} has no string message ID.`);
    if (typeof message.userId !== 'string') throw new Error(`Decoded message ${index} has no string user ID.`);
    if (typeof message.timestamp !== 'string') throw new Error(`Decoded message ${index} has no string timestamp.`);
    if (typeof message.content !== 'string') throw new Error(`Decoded message ${index} has no string content.`);
    if (!Array.isArray(message.attachments)) throw new Error(`Decoded message ${index} has no attachments array.`);
    if (!Array.isArray(message.embeds)) throw new Error(`Decoded message ${index} has no embeds array.`);
  }
  return value;
}

function displayAuthor(user, fallbackId) {
  if (!user) return fallbackId ? `Unknown User (${fallbackId})` : 'Unknown User';
  const name = typeof user.name === 'string' && user.name.trim() ? user.name.trim() : undefined;
  const username = typeof user.username === 'string' && user.username.trim() ? user.username.trim() : undefined;
  if (name && username && name !== username) return `${name} (@${username})`;
  if (username) return `@${username}`;
  if (name) return name;
  return user.id ? `User ${user.id}` : 'Unknown User';
}

function renderEmbed(embed) {
  if (!embed || typeof embed !== 'object') return [];
  const lines = [];
  if (typeof embed.title === 'string' && embed.title.trim()) lines.push(`Embed title: ${embed.title.trim()}`);
  if (typeof embed.description === 'string' && embed.description.trim()) lines.push(embed.description.trim());
  if (Array.isArray(embed.fields)) {
    for (const field of embed.fields) {
      if (!field || typeof field !== 'object') continue;
      const name = typeof field.name === 'string' ? field.name.trim() : '';
      const value = typeof field.value === 'string' ? field.value.trim() : '';
      if (name || value) lines.push(`${name || 'Field'}: ${value}`.trim());
    }
  }
  if (embed.footer && typeof embed.footer.text === 'string' && embed.footer.text.trim()) {
    lines.push(`Footer: ${embed.footer.text.trim()}`);
  }
  return lines;
}

export function formatTranscriptText(decoded) {
  const users = new Map((decoded.users ?? []).map((user) => [String(user.id), user]));
  const lines = [];
  lines.push(`Guild ID: ${decoded.guildId ?? ''}`);
  lines.push(`Channel ID: ${decoded.channelId ?? ''}`);
  lines.push(`Exported At: ${decoded.exportedAt ?? ''}`);
  lines.push(`Messages: ${decoded.messages?.length ?? 0}`);
  lines.push('');

  for (const message of decoded.messages ?? []) {
    const author = displayAuthor(users.get(String(message.userId)), message.userId);
    lines.push(`[${message.timestamp ?? ''}] ${author} [${message.userId ?? ''}]`);
    if (message.messageReference?.messageId) lines.push(`Reply to: ${message.messageReference.messageId}`);
    if (message.content) lines.push(message.content);
    for (const attachment of message.attachments ?? []) {
      const name = attachment?.name || 'attachment';
      const contentType = attachment?.contentType ? ` (${attachment.contentType})` : '';
      const url = attachment?.url || '';
      lines.push(`Attachment: ${name}${contentType}${url ? ` — ${url}` : ''}`);
    }
    for (const embed of message.embeds ?? []) lines.push(...renderEmbed(embed));
    if (!message.content && (message.attachments?.length ?? 0) === 0 && (message.embeds?.length ?? 0) === 0) {
      lines.push(`System/empty message (type ${message.type ?? 'unknown'})`);
    }
    lines.push('');
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

async function readResponseCapped(response, maxBytes) {
  const declared = Number(response.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel();
    throw new Error(`Tickety transcript payload exceeds configured limit (${declared} > ${maxBytes} bytes).`);
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
      throw new Error(`Tickety transcript payload exceeds configured limit (${maxBytes} bytes).`);
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

function parseRetryAfter(response, attempt) {
  const header = Number(response.headers.get('retry-after') ?? '0');
  if (Number.isFinite(header) && header > 0) return Math.min(Math.ceil(header * 1000), 60_000);
  return Math.min(1000 * 2 ** attempt, 30_000);
}

async function fetchTicketyPayload(transcriptId, options) {
  if (!TRANSCRIPT_ID.test(transcriptId)) throw new Error('Refusing invalid Tickety transcript ID.');
  const url = `${TICKETY_API_ORIGIN}/api/ticketTranscript?id=${encodeURIComponent(transcriptId)}`;
  let lastError;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        redirect: 'error',
        headers: {
          Accept: 'application/vnd.msgpack,application/octet-stream;q=0.9,*/*;q=0.1',
          'User-Agent': `CM-Ticket-Transcript-Payload-Extractor/${TOOL_VERSION}`
        }
      });

      if (response.status === 429 || response.status >= 500) {
        lastError = new Error(`Tickety API ${response.status}.`);
        if (attempt < 4) {
          await response.body?.cancel();
          await sleep(parseRetryAfter(response, attempt));
          continue;
        }
      }

      if (!response.ok) throw new Error(`Tickety API ${response.status}.`);
      const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
      if (!contentType.includes('application/vnd.msgpack') && !contentType.includes('application/octet-stream')) {
        throw new Error(`Unexpected Tickety transcript content type: ${contentType || '(missing)'}.`);
      }

      const payload = await readResponseCapped(response, options.maxPayloadBytes);
      if (payload.length === 0) throw new Error('Tickety transcript payload is empty.');
      const decoded = validateDecodedTranscript(decodeTicketyMsgpackr(payload));
      return {
        endpoint: url,
        contentType,
        payload,
        decoded,
        rateLimitLimit: response.headers.get('x-ratelimit-limit') ?? undefined,
        rateLimitRemaining: response.headers.get('x-ratelimit-remaining') ?? undefined
      };
    } catch (error) {
      lastError = error;
      if (attempt < 4 && error?.name !== 'AbortError') await sleep(Math.min(750 * (attempt + 1), 3000));
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error(`Tickety transcript payload fetch failed: ${redactError(lastError?.message ?? lastError)}`);
}

function buildPayloadRecord(sourceLog, acquisition) {
  const decoded = acquisition.decoded;
  return {
    schemaVersion: SCHEMA_VERSION,
    source: {
      discordLog: sourceLog.discordLog,
      ticket: sourceLog.ticket,
      transcriptId: sourceLog.transcript.transcriptId,
      transcriptUrl: sourceLog.transcript.url
    },
    acquisition: {
      fetchedAt: new Date().toISOString(),
      method: 'tickety-msgpack-api-v1',
      endpoint: acquisition.endpoint,
      contentType: acquisition.contentType,
      payloadBytes: acquisition.payload.byteLength,
      payloadSha256: sha256(acquisition.payload),
      exporterVersion: TOOL_VERSION
    },
    transcript: {
      guildId: decoded.guildId,
      channelId: decoded.channelId,
      exportedAt: decoded.exportedAt,
      users: decoded.users,
      roles: decoded.roles,
      channels: decoded.channels,
      messages: decoded.messages
    }
  };
}

async function writePayloadRecord(inputDir, record, payload) {
  const id = record.source.transcriptId;
  const text = formatTranscriptText(record.transcript);
  await Promise.all([
    atomicWrite(join(inputDir, 'payloads', `${id}.msgpack`), payload),
    atomicWrite(join(inputDir, 'transcripts', `${id}.json`), `${JSON.stringify(record, null, 2)}\n`),
    atomicWrite(join(inputDir, 'text', `${id}.txt`), text)
  ]);
}

function summarizeRecord(record) {
  return {
    schemaVersion: record.schemaVersion,
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
    acquisitionMethod: record.acquisition.method,
    payloadBytes: record.acquisition.payloadBytes,
    messageCount: record.transcript.messages.length,
    userCount: record.transcript.users.length,
    files: {
      normalized: `transcripts/${record.source.transcriptId}.json`,
      text: `text/${record.source.transcriptId}.txt`,
      payload: `payloads/${record.source.transcriptId}.msgpack`
    }
  };
}

async function rebuildPayloadIndex(inputDir) {
  const transcriptsDir = join(inputDir, 'transcripts');
  await mkdir(transcriptsDir, { recursive: true });
  const names = (await readdir(transcriptsDir)).filter((name) => name.endsWith('.json')).sort();
  const summaries = [];
  for (const name of names) {
    try {
      const record = JSON.parse(await readFile(join(transcriptsDir, name), 'utf8'));
      if (isCompletePayloadRecord(record, record?.source?.transcriptId)) summaries.push(summarizeRecord(record));
    } catch {
      // Malformed/incomplete files stay visible on disk and are excluded from the canonical v2 index.
    }
  }
  summaries.sort((a, b) => String(a.discordLogTimestamp ?? '').localeCompare(String(b.discordLogTimestamp ?? '')));
  const jsonl = summaries.map((item) => JSON.stringify(item)).join('\n');
  await atomicWrite(join(inputDir, 'index.jsonl'), jsonl ? `${jsonl}\n` : '');
  return summaries;
}

async function extractPayloads(options) {
  const inputDir = resolve(options.inputDir);
  const sourcePath = join(inputDir, 'source-logs.jsonl');
  const sourceLogs = parseSourceLogs(await readFile(sourcePath, 'utf8'));
  if (sourceLogs.length === 0) throw new Error('source-logs.jsonl contains no transcript records.');

  const selected = sourceLogs.slice(0, options.limit);
  const runId = safeTimestamp();
  const startedAt = new Date().toISOString();
  const failures = [];
  let fetched = 0;
  let skipped = 0;

  console.log(`[transcripts] payload extraction selected ${selected.length}/${sourceLogs.length} discovered transcript IDs.`);

  for (let index = 0; index < selected.length; index += 1) {
    const sourceLog = selected[index];
    const id = sourceLog.transcript.transcriptId;
    const recordPath = join(inputDir, 'transcripts', `${id}.json`);

    if (options.resume) {
      const existing = await readJsonIfExists(recordPath);
      if (isCompletePayloadRecord(existing, id)) {
        skipped += 1;
        console.log(`[transcripts] ${index + 1}/${selected.length} ${id}: complete payload already present, skipped.`);
        continue;
      }
    }

    try {
      console.log(`[transcripts] ${index + 1}/${selected.length} ${id}: fetching msgpack payload...`);
      const acquisition = await fetchTicketyPayload(id, options);
      const record = buildPayloadRecord(sourceLog, acquisition);
      await writePayloadRecord(inputDir, record, acquisition.payload);
      fetched += 1;
      console.log(`[transcripts] ${id}: saved ${record.transcript.messages.length} messages (${record.acquisition.payloadBytes} bytes).`);
    } catch (error) {
      const failure = {
        schemaVersion: SCHEMA_VERSION,
        runId,
        timestamp: new Date().toISOString(),
        stage: 'tickety_msgpack_payload',
        transcriptId: id,
        transcriptUrl: sourceLog.transcript.url,
        discordLogMessageId: sourceLog.discordLog?.messageId,
        error: redactError(error?.message ?? error)
      };
      failures.push(failure);
      console.error(`[transcripts] ${id}: FAILED: ${failure.error}`);
    }

    if (options.delayMs > 0 && index < selected.length - 1) await sleep(options.delayMs);
  }

  const summaries = await rebuildPayloadIndex(inputDir);
  const failureText = failures.map((item) => JSON.stringify(item)).join('\n');
  await atomicWrite(join(inputDir, 'failures', `${runId}-payloads.jsonl`), failureText ? `${failureText}\n` : '');

  const run = {
    schemaVersion: SCHEMA_VERSION,
    runId,
    extractorVersion: TOOL_VERSION,
    mode: options.all ? 'all' : 'limit',
    startedAt,
    completedAt: new Date().toISOString(),
    sourceTranscriptIds: sourceLogs.length,
    selectedTranscriptIds: selected.length,
    fetched,
    skipped,
    failed: failures.length,
    completeCorpusRecordsAfterRun: summaries.length,
    delayMs: options.delayMs,
    resume: options.resume
  };
  await atomicWrite(join(inputDir, 'runs', `${runId}-payloads.json`), `${JSON.stringify(run, null, 2)}\n`);

  const manifest = {
    schemaVersion: SCHEMA_VERSION,
    corpus: "Cheater's Market Tickety ticket transcripts",
    updatedAt: new Date().toISOString(),
    sourceTranscriptIds: sourceLogs.length,
    completeRecordCount: summaries.length,
    lastPayloadRun: run,
    canonicalAcquisition: 'Tickety /api/ticketTranscript msgpackr payload',
    layout: {
      index: 'index.jsonl',
      sourceLogs: 'source-logs.jsonl',
      normalizedRecords: 'transcripts/<transcriptId>.json',
      plainText: 'text/<transcriptId>.txt',
      rawPayload: 'payloads/<transcriptId>.msgpack',
      runs: 'runs/<runId>-payloads.json',
      failures: 'failures/<runId>-payloads.jsonl',
      legacyHtmlShells: 'raw/<transcriptId>.html (non-canonical; may exist from the earlier HTML experiment)'
    }
  };
  await atomicWrite(join(inputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(`[transcripts] complete: fetched=${fetched} skipped=${skipped} failed=${failures.length} complete=${summaries.length}/${sourceLogs.length}`);
  return run;
}

async function main() {
  let options;
  try {
    options = parsePayloadArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`Error: ${redactError(error.message)}\n`);
    console.error(payloadHelpText());
    process.exitCode = 2;
    return;
  }

  if (options.help) {
    console.log(payloadHelpText());
    return;
  }

  try {
    await extractPayloads(options);
  } catch (error) {
    console.error(`Fatal: ${redactError(error?.message ?? error)}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

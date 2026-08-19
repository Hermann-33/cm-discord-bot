#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { access, mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

const execFileAsync = promisify(execFile);

const DISCORD_API_ORIGIN = 'https://discord.com/api/v10';
const DEFAULT_SAMPLE_LIMIT = 5;
const DEFAULT_DELAY_MS = 350;
const DEFAULT_MAX_HTML_BYTES = 8 * 1024 * 1024;
const DEFAULT_FETCH_TIMEOUT_MS = 20_000;
const DEFAULT_CHROME_TIMEOUT_MS = 45_000;
const TOOL_VERSION = '1.0.0';
const SCHEMA_VERSION = 1;
const TICKETY_TRANSCRIPT_PATH = /^\/transcripts\/([A-Za-z0-9_-]{6,128})\/?$/;
const SNOWFLAKE = /^\d{5,32}$/;

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

function redactErrorText(value) {
  return String(value ?? 'Unknown error')
    .replace(/Bot\s+[A-Za-z0-9._-]+/gi, 'Bot [REDACTED]')
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
    channelId: undefined,
    outputDir: undefined,
    envFile: undefined,
    limit: DEFAULT_SAMPLE_LIMIT,
    all: false,
    resume: true,
    dryRun: false,
    fetchMode: 'auto',
    chromePath: undefined,
    delayMs: DEFAULT_DELAY_MS,
    maxHtmlBytes: DEFAULT_MAX_HTML_BYTES,
    timeoutMs: DEFAULT_FETCH_TIMEOUT_MS
  };

  let explicitLimit = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) throw new Error(`${arg} requires a value.`);
      i += 1;
      return argv[i];
    };

    switch (arg) {
      case '--channel-id':
        options.channelId = next();
        break;
      case '--output-dir':
        options.outputDir = next();
        break;
      case '--env-file':
        options.envFile = next();
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
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--fetch-mode': {
        const mode = next();
        if (!['auto', 'http', 'chrome'].includes(mode)) {
          throw new Error('--fetch-mode must be auto, http, or chrome.');
        }
        options.fetchMode = mode;
        break;
      }
      case '--chrome-path':
        options.chromePath = next();
        break;
      case '--delay-ms':
        options.delayMs = parseInteger(next(), '--delay-ms', { min: 0, max: 60_000 });
        break;
      case '--max-html-bytes':
        options.maxHtmlBytes = parseInteger(next(), '--max-html-bytes', { min: 1024, max: 100 * 1024 * 1024 });
        break;
      case '--timeout-ms':
        options.timeoutMs = parseInteger(next(), '--timeout-ms', { min: 1000, max: 120_000 });
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
  if (!options.help) {
    if (!options.channelId) throw new Error('--channel-id is required.');
    if (!SNOWFLAKE.test(options.channelId)) throw new Error('--channel-id must be a Discord snowflake.');
    if (!options.outputDir) throw new Error('--output-dir is required.');
  }

  return options;
}

export function helpText() {
  return `CM Ticket Transcript Exporter v${TOOL_VERSION}\n\n` +
    'Usage:\n' +
    '  node export-ticket-transcripts.mjs --channel-id <id> --output-dir <path> [options]\n\n' +
    'Safe sample (default): exports the first 5 Tickety transcript logs found.\n' +
    'Bulk mode requires the explicit --all flag.\n\n' +
    'Options:\n' +
    '  --env-file <path>       Read DISCORD_BOT_TOKEN and DISCORD_GUILD_ID from a local .env file.\n' +
    '  --limit <n>             Export n transcripts (default: 5).\n' +
    '  --all                   Export every transcript found in the channel history.\n' +
    '  --resume                Skip transcripts already present in transcripts/ (default).\n' +
    '  --no-resume             Re-fetch existing transcript files.\n' +
    '  --dry-run               Discover Discord logs/URLs but do not fetch transcript pages.\n' +
    '  --fetch-mode <mode>     auto | http | chrome (default: auto).\n' +
    '  --chrome-path <path>    Explicit Chrome/Chromium executable for browser fallback.\n' +
    `  --delay-ms <n>          Delay between transcript fetches (default: ${DEFAULT_DELAY_MS}).\n` +
    `  --timeout-ms <n>        HTTP timeout (default: ${DEFAULT_FETCH_TIMEOUT_MS}).\n` +
    `  --max-html-bytes <n>    Per-transcript HTML cap (default: ${DEFAULT_MAX_HTML_BYTES}).\n`;
}

function parseDotEnvValue(raw) {
  const trimmed = raw.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export async function loadEnvFile(filePath) {
  const content = await readFile(filePath, 'utf8');
  const values = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index <= 0) continue;
    const key = trimmed.slice(0, index).trim();
    const value = parseDotEnvValue(trimmed.slice(index + 1));
    if (key === 'DISCORD_BOT_TOKEN' || key === 'DISCORD_GUILD_ID') values[key] = value;
  }
  return values;
}

function validateCredentials(environment) {
  const token = environment.DISCORD_BOT_TOKEN?.trim();
  const guildId = environment.DISCORD_GUILD_ID?.trim();
  if (!token) throw new Error('DISCORD_BOT_TOKEN is required in the environment or --env-file.');
  if (!guildId || !SNOWFLAKE.test(guildId)) {
    throw new Error('DISCORD_GUILD_ID is required and must be a Discord snowflake.');
  }
  return { token, guildId };
}

async function parseDiscordError(response) {
  try {
    const body = await response.json();
    const code = body && typeof body === 'object' && 'code' in body ? ` code=${body.code}` : '';
    const message = body && typeof body === 'object' && typeof body.message === 'string' ? ` ${body.message}` : '';
    return `${response.status}${code}${message}`;
  } catch {
    return String(response.status);
  }
}

async function discordGet(pathname, token) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await fetch(`${DISCORD_API_ORIGIN}${pathname}`, {
      headers: {
        Authorization: `Bot ${token}`,
        'User-Agent': `CM-Ticket-Transcript-Exporter/${TOOL_VERSION}`
      }
    });

    if (response.status === 429) {
      let retryMs = 1000;
      try {
        const body = await response.json();
        if (typeof body.retry_after === 'number') retryMs = Math.ceil(body.retry_after * 1000);
      } catch {
        // Use fallback delay.
      }
      await sleep(Math.min(Math.max(retryMs, 250), 60_000));
      continue;
    }

    if (response.status >= 500 && attempt < 4) {
      await response.body?.cancel();
      await sleep(500 * (attempt + 1));
      continue;
    }

    if (!response.ok) {
      throw new Error(`Discord API request failed: ${await parseDiscordError(response)}`);
    }

    return response.json();
  }
  throw new Error('Discord API request failed after retries.');
}

export function normalizeTicketyTranscriptUrl(candidate) {
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'https:') return null;
    const host = url.hostname.toLowerCase();
    if (host !== 'tickety.top' && host !== 'www.tickety.top') return null;
    const match = TICKETY_TRANSCRIPT_PATH.exec(url.pathname);
    if (!match) return null;
    return {
      transcriptId: match[1],
      url: `https://tickety.top/transcripts/${match[1]}`
    };
  } catch {
    return null;
  }
}

function urlsFromText(text) {
  if (typeof text !== 'string') return [];
  return text.match(/https:\/\/(?:www\.)?tickety\.top\/transcripts\/[A-Za-z0-9_-]{6,128}(?:[?#][^\s<>"']*)?/gi) ?? [];
}

function collectUrlsFromValue(value, output, depth = 0) {
  if (depth > 8 || value == null) return;
  if (typeof value === 'string') {
    for (const url of urlsFromText(value)) output.push(url);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectUrlsFromValue(item, output, depth + 1);
    return;
  }
  if (typeof value === 'object') {
    if (typeof value.url === 'string') output.push(value.url);
    for (const [key, child] of Object.entries(value)) {
      if (key === 'url') continue;
      collectUrlsFromValue(child, output, depth + 1);
    }
  }
}

function normalizeFieldName(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

function mentionId(value) {
  const match = /<@!?(\d{5,32})>/.exec(value ?? '');
  return match?.[1];
}

function cleanId(value) {
  const trimmed = String(value ?? '').trim();
  return SNOWFLAKE.test(trimmed) ? trimmed : undefined;
}

export function parseTicketLogMessage(message, channelId) {
  if (!message || typeof message !== 'object') return null;

  const candidateUrls = [];
  collectUrlsFromValue(message.components, candidateUrls);
  collectUrlsFromValue(message.embeds, candidateUrls);
  for (const url of urlsFromText(message.content)) candidateUrls.push(url);

  const normalized = candidateUrls.map(normalizeTicketyTranscriptUrl).filter(Boolean);
  if (normalized.length === 0) return null;

  const unique = new Map(normalized.map((item) => [item.transcriptId, item]));
  const transcript = unique.values().next().value;
  if (!transcript) return null;

  const fields = [];
  for (const embed of Array.isArray(message.embeds) ? message.embeds : []) {
    for (const field of Array.isArray(embed?.fields) ? embed.fields : []) {
      if (field && typeof field.name === 'string') fields.push(field);
    }
  }

  const fieldMap = new Map();
  for (const field of fields) {
    const key = normalizeFieldName(field.name);
    if (!fieldMap.has(key) && typeof field.value === 'string') fieldMap.set(key, field.value.trim());
  }

  const creatorMention = firstNonEmpty(fieldMap.get('creator'));
  const executorMention = firstNonEmpty(fieldMap.get('executor'));
  const embed = Array.isArray(message.embeds) ? message.embeds[0] : undefined;

  return {
    schemaVersion: SCHEMA_VERSION,
    discordLog: {
      channelId,
      messageId: String(message.id ?? ''),
      timestamp: firstNonEmpty(message.timestamp),
      authorId: firstNonEmpty(message.author?.id),
      authorUsername: firstNonEmpty(message.author?.username),
      embedTitle: firstNonEmpty(embed?.title),
      embedDescription: firstNonEmpty(embed?.description)
    },
    ticket: {
      name: firstNonEmpty(fieldMap.get('ticket'), fieldMap.get('ticketname')),
      ticketId: firstNonEmpty(fieldMap.get('ticketid')),
      closeReason: firstNonEmpty(fieldMap.get('closereason'), fieldMap.get('reason')),
      creator: {
        mention: creatorMention,
        username: firstNonEmpty(fieldMap.get('creatorusername')),
        discordId: cleanId(fieldMap.get('creatorid')) ?? mentionId(creatorMention)
      },
      executor: {
        mention: executorMention,
        username: firstNonEmpty(fieldMap.get('executorusername')),
        discordId: cleanId(fieldMap.get('executorid')) ?? mentionId(executorMention)
      }
    },
    transcript: {
      transcriptId: transcript.transcriptId,
      url: transcript.url
    },
    sourceEmbedFields: fields.map((field) => ({
      name: String(field.name ?? ''),
      value: String(field.value ?? ''),
      inline: Boolean(field.inline)
    }))
  };
}

async function fetchDiscordTicketLogs({ token, guildId, channelId, limit }) {
  const channel = await discordGet(`/channels/${channelId}`, token);
  if (!channel || typeof channel !== 'object') throw new Error('Discord returned an invalid channel object.');
  if (channel.guild_id !== guildId) throw new Error('Configured channel does not belong to DISCORD_GUILD_ID.');

  const results = [];
  const seenTranscriptIds = new Set();
  let before;
  let scannedMessages = 0;
  let pages = 0;

  while (results.length < limit) {
    const params = new URLSearchParams({ limit: '100' });
    if (before) params.set('before', before);
    const page = await discordGet(`/channels/${channelId}/messages?${params}`, token);
    if (!Array.isArray(page)) throw new Error('Discord returned an invalid message page.');
    pages += 1;
    scannedMessages += page.length;

    for (const message of page) {
      const parsed = parseTicketLogMessage(message, channelId);
      if (!parsed) continue;
      if (seenTranscriptIds.has(parsed.transcript.transcriptId)) continue;
      seenTranscriptIds.add(parsed.transcript.transcriptId);
      results.push(parsed);
      if (results.length >= limit) break;
    }

    if (page.length < 100 || page.length === 0) break;
    before = String(page.at(-1)?.id ?? '');
    if (!before) break;
  }

  results.sort((a, b) => String(a.discordLog.timestamp ?? '').localeCompare(String(b.discordLog.timestamp ?? '')));
  return {
    channel: {
      id: String(channel.id ?? channelId),
      name: typeof channel.name === 'string' ? channel.name : undefined,
      guildId: channel.guild_id
    },
    tickets: results,
    scannedMessages,
    pages
  };
}

async function readResponseCapped(response, maxBytes) {
  const declared = Number(response.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel();
    throw new Error(`Transcript HTML exceeds configured limit (${declared} > ${maxBytes} bytes).`);
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
      throw new Error(`Transcript HTML exceeds configured limit (${maxBytes} bytes).`);
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

function validateFinalTicketyUrl(urlValue) {
  const normalized = normalizeTicketyTranscriptUrl(urlValue);
  if (!normalized) throw new Error('Tickety redirected the transcript request outside the allowed transcript origin/path.');
  return normalized;
}

async function fetchTranscriptHttp(url, { timeoutMs, maxHtmlBytes }) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1',
          'User-Agent': `Mozilla/5.0 CM-Ticket-Transcript-Exporter/${TOOL_VERSION}`
        }
      });

      if (response.status === 429 || response.status >= 500) {
        if (attempt < 2) {
          const retryHeader = Number(response.headers.get('retry-after') ?? '0');
          await response.body?.cancel();
          await sleep(Number.isFinite(retryHeader) && retryHeader > 0 ? Math.min(retryHeader * 1000, 30_000) : 750 * (attempt + 1));
          continue;
        }
      }

      if (!response.ok) throw new Error(`Tickety HTTP ${response.status}.`);
      validateFinalTicketyUrl(response.url || url);
      const buffer = await readResponseCapped(response, maxHtmlBytes);
      const html = buffer.toString('utf8');
      if (!/<(?:!doctype\s+html|html|body|div|main)\b/i.test(html)) throw new Error('Tickety response does not look like HTML.');
      return { html, method: 'http', finalUrl: response.url || url };
    } catch (error) {
      lastError = error;
      if (attempt < 2) await sleep(500 * (attempt + 1));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error(`HTTP transcript fetch failed: ${redactErrorText(lastError?.message ?? lastError)}`);
}

async function pathExists(filePath) {
  try {
    await access(filePath, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function findChrome(explicitPath) {
  const candidates = [
    explicitPath,
    process.env.CHROME_PATH,
    process.platform === 'win32' ? join(process.env.PROGRAMFILES ?? 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe') : undefined,
    process.platform === 'win32' ? join(process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)', 'Google', 'Chrome', 'Application', 'chrome.exe') : undefined,
    process.platform === 'win32' && process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe') : undefined,
    process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : undefined,
    process.platform === 'linux' ? '/usr/bin/google-chrome' : undefined,
    process.platform === 'linux' ? '/usr/bin/google-chrome-stable' : undefined,
    process.platform === 'linux' ? '/usr/bin/chromium' : undefined,
    process.platform === 'linux' ? '/usr/bin/chromium-browser' : undefined
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (await pathExists(candidate)) return candidate;
  }
  return null;
}

async function fetchTranscriptChrome(url, { chromePath, maxHtmlBytes }) {
  const chrome = await findChrome(chromePath);
  if (!chrome) throw new Error('Chrome/Chromium was not found. Supply --chrome-path or CHROME_PATH.');

  const { stdout } = await execFileAsync(
    chrome,
    ['--headless=new', '--disable-gpu', '--disable-dev-shm-usage', '--dump-dom', url],
    {
      encoding: 'utf8',
      timeout: DEFAULT_CHROME_TIMEOUT_MS,
      maxBuffer: maxHtmlBytes + 1024 * 1024,
      windowsHide: true
    }
  );

  if (Buffer.byteLength(stdout, 'utf8') > maxHtmlBytes) throw new Error(`Chrome transcript HTML exceeds configured limit (${maxHtmlBytes} bytes).`);
  if (!/<(?:!doctype\s+html|html|body|div|main)\b/i.test(stdout)) throw new Error('Chrome did not return recognizable transcript HTML.');
  return { html: stdout, method: 'chrome', finalUrl: url };
}

async function acquireTranscript(url, options) {
  if (!normalizeTicketyTranscriptUrl(url)) throw new Error('Refusing to fetch a non-Tickety transcript URL.');
  if (options.fetchMode === 'http') return fetchTranscriptHttp(url, options);
  if (options.fetchMode === 'chrome') return fetchTranscriptChrome(url, options);

  try {
    return await fetchTranscriptHttp(url, options);
  } catch (httpError) {
    try {
      return await fetchTranscriptChrome(url, options);
    } catch (chromeError) {
      throw new Error(`${redactErrorText(httpError.message)} Browser fallback also failed: ${redactErrorText(chromeError.message)}`);
    }
  }
}

const namedEntities = new Map([
  ['amp', '&'], ['lt', '<'], ['gt', '>'], ['quot', '"'], ['apos', "'"], ['nbsp', ' '],
  ['copy', '©'], ['reg', '®'], ['hellip', '…'], ['mdash', '—'], ['ndash', '–']
]);

export function decodeHtmlEntities(text) {
  return String(text ?? '').replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]+);/gi, (match, entity) => {
    const lower = entity.toLowerCase();
    if (lower.startsWith('#x')) {
      const code = Number.parseInt(lower.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    if (lower.startsWith('#')) {
      const code = Number.parseInt(lower.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return namedEntities.get(lower) ?? match;
  });
}

export function htmlToPlainText(html) {
  let text = String(html ?? '');
  text = text.replace(/<!--[\s\S]*?-->/g, ' ');
  text = text.replace(/<(script|style|noscript|svg|head)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ');
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<li\b[^>]*>/gi, '\n- ');
  text = text.replace(/<\/(?:p|div|section|article|main|header|footer|aside|li|ul|ol|table|tr|blockquote|pre|h[1-6])\s*>/gi, '\n');
  text = text.replace(/<(?:p|div|section|article|main|header|footer|aside|table|tr|blockquote|pre|h[1-6])\b[^>]*>/gi, '\n');
  text = text.replace(/<[^>]+>/g, ' ');
  text = decodeHtmlEntities(text).replace(/\r/g, '');
  const lines = text.split('\n').map((line) => line.replace(/[\t\f\v ]+/g, ' ').trim()).filter(Boolean);
  return lines.join('\n').trim();
}

export function extractHtmlTitle(html) {
  const match = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(html ?? '');
  if (!match) return undefined;
  return htmlToPlainText(match[1]).slice(0, 500) || undefined;
}

function classifyAttachmentUrl(url) {
  const host = url.hostname.toLowerCase();
  const fileish = /\.(?:png|jpe?g|gif|webp|avif|pdf|zip|rar|7z|txt|log|csv|json|mp4|mov|webm|mp3|wav|ogg)(?:$|[?#])/i.test(url.href);
  const discordCdn = host === 'cdn.discordapp.com' || host === 'media.discordapp.net';
  if (!fileish && !discordCdn) return null;
  return { url: url.href, host, kind: discordCdn ? 'discord_cdn' : 'file_link' };
}

export function extractAttachmentCandidates(html, baseUrl) {
  const values = [];
  const regex = /\b(?:href|src)\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi;
  let match;
  while ((match = regex.exec(html ?? ''))) {
    const raw = decodeHtmlEntities(match[1] ?? match[2] ?? match[3] ?? '');
    try {
      const url = new URL(raw, baseUrl);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') continue;
      const classified = classifyAttachmentUrl(url);
      if (classified) values.push(classified);
    } catch {
      // Ignore malformed links.
    }
  }
  const unique = new Map(values.map((entry) => [entry.url, entry]));
  return [...unique.values()].slice(0, 1000);
}

export function estimateMessageCount(html) {
  const patterns = [
    /\bdata-message-id\s*=/gi,
    /\bclass\s*=\s*["'][^"']*\bchatlog__message-group\b[^"']*["']/gi,
    /\bclass\s*=\s*["'][^"']*\bmessage-group\b[^"']*["']/gi
  ];
  return Math.max(...patterns.map((pattern) => (html.match(pattern) ?? []).length), 0);
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

function safeTimestamp(value = new Date()) {
  return value.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function normalizeRecordSummary(record) {
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
    acquisitionMethod: record.acquisition.method,
    htmlBytes: record.acquisition.htmlBytes,
    plainTextChars: record.transcript.plainTextChars,
    estimatedMessageCount: record.transcript.estimatedMessageCount,
    files: {
      normalized: `transcripts/${record.source.transcriptId}.json`,
      text: `text/${record.source.transcriptId}.txt`,
      rawHtml: `raw/${record.source.transcriptId}.html`
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
      if (record?.source?.transcriptId && record?.acquisition) summaries.push(normalizeRecordSummary(record));
    } catch {
      // A malformed record remains visible on disk but is excluded from the searchable index.
    }
  }
  summaries.sort((a, b) => String(a.discordLogTimestamp ?? '').localeCompare(String(b.discordLogTimestamp ?? '')));
  const jsonl = summaries.map((item) => JSON.stringify(item)).join('\n');
  await atomicWrite(join(outputDir, 'index.jsonl'), jsonl ? `${jsonl}\n` : '');
  return summaries;
}

async function mergeSourceLogs(outputDir, discovered) {
  const filePath = join(outputDir, 'source-logs.jsonl');
  const merged = new Map();
  try {
    const existing = await readFile(filePath, 'utf8');
    for (const line of existing.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const value = JSON.parse(line);
      const id = value?.transcript?.transcriptId;
      if (id) merged.set(id, value);
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  for (const item of discovered) merged.set(item.transcript.transcriptId, item);
  const values = [...merged.values()].sort((a, b) => String(a.discordLog?.timestamp ?? '').localeCompare(String(b.discordLog?.timestamp ?? '')));
  const jsonl = values.map((item) => JSON.stringify(item)).join('\n');
  await atomicWrite(filePath, jsonl ? `${jsonl}\n` : '');
}

async function buildTranscriptRecord(ticketLog, acquisition) {
  const htmlBuffer = Buffer.from(acquisition.html, 'utf8');
  const plainText = htmlToPlainText(acquisition.html);
  return {
    schemaVersion: SCHEMA_VERSION,
    source: {
      discordLog: ticketLog.discordLog,
      ticket: ticketLog.ticket,
      transcriptId: ticketLog.transcript.transcriptId,
      transcriptUrl: ticketLog.transcript.url
    },
    acquisition: {
      fetchedAt: new Date().toISOString(),
      method: acquisition.method,
      finalUrl: acquisition.finalUrl,
      htmlBytes: htmlBuffer.byteLength,
      htmlSha256: sha256(htmlBuffer),
      exporterVersion: TOOL_VERSION
    },
    transcript: {
      parser: 'html-visible-text-v1',
      title: extractHtmlTitle(acquisition.html),
      plainText,
      plainTextChars: plainText.length,
      estimatedMessageCount: estimateMessageCount(acquisition.html),
      attachmentCandidates: extractAttachmentCandidates(acquisition.html, ticketLog.transcript.url)
    }
  };
}

async function writeTranscriptRecord(outputDir, record, html) {
  const id = record.source.transcriptId;
  await Promise.all([
    atomicWrite(join(outputDir, 'raw', `${id}.html`), html),
    atomicWrite(join(outputDir, 'text', `${id}.txt`), `${record.transcript.plainText}\n`),
    atomicWrite(join(outputDir, 'transcripts', `${id}.json`), `${JSON.stringify(record, null, 2)}\n`)
  ]);
}

async function exportTickets(options, credentials) {
  const outputDir = resolve(options.outputDir);
  await mkdir(outputDir, { recursive: true });
  const runId = safeTimestamp();
  const runStartedAt = new Date().toISOString();

  console.log(`[transcripts] discovering Discord ticket logs in channel ${options.channelId}...`);
  const discovery = await fetchDiscordTicketLogs({ token: credentials.token, guildId: credentials.guildId, channelId: options.channelId, limit: options.limit });

  if (discovery.tickets.length === 0) {
    throw new Error('No Tickety transcript links were found. Verify the channel ID, bot VIEW_CHANNEL/READ_MESSAGE_HISTORY permissions, and the Discord Message Content privileged intent.');
  }

  await mergeSourceLogs(outputDir, discovery.tickets);

  if (options.dryRun) {
    const run = {
      schemaVersion: SCHEMA_VERSION,
      runId,
      mode: options.all ? 'all' : 'sample',
      dryRun: true,
      startedAt: runStartedAt,
      completedAt: new Date().toISOString(),
      channel: discovery.channel,
      discordMessagesScanned: discovery.scannedMessages,
      discordPagesScanned: discovery.pages,
      transcriptLogsDiscovered: discovery.tickets.length
    };
    await atomicWrite(join(outputDir, 'runs', `${runId}.json`), `${JSON.stringify(run, null, 2)}\n`);
    console.log(`[transcripts] dry run complete: ${discovery.tickets.length} transcript URLs discovered.`);
    return run;
  }

  const failures = [];
  let fetched = 0;
  let skipped = 0;

  for (let index = 0; index < discovery.tickets.length; index += 1) {
    const ticketLog = discovery.tickets[index];
    const id = ticketLog.transcript.transcriptId;
    const normalizedPath = join(outputDir, 'transcripts', `${id}.json`);

    if (options.resume) {
      const existing = await readJsonIfExists(normalizedPath);
      if (existing?.source?.transcriptId === id && existing?.acquisition?.htmlSha256) {
        skipped += 1;
        console.log(`[transcripts] ${index + 1}/${discovery.tickets.length} ${id}: already present, skipped.`);
        continue;
      }
    }

    try {
      console.log(`[transcripts] ${index + 1}/${discovery.tickets.length} ${id}: fetching...`);
      const acquisition = await acquireTranscript(ticketLog.transcript.url, options);
      const record = await buildTranscriptRecord(ticketLog, acquisition);
      await writeTranscriptRecord(outputDir, record, acquisition.html);
      fetched += 1;
      console.log(`[transcripts] ${id}: saved (${record.acquisition.htmlBytes} bytes, ${record.acquisition.method}).`);
    } catch (error) {
      const failure = {
        schemaVersion: SCHEMA_VERSION,
        runId,
        timestamp: new Date().toISOString(),
        stage: 'transcript_fetch_or_parse',
        transcriptId: id,
        transcriptUrl: ticketLog.transcript.url,
        discordLogMessageId: ticketLog.discordLog.messageId,
        error: redactErrorText(error?.message ?? error)
      };
      failures.push(failure);
      console.error(`[transcripts] ${id}: FAILED: ${failure.error}`);
    }

    if (options.delayMs > 0 && index < discovery.tickets.length - 1) await sleep(options.delayMs);
  }

  const summaries = await rebuildIndex(outputDir);
  const failurePath = join(outputDir, 'failures', `${runId}.jsonl`);
  const failureText = failures.map((item) => JSON.stringify(item)).join('\n');
  await atomicWrite(failurePath, failureText ? `${failureText}\n` : '');

  const run = {
    schemaVersion: SCHEMA_VERSION,
    runId,
    exporterVersion: TOOL_VERSION,
    mode: options.all ? 'all' : 'sample',
    startedAt: runStartedAt,
    completedAt: new Date().toISOString(),
    channel: discovery.channel,
    discordMessagesScanned: discovery.scannedMessages,
    discordPagesScanned: discovery.pages,
    transcriptLogsDiscovered: discovery.tickets.length,
    fetched,
    skipped,
    failed: failures.length,
    corpusRecordsAfterRun: summaries.length,
    fetchMode: options.fetchMode,
    resume: options.resume
  };
  await atomicWrite(join(outputDir, 'runs', `${runId}.json`), `${JSON.stringify(run, null, 2)}\n`);

  const manifest = {
    schemaVersion: SCHEMA_VERSION,
    corpus: "Cheater's Market Tickety ticket transcripts",
    updatedAt: new Date().toISOString(),
    lastRun: run,
    recordCount: summaries.length,
    layout: {
      index: 'index.jsonl',
      sourceLogs: 'source-logs.jsonl',
      normalizedRecords: 'transcripts/<transcriptId>.json',
      plainText: 'text/<transcriptId>.txt',
      rawHtml: 'raw/<transcriptId>.html',
      runs: 'runs/<runId>.json',
      failures: 'failures/<runId>.jsonl'
    }
  };
  await atomicWrite(join(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(`[transcripts] complete: fetched=${fetched} skipped=${skipped} failed=${failures.length} corpus=${summaries.length}`);
  return run;
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`Error: ${redactErrorText(error.message)}\n`);
    console.error(helpText());
    process.exitCode = 2;
    return;
  }

  if (options.help) {
    console.log(helpText());
    return;
  }

  try {
    const fileEnvironment = options.envFile ? await loadEnvFile(resolve(options.envFile)) : {};
    const credentials = validateCredentials({ ...fileEnvironment, ...process.env });
    await exportTickets(options, credentials);
  } catch (error) {
    console.error(`Fatal: ${redactErrorText(error?.message ?? error)}`);
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) await main();

export { exportTickets, fetchDiscordTicketLogs };

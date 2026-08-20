#!/usr/bin/env node

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const TOOL_VERSION = '1.0.0';
const TRANSCRIPT_ID = /^[A-Za-z0-9_-]{6,128}$/;
const DEFAULT_OUTPUT_SUBDIR = 'analysis-input';

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
    dataDir: undefined,
    outputSubdir: DEFAULT_OUTPUT_SUBDIR,
    maxExcerptChars: 4400,
    force: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      if (index + 1 >= argv.length) throw new Error(`${arg} requires a value.`);
      index += 1;
      return argv[index];
    };

    switch (arg) {
      case '--data-dir':
        options.dataDir = next();
        break;
      case '--output-subdir':
        options.outputSubdir = next();
        break;
      case '--max-excerpt-chars':
        options.maxExcerptChars = parseInteger(next(), '--max-excerpt-chars', { min: 1000, max: 20_000 });
        break;
      case '--force':
        options.force = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.help) {
    if (!options.dataDir) throw new Error('--data-dir is required.');
    if (!/^[A-Za-z0-9._/-]+$/.test(options.outputSubdir) || options.outputSubdir.includes('..')) {
      throw new Error('--output-subdir must be a relative path without parent traversal.');
    }
    options.dataDir = resolve(options.dataDir);
    options.outputDir = resolve(options.dataDir, options.outputSubdir);
    if (!options.outputDir.startsWith(`${options.dataDir}/`) && options.outputDir !== join(options.dataDir, options.outputSubdir)) {
      throw new Error('--output-subdir must remain inside --data-dir.');
    }
  }

  return options;
}

export function helpText() {
  return `CM Transcript Knowledge Analysis Packer v${TOOL_VERSION}\n\n` +
    'Usage:\n' +
    '  node prepare-knowledge-analysis.mjs --data-dir <CM-Ticket-Transcripts> [options]\n\n' +
    'Produces deterministic data-only analysis inputs from the already-extracted schema-v2 corpus.\n' +
    'It does not call Discord, Tickety, an LLM, the Internal Integrations API, or any database.\n\n' +
    'Options:\n' +
    `  --output-subdir <path>       Output folder inside the data repo (default: ${DEFAULT_OUTPUT_SUBDIR}).\n` +
    '  --max-excerpt-chars <n>      Approximate cap for each review record excerpt (default: 4400).\n' +
    '  --force                      Replace an existing generated analysis-input pack.\n';
}

async function atomicWrite(filePath, content) {
  await mkdir(dirname(filePath), { recursive: true });
  const temp = `${filePath}.${process.pid}.tmp`;
  await writeFile(temp, content);
  await rename(temp, filePath);
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function readIndex(indexPath) {
  const content = await readFile(indexPath, 'utf8');
  const records = [];
  let lineNumber = 0;
  for (const line of content.split(/\r?\n/)) {
    lineNumber += 1;
    if (!line.trim()) continue;
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      throw new Error(`Invalid JSON in index.jsonl at line ${lineNumber}.`);
    }
    if (record?.schemaVersion !== 2 || typeof record?.transcriptId !== 'string' || !TRANSCRIPT_ID.test(record.transcriptId)) {
      throw new Error(`Invalid schema-v2 index record at line ${lineNumber}.`);
    }
    records.push(record);
  }
  return records;
}

function normalizedId(value) {
  if (typeof value === 'string') return value;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value);
  return value == null ? undefined : String(value);
}

function normalizeMessage(message) {
  const author = message?.author && typeof message.author === 'object'
    ? {
        id: normalizedId(message.author.id),
        name: typeof message.author.name === 'string' ? message.author.name : undefined,
        username: typeof message.author.username === 'string' ? message.author.username : undefined,
        bot: Boolean(message.author.bot)
      }
    : undefined;

  return {
    id: normalizedId(message?.id),
    timestamp: message?.timestamp,
    userId: normalizedId(message?.userId),
    author,
    content: typeof message?.content === 'string' ? message.content : '',
    attachmentCount: Array.isArray(message?.attachments) ? message.attachments.length : 0,
    embedCount: Array.isArray(message?.embeds) ? message.embeds.length : 0,
    hasReply: Boolean(message?.messageReference)
  };
}

function humanMessages(messages) {
  return messages.filter((message) => message.author && !message.author.bot);
}

function nonEmptyContent(message) {
  return typeof message?.content === 'string' && message.content.trim().length > 0;
}

function clipMessage(message, remaining) {
  const content = message.content.trim();
  const clipped = content.length > remaining ? `${content.slice(0, Math.max(0, remaining - 1))}…` : content;
  return {
    timestamp: message.timestamp,
    author: message.author,
    content: clipped,
    attachmentCount: message.attachmentCount,
    embedCount: message.embedCount,
    hasReply: message.hasReply
  };
}

function excerptMessages(messages, maxItems, maxChars) {
  const output = [];
  let used = 0;
  for (const message of messages) {
    if (!nonEmptyContent(message) && message.attachmentCount === 0 && message.embedCount === 0) continue;
    if (output.length >= maxItems || used >= maxChars) break;
    const baseCost = 80;
    const remaining = Math.max(0, maxChars - used - baseCost);
    const clipped = clipMessage(message, remaining);
    output.push(clipped);
    used += baseCost + clipped.content.length;
  }
  return output;
}

function firstHumanAuthorId(messages) {
  return humanMessages(messages)[0]?.author?.id;
}

function buildReviewRecord(indexRecord, transcript, maxExcerptChars) {
  const normalizedMessages = transcript.transcript.messages.map(normalizeMessage);
  const humans = humanMessages(normalizedMessages);
  const customerId = firstHumanAuthorId(normalizedMessages);
  const customerMessages = humans.filter((message) => message.author?.id === customerId);
  const otherHumanMessages = humans.filter((message) => message.author?.id !== customerId);

  const openingBudget = Math.floor(maxExcerptChars * 0.3);
  const responseBudget = Math.floor(maxExcerptChars * 0.35);
  const closingBudget = maxExcerptChars - openingBudget - responseBudget;

  return {
    schemaVersion: 1,
    transcriptId: indexRecord.transcriptId,
    discordLogTimestamp: indexRecord.discordLogTimestamp,
    channelId: normalizedId(transcript.transcript.channelId),
    messageCount: transcript.transcript.messages.length,
    humanMessageCount: humans.length,
    inferredCustomer: customerId
      ? {
          id: customerId,
          name: humans[0]?.author?.name,
          username: humans[0]?.author?.username
        }
      : null,
    otherHumanParticipants: [...new Map(otherHumanMessages
      .filter((message) => message.author?.id)
      .map((message) => [message.author.id, message.author])).values()],
    openingCustomerMessages: excerptMessages(customerMessages, 6, openingBudget),
    earlyOtherHumanResponses: excerptMessages(otherHumanMessages, 8, responseBudget),
    closingHumanMessages: excerptMessages([...humans].reverse(), 10, closingBudget).reverse(),
    source: {
      normalized: indexRecord.files?.normalized,
      text: indexRecord.files?.text
    }
  };
}

function collectDomainCounts(text, counts) {
  const regex = /https?:\/\/([^/\s)\]}]+)/gi;
  for (const match of text.matchAll(regex)) {
    const domain = match[1].toLowerCase().replace(/^www\./, '');
    counts.set(domain, (counts.get(domain) ?? 0) + 1);
  }
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p));
  return sorted[index];
}

export async function prepareKnowledgeAnalysisPack(options) {
  const manifest = await readJson(join(options.dataDir, 'manifest.json'));
  if (manifest?.schemaVersion !== 2 || manifest?.structuredRecordCount !== manifest?.sourceTranscriptCount) {
    throw new Error('The data repository must contain a complete schema-v2 structured corpus before analysis packing.');
  }

  const indexRecords = await readIndex(join(options.dataDir, 'index.jsonl'));
  if (indexRecords.length !== manifest.structuredRecordCount) {
    throw new Error(`index.jsonl record count ${indexRecords.length} does not match manifest structuredRecordCount ${manifest.structuredRecordCount}.`);
  }

  try {
    const existing = await readFile(join(options.outputDir, 'manifest.json'), 'utf8');
    if (existing && !options.force) {
      throw new Error(`Analysis pack already exists at ${options.outputDir}. Use --force to replace it.`);
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }

  const corpusLines = [];
  const reviewLines = [];
  const messageCounts = [];
  const plainTextCharCounts = [];
  const domainCounts = new Map();
  const humanAuthorCounts = new Map();

  for (let index = 0; index < indexRecords.length; index += 1) {
    const indexRecord = indexRecords[index];
    const normalizedPath = join(options.dataDir, indexRecord.files.normalized);
    const textPath = join(options.dataDir, indexRecord.files.text);
    const normalizedRecord = await readJson(normalizedPath);

    if (normalizedRecord?.schemaVersion !== 2 || normalizedRecord?.transcriptId !== indexRecord.transcriptId) {
      throw new Error(`Normalized record mismatch for ${indexRecord.transcriptId}.`);
    }
    if (normalizedRecord?.acquisition?.method !== 'tickety-msgpack-api') {
      throw new Error(`Transcript ${indexRecord.transcriptId} is not a structured Tickety Msgpack API record.`);
    }
    if (!Array.isArray(normalizedRecord?.transcript?.messages)) {
      throw new Error(`Transcript ${indexRecord.transcriptId} is missing transcript.messages[].`);
    }

    const plainText = await readFile(textPath, 'utf8');
    const corpusRecord = {
      schemaVersion: 1,
      transcriptId: indexRecord.transcriptId,
      discordLogTimestamp: indexRecord.discordLogTimestamp,
      messageCount: normalizedRecord.transcript.messages.length,
      plainText
    };
    corpusLines.push(JSON.stringify(corpusRecord));

    const reviewRecord = buildReviewRecord(indexRecord, normalizedRecord, options.maxExcerptChars);
    reviewLines.push(JSON.stringify(reviewRecord));

    messageCounts.push(normalizedRecord.transcript.messages.length);
    plainTextCharCounts.push(plainText.length);
    collectDomainCounts(plainText, domainCounts);

    for (const message of normalizedRecord.transcript.messages.map(normalizeMessage)) {
      if (!message.author || message.author.bot || !message.author.id) continue;
      const key = `${message.author.id}\t${message.author.username ?? message.author.name ?? 'unknown'}`;
      humanAuthorCounts.set(key, (humanAuthorCounts.get(key) ?? 0) + 1);
    }
  }

  messageCounts.sort((a, b) => a - b);
  plainTextCharCounts.sort((a, b) => a - b);

  const stats = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    toolVersion: TOOL_VERSION,
    transcriptCount: indexRecords.length,
    messageCount: {
      total: messageCounts.reduce((sum, value) => sum + value, 0),
      min: messageCounts[0] ?? 0,
      p25: percentile(messageCounts, 0.25),
      median: percentile(messageCounts, 0.5),
      p75: percentile(messageCounts, 0.75),
      p95: percentile(messageCounts, 0.95),
      max: messageCounts.at(-1) ?? 0
    },
    plainTextChars: {
      total: plainTextCharCounts.reduce((sum, value) => sum + value, 0),
      min: plainTextCharCounts[0] ?? 0,
      p25: percentile(plainTextCharCounts, 0.25),
      median: percentile(plainTextCharCounts, 0.5),
      p75: percentile(plainTextCharCounts, 0.75),
      p95: percentile(plainTextCharCounts, 0.95),
      max: plainTextCharCounts.at(-1) ?? 0
    },
    topDomains: [...domainCounts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 50)
      .map(([domain, count]) => ({ domain, count })),
    topHumanAuthorsByMessageCount: [...humanAuthorCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 50)
      .map(([key, count]) => {
        const [id, username] = key.split('\t');
        return { id, username, count };
      })
  };

  const analysisManifest = {
    schemaVersion: 1,
    generatedAt: stats.generatedAt,
    toolVersion: TOOL_VERSION,
    sourceManifestUpdatedAt: manifest.updatedAt,
    sourceTranscriptCount: indexRecords.length,
    files: {
      corpus: `${options.outputSubdir}/corpus.ndjson`,
      review: `${options.outputSubdir}/review.ndjson`,
      stats: `${options.outputSubdir}/stats.json`
    },
    notes: [
      'corpus.ndjson preserves every plain-text transcript in one line-addressable file.',
      'review.ndjson contains deterministic excerpts only; it is not an LLM summary and should not be treated as authoritative without source drill-down.',
      'The final knowledge graph must exclude historical customer PII and must distinguish source evidence from inferred/canonical support policy.'
    ]
  };

  const readme = `# Transcript Analysis Input\n\n` +
    `Generated from the complete schema-v2 corpus (${indexRecords.length} transcripts).\n\n` +
    `This folder is data-only. It contains deterministic analysis inputs, not executable code.\n\n` +
    `- \`corpus.ndjson\` — one full plain-text ticket per line for exhaustive source review.\n` +
    `- \`review.ndjson\` — one deterministic excerpt record per ticket for first-pass taxonomy/pattern discovery.\n` +
    `- \`stats.json\` — corpus sizing, common domains and high-volume human participants.\n` +
    `- \`manifest.json\` — provenance and generation metadata.\n\n` +
    `The review excerpts infer the first human participant as the likely customer only to help triage the corpus. That inference is not a final support-policy fact. Drill into \`corpus.ndjson\` or the original \`transcripts/\` record before promoting a rule into the final knowledge graph.\n`;

  await atomicWrite(join(options.outputDir, 'corpus.ndjson'), `${corpusLines.join('\n')}\n`);
  await atomicWrite(join(options.outputDir, 'review.ndjson'), `${reviewLines.join('\n')}\n`);
  await atomicWrite(join(options.outputDir, 'stats.json'), `${JSON.stringify(stats, null, 2)}\n`);
  await atomicWrite(join(options.outputDir, 'manifest.json'), `${JSON.stringify(analysisManifest, null, 2)}\n`);
  await atomicWrite(join(options.outputDir, 'README.md'), readme);

  return {
    transcriptCount: indexRecords.length,
    outputDir: options.outputDir,
    totalMessages: stats.messageCount.total,
    totalPlainTextChars: stats.plainTextChars.total
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(helpText());
    return;
  }

  const result = await prepareKnowledgeAnalysisPack(options);
  console.log(`[transcripts] analysis input ready: transcripts=${result.transcriptCount} messages=${result.totalMessages} chars=${result.totalPlainTextChars}`);
  console.log(`[transcripts] wrote data-only analysis pack to ${result.outputDir}`);
}

const entryUrl = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined;
if (entryUrl === import.meta.url) {
  main().catch((error) => {
    console.error(`[transcripts] analysis pack failed: ${String(error?.message ?? error).slice(0, 2000)}`);
    process.exitCode = 1;
  });
}

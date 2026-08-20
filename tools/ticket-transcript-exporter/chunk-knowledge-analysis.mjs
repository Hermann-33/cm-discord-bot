#!/usr/bin/env node

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const TOOL_VERSION = '1.0.0';
const DEFAULT_CHUNK_SIZE = 50;
const ANALYSIS_SUBDIR = 'analysis-input';
const CHUNKS_SUBDIR = 'chunks';

function parseInteger(value, label, { min, max }) {
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
    chunkSize: DEFAULT_CHUNK_SIZE,
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
      case '--chunk-size':
        options.chunkSize = parseInteger(next(), '--chunk-size', { min: 10, max: 100 });
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
    options.dataDir = resolve(options.dataDir);
    options.analysisDir = join(options.dataDir, ANALYSIS_SUBDIR);
    options.outputDir = join(options.analysisDir, CHUNKS_SUBDIR);
  }

  return options;
}

export function helpText() {
  return `CM Transcript Analysis Chunker v${TOOL_VERSION}\n\n` +
    'Usage:\n' +
    '  node chunk-knowledge-analysis.mjs --data-dir <CM-Ticket-Transcripts> [options]\n\n' +
    'Splits the generated analysis-input corpus/review NDJSON into deterministic, line-addressable chunks.\n' +
    'It performs no network calls and does not change the source transcript corpus.\n\n' +
    'Options:\n' +
    `  --chunk-size <n>   Records per chunk, 10-100 (default: ${DEFAULT_CHUNK_SIZE}).\n` +
    '  --force            Replace an existing analysis-input/chunks directory.\n';
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function readNdjson(path, label) {
  const content = await readFile(path, 'utf8');
  const records = [];
  let lineNumber = 0;
  for (const line of content.split(/\r?\n/)) {
    lineNumber += 1;
    if (!line.trim()) continue;
    try {
      records.push({ raw: line, value: JSON.parse(line) });
    } catch {
      throw new Error(`Invalid JSON in ${label} at line ${lineNumber}.`);
    }
  }
  return records;
}

function padRecord(value) {
  return String(value).padStart(4, '0');
}

function chunkFileName(kind, startRecord, endRecord) {
  return `${kind}-${padRecord(startRecord)}-${padRecord(endRecord)}.ndjson`;
}

function validateAlignedCorpus(corpus, review, expectedCount) {
  if (corpus.length !== expectedCount) {
    throw new Error(`corpus.ndjson record count ${corpus.length} does not match manifest sourceTranscriptCount ${expectedCount}.`);
  }
  if (review.length !== expectedCount) {
    throw new Error(`review.ndjson record count ${review.length} does not match manifest sourceTranscriptCount ${expectedCount}.`);
  }

  const seen = new Set();
  for (let index = 0; index < expectedCount; index += 1) {
    const corpusId = corpus[index]?.value?.transcriptId;
    const reviewId = review[index]?.value?.transcriptId;
    if (typeof corpusId !== 'string' || typeof reviewId !== 'string' || corpusId !== reviewId) {
      throw new Error(`Analysis input alignment mismatch at record ${index + 1}.`);
    }
    if (seen.has(corpusId)) {
      throw new Error(`Duplicate transcriptId in analysis input: ${corpusId}.`);
    }
    seen.add(corpusId);
  }
}

export async function chunkKnowledgeAnalysis(options) {
  const analysisManifest = await readJson(join(options.analysisDir, 'manifest.json'));
  const expectedCount = analysisManifest?.sourceTranscriptCount;
  if (!Number.isSafeInteger(expectedCount) || expectedCount <= 0) {
    throw new Error('analysis-input/manifest.json is missing a valid sourceTranscriptCount.');
  }

  const corpus = await readNdjson(join(options.analysisDir, 'corpus.ndjson'), 'corpus.ndjson');
  const review = await readNdjson(join(options.analysisDir, 'review.ndjson'), 'review.ndjson');
  validateAlignedCorpus(corpus, review, expectedCount);

  try {
    await readFile(join(options.outputDir, 'manifest.json'), 'utf8');
    if (!options.force) {
      throw new Error(`Analysis chunks already exist at ${options.outputDir}. Use --force to replace them.`);
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }

  if (options.force) await rm(options.outputDir, { recursive: true, force: true });
  await mkdir(join(options.outputDir, 'review'), { recursive: true });
  await mkdir(join(options.outputDir, 'corpus'), { recursive: true });

  const chunks = [];
  for (let offset = 0; offset < expectedCount; offset += options.chunkSize) {
    const endOffset = Math.min(expectedCount, offset + options.chunkSize);
    const startRecord = offset + 1;
    const endRecord = endOffset;
    const reviewName = chunkFileName('review', startRecord, endRecord);
    const corpusName = chunkFileName('corpus', startRecord, endRecord);
    const reviewPath = join(options.outputDir, 'review', reviewName);
    const corpusPath = join(options.outputDir, 'corpus', corpusName);

    await writeFile(reviewPath, `${review.slice(offset, endOffset).map((record) => record.raw).join('\n')}\n`);
    await writeFile(corpusPath, `${corpus.slice(offset, endOffset).map((record) => record.raw).join('\n')}\n`);

    chunks.push({
      index: chunks.length + 1,
      startRecord,
      endRecord,
      count: endRecord - startRecord + 1,
      firstTranscriptId: review[offset].value.transcriptId,
      lastTranscriptId: review[endOffset - 1].value.transcriptId,
      review: `${ANALYSIS_SUBDIR}/${CHUNKS_SUBDIR}/review/${reviewName}`,
      corpus: `${ANALYSIS_SUBDIR}/${CHUNKS_SUBDIR}/corpus/${corpusName}`
    });
  }

  const generatedAt = new Date().toISOString();
  const manifest = {
    schemaVersion: 1,
    generatedAt,
    toolVersion: TOOL_VERSION,
    sourceAnalysisToolVersion: analysisManifest.toolVersion,
    sourceTranscriptCount: expectedCount,
    chunkSize: options.chunkSize,
    chunkCount: chunks.length,
    chunks
  };

  const readme = `# Transcript Analysis Chunks\n\n` +
    `Deterministic chunks of the complete ${expectedCount}-ticket analysis pack.\n\n` +
    `Each chunk preserves the original NDJSON record order and transcript IDs. ` +
    `The \`review/\` files are for first-pass taxonomy discovery; the matching \`corpus/\` files contain full plain-text tickets for source verification.\n\n` +
    `Chunk size: ${options.chunkSize} records. Chunk count: ${chunks.length}.\n`;

  await writeFile(join(options.outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(join(options.outputDir, 'README.md'), readme);

  return {
    transcriptCount: expectedCount,
    chunkCount: chunks.length,
    chunkSize: options.chunkSize,
    outputDir: options.outputDir
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(helpText());
    return;
  }

  const result = await chunkKnowledgeAnalysis(options);
  console.log(`[transcripts] analysis chunks ready: transcripts=${result.transcriptCount} chunks=${result.chunkCount} chunkSize=${result.chunkSize}`);
  console.log(`[transcripts] wrote data-only chunks to ${result.outputDir}`);
}

const entryUrl = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined;
if (entryUrl === import.meta.url) {
  main().catch((error) => {
    console.error(`[transcripts] analysis chunking failed: ${String(error?.message ?? error).slice(0, 2000)}`);
    process.exitCode = 1;
  });
}

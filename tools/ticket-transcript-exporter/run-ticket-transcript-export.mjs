#!/usr/bin/env node

import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CORE_EXPORTER = resolve(HERE, 'export-ticket-transcripts.mjs');
const TICKETY_TRANSCRIPT_URL = /^https:\/\/(?:www\.)?tickety\.top\/transcripts\/[A-Za-z0-9_-]{6,128}\/?(?:[?#].*)?$/i;
const DISCORD_MESSAGE_HISTORY_PATH = /^\/api\/v10\/channels\/\d{5,32}\/messages$/;

function normalizedLabel(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').toLowerCase() : '';
}

export function isViewTranscriptButton(component) {
  return Boolean(
    component &&
    typeof component === 'object' &&
    component.type === 2 &&
    component.style === 5 &&
    normalizedLabel(component.label) === 'view transcript' &&
    typeof component.url === 'string' &&
    TICKETY_TRANSCRIPT_URL.test(component.url)
  );
}

export function collectViewTranscriptButtons(value, output = [], depth = 0) {
  if (value == null || depth > 8) return output;
  if (Array.isArray(value)) {
    for (const item of value) collectViewTranscriptButtons(item, output, depth + 1);
    return output;
  }
  if (typeof value !== 'object') return output;

  if (isViewTranscriptButton(value)) output.push(value);
  if (Array.isArray(value.components)) {
    for (const child of value.components) collectViewTranscriptButtons(child, output, depth + 1);
  }
  return output;
}

export function sanitizeDiscordMessageForTranscriptTarget(message) {
  if (!message || typeof message !== 'object') return message;

  const buttons = collectViewTranscriptButtons(message.components);
  if (buttons.length === 0) {
    return {
      id: message.id,
      timestamp: message.timestamp,
      author: message.author,
      content: '',
      embeds: [],
      components: []
    };
  }

  return {
    ...message,
    content: '',
    components: [{ type: 1, components: buttons }]
  };
}

function requestUrl(input) {
  if (typeof input === 'string' || input instanceof URL) return String(input);
  if (input && typeof input === 'object' && typeof input.url === 'string') return input.url;
  return '';
}

export function isDiscordMessageHistoryRequest(input) {
  try {
    const url = new URL(requestUrl(input));
    return url.protocol === 'https:' &&
      url.hostname.toLowerCase() === 'discord.com' &&
      DISCORD_MESSAGE_HISTORY_PATH.test(url.pathname);
  } catch {
    return false;
  }
}

export function installStrictViewTranscriptFilter(fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== 'function') throw new Error('Global fetch is unavailable. Node.js 22+ is required.');

  globalThis.fetch = async (input, init) => {
    const response = await fetchImpl(input, init);
    if (!response.ok || !isDiscordMessageHistoryRequest(input)) return response;

    let body;
    try {
      body = await response.clone().json();
    } catch {
      return response;
    }
    if (!Array.isArray(body)) return response;

    const sanitized = body.map(sanitizeDiscordMessageForTranscriptTarget);
    const headers = new Headers(response.headers);
    headers.delete('content-length');
    headers.delete('content-encoding');

    return new Response(JSON.stringify(sanitized), {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  };
}

async function run() {
  installStrictViewTranscriptFilter();

  const originalArgv1 = process.argv[1];
  process.argv[1] = CORE_EXPORTER;
  try {
    await import(pathToFileURL(CORE_EXPORTER).href);
  } finally {
    process.argv[1] = originalArgv1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

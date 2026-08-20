#!/usr/bin/env node

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const TOOL_VERSION = '1.0.0';
const ANALYSIS_SUBDIR = 'analysis-input';
const MINING_SUBDIR = 'mining';
const KNOWLEDGE_SUBDIR = 'knowledge';

const FIXED_PRODUCT_LINKS = {
  'NFA Accounts': new Set([
    'account_purchase_request','bulk_account_purchase','order_not_received','manual_license_delivery','order_manual_review_or_processing',
    'restock_availability','account_credentials','nfa_account_invalid_or_lost','account_banned_locked_or_wrong_spec',
    'account_owner_active_or_session_conflict','replacement_request','credential_change_or_recovery','nfa_key_redemption_or_activation',
    'download_or_documentation','subscription_duration'
  ]),
  'Web Store': new Set([
    'website_or_checkout_problem','payment_issue','payment_method_or_manual_checkout','crypto_payment_pending','wallet_topup_or_store_balance',
    'refund_request','order_not_received','order_manual_review_or_processing','dashboard_access_or_verification','discount_or_coupon'
  ]),
  'Software Products': new Set([
    'license_invalid_or_expired','subscription_duration','download_or_documentation','launch_or_loader_error','product_status_question',
    'injection_driver_or_kernel','performance_or_game_crash','update_or_service_outage','product_configuration','hardware_reset','anti_cheat_or_ban'
  ]),
  'Spoofers': new Set(['hardware_reset','anti_cheat_or_ban','product_status_question','product_configuration'])
};

function parseArgs(argv) {
  const options = { dataDir: undefined, force: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      if (index + 1 >= argv.length) throw new Error(`${arg} requires a value.`);
      index += 1;
      return argv[index];
    };
    switch (arg) {
      case '--data-dir': options.dataDir = next(); break;
      case '--force': options.force = true; break;
      case '--help':
      case '-h': options.help = true; break;
      default: throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!options.help) {
    if (!options.dataDir) throw new Error('--data-dir is required.');
    options.dataDir = resolve(options.dataDir);
    options.miningDir = join(options.dataDir, ANALYSIS_SUBDIR, MINING_SUBDIR);
    options.outputDir = join(options.dataDir, KNOWLEDGE_SUBDIR);
  }
  return options;
}

export { parseArgs };

export function helpText() {
  return `CM Obsidian Support Knowledge Graph Builder v${TOOL_VERSION}\n\n` +
    'Usage:\n' +
    '  node build-obsidian-knowledge-graph.mjs --data-dir <CM-Ticket-Transcripts> [--force]\n\n' +
    'Builds a data-only Obsidian candidate graph from the deterministic full-corpus mining output.\n' +
    'The graph is not canonical chatbot policy until evidence review promotes nodes from candidate status.\n';
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

function safeFileName(input) {
  return String(input)
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/[. ]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim() || 'Untitled';
}

function yamlString(value) {
  return JSON.stringify(String(value));
}

function markdownText(value) {
  return String(value ?? '')
    .replace(/\[\[/g, '[ [')
    .replace(/\]\]/g, '] ]')
    .replace(/`/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function evidenceStrength(count) {
  if (count >= 30) return 'high';
  if (count >= 10) return 'medium';
  return 'low';
}

function productLinksForIntent(intentId) {
  return Object.entries(FIXED_PRODUCT_LINKS)
    .filter(([, ids]) => ids.has(intentId))
    .map(([name]) => name);
}

function wikilink(path, label) {
  return `[[${path}|${label}]]`;
}

async function writeText(path, content) {
  await writeFile(path, content.endsWith('\n') ? content : `${content}\n`, 'utf8');
}

export async function buildObsidianKnowledgeGraph(options) {
  const manifest = await readJson(join(options.miningDir, 'manifest.json'));
  const candidateFile = await readJson(join(options.miningDir, 'intent-candidates.json'));
  const intents = Array.isArray(candidateFile?.intents) ? candidateFile.intents : null;
  if (!Number.isSafeInteger(manifest?.sourceTranscriptCount) || !intents) {
    throw new Error('analysis-input/mining is missing a valid manifest or intent-candidates.json.');
  }

  try {
    await readFile(join(options.outputDir, '00 - Support Knowledge Graph.md'), 'utf8');
    if (!options.force) throw new Error(`Knowledge graph already exists at ${options.outputDir}. Use --force to replace it.`);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  if (options.force) await rm(options.outputDir, { recursive: true, force: true });

  const dirs = ['Categories','Intents','Products','Policies','Escalations','Evidence'];
  await mkdir(options.outputDir, { recursive: true });
  for (const dir of dirs) await mkdir(join(options.outputDir, dir), { recursive: true });

  const activeIntents = intents.filter((intent) => Number(intent.ticketCount) > 0);
  const categories = new Map();
  for (const intent of activeIntents) {
    if (!categories.has(intent.category)) categories.set(intent.category, []);
    categories.get(intent.category).push(intent);
  }
  for (const bucket of categories.values()) bucket.sort((a, b) => b.ticketCount - a.ticketCount || a.label.localeCompare(b.label));

  const graphNodes = [];
  const graphEdges = [];
  const addNode = (id, type, label, extra = {}) => graphNodes.push({ id, type, label, ...extra });
  const addEdge = (from, to, relation) => graphEdges.push({ from, to, relation });

  addNode('root', 'root', 'Support Knowledge Graph', { status: 'candidate' });

  const rootCategoryLinks = [];
  for (const category of [...categories.keys()].sort()) {
    const fileName = safeFileName(category);
    const categoryId = `category:${category}`;
    addNode(categoryId, 'category', category, { intentCount: categories.get(category).length });
    addEdge('root', categoryId, 'contains');
    rootCategoryLinks.push(`- ${wikilink(`Categories/${fileName}`, category)}`);

    const intentLinks = categories.get(category).map((intent) => {
      const intentFile = safeFileName(intent.label);
      addEdge(categoryId, `intent:${intent.id}`, 'contains');
      return `- ${wikilink(`Intents/${intentFile}`, intent.label)} — ${intent.ticketCount} matching tickets`;
    }).join('\n');

    await writeText(join(options.outputDir, 'Categories', `${fileName}.md`), `---\ntype: category\nstatus: candidate\nlabel: ${yamlString(category)}\n---\n\n# ${category}\n\nParent: [[00 - Support Knowledge Graph]]\n\n## Candidate intents\n\n${intentLinks || '- None'}\n\n## Status\n\nThis category is generated from deterministic corpus mining. Its links are navigation and evidence structure, not final chatbot policy.\n`);
  }

  const productIntentLinks = new Map();
  for (const product of Object.keys(FIXED_PRODUCT_LINKS)) productIntentLinks.set(product, []);

  for (const intent of activeIntents) {
    const intentId = `intent:${intent.id}`;
    const intentFile = safeFileName(intent.label);
    const categoryFile = safeFileName(intent.category);
    const restricted = intent.restrictedTechnical === true;
    const strength = evidenceStrength(intent.ticketCount);
    const productLinks = productLinksForIntent(intent.id);
    const phraseSource = Array.isArray(intent.topTopicPhrases) && intent.topTopicPhrases.length > 0 ? intent.topTopicPhrases : (intent.topCustomerPhrases ?? []);
    const recognition = phraseSource.slice(0, 12).map((entry) => `- ${markdownText(entry.value)} — observed in ${entry.count} matching tickets`).join('\n');
    const sampleIds = (intent.samples ?? []).slice(0, 12).map((sample) => `- \`${sample.transcriptId}\``).join('\n');

    addNode(intentId, 'intent', intent.label, {
      status: 'candidate',
      category: intent.category,
      evidenceCount: intent.ticketCount,
      evidenceStrength: strength,
      restrictedTechnical: restricted
    });

    const productSection = productLinks.length
      ? productLinks.map((product) => `- ${wikilink(`Products/${safeFileName(product)}`, product)}`).join('\n')
      : '- No product/entity link assigned yet.';

    for (const product of productLinks) {
      productIntentLinks.get(product).push(intent);
      addEdge(intentId, `product:${product}`, 'relates_to');
    }
    if (restricted) addEdge(intentId, 'escalation:human-review', 'must_escalate');
    addEdge(intentId, 'policy:evidence-not-policy', 'governed_by');
    addEdge(intentId, 'policy:do-not-guess', 'governed_by');

    const automation = restricted ? 'human-only' : 'review-required';
    const restrictedSection = restricted
      ? `## Escalation\n\n${wikilink('Escalations/Human Review Required', 'Human Review Required')}\n\nThis topic is intentionally excluded from autonomous technical instructions. The chatbot may identify the topic, collect ordinary support context, and route it to a human.\n\n`
      : '';

    await writeText(join(options.outputDir, 'Intents', `${intentFile}.md`), `---\ntype: intent\nid: ${yamlString(intent.id)}\nstatus: candidate\nautomation: ${automation}\ncategory: ${yamlString(intent.category)}\nrestricted_technical: ${restricted}\nevidence_count: ${intent.ticketCount}\nevidence_strength: ${strength}\nsource_transcripts: ${manifest.sourceTranscriptCount}\n---\n\n# ${intent.label}\n\nCategory: ${wikilink(`Categories/${categoryFile}`, intent.category)}\n\nPolicies:\n- ${wikilink('Policies/Historical Evidence Is Not Policy', 'Historical Evidence Is Not Policy')}\n- ${wikilink('Policies/Do Not Guess', 'Do Not Guess')}\n\n## Related products / entities\n\n${productSection}\n\n## Recognition signals\n\n${recognition || '- No repeated phrase signal met the mining threshold.'}\n\n## Evidence strength\n\n${intent.ticketCount} historical tickets matched this candidate intent. Frequency supports topic existence; it does **not** prove that any historical resolution is correct or current.\n\n${restrictedSection}## Evidence sample IDs\n\n${sampleIds || '- None'}\n\nSee ${wikilink(`Evidence/${intentFile} - Evidence`, `${intent.label} - Evidence`)}.\n`);

    const sampleDetails = (intent.samples ?? []).slice(0, 12).map((sample) => {
      const topic = markdownText(sample.topic || sample.customer || '');
      return `### ${sample.transcriptId}\n\n- Match score: ${sample.score}\n- Sanitized topic excerpt: ${topic || '(empty)'}\n`;
    }).join('\n');
    await writeText(join(options.outputDir, 'Evidence', `${intentFile} - Evidence.md`), `---\ntype: evidence\nstatus: historical\nintent_id: ${yamlString(intent.id)}\nevidence_count: ${intent.ticketCount}\n---\n\n# ${intent.label} - Evidence\n\nIntent: ${wikilink(`Intents/${intentFile}`, intent.label)}\n\nThese are sanitized representative excerpts selected deterministically from the historical corpus. They are evidence for taxonomy, not policy or approved response text.\n\n${sampleDetails || 'No representative sample was available.'}\n`);
  }

  for (const [product, linkedIntents] of productIntentLinks.entries()) {
    const productId = `product:${product}`;
    addNode(productId, 'product', product, { status: 'candidate', intentCount: linkedIntents.length });
    addEdge('root', productId, 'contains');
    const links = linkedIntents
      .sort((a, b) => b.ticketCount - a.ticketCount || a.label.localeCompare(b.label))
      .map((intent) => `- ${wikilink(`Intents/${safeFileName(intent.label)}`, intent.label)} — ${intent.ticketCount} matching tickets`)
      .join('\n');
    const restriction = product === 'Software Products' || product === 'Spoofers'
      ? `\n## Safety boundary\n\nTechnical evasion, injection, anti-cheat, spoofing, or configuration guidance is routed through ${wikilink('Escalations/Human Review Required', 'Human Review Required')}.\n`
      : '';
    await writeText(join(options.outputDir, 'Products', `${safeFileName(product)}.md`), `---\ntype: product_or_entity\nstatus: candidate\nlabel: ${yamlString(product)}\n---\n\n# ${product}\n\nParent: [[00 - Support Knowledge Graph]]\n\n## Related intents\n\n${links || '- None'}\n${restriction}`);
  }

  addNode('policy:evidence-not-policy', 'policy', 'Historical Evidence Is Not Policy', { status: 'canonical-guardrail' });
  addNode('policy:do-not-guess', 'policy', 'Do Not Guess', { status: 'canonical-guardrail' });
  addNode('escalation:human-review', 'escalation', 'Human Review Required', { status: 'canonical-guardrail' });
  addNode('evidence:coverage', 'evidence_summary', 'Corpus Coverage', { sourceTranscriptCount: manifest.sourceTranscriptCount });
  addEdge('root', 'policy:evidence-not-policy', 'governed_by');
  addEdge('root', 'policy:do-not-guess', 'governed_by');
  addEdge('root', 'escalation:human-review', 'escalates_to');
  addEdge('root', 'evidence:coverage', 'supported_by');

  await writeText(join(options.outputDir, 'Policies', 'Historical Evidence Is Not Policy.md'), `---\ntype: policy\nstatus: canonical-guardrail\n---\n\n# Historical Evidence Is Not Policy\n\nHistorical ticket messages are evidence of past support behavior. They must not be treated as current policy merely because a staff member said something once or because a phrase was repeated.\n\nA response becomes chatbot policy only after explicit review against current business rules, system capabilities, product state, and contradictions in the corpus.\n\nRelated: [[00 - Support Knowledge Graph]] · ${wikilink('Policies/Do Not Guess', 'Do Not Guess')}\n`);

  await writeText(join(options.outputDir, 'Policies', 'Do Not Guess.md'), `---\ntype: policy\nstatus: canonical-guardrail\n---\n\n# Do Not Guess\n\nIf the required order, account, payment, product-status, entitlement, or policy information is unavailable, the chatbot must ask for the missing information or escalate. It must not invent order state, eligibility, availability, delivery details, timelines, refunds, replacements, or technical facts.\n\nRelated: [[00 - Support Knowledge Graph]] · ${wikilink('Escalations/Human Review Required', 'Human Review Required')}\n`);

  await writeText(join(options.outputDir, 'Escalations', 'Human Review Required.md'), `---\ntype: escalation\nstatus: canonical-guardrail\n---\n\n# Human Review Required\n\nRoute here when a candidate intent is marked \`restricted_technical: true\`, when policy or entitlement is uncertain, when the customer asks for an action the chatbot cannot verify or execute, or when the available context is contradictory.\n\nFor restricted technical topics, the chatbot may identify the issue and collect ordinary support context, but the graph intentionally does not provide autonomous anti-cheat evasion, spoofing, injection, driver/kernel, or cheat-configuration instructions.\n\nRelated: [[00 - Support Knowledge Graph]] · ${wikilink('Policies/Do Not Guess', 'Do Not Guess')}\n`);

  await writeText(join(options.outputDir, 'Evidence', 'Corpus Coverage.md'), `---\ntype: evidence_summary\nstatus: generated\nsource_transcripts: ${manifest.sourceTranscriptCount}\nclassified_tickets: ${manifest.classifiedTicketCount ?? 0}\nunclassified_tickets: ${manifest.unclassifiedTicketCount ?? 0}\nreviewable_unclassified_tickets: ${manifest.reviewableUnclassifiedCount ?? manifest.unclassifiedTicketCount ?? 0}\ncoverage_percent: ${manifest.coveragePercent ?? 0}\n---\n\n# Corpus Coverage\n\n- Source transcripts: **${manifest.sourceTranscriptCount}**\n- Tickets matching at least one candidate intent: **${manifest.classifiedTicketCount ?? 0}**\n- Unmatched tickets: **${manifest.unclassifiedTicketCount ?? 0}**\n- Reviewable unmatched tickets: **${manifest.reviewableUnclassifiedCount ?? manifest.unclassifiedTicketCount ?? 0}**\n- Candidate-intent coverage: **${manifest.coveragePercent ?? 0}%**\n\nThe graph accounts for the full source corpus through this mining manifest, but unmatched reviewable tickets remain an explicit knowledge gap until classified or deliberately marked non-support/noise.\n\nRelated: [[00 - Support Knowledge Graph]]\n`);

  const restrictedLinks = activeIntents.filter((intent) => intent.restrictedTechnical).map((intent) => `- ${wikilink(`Intents/${safeFileName(intent.label)}`, intent.label)}`).join('\n');
  const root = `---\ntype: root\nstatus: candidate\nsource_transcripts: ${manifest.sourceTranscriptCount}\nclassified_tickets: ${manifest.classifiedTicketCount ?? 0}\ncoverage_percent: ${manifest.coveragePercent ?? 0}\n---\n\n# Support Knowledge Graph\n\nThis vault is a source-grounded **candidate** support graph derived from the complete historical transcript mining layer. Open this folder as an Obsidian vault and use Graph View to inspect the relationships.\n\n## Categories\n\n${rootCategoryLinks.join('\n')}\n\n## Products / entities\n\n${Object.keys(FIXED_PRODUCT_LINKS).map((product) => `- ${wikilink(`Products/${safeFileName(product)}`, product)}`).join('\n')}\n\n## Guardrails\n\n- ${wikilink('Policies/Historical Evidence Is Not Policy', 'Historical Evidence Is Not Policy')}\n- ${wikilink('Policies/Do Not Guess', 'Do Not Guess')}\n- ${wikilink('Escalations/Human Review Required', 'Human Review Required')}\n- ${wikilink('Evidence/Corpus Coverage', 'Corpus Coverage')}\n\n## Restricted technical intents\n\n${restrictedLinks || '- None'}\n\n## Promotion rule\n\nIntent nodes begin as \`candidate\`. A future canonicalization pass must verify procedures, policies, decision branches, current backend capabilities, contradictions, and escalation criteria before a free chatbot API may treat them as executable support knowledge.\n`;
  await writeText(join(options.outputDir, '00 - Support Knowledge Graph.md'), root);

  const graph = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    toolVersion: TOOL_VERSION,
    sourceMiningToolVersion: manifest.toolVersion,
    sourceTranscriptCount: manifest.sourceTranscriptCount,
    coverage: {
      classifiedTicketCount: manifest.classifiedTicketCount ?? 0,
      unclassifiedTicketCount: manifest.unclassifiedTicketCount ?? 0,
      reviewableUnclassifiedCount: manifest.reviewableUnclassifiedCount ?? manifest.unclassifiedTicketCount ?? 0,
      coveragePercent: manifest.coveragePercent ?? 0
    },
    nodes: graphNodes,
    edges: graphEdges
  };
  await writeText(join(options.outputDir, 'graph.json'), JSON.stringify(graph, null, 2));
  await writeText(join(options.outputDir, 'README.md'), `# Obsidian Support Knowledge Graph\n\nOpen this \`knowledge/\` directory as an Obsidian vault. The Markdown notes use native \`[[wikilinks]]\`, so Graph View works without a plugin.\n\n\`graph.json\` is a machine-readable projection intended for later chatbot-context compilation.\n\nAll mined intent nodes are candidates until explicitly reviewed and promoted.\n`);

  return {
    transcriptCount: manifest.sourceTranscriptCount,
    intentCount: activeIntents.length,
    categoryCount: categories.size,
    outputDir: options.outputDir
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(helpText());
    return;
  }
  const result = await buildObsidianKnowledgeGraph(options);
  console.log(`[transcripts] Obsidian graph ready: transcripts=${result.transcriptCount} intents=${result.intentCount} categories=${result.categoryCount}`);
  console.log(`[transcripts] wrote data-only knowledge graph to ${result.outputDir}`);
}

const entryUrl = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined;
if (entryUrl === import.meta.url) {
  main().catch((error) => {
    console.error(`[transcripts] knowledge graph build failed: ${String(error?.message ?? error).slice(0, 2000)}`);
    process.exitCode = 1;
  });
}

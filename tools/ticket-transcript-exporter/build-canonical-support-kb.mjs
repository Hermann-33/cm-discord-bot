#!/usr/bin/env node

import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { basename, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { synthesizeSupportCoverage } from './synthesize-support-cases.mjs';

const EXPECTED_FACTS = 3949;
const VERSION = '1.0.0';

export function parseArgs(argv) {
  const options = { dataDir: undefined };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--data-dir') {
      if (index + 1 >= argv.length) throw new Error('--data-dir requires a value.');
      options.dataDir = resolve(argv[++index]);
    } else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.help && !options.dataDir) throw new Error('--data-dir is required.');
  return options;
}

function normalize(value) {
  return String(value ?? '').normalize('NFKD').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function slug(value) {
  return normalize(value).replace(/\s+/g, '_').replace(/^_+|_+$/g, '') || 'unknown';
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function sanitizeHistoricalClaim(value) {
  return String(value ?? '')
    .replace(/\b\d{17,20}\b/g, '[identifier redacted]')
    .replace(/\b(?:bc1|[13])[a-zA-HJ-NP-Z0-9]{25,62}\b/g, '[wallet redacted]')
    .replace(/\beyJ[A-Za-z0-9_-]{24,}(?:\.[A-Za-z0-9_-]+){0,2}\b/g, '[token redacted]')
    .replace(/\b[A-Za-z0-9_-]{48,}\b/g, '[secret redacted]');
}

function emptyScope() {
  return { global: false, categories: [], games: [], vendors: [], products: [], variants: [], accountModels: [], accountListings: [] };
}

function historicalProvenance(fact) {
  const sources = Array.isArray(fact.sources) ? fact.sources : [];
  return {
    sourceClass: 'historical_evidence',
    sourceCount: sources.length || Number(fact.supportCount ?? 0),
    transcriptIds: unique(sources.map((source) => source.transcriptId)),
    historicalFactIds: [fact.id],
    currentSourceRefs: [],
    contradictionIds: unique(fact.contradictions ?? [])
  };
}

async function exists(path) {
  try { await stat(path); return true; } catch (error) { if (error?.code === 'ENOENT') return false; throw error; }
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function writeJson(path, value) {
  await mkdir(resolve(path, '..'), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeJsonl(path, records) {
  await mkdir(resolve(path, '..'), { recursive: true });
  await writeFile(path, `${records.map((record) => JSON.stringify(record)).join('\n')}\n`);
}

async function loadHistoricalFacts(dataDir) {
  const deepReview = join(dataDir, 'deep-review');
  const dirs = (await readdir(deepReview, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && /^batch-\d{4}-\d{4}$/.test(entry.name))
    .map((entry) => entry.name).sort();
  const byId = new Map();
  for (const dir of dirs) {
    for (const fact of await readJson(join(deepReview, dir, 'facts.json'))) {
      const existing = byId.get(fact.id);
      if (!existing || (fact.sources?.length ?? 0) > (existing.sources?.length ?? 0)) byId.set(fact.id, fact);
    }
  }
  const facts = [...byId.values()].sort((a, b) => Number(a.id.split('.')[1]) - Number(b.id.split('.')[1]));
  if (facts.length !== EXPECTED_FACTS) throw new Error(`Historical fact count ${facts.length} does not equal ${EXPECTED_FACTS}.`);
  return facts;
}

async function loadHistoricalContradictions(dataDir) {
  const deepReview = join(dataDir, 'deep-review');
  const dirs = (await readdir(deepReview, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && /^batch-\d{4}-\d{4}$/.test(entry.name))
    .map((entry) => entry.name).sort();
  const output = [];
  for (const dir of dirs) {
    const path = join(deepReview, dir, 'contradictions.json');
    if (await exists(path)) output.push(...await readJson(path));
  }
  return output;
}

function currentEntities(snapshot) {
  const validity = { state: 'current', validFrom: null, validUntil: null, lastObservedAt: snapshot.capturedAt };
  const provenance = (refs) => ({ currentSources: refs, operatorSources: [], transcriptEvidenceCount: 0, transcriptEvidenceIds: [], contradictionIds: [] });
  const entities = [];
  entities.push({ id: 'store.cm', type: 'store_area', displayName: 'Cheater\'s Market storefront', aliases: ['CM', 'store'], historicalAliases: [], status: 'current', scope: { ...emptyScope(), global: true }, validity, relationships: [], provenance: provenance(['cm.public.storefront']) });
  for (const game of snapshot.games) entities.push({ ...game, type: 'game', aliases: game.aliases ?? [], historicalAliases: [], status: 'current', scope: emptyScope(), validity, relationships: [], provenance: provenance(['cm.public.games']) });
  for (const vendor of snapshot.vendors) entities.push({ ...vendor, type: 'vendor', aliases: vendor.aliases ?? [], historicalAliases: [], status: 'current', scope: emptyScope(), validity, relationships: [], provenance: provenance(['cm.public.brands']) });
  for (const category of snapshot.categories) entities.push({ ...category, type: 'category', aliases: [], historicalAliases: [], status: 'current', scope: emptyScope(), validity, relationships: [], provenance: provenance(['cm.public.products']) });
  for (const model of snapshot.accountModels) entities.push({ ...model, type: 'account_model', aliases: [], historicalAliases: [], status: 'current', scope: emptyScope(), validity, relationships: [], provenance: provenance(['cm.public.accounts_help']) });
  for (const listing of snapshot.accountListings) {
    const scope = emptyScope(); scope.games = [listing.gameId]; scope.accountModels = [listing.accountModelId]; scope.accountListings = [listing.id];
    entities.push({ ...listing, type: 'account_listing', aliases: [], historicalAliases: [], status: 'current', scope, validity, relationships: [{ relation: 'for_game', targetId: listing.gameId }, { relation: 'uses_account_model', targetId: listing.accountModelId }], provenance: provenance(['cm.public.accounts']) });
  }
  for (const product of snapshot.products) {
    const scope = emptyScope(); scope.categories = [product.categoryId]; scope.vendors = [product.vendorId]; scope.products = [product.id]; if (product.gameId) scope.games = [product.gameId];
    entities.push({ ...product, type: 'product', aliases: [], historicalAliases: [], status: 'current', scope, validity, relationships: [{ relation: 'from_vendor', targetId: product.vendorId }, { relation: 'in_category', targetId: product.categoryId }, ...(product.gameId ? [{ relation: 'for_game', targetId: product.gameId }] : [])], provenance: provenance([`cm.public.path.${slug(product.sourcePath)}`]) });
    for (const duration of product.durations) {
      const id = `variant.${product.id.slice('product.'.length)}.${slug(duration)}`;
      const variantScope = emptyScope(); variantScope.games = product.gameId ? [product.gameId] : []; variantScope.vendors = [product.vendorId]; variantScope.products = [product.id]; variantScope.variants = [id];
      entities.push({ id, type: 'variant', displayName: `${product.displayName} ${duration}`, aliases: [], historicalAliases: [], status: 'current', duration, scope: variantScope, validity, relationships: [{ relation: 'variant_of', targetId: product.id }], provenance: provenance([`cm.public.path.${slug(product.sourcePath)}`]) });
    }
  }
  return entities;
}

function historicalEntityResolution(label, entities) {
  const original = label.replace(/^(Product|Game) - /, '').trim();
  const key = normalize(original);
  const exact = entities.filter((entity) => normalize(entity.displayName) === key || entity.aliases.some((alias) => normalize(alias) === key));
  if (exact.length === 1) return { historicalEntity: original, resolution: 'current', canonicalIds: [exact[0].id], reason: 'Exact current catalog or authoritative alias identity.', confidence: 'high' };

  const gameAliases = new Map([
    ['warzone', 'historical.game.call_of_duty_warzone'], ['call of duty warzone', 'historical.game.call_of_duty_warzone'],
    ['black ops 6', 'historical.game.black_ops_6'], ['call of duty black ops 6', 'historical.game.black_ops_6'],
    ['call of duty black ops 7', 'historical.game.black_ops_7'], ['five m', 'historical.game.fivem'], ['fivem', 'historical.game.fivem']
  ]);
  if (gameAliases.has(key)) return { historicalEntity: original, resolution: 'historical_only', canonicalIds: [gameAliases.get(key)], reason: 'Historical game label is absent from the current public game directory.', confidence: 'high' };

  const listingRules = [
    [/rust.*nfa|nfa.*rust/, 'account_listing.rust.nfa'], [/cs2.*nfa|counter strike.*nfa/, 'account_listing.cs2.nfa'],
    [/arc raiders.*nfa/, 'account_listing.arc_raiders.nfa'], [/dayz.*nfa/, 'account_listing.dayz.nfa'],
    [/battlefield.*nfa/, 'account_listing.battlefield_6.nfa'], [/rust.*full access/, 'account_listing.rust.full_access'],
    [/arc raiders.*full access/, 'account_listing.arc_raiders.full_access'], [/dayz.*full access/, 'account_listing.dayz.full_access'],
    [/fortnite.*v bucks/, 'account_listing.fortnite.vbucks_full_access']
  ];
  for (const [regex, id] of listingRules) if (regex.test(key)) {
    const hour = key.match(/(0 25|0 100|500 1 000|1 000 1 500|2 000 5 000|5 000|4 000|2 000)/);
    return { historicalEntity: original, resolution: hour ? 'variant' : 'alias', canonicalIds: [id], reason: hour ? 'Historical hour bracket remains a listing variant; it is not flattened into the base listing.' : 'Explicit game/account-model wording resolves to the current listing.', confidence: hour ? 'medium' : 'high' };
  }

  const productRules = [
    [/ancient fortnite/, 'product.ancient.fortnite'], [/exodus fortnite/, 'product.exodus.fortnite'], [/exodus.*rainbow|exodus.*r6/, 'product.exodus.r6x'],
    [/exodus.*rust/, 'product.exodus.rust'], [/reported.*spoofer|reported lol/, 'product.reported_lol.hwid_spoofer'], [/exodus.*spoofer/, 'product.exodus.spoofer']
  ];
  for (const [regex, id] of productRules) if (regex.test(key)) return { historicalEntity: original, resolution: 'alias', canonicalIds: [id], reason: 'Explicit vendor and product/game identity maps to the current catalog product.', confidence: 'high' };

  if (/^(nfa|nfa account|nfa accounts|spoofer|spoofers|exodus|cleaner|account product|cheat product)$/.test(key)) {
    const candidates = entities.filter((entity) => normalize(entity.displayName).includes(key) || normalize(entity.type).includes(key)).slice(0, 20).map((entity) => entity.id);
    return { historicalEntity: original, resolution: 'ambiguous', canonicalIds: candidates, reason: 'Generic historical label does not identify one product/listing; runtime must disambiguate.', confidence: 'low' };
  }
  if (/steam|stripe|buy me a coffee|rivatuner|defender control|apple cleaner|hwid checker/.test(key)) return { historicalEntity: original, resolution: 'third_party', canonicalIds: [`third_party.${slug(original)}`], reason: 'External platform/tool rather than a current CM catalog product.', confidence: 'high' };
  if (/kaze|phantom overlay|woofer|black ops|bo6|bo7|warzone|deferred key|temporary kaze/.test(key)) return { historicalEntity: original, resolution: 'historical_only', canonicalIds: [`historical.product.${slug(original)}`], reason: 'Historically observed product/tool is not established as a current catalog identity.', confidence: 'medium' };
  return { historicalEntity: original, resolution: 'unknown', canonicalIds: [], reason: 'Available current and historical identity evidence is insufficient for a safe merge.', confidence: 'low' };
}

function detectScope(statement, entities) {
  const text = normalize(statement);
  const scope = emptyScope();
  const find = (type, patterns) => {
    for (const [pattern, id] of patterns) if (pattern.test(text)) scope[type].push(id);
  };
  find('games', [[/\brust\b/, 'game.rust'], [/\bfortnite\b|\bfn\b/, 'game.fortnite'], [/\bcs2\b|counter strike/, 'game.cs2'], [/\bapex\b/, 'game.apex_legends'], [/rainbow six|\br6x?\b/, 'game.rainbow_six_siege'], [/tarkov|\beft\b/, 'game.escape_from_tarkov'], [/valorant/, 'game.valorant'], [/arc raiders/, 'game.arc_raiders'], [/battlefield 6|\bbf6\b/, 'game.battlefield_6'], [/dayz/, 'game.dayz'], [/pubg/, 'game.pubg']]);
  find('products', [[/ancient rust/, 'product.ancient.rust'], [/exodus rust/, 'product.exodus.rust'], [/ancient fortnite/, 'product.ancient.fortnite'], [/exodus fortnite/, 'product.exodus.fortnite'], [/exodus.*r6|exodus rainbow/, 'product.exodus.r6x'], [/reported.*spoofer/, 'product.reported_lol.hwid_spoofer'], [/exodus spoofer/, 'product.exodus.spoofer']]);
  find('vendors', [[/\bancient\b/, 'vendor.ancient'], [/\bexodus\b/, 'vendor.exodus'], [/\bvenom\b/, 'vendor.venom'], [/\bfecurity\b/, 'vendor.fecurity'], [/reported/, 'vendor.reported_lol']]);
  if (/\bnfa\b/.test(text)) scope.accountModels.push('account_model.nfa');
  if (/full access/.test(text)) scope.accountModels.push('account_model.full_access');
  if (/manual service|top up|topup/.test(text)) scope.accountModels.push('account_model.manual_service');
  const listingMap = new Map([['game.rust', 'account_listing.rust.nfa'], ['game.cs2', 'account_listing.cs2.nfa'], ['game.arc_raiders', 'account_listing.arc_raiders.nfa'], ['game.dayz', 'account_listing.dayz.nfa'], ['game.battlefield_6', 'account_listing.battlefield_6.nfa']]);
  if (scope.accountModels.includes('account_model.nfa')) for (const game of scope.games) if (listingMap.has(game)) scope.accountListings.push(listingMap.get(game));
  for (const key of Object.keys(scope)) if (Array.isArray(scope[key])) scope[key] = unique(scope[key]);
  if (!Object.values(scope).some((value) => Array.isArray(value) && value.length > 0)) scope.global = true;
  return scope;
}

function relationFor(fact) {
  const type = fact.types?.[0] ?? 'fact';
  const map = {
    availability: 'has_dynamic_availability', pricing: 'has_dynamic_price', payment: 'historical_payment_observation', supply: 'historical_supply_observation',
    procedure: 'historical_procedure_observation', diagnostic: 'diagnosed_by', cause: 'possible_cause', requirement: 'requires',
    policy: 'historical_policy_statement', exception: 'historical_exception', outcome: 'historical_outcome', incident: 'historical_incident',
    limitation: 'has_limitation', warning: 'has_warning', safety: 'has_safety_warning', security: 'has_security_rule', privacy: 'has_privacy_observation',
    productBehavior: 'historical_product_behavior', product: 'historical_product_claim', feature: 'historical_feature_claim', terminology: 'defines_term',
    contradiction: 'has_contradiction', unresolved: 'has_unresolved_question', escalation: 'historical_escalation', clarification: 'clarifies', risk: 'has_risk'
  };
  return map[type] ?? 'historical_observation';
}

function dispositionFor(fact, scope) {
  const statement = normalize(fact.statement);
  const type = fact.types?.[0] ?? 'fact';
  if (/staff stated (?:perms|whats up|depression)|customer reported (?:hi|hello|yo) final recorded turn.*(?:sup|hello)/.test(statement)) return ['noise', 'Conversational fragment has no reusable support semantics.'];
  if (['availability', 'pricing'].includes(type) || /\b(in stock|out of stock|restock|price|server.*down|operational|updating|detected status)\b/.test(statement)) return ['dynamic', 'Changeable catalog/service state cannot be frozen from historical evidence.'];
  if (['unresolved', 'contradiction'].includes(type) || fact.confidence === 'contradicted' || /unresolved|no substantive staff|awaiting response|no confirmation/.test(statement)) return ['unresolved', 'Evidence is incomplete, contradicted, or lacks a confirmed outcome.'];
  const restrictedTopic = /spoofer|spoof|anti cheat|eac|battleye|vanguard|inject|injection|hwid|detection|undetected|bypass|kernel|driver/.test(statement);
  const operational = /\b(run|disable|enable|remove|delete|flash|inject|change|reset|use|install|uninstall|execute|script)\b/.test(statement);
  if (restrictedTopic && operational) return ['restricted', 'Sensitive bypass/evasion-adjacent operational material is retained only for recognition and escalation.'];
  if (['policy', 'exception', 'commercial', 'product', 'productBehavior', 'feature', 'limitation', 'risk', 'warning', 'privacy', 'security'].includes(type)) return ['historical_only', 'Meaningful historical claim is retained without promotion to current authoritative truth.'];
  if (['procedure', 'diagnostic', 'cause', 'requirement', 'configuration'].includes(type) && !restrictedTopic) return ['canonical', 'Safe reusable support knowledge under explicit historical scope and provenance.'];
  if (scope.global && ['fact', 'outcome'].includes(type)) return ['historical_only', 'Context is too broad or case-specific for safe general runtime use.'];
  return ['linked_related', 'Distinct historical observation is preserved and linked by scope/relation rather than merged by wording.'];
}

function canonicalizeFacts(facts, entities) {
  const canonicalFacts = [];
  const dispositions = [];
  const identity = new Map();
  const contradictionByFact = new Map();
  for (const fact of facts) for (const id of fact.contradictions ?? []) contradictionByFact.set(fact.id, [...(contradictionByFact.get(fact.id) ?? []), id]);
  for (const fact of facts) {
    const scope = detectScope(fact.statement, entities);
    const relation = relationFor(fact);
    const [initialDisposition, reason] = dispositionFor(fact, scope);
    const subjectId = scope.variants[0] ?? scope.products[0] ?? scope.accountListings[0] ?? scope.accountModels[0] ?? scope.games[0] ?? scope.vendors[0] ?? 'store.cm';
    const conditions = [];
    if (/if |when |after |before |unless |while /.test(normalize(fact.statement))) conditions.push('Conditions remain embedded in the normalized historical claim; review before widening scope.');
    const validity = { state: initialDisposition === 'dynamic' ? 'dynamic' : 'historical', validFrom: null, validUntil: null, lastObservedAt: null };
    const semanticObject = normalize(fact.statement)
      .replace(/\b(close and reopen|close reopen|relaunch)\b/g, 'restart')
      .replace(/\bweb site\b/g, 'website')
      .replace(/\b(log in|sign in)\b/g, 'login')
      .replace(/\bnot working\b/g, 'fails');
    const key = JSON.stringify({ subjectId, relation, semanticObject, conditions, scope, validity: validity.state });
    const duplicateTarget = identity.get(key);
    let disposition = initialDisposition;
    let targetId = duplicateTarget;
    if (duplicateTarget) disposition = 'merged_duplicate';
    else if (disposition !== 'noise') {
      targetId = `fact.canonical.${String(canonicalFacts.length + 1).padStart(4, '0')}`;
      identity.set(key, targetId);
      canonicalFacts.push({
        id: targetId,
        subjectId,
        relation,
        object: { entityId: null, value: sanitizeHistoricalClaim(fact.statement) },
        conditions,
        scope,
        validity,
        truthLayer: disposition === 'canonical' || disposition === 'linked_related' ? 'L3_CANONICAL_HISTORICAL' : 'L4_HISTORICAL_EVIDENCE',
        confidence: fact.confidence === 'contradicted' ? 'contradicted' : Number(fact.supportCount ?? 1) > 1 ? 'repeated' : 'single',
        outcomeEvidence: null,
        runtimeEligible: ['canonical', 'linked_related'].includes(disposition),
        provenance: historicalProvenance(fact)
      });
    }
    dispositions.push({ originalFactId: fact.id, disposition, canonicalTargetIds: targetId ? [targetId] : [], reason: duplicateTarget ? 'Materially identical subject, relation, object, conditions, scope, and validity; provenance merged.' : reason, sourceCount: Number(fact.supportCount ?? fact.sources?.length ?? 0), contradictionIds: unique([...(fact.contradictions ?? []), ...(contradictionByFact.get(fact.id) ?? [])]) });
    if (duplicateTarget) {
      const target = canonicalFacts.find((candidate) => candidate.id === duplicateTarget);
      target.provenance.sourceCount += Number(fact.supportCount ?? fact.sources?.length ?? 0);
      target.provenance.transcriptIds = unique([...target.provenance.transcriptIds, ...historicalProvenance(fact).transcriptIds]);
      target.provenance.historicalFactIds.push(fact.id);
    }
  }
  return { canonicalFacts, dispositions };
}

function procedureEvidence(facts, pattern) {
  const relevant = facts.filter((fact) => pattern.test(normalize(fact.statement)));
  const count = (regex) => relevant.filter((fact) => regex.test(normalize(fact.statement))).length;
  return {
    attempted: count(/tried|attempted|ran|installed|restarted|lowered|cleared|checked/),
    confirmedSuccess: count(/confirmed|resolved|worked|works now|fixed|successful/),
    explicitFailure: count(/failed|did not|didnt|still|no luck|not working/),
    partial: count(/partial|temporar|recurred|worked.*but/),
    noConfirmation: count(/not confirmed|no confirmation|without customer confirmation|outcome.*unconfirmed/)
  };
}

function buildSemanticNodes(facts) {
  const prov = (ids = []) => ({ sourceClass: 'canonical_historical', sourceCount: ids.length, transcriptIds: [], historicalFactIds: ids, currentSourceRefs: [], contradictionIds: [] });
  const symptoms = [
    { id: 'symptom.rust.server_load_crash', displayName: 'Rust crashes while loading a server or world' },
    { id: 'symptom.loader.closes_immediately', displayName: 'Loader closes immediately' },
    { id: 'symptom.payment.complete_no_delivery', displayName: 'Payment completed but delivery is missing' },
    { id: 'symptom.nfa.invalid_or_reclaimed', displayName: 'NFA account is invalid, locked, or reclaimed' },
    { id: 'symptom.loader.connection_failure', displayName: 'Loader cannot connect or remains stuck' }
  ].map((node) => ({ ...node, provenance: prov() }));
  const causes = [
    { id: 'cause.rust.server_load_resource_pressure', displayName: 'Resource pressure during Rust world/server loading', provenance: { sourceClass: 'operator_approved', sourceCount: 0, transcriptIds: [], historicalFactIds: [], currentSourceRefs: ['operator.rust.resource_pressure'], contradictionIds: [] } },
    { id: 'cause.loader.webview_runtime_missing', displayName: 'Required WebView runtime is missing or damaged', provenance: prov(['fact.2650']) },
    { id: 'cause.fulfillment.pending_after_payment', displayName: 'Payment and fulfillment state have not converged', provenance: prov() },
    { id: 'cause.nfa.owner_or_session_change', displayName: 'NFA owner/session state changed', provenance: prov() }
  ];
  const diagnostics = [
    { id: 'diagnostic.rust.graphics_level', question: 'Are the Rust graphics settings high, or are they already low?', answers: [{ match: 'high', boostCauseIds: ['cause.rust.server_load_resource_pressure'], reduceCauseIds: [], setContext: { graphicsLevel: 'high' } }, { match: 'low', boostCauseIds: [], reduceCauseIds: ['cause.rust.server_load_resource_pressure'], setContext: { graphicsLevel: 'low' } }], requiredWhen: ['symptom.rust.server_load_crash'], skipWhenKnown: true, provenance: prov() },
    { id: 'diagnostic.system.available_resources', question: 'Are RAM or other system resources heavily used while the world loads?', answers: [{ match: 'high_usage', boostCauseIds: ['cause.rust.server_load_resource_pressure'], reduceCauseIds: [], setContext: { resourcePressure: true } }], requiredWhen: ['symptom.rust.server_load_crash'], skipWhenKnown: true, provenance: prov() },
    { id: 'diagnostic.loader.webview_present', question: 'After a Windows reinstall, is the supported WebView runtime installed?', answers: [], requiredWhen: ['symptom.loader.closes_immediately'], skipWhenKnown: true, provenance: prov(['fact.2650']) },
    { id: 'diagnostic.order.reference_available', question: 'Do you have the public order or purchase reference?', answers: [], requiredWhen: ['symptom.payment.complete_no_delivery'], skipWhenKnown: true, provenance: prov() },
    { id: 'diagnostic.attachment.visual_required', question: 'Does the screenshot contain the only visible error or status evidence?', answers: [], requiredWhen: [], skipWhenKnown: true, provenance: prov() }
  ];
  const procedureSpecs = [
    ['procedure.system.reduce_resource_pressure', 'Reduce ordinary system resource pressure', /graphics|ram|resource|background app/, [{ id: 'step.1', action: 'If graphics are high, lower ordinary in-game graphics settings.', when: ['graphicsLevel=high'], requiresContext: ['graphicsLevel'], onSuccess: ['outcome.resolved'], onFailure: ['diagnostic.system.available_resources'] }, { id: 'step.2', action: 'Close unnecessary background applications and free ordinary system resources.', when: ['resourcePressure=true_or_unknown'], requiresContext: [], onSuccess: ['outcome.resolved'], onFailure: ['case.rust.nfa.server_load_crash.continue'] }]],
    ['procedure.loader.install_webview_runtime', 'Install the supported WebView runtime', /webview|loader.*close/, [{ id: 'step.1', action: 'Install or repair the supported Evergreen WebView runtime from its official source.', when: ['webview_missing_or_damaged'], requiresContext: [], onSuccess: ['outcome.resolved'], onFailure: ['case.loader.closes.continue'] }]],
    ['procedure.loader.restart_and_retry', 'Restart the affected application and retry', /restart|reboot|relaunch/, [{ id: 'step.1', action: 'Close the affected application fully, reopen it, and retry once.', when: [], requiresContext: [], onSuccess: ['outcome.resolved'], onFailure: ['escalation.known_flow_exhausted'] }]],
    ['procedure.browser.clear_state', 'Clear ordinary browser state', /browser|cookies|cache/, [{ id: 'step.1', action: 'Clear the relevant browser cookies/cache or retry in another supported browser.', when: ['browser_flow_failure'], requiresContext: [], onSuccess: ['outcome.resolved'], onFailure: ['escalation.known_flow_exhausted'] }]],
    ['procedure.order.lookup_current_state', 'Look up current order and fulfillment state', /order|fulfillment|payment/, [{ id: 'step.1', action: 'Use the approved current order lookup with a public order selector.', when: [], requiresContext: ['order selector'], onSuccess: ['case.order.current_state'], onFailure: ['dynamic.purchase_intent.status'] }]],
    ['procedure.product.read_exact_requirements', 'Read exact current product or variant requirements', /requirement|compatible|windows|bios/, [{ id: 'step.1', action: 'Resolve the exact product and variant, then read only its current authoritative requirements.', when: [], requiresContext: ['productId'], onSuccess: ['outcome.context_resolved'], onFailure: ['escalation.entity_ambiguous'] }]]
  ];
  const procedures = procedureSpecs.map(([id, displayName, pattern, steps]) => ({ id, displayName, scope: emptyScope(), steps, outcomeEvidence: procedureEvidence(facts, pattern), restricted: false, provenance: prov(facts.filter((fact) => pattern.test(normalize(fact.statement))).slice(0, 100).map((fact) => fact.id)) }));
  const outcomes = [{ id: 'outcome.resolved', displayName: 'Customer confirmed resolution' }, { id: 'outcome.unconfirmed', displayName: 'No customer confirmation' }, { id: 'outcome.explicit_failure', displayName: 'Customer explicitly reported failure' }, { id: 'outcome.escalated', displayName: 'Escalated for human review' }, { id: 'outcome.context_resolved', displayName: 'Required support context resolved' }].map((node) => ({ ...node, provenance: prov() }));
  return { symptoms, causes, diagnostics, procedures, outcomes };
}

function buildPolicies(snapshot, contradictions) {
  const byId = new Map();
  for (const item of snapshot.currentStaticPolicies) byId.set(item.id, { id: item.id, displayName: item.claim, scope: emptyScope(), authority: 'current_authoritative', rule: item.claim, conditions: [], exceptionIds: [], dynamicRequirements: [], escalateWhen: [], provenance: { sourceClass: 'current_authoritative', sourceCount: item.sourceIds.length, transcriptIds: [], historicalFactIds: [], currentSourceRefs: item.sourceIds, contradictionIds: [] } });
  byId.set('policy.refund_or_replacement.current_state_required', { id: 'policy.refund_or_replacement.current_state_required', displayName: 'Refund or replacement decisions require current order and policy state', scope: emptyScope(), authority: 'operator_approved', rule: 'Do not infer current refund or replacement eligibility from historical discretionary handling.', conditions: [], exceptionIds: ['exception.historical_discretionary_remedy'], dynamicRequirements: ['dynamic.order.status', 'dynamic.fulfillment.status'], escalateWhen: ['current policy or live state is unavailable', 'historical evidence is contradictory'], provenance: { sourceClass: 'operator_approved', sourceCount: 0, transcriptIds: [], historicalFactIds: [], currentSourceRefs: [], contradictionIds: contradictions.filter((item) => /finality|replacement|refund/i.test(item.topic ?? item.id)).map((item) => item.id) } });
  return [...byId.values()];
}

// Historical first-pass seeds retained only as readable regression references.
// Runtime compilation uses synthesizeSupportCoverage over all ticket ledgers.
function legacySeedRegressionCases() {
  const scope = (values = {}) => ({ ...emptyScope(), ...values });
  return [
    { id: 'case.rust.nfa.server_load_crash', displayName: 'Rust NFA crashes while loading a server or world', scope: scope({ games: ['game.rust'], accountModels: ['account_model.nfa'], accountListings: ['account_listing.rust.nfa'] }), recognition: { phrases: ['rust crashes loading server', 'crash while loading world', 'rust server load crash', 'world loading closes'], symptomIds: ['symptom.rust.server_load_crash'], errorSignals: [], contextSignals: ['server loading', 'world loading'] }, requiredContext: ['graphicsLevel', 'resourcePressure', 'proceduresAttempted'], possibleCauseIds: ['cause.rust.server_load_resource_pressure'], diagnosticIds: ['diagnostic.rust.graphics_level', 'diagnostic.system.available_resources'], resolutionFlow: [{ when: ['graphicsLevel=high'], procedureId: 'procedure.system.reduce_resource_pressure', onSuccess: 'outcome.resolved', onFailure: 'case.rust.nfa.server_load_crash.continue' }, { when: ['graphicsLevel=low', 'or previous procedure failed'], action: 'continue diagnosis', onFailure: 'escalation.known_flow_exhausted' }], policyIds: [], relatedCaseIds: ['case.rust.nfa.server_load_crash.continue'], escalateWhen: ['ordinary resource-pressure branch fails'], confidence: 'operator-approved-with-historical-analogue', provenance: { sourceClass: 'operator_approved', sourceCount: 1, transcriptIds: [], historicalFactIds: [], currentSourceRefs: [], contradictionIds: [] } },
    { id: 'case.rust.nfa.server_load_crash.continue', displayName: 'Continue Rust server-load crash diagnosis after low graphics or failed resource fix', scope: scope({ games: ['game.rust'], accountModels: ['account_model.nfa'], accountListings: ['account_listing.rust.nfa'] }), recognition: { phrases: ['graphics already low', 'already closed background apps', 'still crashes loading server'], symptomIds: ['symptom.rust.server_load_crash'], errorSignals: [], contextSignals: ['resource fix failed'] }, requiredContext: ['graphicsLevel', 'proceduresAttempted'], possibleCauseIds: [], diagnosticIds: [], resolutionFlow: [], policyIds: [], relatedCaseIds: ['case.rust.nfa.server_load_crash'], escalateWhen: ['no additional evidence-backed safe branch'], confidence: 'operator-approved', provenance: { sourceClass: 'operator_approved', sourceCount: 0, transcriptIds: [], historicalFactIds: [], currentSourceRefs: [], contradictionIds: [] } },
    { id: 'case.loader.closes.webview', displayName: 'Loader closes immediately after Windows/runtime change', scope: scope({ categories: ['category.external', 'category.internal'] }), recognition: { phrases: ['loader closes immediately', 'app instantly exits', 'loader disappears after opening', 'windows reinstall loader closes'], symptomIds: ['symptom.loader.closes_immediately'], errorSignals: [], contextSignals: ['Windows reinstall'] }, requiredContext: ['webviewPresent'], possibleCauseIds: ['cause.loader.webview_runtime_missing'], diagnosticIds: ['diagnostic.loader.webview_present'], resolutionFlow: [{ procedureId: 'procedure.loader.install_webview_runtime', onSuccess: 'outcome.resolved', onFailure: 'escalation.known_flow_exhausted' }], policyIds: [], relatedCaseIds: [], escalateWhen: ['runtime repair fails'], confidence: 'historically-confirmed', provenance: { sourceClass: 'canonical_historical', sourceCount: 1, transcriptIds: [], historicalFactIds: ['fact.2650'], currentSourceRefs: [], contradictionIds: [] } },
    { id: 'case.payment.completed_fulfillment_pending', displayName: 'Payment completed but order or fulfillment is missing', scope: scope({ global: true }), recognition: { phrases: ['paid but no order', 'payment confirmed nothing delivered', 'charged but not received', 'where is my order'], symptomIds: ['symptom.payment.complete_no_delivery'], errorSignals: [], contextSignals: ['payment complete'] }, requiredContext: ['order selector'], possibleCauseIds: ['cause.fulfillment.pending_after_payment'], diagnosticIds: ['diagnostic.order.reference_available'], resolutionFlow: [{ procedureId: 'procedure.order.lookup_current_state', onSuccess: 'case.order.current_state', onFailure: 'dynamic.purchase_intent.status' }], policyIds: [], relatedCaseIds: ['case.order.current_state'], escalateWhen: ['live lookup unavailable'], confidence: 'operator-approved', provenance: { sourceClass: 'operator_approved', sourceCount: 0, transcriptIds: [], historicalFactIds: [], currentSourceRefs: [], contradictionIds: ['contradiction.batch4.payment-flow-vs-delay'] } },
    { id: 'case.order.current_state', displayName: 'Customer asks for current order or fulfillment state', scope: scope({ global: true }), recognition: { phrases: ['where is my order', 'order status', 'has my order delivered', 'fulfillment status'], symptomIds: [], errorSignals: [], contextSignals: [] }, requiredContext: ['order selector'], possibleCauseIds: [], diagnosticIds: ['diagnostic.order.reference_available'], resolutionFlow: [], policyIds: [], relatedCaseIds: [], escalateWhen: ['approved live lookup fails'], confidence: 'authoritative-routing', provenance: { sourceClass: 'operator_approved', sourceCount: 0, transcriptIds: [], historicalFactIds: [], currentSourceRefs: [], contradictionIds: [] } },
    { id: 'case.catalog.current_stock_or_status', displayName: 'Customer asks for current stock, price, or product status', scope: scope({ global: true }), recognition: { phrases: ['is it in stock', 'current price', 'is product working', 'when restock', 'detected right now'], symptomIds: [], errorSignals: [], contextSignals: [] }, requiredContext: ['productId'], possibleCauseIds: [], diagnosticIds: [], resolutionFlow: [], policyIds: [], relatedCaseIds: [], escalateWhen: ['current catalog lookup unavailable'], confidence: 'authoritative-routing', provenance: { sourceClass: 'operator_approved', sourceCount: 0, transcriptIds: [], historicalFactIds: [], currentSourceRefs: [], contradictionIds: [] } },
    { id: 'case.nfa.invalid_or_reclaimed', displayName: 'NFA account became invalid, locked, or reclaimed', scope: scope({ accountModels: ['account_model.nfa'] }), recognition: { phrases: ['nfa invalid', 'account locked', 'owner changed password', 'account reclaimed', 'token stopped working'], symptomIds: ['symptom.nfa.invalid_or_reclaimed'], errorSignals: [], contextSignals: [] }, requiredContext: ['gameId', 'listingId', 'order selector', 'failureTiming'], possibleCauseIds: ['cause.nfa.owner_or_session_change'], diagnosticIds: [], resolutionFlow: [], policyIds: ['policy.account_models.distinct', 'policy.refund_or_replacement.current_state_required'], relatedCaseIds: ['case.nfa.replacement_dispute'], escalateWhen: ['replacement eligibility requested', 'visual evidence required'], confidence: 'historically-repeated-current-policy-gated', provenance: { sourceClass: 'canonical_historical', sourceCount: 1, transcriptIds: [], historicalFactIds: ['fact.0723'], currentSourceRefs: ['cm.public.nfa_meaning'], contradictionIds: [] } },
    { id: 'case.nfa.replacement_dispute', displayName: 'NFA refund or replacement dispute', scope: scope({ accountModels: ['account_model.nfa'] }), recognition: { phrases: ['replace my nfa', 'refund invalid account', 'account arrived banned', 'need replacement'], symptomIds: ['symptom.nfa.invalid_or_reclaimed'], errorSignals: [], contextSignals: [] }, requiredContext: ['order selector', 'failureTiming', 'evidenceAvailable'], possibleCauseIds: [], diagnosticIds: [], resolutionFlow: [], policyIds: ['policy.refund_or_replacement.current_state_required'], relatedCaseIds: ['case.nfa.invalid_or_reclaimed'], escalateWhen: ['policy conflict', 'required attachment unseen'], confidence: 'historically-contradicted', provenance: { sourceClass: 'canonical_historical', sourceCount: 0, transcriptIds: [], historicalFactIds: [], currentSourceRefs: [], contradictionIds: ['contradiction.batch4.nfa-finality-vs-remedies'] } },
    { id: 'case.account_model.choose', displayName: 'Choose NFA, Full Access, or manual service correctly', scope: scope({ categories: ['category.account', 'category.manual_service'] }), recognition: { phrases: ['what is nfa', 'nfa vs full access', 'do i own nfa account', 'manual account service'], symptomIds: [], errorSignals: [], contextSignals: [] }, requiredContext: ['desiredControlModel'], possibleCauseIds: [], diagnosticIds: [], resolutionFlow: [], policyIds: ['policy.account_models.distinct', 'policy.nfa.short_term'], relatedCaseIds: [], escalateWhen: ['listing model remains unclear'], confidence: 'current-authoritative', provenance: { sourceClass: 'current_authoritative', sourceCount: 2, transcriptIds: [], historicalFactIds: [], currentSourceRefs: ['cm.public.accounts_help', 'cm.public.nfa_vs_full_access'], contradictionIds: [] } },
    { id: 'case.product.requirements', displayName: 'Resolve exact current product or variant requirements', scope: scope({ categories: ['category.external', 'category.internal', 'category.spoofer'] }), recognition: { phrases: ['what are requirements', 'does it support windows', 'need secure boot', 'does it work with raid'], symptomIds: [], errorSignals: [], contextSignals: [] }, requiredContext: ['productId', 'variantId'], possibleCauseIds: [], diagnosticIds: [], resolutionFlow: [{ procedureId: 'procedure.product.read_exact_requirements', onSuccess: 'outcome.context_resolved', onFailure: 'escalation.entity_ambiguous' }], policyIds: [], relatedCaseIds: [], escalateWhen: ['product or variant is ambiguous'], confidence: 'current-authoritative-when-profile-present', provenance: { sourceClass: 'current_authoritative', sourceCount: 0, transcriptIds: [], historicalFactIds: [], currentSourceRefs: [], contradictionIds: [] } },
    { id: 'case.attachment.visual_required', displayName: 'Diagnosis depends on an unseen attachment', scope: scope({ global: true }), recognition: { phrases: ['see screenshot', 'look at attached image', 'error is in picture'], symptomIds: [], errorSignals: [], contextSignals: ['attachment required'] }, requiredContext: ['attachmentReviewed'], possibleCauseIds: [], diagnosticIds: ['diagnostic.attachment.visual_required'], resolutionFlow: [], policyIds: [], relatedCaseIds: [], escalateWhen: ['visual content is unavailable or ambiguous'], confidence: 'escalation-only', provenance: { sourceClass: 'canonical_historical', sourceCount: 504, transcriptIds: [], historicalFactIds: [], currentSourceRefs: [], contradictionIds: [] } },
    { id: 'case.restricted.technical', displayName: 'Restricted technical bypass or evasion request', scope: scope({ categories: ['category.external', 'category.internal', 'category.spoofer'] }), recognition: { phrases: ['bypass anti cheat', 'inject driver', 'spoof ban identifiers', 'avoid detection'], symptomIds: [], errorSignals: [], contextSignals: [] }, requiredContext: ['productId'], possibleCauseIds: [], diagnosticIds: [], resolutionFlow: [], policyIds: [], relatedCaseIds: [], escalateWhen: ['operational bypass or evasion detail requested'], confidence: 'restricted-routing', provenance: { sourceClass: 'canonical_historical', sourceCount: 0, transcriptIds: [], historicalFactIds: [], currentSourceRefs: [], contradictionIds: [] } },
    { id: 'case.loader.connection_failure', displayName: 'Loader connection or zero-progress failure', scope: scope({ categories: ['category.external', 'category.internal'] }), recognition: { phrases: ['loader stuck at zero', 'loader connection failed', 'cannot reach loader server'], symptomIds: ['symptom.loader.connection_failure'], errorSignals: [], contextSignals: [] }, requiredContext: ['exactError', 'networkPath', 'securitySoftware'], possibleCauseIds: [], diagnosticIds: [], resolutionFlow: [{ procedureId: 'procedure.loader.restart_and_retry', onSuccess: 'outcome.resolved', onFailure: 'escalation.known_flow_exhausted' }], policyIds: [], relatedCaseIds: [], escalateWhen: ['safe ordinary checks exhausted'], confidence: 'canonical-historical', provenance: { sourceClass: 'canonical_historical', sourceCount: 1, transcriptIds: [], historicalFactIds: ['fact.0031'], currentSourceRefs: [], contradictionIds: [] } }
  ];
}

function buildDynamicLookups() {
  return [
    ['dynamic.catalog.stock', ['stock', 'availability', 'restock'], ['catalog.stock'], 'catalog.current.read', ['product selector']],
    ['dynamic.catalog.price', ['price'], ['catalog.price'], 'catalog.current.read', ['product and variant selector']],
    ['dynamic.catalog.product_status', ['product_status', 'detection_status'], ['catalog.status'], 'catalog.current.read', ['product selector']],
    ['dynamic.order.status', ['order_status'], ['order.status'], 'orders.details.read', ['order selector']],
    ['dynamic.fulfillment.status', ['fulfillment_status', 'delivery_status'], ['fulfillment.status'], 'orders.fulfillment.read', ['order selector']],
    ['dynamic.purchase_intent.status', ['payment_status', 'pending_purchase'], ['purchase_intent.status'], 'purchase-intents.lookup.read', ['purchase selector']],
    ['dynamic.user.overview', ['wallet_balance', 'aura_balance', 'entitlement'], ['user.overview'], 'users.overview.read', ['user selector']]
  ].map(([id, questionTypes, fields, operation, requiredIdentifiers]) => ({ id, questionTypes, fields, source: 'cm_internal_integrations_api_or_current_catalog', operation, requiredIdentifiers, neverInferFromHistory: true }));
}

function runtimeAliases(snapshot, cases) {
  const records = [];
  const add = (alias, targets, status = 'exact', disambiguation = []) => records.push({ alias, normalized: normalize(alias), targets, status, disambiguation });
  for (const game of snapshot.games) { add(game.displayName, [game.id]); for (const alias of game.aliases ?? []) add(alias, [game.id]); }
  for (const vendor of snapshot.vendors) { add(vendor.displayName, [vendor.id]); for (const alias of vendor.aliases ?? []) add(alias, [vendor.id]); }
  for (const product of snapshot.products) add(product.displayName, [product.id]);
  for (const listing of snapshot.accountListings) add(listing.displayName, [listing.id]);
  add('nfa', ['account_model.nfa']); add('full access', ['account_model.full_access']); add('manual service', ['account_model.manual_service']);
  const casePhrases = new Map(cases.flatMap((item) => item.recognition.phrases.map((phrase) => [phrase, item.id])));
  for (const [phrase, id] of casePhrases) add(phrase, [id], 'slang');
  add('ancient', ['vendor.ancient'], 'ambiguous', ['Ask for the game/product before applying product-specific requirements.']);
  add('exodus', ['vendor.exodus'], 'ambiguous', ['Ask for the exact Exodus product and game.']);
  add('spoofer', ['product.reported_lol.hwid_spoofer', 'product.exodus.spoofer'], 'ambiguous', ['Ask which spoofer product.']);
  return records;
}

function evaluationQueries(cases, snapshot) {
  const families = ['paraphrase', 'typo_or_slang', 'negation', 'already_tried', 'product_isolation', 'variant_isolation', 'account_model_isolation', 'dynamic_state', 'multi_turn', 'ambiguity'];
  const templates = {
    paraphrase: ['rust closes when joining a server', 'the loader vanishes as soon as I open it', 'payment went through but no delivery'],
    typo_or_slang: ['rst nfa crash loadin wrld', 'ldr closes insta after reinstall', 'paid but no acc yet'],
    negation: ['my Rust graphics are not high and it still crashes loading the world', 'the loader is not closing; it is stuck at zero', 'I am not asking about stock, I need my order status'],
    already_tried: ['I already lowered Rust graphics and closed background apps but server loading still crashes', 'I already installed WebView and the loader still exits', 'I already restarted the loader and it remains stuck'],
    product_isolation: ['Ancient Rust requirements only', 'Exodus Rust requirements only', 'does Exodus R6X need the Ancient Rust setup'],
    variant_isolation: ['requirements for the 1 day Ancient Rust variant', 'does the 30 day Exodus Rust variant differ', 'I bought the 7 day variant not the 1 day one'],
    account_model_isolation: ['is NFA the same as full access', 'I need ownership control should I buy NFA', 'this is a manual Fortnite service not an NFA account'],
    dynamic_state: ['where is my order right now', 'is Ancient Rust in stock today', 'what is my current wallet balance'],
    multi_turn: ['Rust crashes loading a world; I already said graphics are low', 'loader closes; WebView is already installed', 'payment succeeded; my order reference is already in the previous message'],
    ambiguity: ['Ancient is not working', 'I need help with Exodus', 'the spoofer has an issue']
  };
  const caseFor = (family, index) => {
    if (family === 'paraphrase' || family === 'typo_or_slang') return ['case.rust.nfa.server_load_crash', 'case.loader.closes.webview', 'case.payment.completed_fulfillment_pending'][index % 3];
    if (family === 'negation') return ['case.rust.nfa.server_load_crash.continue', 'case.loader.connection_failure', 'case.order.current_state'][index % 3];
    if (family === 'already_tried' || family === 'multi_turn') return ['case.rust.nfa.server_load_crash.continue', 'case.loader.closes.webview', 'case.payment.completed_fulfillment_pending'][index % 3];
    if (family === 'product_isolation' || family === 'variant_isolation') return 'case.product.requirements';
    if (family === 'account_model_isolation') return 'case.account_model.choose';
    if (family === 'dynamic_state') return ['case.order.current_state', 'case.catalog.current_stock_or_status', 'case.order.current_state'][index % 3];
    return 'case.product.requirements';
  };
  const records = [];
  for (const family of families) for (let index = 0; index < 30; index += 1) {
    const query = `${templates[family][index % 3]}${index < 3 ? '' : ` (support wording ${index + 1})`}`;
    const caseId = caseFor(family, index);
    const dynamicLookupIds = family === 'dynamic_state' ? [['dynamic.order.status'], ['dynamic.catalog.stock'], ['dynamic.user.overview']][index % 3] : [];
    const entityIds = family === 'account_model_isolation' ? [['account_model.nfa', 'account_model.full_access'], ['account_model.nfa'], ['account_model.manual_service']][index % 3] : family === 'product_isolation' ? [['product.ancient.rust'], ['product.exodus.rust'], ['product.exodus.r6x', 'product.ancient.rust']][index % 3] : [];
    records.push({
      id: `eval.${family}.${String(index + 1).padStart(2, '0')}`,
      query,
      conversationContext: family === 'multi_turn' ? [{ role: 'customer', content: index % 3 === 0 ? 'My graphics are low.' : index % 3 === 1 ? 'WebView is installed.' : 'I supplied the order reference.' }] : [],
      expected: {
        entityIds,
        caseIds: [caseId],
        acceptableCaseIds: family === 'already_tried' && index % 3 === 0 ? ['case.rust.nfa.server_load_crash.continue'] : [],
        policyIds: family === 'account_model_isolation' ? ['policy.account_models.distinct'] : [],
        dynamicLookupIds,
        mustIncludeClaims: family === 'negation' && index % 3 === 0 ? ['continue diagnosis because graphics are already low'] : [],
        mustNotIncludeClaims: family === 'product_isolation' ? ['requirements from a sibling product'] : family === 'account_model_isolation' ? ['NFA and Full Access are interchangeable'] : [],
        diagnosticIds: family === 'paraphrase' && index % 3 === 0 ? ['diagnostic.rust.graphics_level', 'diagnostic.system.available_resources'] : [],
        escalation: family === 'ambiguity'
      },
      sourceTranscriptIds: [],
      behaviorFamily: family
    });
  }
  return records;
}

async function writeMarkdownGraph(canonicalDir, entities, cases, nodes, policies, contradictions, requirements, compatibility) {
  const dirs = ['Catalog', 'Games', 'Vendors', 'Products', 'Variants', 'Account-Models', 'Account-Listings', 'Cases', 'Symptoms', 'Causes', 'Diagnostics', 'Procedures', 'Outcomes', 'Policies', 'Exceptions', 'Requirements', 'Compatibility', 'Dynamic', 'Escalations', 'Restricted', 'Audit', 'Evaluation'];
  for (const dir of dirs) await mkdir(join(canonicalDir, dir), { recursive: true });
  const note = async (dir, id, title, links = []) => {
    const linkText = links.map((link) => `- [[${link}]]`).join('\n');
    await writeFile(join(canonicalDir, dir, `${id}.md`), `---\nid: ${id}\n---\n\n# ${title}\n${linkText ? `\n${linkText}\n` : ''}`);
  };
  const entityDir = { game: 'Games', vendor: 'Vendors', product: 'Products', variant: 'Variants', account_model: 'Account-Models', account_listing: 'Account-Listings', category: 'Catalog' };
  for (const entity of entities) await note(entityDir[entity.type] ?? 'Catalog', entity.id, entity.displayName, entity.relationships.map((item) => item.targetId));
  for (const item of cases) await note('Cases', item.id, item.displayName, unique([...item.recognition.symptomIds, ...item.possibleCauseIds, ...item.diagnosticIds, ...item.resolutionFlow.map((flow) => flow.procedureId), ...item.policyIds, ...item.parentCaseIds, ...item.specializesCaseIds, ...item.relatedCaseIds, item.onSuccessCaseId, item.onFailureCaseId, ...item.requiresClarificationCaseIds, ...item.escalationIds]));
  for (const [key, dir] of [['symptoms', 'Symptoms'], ['causes', 'Causes'], ['diagnostics', 'Diagnostics'], ['procedures', 'Procedures'], ['outcomes', 'Outcomes']]) for (const item of nodes[key]) await note(dir, item.id, item.displayName ?? item.question);
  for (const item of policies) await note('Policies', item.id, item.displayName, item.exceptionIds);
  await note('Exceptions', 'exception.historical_discretionary_remedy', 'Historical discretionary remedy (not current entitlement)');
  for (const item of requirements) await note('Requirements', item.id, item.displayName, [item.productId]);
  for (const item of compatibility) await note('Compatibility', item.id, item.displayName, [item.productId, item.requirementId]);
  for (const item of contradictions) await note('Audit', item.id, item.topic ?? item.id);
  for (const item of [{ id: 'escalation.entity_ambiguous', title: 'Entity ambiguity escalation' }, { id: 'escalation.known_flow_exhausted', title: 'Known safe flow exhausted' }, { id: 'escalation.visual_required', title: 'Visual review required' }, { id: 'escalation.policy_conflict', title: 'Current policy conflict' }]) await note('Escalations', item.id, item.title);
  await writeFile(join(canonicalDir, '00 - Canonical Support Knowledge.md'), `---\ntype: map-of-content\nversion: ${VERSION}\n---\n\n# Canonical Support Knowledge\n\n- [[Catalog/00 - Catalog]]\n- [[Cases/00 - Cases]]\n- [[Policies/00 - Policies]]\n- [[Audit/00 - Audit]]\n`);
  await writeFile(join(canonicalDir, 'Catalog', '00 - Catalog.md'), '# Catalog\n');
  await writeFile(join(canonicalDir, 'Cases', '00 - Cases.md'), `# Cases\n\n${cases.map((item) => `- [[${item.id}]]`).join('\n')}\n`);
  await writeFile(join(canonicalDir, 'Policies', '00 - Policies.md'), `# Policies\n\n${policies.map((item) => `- [[${item.id}]]`).join('\n')}\n`);
  await writeFile(join(canonicalDir, 'Audit', '00 - Audit.md'), '# Audit\n');
}

export async function buildCanonicalSupportKb(dataDir) {
  const canonicalDir = join(dataDir, 'knowledge-canonical');
  const runtimeDir = join(dataDir, 'runtime-kb');
  const snapshotPath = join(canonicalDir, 'Audit', 'current-domain-snapshot.json');
  const snapshot = await readJson(snapshotPath);
  const historicalFacts = await loadHistoricalFacts(dataDir);
  const historicalContradictions = await loadHistoricalContradictions(dataDir);
  const entities = currentEntities(snapshot);
  const productDir = join(dataDir, 'knowledge-deep', 'Products');
  const gameDir = join(dataDir, 'knowledge-deep', 'Games');
  const historicalLabels = [];
  for (const dir of [productDir, gameDir]) for (const name of await readdir(dir)) if (name.endsWith('.md') && !name.startsWith('00 -')) historicalLabels.push(basename(name, '.md'));
  const entityResolution = historicalLabels.sort().map((label) => historicalEntityResolution(label, entities));
  const { canonicalFacts, dispositions } = canonicalizeFacts(historicalFacts, entities);
  const nodes = buildSemanticNodes(historicalFacts);
  const contradictions = historicalContradictions.map((item, index) => ({
    id: item.id ?? `contradiction.historical.${String(index + 1).padStart(3, '0')}`,
    subjectIds: [],
    claims: [
      { claimId: `${item.id ?? `contradiction.${index + 1}`}.a`, statement: item.sideA?.claim ?? item.claims?.[0]?.statement ?? 'Historical claim A', sourceIds: item.sideA?.sources ?? item.claims?.[0]?.sourceIds ?? [] },
      { claimId: `${item.id ?? `contradiction.${index + 1}`}.b`, statement: item.sideB?.claim ?? item.claims?.[1]?.statement ?? 'Historical claim B', sourceIds: item.sideB?.sources ?? item.claims?.[1]?.sourceIds ?? [] }
    ],
    resolutionState: 'unresolved', resolution: null, resolutionSources: [], topic: item.topic ?? item.id
  }));
  const policies = buildPolicies(snapshot, contradictions);
  const dynamicLookups = buildDynamicLookups();
  const synthesis = await synthesizeSupportCoverage(dataDir, entities, historicalFacts, dispositions);
  const cases = synthesis.cases;
  const rustCase = cases.find((item) => item.id === 'case.rust.nfa.server_load_crash');
  if (rustCase) {
    rustCase.diagnosticIds = ['diagnostic.rust.graphics_level', 'diagnostic.system.available_resources'];
    rustCase.possibleCauseIds = ['cause.rust.server_load_resource_pressure'];
    rustCase.resolutionFlow = [{ when: ['graphicsLevel=high'], procedureId: 'procedure.system.reduce_resource_pressure', onSuccess: 'outcome.resolved', onFailure: 'case.rust.nfa.server_load_crash.continue' }];
    rustCase.relatedCaseIds = ['case.rust.nfa.server_load_crash.continue'];
    rustCase.onFailureCaseId = 'case.rust.nfa.server_load_crash.continue';
  }
  const aliases = runtimeAliases(snapshot, cases);
  const queries = synthesis.historicalUtteranceGold;
  const requirements = snapshot.staticRequirements.map((item) => ({ id: `requirement.${item.productId.slice('product.'.length)}`, displayName: `${entities.find((entity) => entity.id === item.productId)?.displayName ?? item.productId} current requirements`, productId: item.productId, claims: item.requirements, truthLayer: 'L1_CURRENT_AUTHORITATIVE', validity: { state: 'current', lastObservedAt: snapshot.capturedAt }, provenance: { sourceClass: 'current_authoritative', sourceCount: 1, currentSourceRefs: [`cm.public.path.${slug(item.sourcePath)}`], transcriptIds: [], historicalFactIds: [], contradictionIds: [] } }));
  const compatibility = requirements.map((item) => ({ id: `compatibility.${item.productId.slice('product.'.length)}.documented`, displayName: `${item.displayName} compatibility boundary`, productId: item.productId, requirementId: item.id, rule: 'Compatibility is limited to the exact current product requirements; do not inherit across sibling products or variants.', provenance: item.provenance }));

  await writeJson(join(canonicalDir, 'Audit', 'entities.json'), { schemaVersion: 1, generatedAt: new Date().toISOString(), entities });
  await writeJsonl(join(canonicalDir, 'Audit', 'entity-resolution.jsonl'), entityResolution);
  await writeJsonl(join(canonicalDir, 'Audit', 'canonical-facts.jsonl'), canonicalFacts);
  await writeJsonl(join(canonicalDir, 'Audit', 'fact-disposition.jsonl'), dispositions);
  await writeJsonl(join(canonicalDir, 'Audit', 'case-coverage.jsonl'), synthesis.caseCoverage);
  await writeJsonl(join(canonicalDir, 'Audit', 'fact-runtime-usage.jsonl'), synthesis.factRuntimeUsage);
  await writeJson(join(canonicalDir, 'Audit', 'canonical-graph.json'), { schemaVersion: 2, symptoms: nodes.symptoms, causes: nodes.causes, diagnostics: nodes.diagnostics, procedures: nodes.procedures, outcomes: nodes.outcomes, policies, exceptions: [{ id: 'exception.historical_discretionary_remedy', displayName: 'Historical discretionary remedy', currentEntitlement: false }], requirements, compatibility, contradictions, cases });
  await writeJson(join(canonicalDir, 'Audit', 'residual-case-analysis.json'), synthesis.residualAnalysis);
  await writeJson(join(canonicalDir, 'Audit', 'historical-utterance-gold-distribution.json'), synthesis.goldDistribution);
  const dispositionCounts = Object.fromEntries([...new Set(dispositions.map((item) => item.disposition))].sort().map((key) => [key, dispositions.filter((item) => item.disposition === key).length]));
  await writeJson(join(canonicalDir, 'Audit', 'canonicalization-summary.json'), { schemaVersion: 3, generatedAt: new Date().toISOString(), inputHistoricalFacts: historicalFacts.length, dispositionRecords: dispositions.length, uniqueOriginalFactIds: new Set(dispositions.map((item) => item.originalFactId)).size, missing: [], duplicates: [], canonicalFacts: canonicalFacts.length, dispositionCounts, entities: entities.length, entityResolutionRecords: entityResolution.length, unresolvedEntityMappings: entityResolution.filter((item) => ['unknown', 'ambiguous'].includes(item.resolution)).length, contradictionSets: contradictions.length, cases: cases.length, ticketCoverageRecords: synthesis.caseCoverage.length, factRuntimeUsageRecords: synthesis.factRuntimeUsage.length, historicalRuleHoldoutQueries: synthesis.historicalRuleHoldout.length, historicalUtteranceGoldQueries: synthesis.historicalUtteranceGold.length, statefulConversations: synthesis.statefulConversations.length, adversarialQueries: synthesis.adversarial.length });
  await writeJson(join(canonicalDir, 'Audit', 'build-state.json'), { schemaVersion: 3, checkpoint: 'stateful-independent-gold-remediation-generated', status: 'generated_pending_validation', completed: ['preserved-first-pass-foundation', 'complete-ticket-ledger-ingestion', 'corpus-derived-case-synthesis', 'ticket-case-coverage-ledger', 'fact-runtime-usage-ledger', 'historical-rule-holdout', 'independent-literal-customer-gold', 'residual-case-review', 'stateful-conversations', 'case-transition-graph', 'separate-adversarial-set', 'runtime-pack'] });
  await rm(join(canonicalDir, 'Evaluation', 'historical-holdout.jsonl'), { force: true });
  await writeJsonl(join(canonicalDir, 'Evaluation', 'historical-rule-holdout.jsonl'), synthesis.historicalRuleHoldout);
  await writeJsonl(join(canonicalDir, 'Evaluation', 'historical-utterance-gold.jsonl'), synthesis.historicalUtteranceGold);
  await writeJsonl(join(canonicalDir, 'Evaluation', 'stateful-conversations.jsonl'), synthesis.statefulConversations);
  await writeJsonl(join(canonicalDir, 'Evaluation', 'adversarial-behavior.jsonl'), synthesis.adversarial);
  await writeJsonl(join(canonicalDir, 'Evaluation', 'queries.jsonl'), synthesis.historicalUtteranceGold);
  await writeMarkdownGraph(canonicalDir, entities, cases, nodes, policies, contradictions, requirements, compatibility);

  await mkdir(runtimeDir, { recursive: true });
  const productProfiles = snapshot.products.map((product) => ({ id: product.id, displayName: product.displayName, gameId: product.gameId ?? null, vendorId: product.vendorId, categoryIds: [product.categoryId], variantIds: product.durations.map((duration) => `variant.${product.id.slice('product.'.length)}.${slug(duration)}`), accountModelIds: [], currentStaticAttributes: {}, dynamicAttributeIds: ['dynamic.catalog.price', 'dynamic.catalog.stock', 'dynamic.catalog.product_status'], caseIds: ['case.product.requirements'], policyIds: [], requirementIds: snapshot.staticRequirements.filter((item) => item.productId === product.id).map((item) => `requirement.${product.id.slice('product.'.length)}`), compatibilityIds: [] }));
  const runtimeCases = cases.map((item) => {
    let dynamic = [];
    if (item.runtimeDisposition === 'dynamic_lookup_case') {
      dynamic = item.family.startsWith('commerce.order') ? ['dynamic.order.status'] : item.family.startsWith('commerce.fulfillment') ? ['dynamic.fulfillment.status'] : item.family.startsWith('commerce.aura') || item.family.startsWith('commerce.wallet') ? ['dynamic.user.overview'] : item.family.startsWith('catalog') ? ['dynamic.catalog.product_status'] : ['dynamic.purchase_intent.status'];
    }
    return { id: item.id, displayName: item.displayName, family: item.family, scope: item.scope, match: { phrases: item.recognition.phrases.slice(0, 12), symptoms: item.recognition.symptomIds, errors: item.recognition.errorSignals, context: item.recognition.contextSignals.slice(0, 5) }, ask: item.diagnosticIds, causes: item.possibleCauseIds, flow: item.resolutionFlow, policies: item.policyIds, dynamic, parentCaseIds: item.parentCaseIds, specializesCaseIds: item.specializesCaseIds, relatedCaseIds: item.relatedCaseIds, onSuccessCaseId: item.onSuccessCaseId, onFailureCaseId: item.onFailureCaseId, requiresClarificationCaseIds: item.requiresClarificationCaseIds, escalationIds: item.escalationIds, escalate: item.escalateWhen, confidence: item.confidence, canonicalRefs: [item.id], provenance: { transcriptEvidenceCount: item.provenance.transcriptIds.length, historicalFactCount: item.provenance.historicalFactIds.length, sampleTranscriptIds: item.provenance.transcriptIds.slice(0, 1), sampleHistoricalFactIds: item.provenance.historicalFactIds.slice(0, 2) } };
  });
  await writeJson(join(runtimeDir, 'catalog.json'), { schemaVersion: 1, games: snapshot.games, vendors: snapshot.vendors, categories: snapshot.categories, accountModels: snapshot.accountModels, accountListings: snapshot.accountListings });
  await writeJson(join(runtimeDir, 'aliases.json'), aliases);
  await writeJson(join(runtimeDir, 'product-profiles.json'), productProfiles);
  await writeJsonl(join(runtimeDir, 'cases.jsonl'), runtimeCases);
  await writeJson(join(runtimeDir, 'procedures.json'), nodes.procedures);
  await writeJson(join(runtimeDir, 'policies.json'), policies);
  await writeJson(join(runtimeDir, 'routing.json'), { schemaVersion: 1, levels: [{ level: 0, use: 'greetings and acknowledgements' }, { level: 1, use: 'exact alias and direct policy' }, { level: 2, use: 'normal scoped case retrieval' }, { level: 3, use: 'ambiguous or multipart support' }, { level: 4, use: 'conflicting, restricted, or low-confidence support' }], caseRoutes: runtimeCases.map((item) => ({ caseId: item.id, dynamicLookupIds: item.dynamic, escalation: item.escalate.length > 0 })) });
  await writeJson(join(runtimeDir, 'dynamic-lookups.json'), dynamicLookups);
  await writeJson(join(runtimeDir, 'escalations.json'), [{ id: 'escalation.entity_ambiguous', trigger: 'Material entity ambiguity changes the answer.', action: 'Ask targeted disambiguation or route to human support.' }, { id: 'escalation.known_flow_exhausted', trigger: 'Safe evidence-backed procedure flow is exhausted.', action: 'Escalate with attempted steps and outcomes.' }, { id: 'escalation.visual_required', trigger: 'Unseen attachment is required for diagnosis.', action: 'Request human visual review.' }, { id: 'escalation.policy_conflict', trigger: 'Current policy is unavailable and historical handling conflicts.', action: 'Escalate without promising a remedy.' }]);
  await writeJson(join(runtimeDir, 'restricted-topics.json'), [{ id: 'restricted.anti_cheat_bypass', recognition: ['anti-cheat bypass', 'detection evasion', 'injection internals', 'kernel or driver bypass', 'spoofing bypass internals'], safeContext: ['exact product identity', 'ordinary operating-system context', 'customer-visible error'], prohibited: ['autonomous operational bypass instructions', 'optimized evasion sequence'], escalationId: 'escalation.known_flow_exhausted' }]);
  const runtimeFiles = ['catalog.json', 'aliases.json', 'product-profiles.json', 'cases.jsonl', 'procedures.json', 'policies.json', 'routing.json', 'dynamic-lookups.json', 'escalations.json', 'restricted-topics.json'];
  let runtimeBytes = 0; for (const name of runtimeFiles) runtimeBytes += (await stat(join(runtimeDir, name))).size;
  await writeJson(join(runtimeDir, 'manifest.json'), { schemaVersion: 2, knowledgeVersion: VERSION, generatedAt: new Date().toISOString(), sourceDomainSnapshotAt: snapshot.capturedAt, counts: { entities: entities.length, products: snapshot.products.length, variants: entities.filter((item) => item.type === 'variant').length, cases: runtimeCases.length, procedures: nodes.procedures.length, policies: policies.length, aliases: aliases.length, dynamicLookups: dynamicLookups.length }, retrieval: { method: 'stateful-transition-first+exact-alias+scope-specificity+bm25+local-character-trigram', topK: 5 }, evaluation: { datasetVersion: VERSION, literalGoldQueryCount: queries.length, statefulConversationCount: synthesis.statefulConversations.length }, privacy: { rawTranscriptProse: false, customerPii: false }, runtimeBytes });
  await writeFile(join(canonicalDir, 'README.md'), '# Canonical CM Support Knowledge\n\nGenerated from the immutable historical evidence layer under the normative knowledge-engineering specifications. Machine IDs and JSON/JSONL relations are authoritative. Historical evidence remains unchanged.\n');
  return { historicalFacts: historicalFacts.length, dispositions: dispositions.length, canonicalFacts: canonicalFacts.length, entities: entities.length, cases: cases.length, queries: queries.length, runtimeBytes };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) { process.stdout.write('Usage: node build-canonical-support-kb.mjs --data-dir <CM-Ticket-Transcripts>\n'); return; }
  const result = await buildCanonicalSupportKb(options.dataDir);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => { process.stderr.write(`${error.stack ?? error.message}\n`); process.exitCode = 1; });

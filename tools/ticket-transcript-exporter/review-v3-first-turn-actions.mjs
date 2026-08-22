import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAliasIndex, resolveAliases } from './evaluate-canonical-support-retrieval.mjs';

const STAFF_OR_NON_ISSUE = new Set([
  'first-turn-candidate.1300','first-turn-candidate.1318','first-turn-candidate.1410','first-turn-candidate.1268','first-turn-candidate.1343','first-turn-candidate.1261','first-turn-candidate.1419','first-turn-candidate.1264','first-turn-candidate.1505','first-turn-candidate.0681','first-turn-candidate.1289','first-turn-candidate.1374','first-turn-candidate.1546','first-turn-candidate.1342','first-turn-candidate.1077','first-turn-candidate.1418','first-turn-candidate.1305','first-turn-candidate.1006','first-turn-candidate.0323','first-turn-candidate.1398','first-turn-candidate.1356','first-turn-candidate.1322','first-turn-candidate.1389','first-turn-candidate.1534','first-turn-candidate.1411','first-turn-candidate.1447','first-turn-candidate.1450','first-turn-candidate.0082','first-turn-candidate.1522','first-turn-candidate.0974','first-turn-candidate.0995','first-turn-candidate.1432','first-turn-candidate.1440','first-turn-candidate.1307','first-turn-candidate.0556','first-turn-candidate.1433','first-turn-candidate.1192','first-turn-candidate.0023','first-turn-candidate.257'
]);

const unique = (values) => [...new Set((values ?? []).filter(Boolean))];
const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));
const readJsonl = async (file) => (await readFile(file, 'utf8')).split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
const normalized = (value) => String(value ?? '').toLowerCase().replace(/[’']/gu, '').replace(/\s+/gu, ' ').trim();

function entitiesFor(query, aliasIndex) {
  return unique(resolveAliases(query, aliasIndex).flatMap((match) => match.targetIds).filter((id) => /^(?:game|vendor|product|variant|account_model|account_listing)\./u.test(id)));
}

function reviewed(value) {
  const action = {
    direct_static_case: 'answer_case', direct_dynamic_lookup: 'request_dynamic_lookup', direct_policy_route: 'request_policy_route',
    direct_attachment_route: 'request_attachment', direct_restricted_escalation: 'restricted_escalation', direct_support_operation: 'support_operation',
    family_scoped_clarification: 'ask_clarification', entity_scoped_clarification: 'ask_clarification', generic_clarification: 'ask_clarification',
    multi_intent_route: 'multi_intent_route', human_escalation: 'human_escalation'
  }[value.primaryDecision];
  return { goldStatus: 'reviewed', labelMethod: 'independent_semantic_review_first_turn_decision', action, ...value };
}

function exact(caseId, family, reason) {
  return reviewed({ inferability: 'exact_case', informationSufficiency: 'sufficient_information', primaryDecision: 'direct_static_case', observableCaseIds: [caseId], observableFamilyIds: [family], clarificationId: null, lookupIds: [], decisionReason: reason });
}

function control(primaryDecision, caseIds, familyIds, lookupIds, reason) {
  return reviewed({ inferability: 'control_plane_only', informationSufficiency: 'sufficient_for_control_plane_action', primaryDecision, observableCaseIds: caseIds, observableFamilyIds: familyIds, clarificationId: null, lookupIds, decisionReason: reason });
}

function clarify(inferability, primaryDecision, clarificationId, caseIds, familyIds, reason) {
  return reviewed({ inferability, informationSufficiency: 'insufficient_information', primaryDecision, observableCaseIds: caseIds, observableFamilyIds: familyIds, clarificationId, lookupIds: [], decisionReason: reason });
}

function semanticDecision(query, entityIds) {
  const text = normalized(query); const has = (pattern) => pattern.test(text);
  const nfa = has(/\bnfa\b/u) || entityIds.includes('account_model.nfa');
  const loader = has(/\b(?:loader|loder|loadder)\b/u);
  const payment = has(/\b(?:paid|payed|payment|card|paypal|crypto|btc|giftcard|checkout|stripe|venmo)\b/u);
  const order = has(/\b(?:order|key|delivery|fulfill|account token)\b/u);

  if (has(/\b(?:paid|payment|order|key)\b/u) && has(/\b(?:and|also)\b/u) && has(/\b(?:nfa|loader|invalid|banned|spoofer)\b/u)) return reviewed({ inferability: 'multi_intent', informationSufficiency: 'mixed_information', primaryDecision: 'multi_intent_route', observableCaseIds: [], observableFamilyIds: ['commerce.payment','accounts.nfa'], observableEntityIds: entityIds, clarificationId: null, lookupIds: [], decisionReason: 'Two independent support intents are explicit.' });
  if (has(/\b(?:failed to load driver|bypass|evade|evasion|unban|inject(?:ion)?)\b/u)) return control('direct_restricted_escalation',['case.restricted.technical'],['restricted.technical'],[],'The request enters the restricted technical boundary.');
  if (has(/\b(?:reported.*phishing|reversed.*program|reported.*token)\b/u)) return control('human_escalation',[],['support.security'],[],'The message alleges a security incident requiring human review.');
  if (has(/\b(?:refund|cancel|replacement|replace|wrong account|wrong delivery|charged twice|processed twice)\b/u)) return control('direct_policy_route',[],['commerce.policy'],[],'A current-authority remedy or dispute is explicit.');
  if (has(/\b(?:dont close|do not close|close ticket)\b/u)) return control('direct_support_operation',['case.support.followup'],['support.operations'],[],'The customer explicitly requests a ticket operation.');
  if (has(/\b(?:aura)\b/u)) return control('direct_dynamic_lookup',['case.aura.balance_or_adjustment'],['commerce.aura'],['aura.lookup.read'],'Aura requires current user state.');
  if (payment && has(/\b(?:not arrive|didnt receive|not received|isnt going|not going|wont work|doesnt work|issue|paid|payed|charged|declin|disabled|paypal|giftcard|manual action|required|processor|confirmed|detecting)\b/u)) return control('direct_dynamic_lookup',[],['commerce.payment'],['purchase-intents.lookup.read','purchase-intents.process.status.read'],'Current payment or purchase-intent state is required.');
  if (order && has(/\b(?:need|where|check|didnt get|did not get|not received|manual|generate|order id|paid already|account token|login)\b/u)) return control('direct_dynamic_lookup',[],['commerce.order','commerce.fulfillment'],['orders.lookup.read','orders.details.read','orders.fulfillment.read'],'Current order or fulfillment state is required.');
  if (has(/\b(?:stock|working|works?|ud rn|back up|status|available|lifetime|how long)\b/u) && has(/\b(?:cheat|spoofer|nfa|account|exodus|product|pubg|fortnite|rust)\b/u)) return control('direct_dynamic_lookup',['case.catalog.availability_status'],['catalog.dynamic'],['dynamic.catalog.product_status'],'The answer depends on current catalog status or availability.');

  if (has(/\b(?:make|do|provide) media|media (?:creator|on tiktok)|u search media|looking for.*media\b/u)) return exact('case.media.application','business.media','The first message explicitly proposes media work.');
  if (has(/\b(?:rebrand|branded|resell your|resell.*nfa|cooperate|cooperation|discord payment bot)\b/u)) return exact('case.reseller.application','business.reseller','The first message explicitly proposes resale, branding, or partnership.');
  if (has(/\b(?:compatible|work on controller|work with controller)\b/u)) return exact('case.product.compatibility','product.compatibility','The compatibility question is explicit.');
  if (has(/\b(?:hwid reset)\b/u)) return exact('case.spoofer.hwid_state','technical.spoofer','The request explicitly asks for an HWID reset.');
  if (has(/\b(?:spoofer|spoof)\b/u) && has(/\b(?:perm or temp|permanent or temporary|temp spoofer|temporary spoofer)\b/u)) return exact('case.catalog.pricing_duration','catalog.commercial','The customer explicitly asks about spoofer duration.');
  if (has(/\b(?:where|how)\b.{0,20}\b(?:config|guide|start)\b/u)) return exact('case.product.requirements','product.requirements','The setup or guide request is explicit.');
  if (nfa && has(/\b(?:redeem|activate|activation|token.*(?:put|import)|where.*token)\b/u)) return exact('case.nfa.redemption_activation','accounts.nfa','NFA redemption or activation is explicit.');
  if (nfa && has(/\b(?:owner|someone else|kicked|logged out|signed out)\b/u)) return exact('case.nfa.owner_session_conflict','accounts.nfa','NFA owner/session conflict is explicit.');
  if (nfa && has(/\b(?:worked (?:yesterday|before)|use to work|used to work|was working fine)\b/u)) return exact('case.nfa.invalid_after_use','accounts.nfa','The account worked before and later failed.');
  if (nfa && has(/\b(?:just bought|first time)\b/u) && has(/\b(?:locked|invalid|doesnt work|dont work|not opening)\b/u)) return exact('case.nfa.invalid_first_use','accounts.nfa','First-use NFA invalidity is explicit.');
  if (nfa && has(/\b(?:how long|longer lasting|kicked out while|what.*nfa|hacking account)\b/u)) return exact('case.nfa.access_model_question','accounts.nfa','The NFA access model is the explicit question.');
  if (loader && has(/\b(?:doesnt open|dont open|not open|wont open|closed|closes)\b/u)) return exact('case.loader.closes_runtime','technical.loader','The loader close/open failure is explicit.');
  if (loader && has(/\b(?:download|link|browser.*block)\b/u)) return exact('case.loader.update','technical.loader','The loader download/update stage is explicit.');
  if (loader && has(/\b(?:defender.*(?:on|off))\b/u)) return exact('case.product.requirements','product.requirements','A named prerequisite state is explicit.');
  if (loader) return clarify('family_only','family_scoped_clarification','clarify.loader.failure_stage',['case.loader.closes_runtime','case.loader.connection','case.loader.update','case.loader.key_error'],['technical.loader'],'The loader is known but the discriminating failure stage is missing.');
  if (nfa) return clarify('family_only','family_scoped_clarification','clarify.nfa.failure_stage',['case.nfa.invalid_first_use','case.nfa.invalid_after_use','case.nfa.owner_session_conflict','case.nfa.redemption_activation'],['accounts.nfa'],'NFA is known but the failure stage is missing.');
  if (payment) return clarify('family_only','family_scoped_clarification','clarify.payment_state',[],['commerce.payment'],'A payment surface is known but its current state is not.');
  if (order) return clarify('family_only','family_scoped_clarification','clarify.order.fulfillment_state',[],['commerce.order','commerce.fulfillment'],'An order surface is known but the request or state is unclear.');
  if (has(/\b(?:spoofer|cheat|game|launch|menu|open|bsod|crash|error|not working|doesnt work|dont work|wont work)\b/u)) return clarify('family_only','family_scoped_clarification','clarify.technical.failure_stage',[],['technical.product','technical.game'],'A technical surface is present but the failure stage is underdetermined.');
  if (entityIds.length) return clarify('entity_only','entity_scoped_clarification','clarify.support_surface',[],[],'An entity is observable but the support request is not.');
  return clarify('insufficient_context','generic_clarification','clarify.support_surface',[],[],'The verified first message does not contain enough information for a safe case or control action.');
}

export async function reviewV3(dataDir) {
  const manifest = await readJson(path.join(dataDir, 'knowledge-canonical', 'Audit', 'router-v3-holdout-manifest.json'));
  const candidates = await readJsonl(path.join(dataDir, 'knowledge-canonical', 'Audit', 'first-turn-authorship-candidates.jsonl'));
  const aliasIndex = buildAliasIndex(await readJson(path.join(dataDir, 'runtime-kb', 'aliases.json')));
  const byTranscript = new Map(candidates.map((record) => [record.sourceTranscriptId, record]));
  const output = manifest.records.map((entry, index) => {
    const candidate = byTranscript.get(entry.sourceTranscriptId);
    if (!candidate) throw new Error(`Missing frozen V3 candidate ${entry.sourceTranscriptId}`);
    const provenance = { sourceTranscriptIds: [candidate.sourceTranscriptId], sourceTicketNumbers: [candidate.sourceTicketNumber], candidateId: candidate.id };
    if (STAFF_OR_NON_ISSUE.has(candidate.id)) return { id: `first-turn-action-v3.${String(index + 1).padStart(4, '0')}`, query: candidate.query, ...provenance, goldStatus: 'needs_review', labelMethod: 'independent_semantic_review_first_turn_decision', reviewReason: 'The isolated message appears staff/system-authored or is not a meaningful customer support issue; it is excluded from metrics.' };
    const entityIds = entitiesFor(candidate.query, aliasIndex);
    const decision = semanticDecision(candidate.query, entityIds);
    return { id: `first-turn-action-v3.${String(index + 1).padStart(4, '0')}`, query: candidate.query, ...provenance, ...decision, observableEntityIds: entityIds, eventualCaseId: candidate.candidateCaseIds?.[0] ?? null, eventualDisposition: candidate.runtimeDisposition, reviewReason: decision.decisionReason };
  });
  const target = path.join(dataDir, 'knowledge-canonical', 'Evaluation', 'historical-first-turn-action-v3.jsonl');
  await writeFile(target, `${output.map((row) => JSON.stringify(row)).join('\n')}\n`, 'utf8');
  const reviewedRows = output.filter((row) => row.goldStatus === 'reviewed');
  return { selected: output.length, reviewed: reviewedRows.length, needsReview: output.length - reviewedRows.length, primaryDecisions: Object.fromEntries([...reviewedRows.reduce((map, row) => map.set(row.primaryDecision, (map.get(row.primaryDecision) ?? 0) + 1), new Map())].sort()) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const index = process.argv.indexOf('--data-dir');
  if (index < 0 || !process.argv[index + 1]) throw new Error('--data-dir is required');
  console.log(JSON.stringify(await reviewV3(path.resolve(process.argv[index + 1])), null, 2));
}

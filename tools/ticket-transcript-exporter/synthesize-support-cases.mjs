import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const DISPOSITIONS = new Set(['answerable_case', 'dynamic_lookup_case', 'clarification_case', 'restricted_escalation', 'policy_escalation', 'unresolved_escalation', 'attachment_required', 'historical_only_no_current_action', 'no_runtime_knowledge']);

const RULES = [
  ['case.rust.nfa.server_load_crash.continue', 'Rust NFA server-load crash after resource steps fail', 'technical.rust_nfa', 'clarification_case', /rust.*nfa.*(graphics.*low|already.*(lower|close|free)|still.*crash).*(load|server|world)|rust.*nfa.*(load|server|world).*(graphics.*low|still.*crash)/],
  ['case.rust.nfa.server_load_crash', 'Rust NFA crashes while loading a server or world', 'technical.rust_nfa', 'answerable_case', /rust.*nfa.*(crash|close|freeze).*(load|join|server|world)|rust.*nfa.*(load|join|server|world).*(crash|close|freeze)/],
  ['case.nfa.invalid_first_use', 'NFA invalid or locked at first use', 'accounts.nfa', 'policy_escalation', /\bnfa\b.*(first use|never work|arrived|received|delivery).*(invalid|locked|ban|not work)|(?:invalid|locked|ban).*\bnfa\b.*(first|arriv|receiv)/],
  ['case.nfa.invalid_after_use', 'NFA became invalid after prior use', 'accounts.nfa', 'policy_escalation', /\bnfa\b.*(worked|used|day|later|after).*(invalid|locked|reclaim|password|ban)/],
  ['case.nfa.owner_session_conflict', 'NFA owner or session conflict', 'accounts.nfa', 'clarification_case', /\bnfa\b.*(owner|session|logged|login|password|kick|device|steam guard)/],
  ['case.nfa.redemption_activation', 'NFA redemption or activation help', 'accounts.nfa', 'answerable_case', /\bnfa\b.*(redeem|activat|token|loader|claim|launch)/],
  ['case.nfa.replacement_dispute', 'NFA replacement or refund dispute', 'accounts.nfa', 'policy_escalation', /\bnfa\b.*(replace|replacement|refund|compensat|warranty)/],
  ['case.nfa.access_model_question', 'NFA access and ownership question', 'accounts.nfa', 'answerable_case', /\bnfa\b.*(mean|what is|access|email|ownership|full access|short term)/],
  ['case.account.full_access', 'Full Access account question or problem', 'accounts.full_access', 'answerable_case', /full access.*(account|email|password|owner|login|purchase|change)/],
  ['case.account.manual_service', 'Manual service fulfillment', 'accounts.manual_service', 'clarification_case', /manual service|customer.?owned account|top.?up|v.?bucks.*service|crew service/],
  ['case.account.bulk_purchase', 'Bulk account purchase question', 'accounts.purchase', 'clarification_case', /bulk.*account|multiple accounts|many accounts|wholesale.*account/],
  ['case.account.purchase_question', 'Account purchase or listing question', 'accounts.purchase', 'clarification_case', /(buy|purchase|sell|price|stock).*(account|nfa)|(?:account|nfa).*(buy|purchase|sell|price|stock)/],
  ['case.account.wrong_specification', 'Wrong account or specification delivered', 'accounts.delivery', 'policy_escalation', /wrong (account|hours|region|rank|spec)|hours.*(wrong|missing)|different.*account/],
  ['case.account.banned', 'Delivered or purchased account is banned', 'accounts.delivery', 'policy_escalation', /(account|nfa).*(banned|ban)|banned.*(account|nfa)/],
  ['case.account.login_access', 'Account login or credential access problem', 'accounts.access', 'clarification_case', /(account|credential|email|password).*(login|log in|invalid|not work|access)|cannot.*(account|login)/],
  ['case.payment.card_declined', 'Card payment declined or unavailable', 'commerce.payment', 'dynamic_lookup_case', /(card|stripe).*(declin|fail|unavailable|not work)|payment.*card.*(fail|declin)/],
  ['case.payment.paypal_unavailable', 'PayPal availability or payment problem', 'commerce.payment', 'dynamic_lookup_case', /paypal.*(unavailable|not work|payment|option|declin|fail)/],
  ['case.payment.crypto_pending', 'Crypto payment pending or unconfirmed', 'commerce.payment', 'dynamic_lookup_case', /(crypto|bitcoin|btc|coinbase).*(pending|confirm|delay|not received|payment)/],
  ['case.payment.manual', 'Manual payment coordination', 'commerce.payment', 'policy_escalation', /manual payment|pay manually|bank transfer|cash app|buymeacoffee|buy me a coffee/],
  ['case.payment.completed_missing_order', 'Payment completed but order is missing', 'commerce.payment', 'dynamic_lookup_case', /(paid|payment.*complete|charged).*(no order|not received|nothing|missing)|order.*missing.*(paid|charged)/],
  ['case.payment.failed_or_pending', 'Payment failed or remains pending', 'commerce.payment', 'dynamic_lookup_case', /payment.*(pending|failed|declined|error|stuck)|checkout.*payment.*(fail|error)/],
  ['case.order.fulfillment_delayed', 'Order exists but fulfillment is delayed', 'commerce.fulfillment', 'dynamic_lookup_case', /(order|delivery|fulfillment).*(pending|delay|not received|waiting|missing)|not (delivered|received).*(order|key|account)/],
  ['case.order.wrong_delivery', 'Wrong product, key, or delivery received', 'commerce.fulfillment', 'policy_escalation', /wrong (product|key|delivery|license)|delivered.*wrong/],
  ['case.order.refund_cancel', 'Order refund or cancellation request', 'commerce.policy', 'policy_escalation', /(refund|cancel).*(order|purchase|payment)|order.*(refund|cancel)/],
  ['case.order.status', 'Current order status question', 'commerce.order', 'dynamic_lookup_case', /(where|status|track).*(order|purchase)|order.*(status|where|track)/],
  ['case.wallet.balance', 'Wallet or store balance question', 'commerce.wallet', 'dynamic_lookup_case', /(wallet|store balance|credit balance).*(balance|missing|add|use|transfer)|balance.*(wallet|store)/],
  ['case.aura.balance_or_adjustment', 'Aura balance or adjustment question', 'commerce.aura', 'dynamic_lookup_case', /\baura\b.*(balance|missing|add|remove|adjust|points|reward)/],
  ['case.discount.coupon', 'Discount or coupon question', 'commerce.discount', 'clarification_case', /discount|coupon|promo code|voucher/],
  ['case.dashboard.verification', 'Dashboard or purchase verification', 'website.dashboard', 'dynamic_lookup_case', /dashboard.*(verify|verification|order|purchase|not show|missing)|verify.*purchase/],
  ['case.website.checkout_failure', 'Website checkout failure', 'website.checkout', 'clarification_case', /(website|site|checkout|cart).*(error|fail|not work|stuck|blank)|cannot.*checkout/],
  ['case.website.login', 'Website login or account-link problem', 'website.account', 'clarification_case', /(website|site|dashboard).*(login|log in|account|discord).*(fail|problem|not work|link)|discord.*link.*account/],
  ['case.media.application', 'Media or creator application', 'business.application', 'clarification_case', /media (application|role)|creator application|apply.*media|media.*apply/],
  ['case.reseller.application', 'Reseller or partnership inquiry', 'business.reseller', 'clarification_case', /resell|reseller|partnership|affiliate|sales offer/],
  ['case.catalog.availability_status', 'Current product availability or status', 'catalog.dynamic', 'dynamic_lookup_case', /(stock|restock|available|availability|status|detected|down|updating|working).*(product|cheat|spoofer|account|exodus|ancient|venom)|(?:product|cheat|spoofer|exodus|ancient|venom).*(stock|restock|available|status|detected|down|updating)/],
  ['case.catalog.pricing_duration', 'Product pricing or duration question', 'catalog.commercial', 'dynamic_lookup_case', /(price|cost|duration|day key|week|month|lifetime).*(product|license|key|cheat|spoofer)|(?:product|license|key|cheat|spoofer).*(price|cost|duration)/],
  ['case.product.requirements', 'Exact product requirements', 'product.requirements', 'answerable_case', /requirement|secure boot|virtualization|\baes\b|windows 10|windows 11|ram required|bios setting/],
  ['case.product.compatibility', 'Product compatibility question', 'product.compatibility', 'answerable_case', /compatib|support.*(windows|cpu|gpu|game|version)|work with|raid|rapid storage|integrated gpu/],
  ['case.license.activation', 'License or key activation problem', 'product.license', 'clarification_case', /(license|key).*(activat|invalid|redeem|not work|error)|activat.*(license|key)/],
  ['case.license.expired_time', 'License expiry or consumed time dispute', 'product.license', 'policy_escalation', /(license|key|subscript).*(expired|time|duration|lost|credit|compensat)|time.*(license|key).*(run|lost)/],
  ['case.loader.closes_runtime', 'Loader closes immediately or runtime is missing', 'technical.loader', 'answerable_case', /(loader|application|app).*(close|crash|vanish|exit).*(immediate|open|start|launch)|webview|bootstrapper/],
  ['case.loader.connection', 'Loader connection or authentication failure', 'technical.loader', 'clarification_case', /loader.*(connect|connection|network|server|login|auth|zero|stuck)/],
  ['case.loader.update', 'Loader update or download failure', 'technical.loader', 'clarification_case', /(loader|updater).*(update|download|redownload|version).*(fail|error|stuck|not work)|update.*loader/],
  ['case.loader.key_error', 'Loader key or license error', 'technical.loader', 'clarification_case', /loader.*(key|license).*(invalid|error|not work|expired)/],
  ['case.product.launch_failure', 'Product does not launch or initialize', 'technical.product', 'clarification_case', /(product|cheat|menu|overlay|inject).*(not launch|wont launch|not start|fail|error|nothing happens)|game.*(product|cheat).*(not work|missing)/],
  ['case.game.crash_loading', 'Game crashes while loading a server or world', 'technical.game', 'answerable_case', /(crash|close|freeze).*(loading|joining|server|world)|(?:loading|joining).*(crash|close|freeze)/],
  ['case.game.crash_general', 'Game crashes during product use', 'technical.game', 'clarification_case', /(game|rust|fortnite|cs2|apex|valorant|pubg|tarkov|rainbow).*(crash|freeze|close)/],
  ['case.game.overlay_menu', 'Overlay or menu is missing or frozen', 'technical.game', 'clarification_case', /(overlay|menu).*(missing|not show|freeze|stuck|not open|invisible)|cannot open.*(menu|overlay)/],
  ['case.game.feature_behavior', 'Product feature or configuration problem', 'technical.product', 'clarification_case', /(feature|aimbot|esp|visual|setting|config).*(not work|problem|missing|reset|save)/],
  ['case.network.vpn', 'VPN or network-path troubleshooting', 'technical.network', 'answerable_case', /\bvpn\b|network.*(error|block|connection)|connection.*(timeout|failed)/],
  ['case.windows.activation_after_spoofer', 'Windows activation after temporary spoofer use', 'technical.windows', 'answerable_case', /windows.*activat.*(spoofer|hwid|hardware|restart)|0xc004f211/],
  ['case.spoofer.reversal_reset', 'Temporary spoofer reversal or reset', 'technical.spoofer', 'restricted_escalation', /(temporary spoofer|spoof).*(revert|reverse|reset|restart|original|undo)/],
  ['case.spoofer.hwid_state', 'HWID or spoofer state question', 'technical.spoofer', 'restricted_escalation', /(hwid|spoofer|spoof).*(status|work|fail|error|ban|serial|clean)/],
  ['case.restricted.technical', 'Restricted bypass or evasion request', 'restricted', 'restricted_escalation', /anti.?cheat|bypass|inject|injection|kernel|driver.*(map|load)|detection evasion|undetected/],
  ['case.support.followup', 'Support follow-up or no-response request', 'support.operations', 'unresolved_escalation', /(no response|not responding|waiting for support|support.*reply|any update|bump|ticket.*unanswered)/],
  ['case.attachment.review', 'Attachment-dependent support', 'support.attachment', 'attachment_required', /attachment omitted|screenshot|image|video|see attached|error.*picture/]
].map(([id, displayName, family, disposition, regex]) => ({ id, displayName, family, disposition, regex }));

function normalize(value) { return String(value ?? '').normalize('NFKD').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' '); }
function unique(values) { return [...new Set(values.filter(Boolean))]; }
function sanitize(value) {
  return String(value ?? '').replace(/https?:\/\/\S+/gi, '[URL omitted]').replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email omitted]').replace(/\b\d{17,20}\b/g, '[identifier omitted]').replace(/\b(?:bc1|[13])[a-zA-HJ-NP-Z0-9]{25,62}\b/g, '[wallet omitted]').replace(/\b[A-Za-z0-9_-]{48,}\b/g, '[secret omitted]').trim();
}
function collectStrings(value, output = [], key = '') {
  if (typeof value === 'string' && !/transcriptid|sourcefile|evidencemessage/i.test(key)) output.push(value);
  else if (Array.isArray(value)) for (const item of value) collectStrings(item, output, key);
  else if (value && typeof value === 'object') for (const [childKey, item] of Object.entries(value)) collectStrings(item, output, childKey);
  return output;
}
function customerPhrases(ticket) {
  const candidates = [ticket.initialCustomerProblem, ...(ticket.semanticTimeline ?? []).filter((turn) => turn.role === 'customer').map((turn) => turn.text), ...(ticket.customerGoals ?? []), ...(ticket.problems ?? []), ...(ticket.symptoms ?? [])];
  return unique(candidates.map(sanitize).filter((item) => item && !/^\[(?:attachment|url) omitted\]$/i.test(item) && item.length >= 5));
}
function substantive(ticket) {
  if ((ticket.knowledgeAtoms ?? []).length > 0) return true;
  return !/(accidental|empty|non-substantive|no-runtime|no substantive)/i.test(ticket.disposition ?? '') && collectStrings(ticket).join(' ').length > 30;
}
function classify(ticket) {
  const text = normalize(collectStrings(ticket).join(' '));
  const matches = RULES.filter((rule) => rule.regex.test(text));
  if (matches.length) return matches;
  if (ticket.attachment_requires_review || ticket.attachments?.materiality === 'manual review required') return [RULES.find((rule) => rule.id === 'case.attachment.review')];
  return [];
}
export function classifySupportText(value) {
  const text = normalize(value);
  return RULES.filter((rule) => rule.regex.test(text)).map((rule) => rule.id);
}
function dynamicLookupFor(rule) {
  if (rule.disposition !== 'dynamic_lookup_case') return null;
  if (rule.family.startsWith('commerce.order')) return 'dynamic.order.status';
  if (rule.family.startsWith('commerce.fulfillment')) return 'dynamic.fulfillment.status';
  if (rule.family.startsWith('commerce.aura') || rule.family.startsWith('commerce.wallet')) return 'dynamic.user.overview';
  if (rule.family.startsWith('catalog')) return 'dynamic.catalog.product_status';
  return 'dynamic.purchase_intent.status';
}
function scopeFor(rule, tickets, entities) {
  const scope = { global: false, categories: [], games: [], vendors: [], products: [], variants: [], accountModels: [], accountListings: [] };
  if (rule.family === 'technical.rust_nfa') { scope.games = ['game.rust']; scope.accountModels = ['account_model.nfa']; return scope; }
  if (rule.family === 'accounts.nfa') { scope.accountModels = ['account_model.nfa']; return scope; }
  if (rule.family === 'accounts.full_access') { scope.accountModels = ['account_model.full_access']; return scope; }
  if (rule.family === 'accounts.manual_service') { scope.accountModels = ['account_model.manual_service']; return scope; }
  if (!rule.family.startsWith('technical.game')) { scope.global = true; return scope; }
  const text = normalize(tickets.flatMap((ticket) => collectStrings(ticket)).join(' '));
  for (const entity of entities) {
    if (entity.type !== 'game') continue;
    const names = [entity.displayName, ...(entity.aliases ?? [])].map(normalize).filter((name) => name.length >= 3);
    if (!names.some((name) => text.includes(name))) continue;
    scope.games.push(entity.id);
  }
  for (const key of Object.keys(scope)) if (Array.isArray(scope[key])) scope[key] = unique(scope[key]).slice(0, 20);
  scope.global = !Object.values(scope).some((value) => Array.isArray(value) && value.length);
  return scope;
}
async function readJsonl(path) { return (await readFile(path, 'utf8')).split(/\r?\n/).filter(Boolean).map(JSON.parse); }
async function loadTickets(dataDir) {
  const dirs = (await readdir(join(dataDir, 'deep-review'), { withFileTypes: true })).filter((entry) => entry.isDirectory() && /^batch-\d{4}-\d{4}$/.test(entry.name)).map((entry) => entry.name).sort();
  return (await Promise.all(dirs.map((dir) => readJsonl(join(dataDir, 'deep-review', dir, 'ticket-knowledge.ndjson'))))).flat().sort((a, b) => a.ticketNumber - b.ticketNumber);
}

export async function synthesizeSupportCoverage(dataDir, entities, historicalFacts, factDispositions) {
  const tickets = await loadTickets(dataDir);
  if (tickets.length !== 1578 || new Set(tickets.map((item) => item.transcriptId)).size !== 1578) throw new Error('Ticket ledger must contain exactly 1,578 unique transcripts.');
  const classified = tickets.map((ticket) => {
    const phrases = customerPhrases(ticket);
    const phrase = phrases[0] ?? '';
    return { ticket, rules: classify(ticket), phrase, phrases, phraseRules: RULES.filter((rule) => rule.regex.test(normalize(phrase))) };
  });
  const holdoutCandidates = classified.filter((item) => item.phraseRules.length && item.phrase).sort((a, b) => a.ticket.ticketNumber - b.ticket.ticketNumber);
  const holdout = [];
  const heldTranscriptIds = new Set();
  const seenQueries = new Set();
  for (const item of holdoutCandidates) {
    const query = item.phrase.slice(0, 500);
    const key = normalize(query);
    if (!key || seenQueries.has(key)) continue;
    seenQueries.add(key); heldTranscriptIds.add(item.ticket.transcriptId);
    holdout.push({ id: `holdout.${String(holdout.length + 1).padStart(4, '0')}`, query, conversationContext: [], expected: { entityIds: [], caseIds: item.phraseRules.map((rule) => rule.id), acceptableCaseIds: [], policyIds: [], dynamicLookupIds: unique(item.phraseRules.map(dynamicLookupFor)), mustIncludeClaims: [], mustNotIncludeClaims: [], diagnosticIds: [], escalation: item.phraseRules.some((rule) => /escalation|attachment/.test(rule.disposition)) }, sourceTranscriptIds: [item.ticket.transcriptId], sourceType: 'historical_holdout', behaviorFamily: 'historical' });
    if (holdout.length === 400) break;
  }
  if (holdout.length < 300) throw new Error(`Only ${holdout.length} distinct historical holdout queries were available.`);
  const factIdsByTranscript = new Map();
  for (const fact of historicalFacts) for (const source of fact.sources ?? []) if (source.transcriptId) factIdsByTranscript.set(source.transcriptId, [...(factIdsByTranscript.get(source.transcriptId) ?? []), fact.id]);
  const cases = [];
  for (const rule of RULES) {
    const matched = classified.filter((item) => item.rules.some((candidate) => candidate.id === rule.id));
    if (!matched.length) continue;
    const recognition = unique(matched.flatMap((item) => item.phrases).filter((phrase) => rule.regex.test(normalize(phrase)) && !seenQueries.has(normalize(phrase))).map((item) => item.slice(0, 240))).slice(0, 40);
    const transcriptIds = unique(matched.map((item) => item.ticket.transcriptId));
    const factIds = unique(transcriptIds.flatMap((id) => factIdsByTranscript.get(id) ?? []));
    const caseRecord = { id: rule.id, displayName: rule.displayName, family: rule.family, runtimeDisposition: rule.disposition, scope: scopeFor(rule, matched.map((item) => item.ticket), entities), recognition: { phrases: recognition, symptomIds: [], errorSignals: [], contextSignals: unique(matched.flatMap((item) => item.ticket.symptoms ?? [])).map(sanitize).slice(0, 20) }, requiredContext: [], possibleCauseIds: [], diagnosticIds: [], resolutionFlow: [], policyIds: [], relatedCaseIds: [], relationships: [], escalateWhen: /escalation|attachment/.test(rule.disposition) ? ['Human review or current authoritative state is required.'] : [], confidence: 'corpus-derived', provenance: { sourceClass: 'canonical_historical', sourceCount: transcriptIds.length, transcriptIds, historicalFactIds: factIds, currentSourceRefs: [], contradictionIds: [] } };
    if (rule.disposition === 'dynamic_lookup_case') caseRecord.requiredContext = ['current lookup selector'];
    if (rule.disposition === 'clarification_case') caseRecord.requiredContext = ['exact product/account and observed state'];
    if (rule.disposition === 'policy_escalation') caseRecord.policyIds = ['policy.refund_or_replacement.current_state_required'];
    if (rule.id === 'case.loader.closes_runtime') { caseRecord.diagnosticIds = ['diagnostic.loader.webview_present']; caseRecord.resolutionFlow = [{ procedureId: 'procedure.loader.install_webview_runtime', onSuccess: 'outcome.resolved', onFailure: 'escalation.known_flow_exhausted' }]; }
    if (['case.loader.connection', 'case.loader.update', 'case.network.vpn'].includes(rule.id)) caseRecord.resolutionFlow = [{ procedureId: 'procedure.loader.restart_and_retry', onSuccess: 'outcome.resolved', onFailure: 'escalation.known_flow_exhausted' }];
    if (rule.id === 'case.product.requirements' || rule.id === 'case.product.compatibility') caseRecord.resolutionFlow = [{ procedureId: 'procedure.product.read_exact_requirements', onSuccess: 'outcome.context_resolved', onFailure: 'escalation.entity_ambiguous' }];
    if (rule.id === 'case.attachment.review') caseRecord.diagnosticIds = ['diagnostic.attachment.visual_required'];
    cases.push(caseRecord);
  }
  for (const item of cases) {
    const siblings = cases.filter((candidate) => candidate.id !== item.id && candidate.family.split('.')[0] === item.family.split('.')[0]).map((candidate) => candidate.id).slice(0, 8);
    item.relatedCaseIds = siblings;
    item.relationships = siblings.map((targetId) => ({ relation: 'related_case', targetId }));
  }
  const caseById = new Map(cases.map((item) => [item.id, item]));
  const caseCoverage = classified.map(({ ticket, rules }) => {
    const isSubstantive = substantive(ticket);
    let runtimeDisposition = isSubstantive ? 'historical_only_no_current_action' : 'no_runtime_knowledge';
    if (rules.length) runtimeDisposition = rules[0].disposition;
    if (!DISPOSITIONS.has(runtimeDisposition)) throw new Error(`Invalid runtime disposition ${runtimeDisposition}.`);
    const caseIds = rules.map((rule) => rule.id).filter((id) => caseById.has(id));
    return { ticketNumber: ticket.ticketNumber, transcriptId: ticket.transcriptId, substantive: isSubstantive, runtimeDisposition, caseIds, profileIds: [], policyIds: [], dynamicLookupIds: unique(rules.map(dynamicLookupFor)), restrictedTopicIds: rules.filter((rule) => rule.disposition === 'restricted_escalation').map(() => 'restricted.anti_cheat_bypass'), unresolvedIds: runtimeDisposition === 'unresolved_escalation' ? [`unresolved.ticket.${ticket.ticketNumber}`] : [], attachmentRequired: runtimeDisposition === 'attachment_required', factIds: unique(factIdsByTranscript.get(ticket.transcriptId) ?? []), reason: rules.length ? `Matched ${rules.map((rule) => rule.family).join(', ')} from the reviewed ticket semantics.` : isSubstantive ? 'Retained as historical-only because available evidence does not support a safe reusable current action.' : 'No substantive reusable runtime knowledge was recorded.' };
  });
  const coverageByTranscript = new Map(caseCoverage.map((item) => [item.transcriptId, item]));
  const dispositionByFact = new Map(factDispositions.map((item) => [item.originalFactId, item.disposition]));
  const roleFor = (fact) => {
    const type = fact.types?.[0] ?? 'fact';
    if (dispositionByFact.get(fact.id) === 'noise') return ['noise'];
    if (dispositionByFact.get(fact.id) === 'dynamic') return ['dynamic_routing'];
    if (dispositionByFact.get(fact.id) === 'restricted') return ['restricted_routing', 'escalation'];
    if (dispositionByFact.get(fact.id) === 'unresolved') return ['unresolved', 'escalation'];
    const map = { procedure: ['procedure'], diagnostic: ['diagnostic'], cause: ['case_cause'], outcome: ['procedure_outcome'], policy: ['policy'], exception: ['exception'], requirement: ['requirement'], terminology: ['terminology_alias'], availability: ['dynamic_routing'], pricing: ['dynamic_routing'], product: ['product_profile'], productBehavior: ['case_context'], feature: ['case_context'], compatibility: ['compatibility'] };
    return map[type] ?? (dispositionByFact.get(fact.id) === 'historical_only' ? ['historical_only'] : ['case_context']);
  };
  const factRuntimeUsage = historicalFacts.map((fact) => {
    const transcriptIds = unique((fact.sources ?? []).map((source) => source.transcriptId));
    const caseIds = unique(transcriptIds.flatMap((id) => coverageByTranscript.get(id)?.caseIds ?? []));
    const roles = unique([...roleFor(fact), ...(caseIds.length ? ['case_recognition'] : [])]);
    const linkedDynamic = unique(transcriptIds.flatMap((id) => coverageByTranscript.get(id)?.dynamicLookupIds ?? []));
    return { originalFactId: fact.id, roles, caseIds, profileIds: [], policyIds: roles.includes('policy') ? ['policy.refund_or_replacement.current_state_required'] : [], dynamicLookupIds: roles.includes('dynamic_routing') ? (linkedDynamic.length ? linkedDynamic : ['dynamic.catalog.product_status']) : [], restrictedTopicIds: roles.includes('restricted_routing') ? ['restricted.anti_cheat_bypass'] : [], reason: caseIds.length ? 'Linked through source-ticket membership to corpus-derived support cases.' : `Explicit ${roles.join('/')} runtime usage or exclusion.` };
  });
  const adversarialTemplates = [
    ['negation', 'my graphics are not high and Rust still crashes loading the world', 'case.game.crash_loading'], ['already_tried', 'my Rust NFA already has low graphics and still crashes loading the world', 'case.rust.nfa.server_load_crash.continue'], ['product_isolation', 'Ancient Rust requirements, not Exodus Rust', 'case.product.requirements'], ['variant_isolation', 'requirements for only the one-day variant', 'case.product.requirements'], ['account_model_isolation', 'I need Full Access, not an NFA account', 'case.nfa.access_model_question'], ['dynamic_state', 'where is my order right now', 'case.order.status'], ['ambiguity', 'Ancient is not working', 'case.catalog.availability_status'], ['multi_turn', 'I already gave the order reference in my previous message', 'case.order.status'], ['paraphrase', 'the program disappears immediately when opened', 'case.loader.closes_runtime'], ['typo_or_slang', 'ldr wont connct', 'case.loader.connection']
  ];
  const adversarial = adversarialTemplates.flatMap(([family, query, caseId]) => Array.from({ length: 5 }, (_, index) => ({ id: `adversarial.${family}.${index + 1}`, query: index ? `${query}; attempt ${index + 1}` : query, conversationContext: [], expected: { entityIds: [], caseIds: [caseId], acceptableCaseIds: [], policyIds: [], dynamicLookupIds: family === 'dynamic_state' ? ['dynamic.order.status'] : [], mustIncludeClaims: [], mustNotIncludeClaims: family.includes('isolation') ? ['sibling scope leakage'] : [], diagnosticIds: [], escalation: family === 'ambiguity' }, sourceTranscriptIds: [], sourceType: 'synthetic_adversarial', behaviorFamily: family })));
  return { cases, caseCoverage, factRuntimeUsage, historicalHoldout: holdout, adversarial };
}

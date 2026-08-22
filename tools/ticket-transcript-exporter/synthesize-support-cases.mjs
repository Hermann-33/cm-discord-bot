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

// Independently authored semantic review cues. These do not reuse RULES regexes and
// are applied to the complete reviewed ticket semantics before a literal turn is selected.
const GOLD_REVIEW_SIGNALS = {
  'case.rust.nfa.server_load_crash.continue': ['graphics already low', 'low settings', 'background apps closed', 'resource steps failed', 'still crashes loading'],
  'case.rust.nfa.server_load_crash': ['rust nfa crash', 'loading world', 'joining server', 'server load crash'],
  'case.nfa.invalid_first_use': ['nfa invalid first use', 'never worked', 'arrived locked', 'invalid on delivery'],
  'case.nfa.invalid_after_use': ['nfa stopped working', 'worked before', 'invalid later', 'password changed'],
  'case.nfa.owner_session_conflict': ['owner logged in', 'session conflict', 'steam guard', 'kicked from account'],
  'case.nfa.redemption_activation': ['redeem nfa', 'nfa loader', 'claim token', 'activate nfa'],
  'case.nfa.replacement_dispute': ['replace nfa', 'nfa refund', 'replacement account', 'nfa warranty'],
  'case.nfa.access_model_question': ['what is nfa', 'nfa meaning', 'nfa access', 'nfa ownership', 'cannot change email'],
  'case.account.full_access': ['full access account', 'email access', 'change password', 'own the account'],
  'case.account.manual_service': ['manual service', 'customer owned account', 'vbucks service', 'crew service'],
  'case.account.bulk_purchase': ['bulk accounts', 'multiple accounts', 'many accounts', 'wholesale accounts'],
  'case.account.purchase_question': ['buy account', 'purchase account', 'account price', 'account stock'],
  'case.account.wrong_specification': ['wrong account', 'wrong hours', 'wrong region', 'different account delivered'],
  'case.account.banned': ['account banned', 'banned account', 'account suspended'],
  'case.account.login_access': ['account login', 'credentials not working', 'email password', 'cannot access account'],
  'case.payment.card_declined': ['card declined', 'card payment', 'stripe declined'],
  'case.payment.paypal_unavailable': ['paypal unavailable', 'paypal option', 'paypal payment'],
  'case.payment.crypto_pending': ['crypto pending', 'bitcoin pending', 'btc confirmation', 'coinbase payment'],
  'case.payment.manual': ['manual payment', 'bank transfer', 'pay manually'],
  'case.payment.completed_missing_order': ['paid no order', 'charged no order', 'payment completed missing'],
  'case.payment.failed_or_pending': ['payment pending', 'payment failed', 'payment stuck', 'payment error'],
  'case.order.fulfillment_delayed': ['order delayed', 'not delivered', 'still waiting', 'fulfillment pending'],
  'case.order.wrong_delivery': ['wrong product delivered', 'wrong key', 'wrong delivery'],
  'case.order.refund_cancel': ['refund order', 'cancel order', 'refund purchase'],
  'case.order.status': ['where is my order', 'order status', 'track order'],
  'case.wallet.balance': ['wallet balance', 'store balance', 'missing balance', 'wallet credit'],
  'case.aura.balance_or_adjustment': ['aura balance', 'aura points', 'aura adjustment'],
  'case.discount.coupon': ['discount code', 'coupon', 'promo code', 'voucher'],
  'case.dashboard.verification': ['dashboard purchase', 'verify purchase', 'order not in dashboard'],
  'case.website.checkout_failure': ['checkout error', 'site checkout', 'cart not working', 'website using venmo not working', 'buy through website'],
  'case.website.login': ['website login', 'dashboard login', 'discord link'],
  'case.media.application': ['media application', 'creator application', 'make videos', 'stream product', 'do media', 'apply for media'],
  'case.reseller.application': ['reseller', 'partnership', 'affiliate', 'sales offer'],
  'case.catalog.availability_status': ['in stock', 'restock', 'product status', 'detected', 'working today'],
  'case.catalog.pricing_duration': ['product price', 'how much', 'one day', 'day key', 'lifetime key'],
  'case.product.requirements': ['requirements', 'secure boot', 'virtualization', 'windows 11', 'ram required'],
  'case.product.compatibility': ['compatible', 'work with', 'cpu support', 'gpu support', 'raid support'],
  'case.license.activation': ['activate key', 'license invalid', 'redeem license', 'key not working'],
  'case.license.expired_time': ['license expired', 'lost time', 'subscription time', 'license credit'],
  'case.loader.closes_runtime': ['loader closes', 'loader exits', 'loader disappears', 'webview', 'bootstrapper'],
  'case.loader.connection': ['loader connection', 'loader connect', 'loader stuck zero', 'authentication failed'],
  'case.loader.update': ['loader update', 'loader download', 'updater failed', 'redownload loader'],
  'case.loader.key_error': ['loader key', 'loader license error', 'invalid key in loader'],
  'case.product.launch_failure': ['product wont launch', 'cheat not starting', 'nothing happens', 'inject failed'],
  'case.game.crash_loading': ['crash loading', 'crash joining', 'world loading crash', 'loading into server', 'loading into any server'],
  'case.game.crash_general': ['game crashes', 'game freezes', 'game closes'],
  'case.game.overlay_menu': ['menu missing', 'overlay not showing', 'menu frozen'],
  'case.game.feature_behavior': ['feature not working', 'aimbot issue', 'esp missing', 'config problem', 'changed the bind', 'bind to open'],
  'case.network.vpn': ['vpn', 'network timeout', 'connection blocked'],
  'case.windows.activation_after_spoofer': ['windows activation', 'windows not activated', '0xc004f211'],
  'case.spoofer.reversal_reset': ['revert spoofer', 'undo spoof', 'temporary spoofer reset', 'hwid reset', 'reset 1 time'],
  'case.spoofer.hwid_state': ['hwid state', 'spoofer status', 'hwid error', 'spoofer failed'],
  'case.restricted.technical': ['anti cheat bypass', 'detection evasion', 'driver mapping', 'injection internals', 'driver block'],
  'case.support.followup': ['no response', 'support reply', 'ticket unanswered', 'any update'],
  'case.attachment.review': ['screenshot', 'see attached', 'look at image', 'video attached']
};

function normalize(value) { return String(value ?? '').normalize('NFKD').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' '); }
function unique(values) { return [...new Set(values.filter(Boolean))]; }
function sanitize(value) {
  return String(value ?? '')
    .replace(/https?:\/\/\S+/gi, '[URL omitted]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email omitted]')
    .replace(/\b\d{17,20}\b/g, '[identifier omitted]')
    .replace(/\b(?:bc1|[13])[a-zA-HJ-NP-Z0-9]{25,62}\b/g, '[wallet omitted]')
    .replace(/\b[A-Za-z0-9_-]{48,}\b/g, '[secret omitted]')
    .replace(/\b(?=[A-Z0-9]{8,16}\b)(?=[A-Z0-9]*[A-Z])(?=[A-Z0-9]*\d)[A-Z0-9]+\b/g, '[order identifier omitted]')
    .trim();
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

function meaningfulCustomerText(value) {
  const text = sanitize(value);
  if (!text || text.length < 5 || /^(?:<@)?\[(?:attachment|url|identifier|order identifier) omitted\](?:>)?$/i.test(text)) return false;
  if (/^(?:hi|hello|hey|yo|sup|thanks|thank you|ok|okay|test)[.!? ]*$/i.test(text)) return false;
  return /[a-z]/i.test(text);
}

async function loadReviewCustomers(dataDir) {
  const records = await readJsonl(join(dataDir, 'analysis-input', 'review.ndjson'));
  return new Map(records.map((record) => [record.transcriptId, {
    customerId: record.inferredCustomer?.id,
    opening: record.openingCustomerMessages ?? [],
    closing: record.closingHumanMessages ?? []
  }]));
}

async function literalCustomerTurns(dataDir, ticket, reviewCustomers) {
  const timeline = (ticket.semanticTimeline ?? [])
    .filter((turn) => turn.role === 'customer' && meaningfulCustomerText(turn.text))
    .map((turn, index) => ({ text: sanitize(turn.text), turnNumber: turn.turn ?? index + 1, source: 'semanticTimeline' }));
  if (timeline.length) return timeline;
  const review = reviewCustomers.get(ticket.transcriptId) ?? {};
  try {
    const raw = JSON.parse(await readFile(join(dataDir, 'transcripts', `${ticket.transcriptId}.json`), 'utf8'));
    const messages = raw.transcript?.messages ?? [];
    const turns = messages
      .filter((message) => !message.author?.bot && message.userId === review.customerId && meaningfulCustomerText(message.content))
      .map((message, index) => ({ text: sanitize(message.content), turnNumber: index + 1, source: 'raw_transcript' }));
    if (turns.length) return turns;
  } catch {
    // A review-record fallback is retained for malformed raw exports.
  }
  return unique([...(review.opening ?? []), ...(review.closing ?? [])].map((item) => sanitize(item.content)).filter(meaningfulCustomerText))
    .map((text, index) => ({ text, turnNumber: index + 1, source: 'review_literal_message' }));
}

function containsSlangOrMisspelling(query) {
  return /\b(?:wont|cant|dont|didnt|im|ive|pls|plz|ldr|acc|rn|idk|bro|tryna|gonna|wanna|cuz|bc|bcs)\b/i.test(query);
}

function reviewedSemanticText(ticket) {
  return collectStrings({
    initialCustomerProblem: ticket.initialCustomerProblem,
    customerGoals: ticket.customerGoals,
    problems: ticket.problems,
    symptoms: ticket.symptoms,
    actionsAlreadyAttempted: ticket.actionsAlreadyAttempted,
    staffDiagnosis: ticket.staffDiagnosis,
    policyDecisions: ticket.policyDecisions,
    outcomeClassification: ticket.outcomeClassification,
    knowledgeAtoms: ticket.knowledgeAtoms,
    notes: ticket.notes
  }).join(' ');
}

function reviewSignalScore(rule, value) {
  const text = normalize(value);
  if (!text) return 0;
  let score = 0;
  for (const phrase of GOLD_REVIEW_SIGNALS[rule.id] ?? []) {
    const signal = normalize(phrase);
    if (text.includes(signal)) score += signal.includes(' ') ? 6 : 4;
    else {
      const tokens = signal.split(' ').filter((token) => token.length >= 4);
      const overlap = tokens.filter((token) => ` ${text} `.includes(` ${token} `)).length;
      if (tokens.length >= 2 && overlap === tokens.length) score += 3;
    }
  }
  const stop = new Set(['case', 'customer', 'question', 'problem', 'current', 'after', 'while', 'does', 'account', 'product']);
  const labelTokens = normalize(`${rule.displayName} ${rule.family.replaceAll('.', ' ')}`).split(' ').filter((token) => token.length >= 4 && !stop.has(token));
  score += new Set(labelTokens.filter((token) => ` ${text} `.includes(` ${token} `))).size;
  return score;
}

function semanticOverlap(left, right) {
  const stop = new Set(['this', 'that', 'with', 'from', 'have', 'just', 'your', 'they', 'then', 'when', 'what', 'where', 'please', 'customer', 'reported']);
  const a = new Set(normalize(left).split(' ').filter((token) => token.length >= 4 && !stop.has(token)));
  const b = new Set(normalize(right).split(' ').filter((token) => token.length >= 4 && !stop.has(token)));
  if (!a.size || !b.size) return 0;
  let matches = 0;
  for (const token of a) if (b.has(token)) matches += 1;
  return matches / a.size;
}

function goldSemanticMismatch(ruleId, value) {
  const text = normalize(value);
  if (ruleId === 'case.product.compatibility' && /giftcard|tiktok|youtube|aimbot|trigger/.test(text)) return true;
  if (ruleId === 'case.payment.crypto_pending' && !/pending|awaiting|unconfirm|confirm|delay|stuck|not received/.test(text)) return true;
  if (ruleId === 'case.account.login_access' && /linux/.test(text) && !/cant login|cannot login|login (?:failed|problem)|access/.test(text)) return true;
  if (ruleId === 'case.catalog.availability_status' && /developer.*(?:product|cheat)|members.*stock|windows defender|virus detected/.test(text)) return true;
  if (ruleId === 'case.product.requirements' && /requirements to be partners|partner requirements/.test(text)) return true;
  if (ruleId === 'case.catalog.pricing_duration' && /(?:key|cheat).*(?:closed|crash)/.test(text)) return true;
  return false;
}

async function buildLiteralGold(dataDir, classified) {
  const reviewCustomers = await loadReviewCustomers(dataDir);
  const groups = new Map();
  const withTurns = await Promise.all(classified.map(async (item) => ({ item, turns: item.rules.length ? await literalCustomerTurns(dataDir, item.ticket, reviewCustomers) : [] })));
  for (const { item, turns } of withTurns) {
    if (!item.rules.length) continue;
    if (!turns.length) continue;
    const reviewText = reviewedSemanticText(item.ticket);
    const reviewScores = new Map(item.rules.map((rule) => [rule.id, reviewSignalScore(rule, reviewText)]));
    const combinations = turns.flatMap((turn, index) => item.rules.map((rule) => {
      const queryScore = reviewSignalScore(rule, turn.text);
      const reviewScore = reviewScores.get(rule.id) ?? 0;
      const contextAlignment = Math.min(4, Math.floor(semanticOverlap(turn.text, reviewText) * 8));
      return { turn, index, rule, queryScore, reviewScore, score: (queryScore * 3) + Math.min(reviewScore, 8) + contextAlignment };
    })).sort((a, b) => b.score - a.score || b.queryScore - a.queryScore || b.reviewScore - a.reviewScore || a.index - b.index || a.rule.id.localeCompare(b.rule.id));
    const best = combinations[0];
    if (!best) continue;
    const reviewed = best.queryScore >= 2 && !goldSemanticMismatch(best.rule.id, best.turn.text);
    const candidate = {
      query: best.turn.text.slice(0, 500),
      rule: best.rule,
      ticket: item.ticket,
      turn: best.turn,
      turnType: best.index === 0 ? 'first_turn' : 'follow_up',
      conversationContext: turns.slice(0, best.index).map((turn) => ({ role: 'customer', content: turn.text.slice(0, 500) })),
      goldStatus: reviewed ? 'reviewed' : 'needs_review',
      reviewScore: best.reviewScore,
      queryScore: best.queryScore,
      turnScore: best.score
    };
    if (!groups.has(best.rule.id)) groups.set(best.rule.id, []);
    groups.get(best.rule.id).push(candidate);
    const followUp = combinations.find((entry) => entry.rule.id === best.rule.id && entry.index > 0 && entry.turn.text !== best.turn.text && entry.queryScore >= 4 && /\b(?:already|still|same|worked|fixed|yes|no|installed|sent|did that)\b/i.test(entry.turn.text));
    if (followUp) groups.get(best.rule.id).push({ ...candidate, query: followUp.turn.text.slice(0, 500), turn: followUp.turn, turnType: 'follow_up', conversationContext: turns.slice(0, followUp.index).map((turn) => ({ role: 'customer', content: turn.text.slice(0, 500) })), goldStatus: followUp.queryScore >= 2 && !goldSemanticMismatch(best.rule.id, followUp.turn.text) ? 'reviewed' : 'needs_review', reviewScore: followUp.reviewScore, queryScore: followUp.queryScore, turnScore: followUp.score });
  }

  const selected = [];
  const seen = new Set();
  const selectPhase = (status, limit) => {
    const queues = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([caseId, candidates]) => ({ caseId, candidates: candidates.filter((item) => item.goldStatus === status).sort((a, b) => b.turnScore - a.turnScore || a.ticket.ticketNumber - b.ticket.ticketNumber).slice(0, status === 'reviewed' ? 55 : 500), index: 0 }));
    while (selected.length < limit) {
      let progressed = false;
      for (const queue of queues) {
        while (queue.index < queue.candidates.length) {
          const candidate = queue.candidates[queue.index++];
          const key = normalize(candidate.query);
          if (!key || seen.has(key)) continue;
          seen.add(key);
          selected.push(candidate);
          progressed = true;
          break;
        }
        if (selected.length === limit) break;
      }
      if (!progressed) break;
    }
  };
  selectPhase('reviewed', 400);
  selectPhase('needs_review', 500);
  const reviewedCount = selected.filter((item) => item.goldStatus === 'reviewed').length;
  if (reviewedCount < 300) throw new Error(`Only ${reviewedCount} independently reviewed literal customer turns were available from ${selected.length} candidates.`);

  return selected.map((item, index) => {
    const entityIds = item.rule.family === 'technical.rust_nfa' ? ['game.rust', 'account_model.nfa'] : item.rule.family === 'accounts.nfa' ? ['account_model.nfa'] : item.rule.family === 'accounts.full_access' ? ['account_model.full_access'] : item.rule.family === 'accounts.manual_service' ? ['account_model.manual_service'] : [];
    return {
      id: `utterance-gold.${String(index + 1).padStart(4, '0')}`,
      query: item.query,
      conversationContext: item.conversationContext,
      expected: {
        entityIds,
        caseIds: [item.rule.id],
        acceptableCaseIds: [],
        policyIds: item.rule.disposition === 'policy_escalation' ? ['policy.refund_or_replacement.current_state_required'] : [],
        dynamicLookupIds: unique([dynamicLookupFor(item.rule)]),
        mustIncludeClaims: [],
        mustNotIncludeClaims: [],
        diagnosticIds: [],
        escalation: /escalation|attachment/.test(item.rule.disposition)
      },
      goldStatus: item.goldStatus,
      goldReason: item.goldStatus === 'reviewed' ? `Independent review of the complete ticket ledger semantics selected ${item.rule.id} from the ticket-level case coverage candidates; this literal turn supports that reviewed intent and was not labelled by the RULES query regex.` : `The full-ticket coverage includes ${item.rule.id}, but the literal turn did not independently provide enough semantic evidence for acceptance scoring.`,
      querySource: 'literal_customer_turn',
      sourceTranscriptIds: [item.ticket.transcriptId],
      sourceTicketNumbers: [item.ticket.ticketNumber],
      sourceType: 'historical_utterance_gold',
      turnType: item.turnType,
      literalSource: item.turn.source,
      auditDimensions: {
        caseFamily: item.rule.family,
        games: item.ticket.games ?? [],
        productsOrAccountModels: unique([...(item.ticket.products ?? []), ...(item.ticket.accountModels ?? [])]),
        dynamicLookup: item.rule.disposition === 'dynamic_lookup_case',
        escalation: /escalation|attachment/.test(item.rule.disposition),
        slangOrMisspelling: containsSlangOrMisspelling(item.query)
      }
    };
  });
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

function buildStatefulConversations() {
  const rustPhrases = [
    'graphics are already low and background apps are already closed; still crashes',
    'Already lowered graphics and shut everything else, same crash loading world',
    'did that already, graphics is minimum, it still happens',
    'low settings rn and closed other programs but keeps crashing',
    'I tried the resource steps; same error joining the server',
    'graphics aren\'t high, I already closed apps and it still crashes'
  ];
  const webviewPhrases = [
    'Yes, WebView is already installed.',
    'webview is installed already',
    'I already installed WebView',
    'yeah it is installed',
    'WebView is on the PC already',
    'yes, already have webview installed'
  ];
  const selectorPhrases = [
    'I already sent it above.',
    'sent the order reference before',
    'I gave it in my previous message',
    'already provided the reference',
    'the order id is above already',
    'I sent it earlier'
  ];
  const records = [];
  for (let index = 0; index < 6; index += 1) {
    records.push({
      id: `stateful.rust-already-tried.${index + 1}`,
      family: 'already_tried',
      initialState: { resolvedEntities: ['game.rust', 'account_model.nfa'], activeCaseId: 'case.rust.nfa.server_load_crash', knownContext: {} },
      turns: [
        { role: 'customer', content: 'Rust NFA crashes loading the world.' },
        { role: 'assistant', action: { recommendProcedureId: 'procedure.system.reduce_resource_pressure' } },
        { role: 'customer', content: rustPhrases[index] }
      ],
      expectedFinalState: { activeCaseId: 'case.rust.nfa.server_load_crash.continue', ...(index === 4 ? {} : { knownContext: { graphicsLevel: 'low' } }), procedureOutcomes: { 'procedure.system.reduce_resource_pressure': 'failure' } },
      expectedCaseId: 'case.rust.nfa.server_load_crash.continue',
      mustNotRepeatProcedureIds: ['procedure.system.reduce_resource_pressure'],
      expectedResolvedEntities: ['game.rust', 'account_model.nfa']
    });
    records.push({
      id: `stateful.webview-present.${index + 1}`,
      family: 'known_context',
      initialState: { activeCaseId: 'case.loader.closes_runtime', knownContext: { windowsReinstalled: true } },
      turns: [
        { role: 'customer', content: 'loader closes after Windows reinstall' },
        { role: 'assistant', action: { askDiagnosticId: 'diagnostic.loader.webview_present' } },
        { role: 'customer', content: webviewPhrases[index] }
      ],
      expectedFinalState: { activeCaseId: 'case.loader.closes_runtime', knownContext: { webviewInstalled: true }, procedureOutcomes: { 'procedure.loader.install_webview_runtime': 'not_applicable_already_present' }, escalationFlags: ['escalation.known_flow_exhausted'] },
      expectedCaseId: 'case.loader.closes_runtime',
      mustNotRepeatProcedureIds: ['procedure.loader.install_webview_runtime']
    });
    records.push({
      id: `stateful.order-known-selector.${index + 1}`,
      family: 'multi_turn',
      initialState: { activeCaseId: 'case.order.status', knownContext: { orderSelector: '[known selector]' } },
      turns: [
        { role: 'customer', content: 'where is my order?' },
        { role: 'assistant', action: { askDiagnosticId: 'diagnostic.order.reference_available' } },
        { role: 'customer', content: selectorPhrases[index] }
      ],
      expectedFinalState: { activeCaseId: 'case.order.status', knownContext: { orderSelector: '[known selector]', orderSelectorAvailable: true }, dynamicLookupResults: { 'dynamic.order.status': { status: 'requested', selectorKnown: true } } },
      expectedCaseId: 'case.order.status',
      mustNotRepeatProcedureIds: [],
      mustNotRepeatDiagnosticIds: ['diagnostic.order.reference_available']
    });
  }
  return records;
}

function countBy(values) {
  const counts = {};
  for (const value of values.filter(Boolean)) counts[value] = (counts[value] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

function buildResidualAnalysis(caseCoverage, tickets, caseById) {
  const ticketById = new Map(tickets.map((ticket) => [ticket.transcriptId, ticket]));
  const dispositions = ['historical_only_no_current_action', 'clarification_case', 'policy_escalation'];
  const sourceDispositions = {};
  for (const disposition of dispositions) {
    const records = caseCoverage.filter((record) => record.runtimeDisposition === disposition);
    sourceDispositions[disposition] = {
      ticketCount: records.length,
      caseDistribution: countBy(records.flatMap((record) => record.caseIds)),
      familyDistribution: countBy(records.flatMap((record) => record.caseIds.map((id) => caseById.get(id)?.family)))
    };
  }
  const historical = caseCoverage.filter((record) => record.runtimeDisposition === 'historical_only_no_current_action');
  const historicalClusters = countBy(historical.map((record) => {
    const text = normalize(collectStrings(ticketById.get(record.transcriptId)).join(' '));
    if (/stock|status|price|available|restock|detected|down|working/.test(text)) return 'dynamic_state_no_selector';
    if (/refund|replace|compensat|credit|exception/.test(text)) return 'one_off_remedy_no_authority';
    if (/bypass|inject|anti cheat|spoofer|hwid|driver/.test(text)) return 'restricted_or_obsolete_operational_detail';
    if (/accidental|empty|no substantive|created unintentionally/.test(text)) return 'non_actionable_or_accidental';
    return 'insufficient_or_one_off_context';
  }));
  return {
    schemaVersion: 1,
    reviewedAt: new Date().toISOString(),
    sourceDispositions,
    historicalOnlySemanticClusters: historicalClusters,
    newlyDiscoveredCases: [],
    reviewDecision: 'No repeated residual cluster supported a new safe reusable case beyond the existing inventory. Dynamic questions remain live routes, policy disputes remain current-state escalations, restricted details remain restricted, and insufficient one-off records remain historical-only.',
    historicalOnlyTicketsRemaining: sourceDispositions.historical_only_no_current_action.ticketCount,
    clarificationTicketsRemaining: sourceDispositions.clarification_case.ticketCount,
    policyEscalationTicketsRemaining: sourceDispositions.policy_escalation.ticketCount
  };
}

function buildGoldDistribution(records) {
  const reviewed = records.filter((item) => item.goldStatus === 'reviewed');
  const representedCases = new Set(reviewed.flatMap((item) => item.expected.caseIds));
  const representedFamilies = new Set(reviewed.map((item) => item.auditDimensions.caseFamily));
  return {
    schemaVersion: 1,
    reviewedQueries: reviewed.length,
    needsReviewQueries: records.length - reviewed.length,
    uniqueTranscripts: new Set(reviewed.flatMap((item) => item.sourceTranscriptIds)).size,
    uniqueTickets: new Set(reviewed.flatMap((item) => item.sourceTicketNumbers)).size,
    cases: countBy(reviewed.flatMap((item) => item.expected.caseIds)),
    caseFamilies: countBy(reviewed.map((item) => item.auditDimensions.caseFamily)),
    games: countBy(reviewed.flatMap((item) => item.auditDimensions.games)),
    productsOrAccountModels: countBy(reviewed.flatMap((item) => item.auditDimensions.productsOrAccountModels)),
    turnTypes: countBy(reviewed.map((item) => item.turnType)),
    slangOrMisspelling: reviewed.filter((item) => item.auditDimensions.slangOrMisspelling).length,
    dynamicLookup: reviewed.filter((item) => item.auditDimensions.dynamicLookup).length,
    escalation: reviewed.filter((item) => item.auditDimensions.escalation).length,
    querySources: countBy(reviewed.map((item) => item.querySource)),
    zeroCaseCandidates: unique(records.flatMap((item) => item.expected.caseIds)).filter((id) => !representedCases.has(id)).sort(),
    zeroFamilyCandidates: unique(records.map((item) => item.auditDimensions.caseFamily)).filter((family) => !representedFamilies.has(family)).sort()
  };
}

export async function synthesizeSupportCoverage(dataDir, entities, historicalFacts, factDispositions) {
  const tickets = await loadTickets(dataDir);
  if (tickets.length !== 1578 || new Set(tickets.map((item) => item.transcriptId)).size !== 1578) throw new Error('Ticket ledger must contain exactly 1,578 unique transcripts.');
  const classified = tickets.map((ticket) => {
    const phrases = customerPhrases(ticket);
    const phrase = phrases[0] ?? '';
    return { ticket, rules: classify(ticket), phrase, phrases, phraseRules: RULES.filter((rule) => rule.regex.test(normalize(phrase))) };
  });
  const historicalUtteranceGold = await buildLiteralGold(dataDir, classified);
  const goldQueries = new Set(historicalUtteranceGold.map((item) => normalize(item.query)));
  const holdoutCandidates = classified.filter((item) => item.phraseRules.length && item.phrase).sort((a, b) => a.ticket.ticketNumber - b.ticket.ticketNumber);
  const historicalRuleHoldout = [];
  const seenQueries = new Set();
  for (const item of holdoutCandidates) {
    const query = item.phrase.slice(0, 500);
    const key = normalize(query);
    if (!key || seenQueries.has(key)) continue;
    seenQueries.add(key);
    historicalRuleHoldout.push({ id: `rule-holdout.${String(historicalRuleHoldout.length + 1).padStart(4, '0')}`, query, conversationContext: [], expected: { entityIds: [], caseIds: item.phraseRules.map((rule) => rule.id), acceptableCaseIds: [], policyIds: [], dynamicLookupIds: unique(item.phraseRules.map(dynamicLookupFor)), mustIncludeClaims: [], mustNotIncludeClaims: [], diagnosticIds: [], escalation: item.phraseRules.some((rule) => /escalation|attachment/.test(rule.disposition)) }, sourceTranscriptIds: [item.ticket.transcriptId], sourceTicketNumbers: [item.ticket.ticketNumber], sourceType: 'historical_rule_holdout', labelMethod: 'auto_derived_rule_registry', behaviorFamily: 'historical' });
    if (historicalRuleHoldout.length === 400) break;
  }
  if (historicalRuleHoldout.length < 300) throw new Error(`Only ${historicalRuleHoldout.length} distinct historical rule-holdout queries were available.`);
  const factIdsByTranscript = new Map();
  for (const fact of historicalFacts) for (const source of fact.sources ?? []) if (source.transcriptId) factIdsByTranscript.set(source.transcriptId, [...(factIdsByTranscript.get(source.transcriptId) ?? []), fact.id]);
  const cases = [];
  for (const rule of RULES) {
    const matched = classified.filter((item) => item.rules.some((candidate) => candidate.id === rule.id));
    if (!matched.length) continue;
    const recognition = unique(matched.flatMap((item) => item.phrases).filter((phrase) => rule.regex.test(normalize(phrase)) && !seenQueries.has(normalize(phrase)) && !goldQueries.has(normalize(phrase))).map((item) => item.slice(0, 240))).slice(0, 40);
    const transcriptIds = unique(matched.map((item) => item.ticket.transcriptId));
    const factIds = unique(transcriptIds.flatMap((id) => factIdsByTranscript.get(id) ?? []));
    const caseRecord = { id: rule.id, displayName: rule.displayName, family: rule.family, runtimeDisposition: rule.disposition, scope: scopeFor(rule, matched.map((item) => item.ticket), entities), recognition: { phrases: recognition, symptomIds: [], errorSignals: [], contextSignals: unique(matched.flatMap((item) => item.ticket.symptoms ?? [])).map(sanitize).slice(0, 20) }, requiredContext: [], possibleCauseIds: [], diagnosticIds: [], resolutionFlow: [], policyIds: [], parentCaseIds: [], specializesCaseIds: [], relatedCaseIds: [], onSuccessCaseId: null, onFailureCaseId: null, requiresClarificationCaseIds: [], escalationIds: /escalation|attachment/.test(rule.disposition) ? ['escalation.known_flow_exhausted'] : [], relationships: [], escalateWhen: /escalation|attachment/.test(rule.disposition) ? ['Human review or current authoritative state is required.'] : [], confidence: 'corpus-derived', provenance: { sourceClass: 'canonical_historical', sourceCount: transcriptIds.length, transcriptIds, historicalFactIds: factIds, currentSourceRefs: [], contradictionIds: [] } };
    if (rule.disposition === 'dynamic_lookup_case') caseRecord.requiredContext = ['current lookup selector'];
    if (rule.disposition === 'clarification_case') caseRecord.requiredContext = ['exact product/account and observed state'];
    if (rule.disposition === 'policy_escalation') caseRecord.policyIds = ['policy.refund_or_replacement.current_state_required'];
    if (rule.id === 'case.loader.closes_runtime') { caseRecord.diagnosticIds = ['diagnostic.loader.webview_present']; caseRecord.resolutionFlow = [{ procedureId: 'procedure.loader.install_webview_runtime', onSuccess: 'outcome.resolved', onFailure: 'escalation.known_flow_exhausted' }]; caseRecord.escalationIds = ['escalation.known_flow_exhausted']; }
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
  const rustParent = cases.find((item) => item.id === 'case.rust.nfa.server_load_crash');
  const rustContinue = cases.find((item) => item.id === 'case.rust.nfa.server_load_crash.continue');
  if (rustParent && rustContinue) {
    rustParent.onFailureCaseId = rustContinue.id;
    rustParent.relatedCaseIds = unique([...rustParent.relatedCaseIds, rustContinue.id]);
    rustContinue.parentCaseIds = [rustParent.id];
    rustContinue.specializesCaseIds = [rustParent.id];
    rustContinue.relatedCaseIds = unique([...rustContinue.relatedCaseIds, rustParent.id]);
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
  const statefulConversations = buildStatefulConversations();
  const residualAnalysis = buildResidualAnalysis(caseCoverage, tickets, caseById);
  const goldDistribution = buildGoldDistribution(historicalUtteranceGold);
  return { cases, caseCoverage, factRuntimeUsage, historicalRuleHoldout, historicalUtteranceGold, adversarial, statefulConversations, residualAnalysis, goldDistribution };
}

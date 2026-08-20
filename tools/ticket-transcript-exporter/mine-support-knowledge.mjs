#!/usr/bin/env node

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const TOOL_VERSION = '1.1.0';
const ANALYSIS_SUBDIR = 'analysis-input';
const OUTPUT_SUBDIR = 'mining';
const DEFAULT_SAMPLE_LIMIT = 12;

const STOPWORDS = new Set([
  'a','about','after','again','all','also','am','an','and','any','are','as','at','be','because','been','before','being','but','by','can','could','did','do','does','doing','done','for','from','get','getting','got','had','has','have','having','he','hello','help','here','hey','hi','how','i','id','if','im','in','into','is','it','its','just','like','me','my','no','not','now','of','ok','okay','on','one','or','our','out','please','so','some','still','that','the','their','them','then','there','they','this','to','too','up','us','was','we','were','what','when','where','which','who','why','will','with','would','yeah','yes','you','your','youre'
]);

const INTENT_RULES = [
  {
    id: 'ticket_created_by_mistake',
    label: 'Ticket Created By Mistake',
    category: 'Ticket Administration',
    patterns: [/didn.?t mean to (?:make|open|create)/i, /accident(?:al|ally)?(?: opened| made| created)?/i, /wrong ticket/i, /close (?:this|the )?ticket/i, /nvm.*close/i]
  },
  {
    id: 'order_not_received',
    label: 'Order Not Received',
    category: 'Orders & Delivery',
    patterns: [/not received/i, /didn.?t receive/i, /didnt receive/i, /haven.?t received/i, /havent received/i, /never received/i, /where(?:'s| is) my (?:order|key|license|account)/i, /nothing (?:was )?(?:received|delivered)/i, /order.*(?:missing|not here)/i, /paid.*(?:nothing|no email|no key|no account)/i]
  },
  {
    id: 'manual_license_delivery',
    label: 'Manual License Delivery',
    category: 'Orders & Delivery',
    patterns: [/generate my key/i, /key manually/i, /manual(?:ly)? generate/i, /send my order id/i, /here(?:'s| is) my order id/i, /license.*order id/i, /unable to generate (?:my )?(?:key|license)/i, /auto(?:matic)? delivery failed/i]
  },
  {
    id: 'order_manual_review_or_processing',
    label: 'Order Manual Review Or Processing',
    category: 'Orders & Delivery',
    patterns: [/manual review/i, /under review/i, /manual action required/i, /partial delivery/i, /order.*(?:processing|pending review)/i, /payment.*under review/i, /process(?:ed|ing) (?:the )?order manually/i]
  },
  {
    id: 'license_invalid_or_expired',
    label: 'License Invalid Or Expired',
    category: 'Licensing',
    patterns: [/key (?:is )?invalid/i, /invalid (?:key|license)/i, /license (?:is )?invalid/i, /key (?:doesn.?t|does not|won.?t|wont) work/i, /license (?:doesn.?t|does not|won.?t|wont) work/i, /key expired/i, /license expired/i, /expired key/i]
  },
  {
    id: 'payment_issue',
    label: 'Payment Issue',
    category: 'Payments',
    patterns: [/payment (?:failed|error|issue|problem|pending|declined)/i, /card (?:declined|failed|charged|locked)/i, /checkout (?:failed|error|issue)/i, /charged (?:twice|but|and)/i, /payment.*(?:not going|won.?t|wont|doesn.?t|doesnt)/i, /keeps? declining/i, /money.*(?:taken|deducted).*nothing/i]
  },
  {
    id: 'payment_method_or_manual_checkout',
    label: 'Payment Method Or Manual Checkout',
    category: 'Payments',
    patterns: [/(?:paypal|stripe|cashapp|venmo|card|crypto|btc|ltc|solana).{0,50}(?:pay|payment|buy|checkout)/i, /(?:pay|payment|buy|checkout).{0,50}(?:paypal|stripe|cashapp|venmo|card|crypto|btc|ltc|solana)/i, /payment link/i, /temp(?:orary)? (?:payment )?link/i, /buy from here/i, /pay you .* onsite balance/i]
  },
  {
    id: 'crypto_payment_pending',
    label: 'Crypto Payment Pending Or Confirmation',
    category: 'Payments',
    patterns: [/(?:crypto|btc|bitcoin|ltc|litecoin|solana).{0,80}(?:confirm|confirmation|pending|sent|waiting|received|arrive)/i, /(?:confirmations?|block ?chain|blockchain|network confirmation)/i, /transaction.*(?:confirm|pending|sent)/i]
  },
  {
    id: 'wallet_topup_or_store_balance',
    label: 'Wallet Top-Up Or Store Balance',
    category: 'Payments',
    patterns: [/(?:wallet|onsite|on[- ]?site|site|store) balance/i, /top ?up/i, /add (?:money|funds|\$?\d+).*balance/i, /deposit.*wallet/i, /store credit/i, /wallet credit/i]
  },
  {
    id: 'refund_request',
    label: 'Refund Request',
    category: 'Payments',
    patterns: [/refund/i, /money back/i, /chargeback/i, /return my money/i]
  },
  {
    id: 'website_or_checkout_problem',
    label: 'Website Or Checkout Problem',
    category: 'Website & Checkout',
    patterns: [/(?:website|site).*(?:down|not working|broken|error|offline)/i, /(?:down|not working|broken|offline).*(?:website|site)/i, /checkout.*(?:not working|won.?t|wont|unable|error|declin)/i, /unable to start secure checkout/i, /buymeacoffee.*(?:not working|won.?t|wont|error|open)/i, /stripe.*(?:not working|down|error)/i]
  },
  {
    id: 'discord_role_access',
    label: 'Discord Role Or Purchase Access',
    category: 'Discord Access',
    patterns: [/customer role/i, /give me (?:my )?role/i, /purchase role/i, /verify (?:my )?purchase/i, /role.*(?:purchase|bought|order|vouch)/i, /access (?:to )?(?:the )?(?:customer|download|support) channel/i]
  },
  {
    id: 'dashboard_access_or_verification',
    label: 'Dashboard Access Or Verification',
    category: 'Discord Access',
    patterns: [/verification code/i, /dashboard.*(?:login|log in|code|access|verify|verification)/i, /(?:login|log in|code|access|verify|verification).*dashboard/i, /link (?:my )?discord.*(?:site|web|dashboard)/i, /discord.*(?:link|linked).*dashboard/i]
  },
  {
    id: 'restock_availability',
    label: 'Restock Or Availability',
    category: 'Product Availability',
    patterns: [/restock/i, /out of stock/i, /sold out/i, /when.*(?:back|available|stock)/i, /(?:is|are).*available/i, /stock.*(?:when|soon|eta)/i, /have .* in stock/i]
  },
  {
    id: 'account_purchase_request',
    label: 'Account Purchase Request',
    category: 'Pre-Sales',
    patterns: [/(?:buy|purchase|lemme get|let me get|can i get|wanna buy|want to buy).{0,50}(?:nfa|account|accounts|acc|accs)/i, /(?:nfa|account|accounts|acc|accs).{0,50}(?:buy|purchase)/i]
  },
  {
    id: 'bulk_account_purchase',
    label: 'Bulk Account Purchase',
    category: 'Pre-Sales',
    patterns: [/\bbulk\b.*(?:nfa|account|acc)/i, /(?:nfa|accounts?|accs?).*\bbulk\b/i, /buy (?:like )?\d+ .*?(?:accounts|accs)/i, /\d+\+? (?:accounts|accs)/i, /minimum purchase.*units/i]
  },
  {
    id: 'product_pre_purchase_question',
    label: 'Pre-Purchase Product Question',
    category: 'Pre-Sales',
    patterns: [/before i buy/i, /thinking (?:of|about) buying/i, /which (?:one|product)/i, /what (?:product|cheat|plan)/i, /does (?:it|this|the).*work/i, /is (?:it|this|the).*worth/i, /how much/i, /price/i]
  },
  {
    id: 'discount_or_coupon',
    label: 'Discount, Coupon Or Promotion',
    category: 'Pre-Sales',
    patterns: [/coupon/i, /discount(?: code)?/i, /promo(?: code|tion)?/i, /special offer/i, /any offers/i]
  },
  {
    id: 'review_feedback',
    label: 'Review Or Feedback',
    category: 'Community',
    patterns: [/leave a review/i, /write a review/i, /review (?:it|this|the product)/i, /feedback/i, /vouch/i, /testimonial/i]
  },
  {
    id: 'partnership_business_inquiry',
    label: 'Partnership Or Business Inquiry',
    category: 'Business',
    patterns: [/partnership/i, /partner with/i, /affiliate/i, /resell/i, /reseller/i, /media for/i, /content creator/i, /payment processing/i, /collab/i, /collaboration/i, /sponsor/i, /supplier/i, /supply you/i]
  },
  {
    id: 'media_application',
    label: 'Media Or Creator Application',
    category: 'Business',
    patterns: [/need media/i, /hire.*media/i, /do media/i, /media creator/i, /media team/i, /media for you/i, /make media/i, /videos? for you/i]
  },
  {
    id: 'download_or_documentation',
    label: 'Download Or Documentation',
    category: 'Product Access',
    patterns: [/where.*download/i, /download (?:link|page|file|loader)/i, /how.*download/i, /docs/i, /documentation/i, /guide/i, /setup instructions/i, /install(?:ation)? (?:guide|instructions)/i, /where.*loader/i, /need (?:the )?loader/i]
  },
  {
    id: 'nfa_key_redemption_or_activation',
    label: 'NFA Key Redemption Or Activation',
    category: 'Product Access',
    patterns: [/(?:redeem|activate|use).{0,50}(?:nfa|account|key|token)/i, /(?:nfa|account|key|token).{0,50}(?:redeem|activate|use)/i, /how do i use (?:it|this|the )?(?:key|token)/i, /what (?:do|should) i do with (?:the |my )?(?:key|token)/i]
  },
  {
    id: 'launch_or_loader_error',
    label: 'Launch Or Loader Error',
    category: 'Technical Support',
    restrictedTechnical: true,
    patterns: [/loader.*(?:error|fail|stuck|crash|close|open|fetch)/i, /(?:error|failed).*loader/i, /won.?t (?:launch|open|start)/i, /wont (?:launch|open|start)/i, /doesn.?t (?:launch|open|start)/i, /doesnt (?:launch|open|start)/i, /crash(?:es|ing)? (?:on|when|after) (?:launch|open|start|loading)/i, /stuck (?:on|at).*(?:loader|loading)/i, /downloading data.*closes/i]
  },
  {
    id: 'account_credentials',
    label: 'Account Credentials Or Login',
    category: 'Accounts',
    patterns: [/wrong password/i, /password (?:doesn.?t|does not|won.?t|wont) work/i, /can.?t log ?in/i, /cant log ?in/i, /cannot log ?in/i, /login (?:error|issue|problem)/i, /credentials/i, /email.*password/i, /account.*(?:locked|login|password|email)/i]
  },
  {
    id: 'nfa_account_invalid_or_lost',
    label: 'NFA Account Invalid, Logged Out Or Lost',
    category: 'Accounts',
    patterns: [/nfa.*(?:invalid|inactive|logged out|signed out|not working|doesn.?t work|doesnt work|wont work)/i, /account.*(?:went|gone|became|straight up).*invalid/i, /(?:logged|signed) out.*account/i, /account.*(?:logged|signed) (?:me )?out/i, /invalid account/i, /account.*(?:inactive|session data changed)/i]
  },
  {
    id: 'account_banned_locked_or_wrong_spec',
    label: 'Account Banned, Locked Or Wrong Specification',
    category: 'Accounts',
    patterns: [/account.*(?:banned|vac|game ban|cooldown|locked)/i, /(?:banned|vac|game ban|cooldown|locked).*account/i, /non[- ]?prime/i, /premier.*(?:not|missing|low|locked)/i, /wrong.*(?:account|hours|rating|prime)/i, /account.*(?:not prime|wrong hours|wrong rating)/i]
  },
  {
    id: 'account_owner_active_or_session_conflict',
    label: 'Account Owner Active Or Session Conflict',
    category: 'Accounts',
    patterns: [/owner.*(?:playing|online|logged|using)/i, /someone else.*(?:account|playing|logged)/i, /another user.*account/i, /account.*already.*playing/i, /session.*(?:changed|conflict|invalid)/i]
  },
  {
    id: 'subscription_duration',
    label: 'Subscription Duration Or Expiry',
    category: 'Licensing',
    patterns: [/how long/i, /(?:day|week|month|lifetime) (?:key|license|sub|subscription)/i, /subscription.*(?:expire|duration|time)/i, /time (?:left|remaining)/i, /when.*expire/i]
  },
  {
    id: 'hardware_reset',
    label: 'Hardware ID Reset',
    category: 'Technical Support',
    restrictedTechnical: true,
    patterns: [/hwid/i, /hardware id/i, /hardware-id/i]
  },
  {
    id: 'anti_cheat_or_ban',
    label: 'Anti-Cheat, Detection Or Ban',
    category: 'Restricted Technical Support',
    restrictedTechnical: true,
    patterns: [/anti[- ]?cheat/i, /detected/i, /undetected/i, /(?:got|was|am|i.?m) banned/i, /ban(?:ned)? (?:risk|wave|issue)/i, /bypass/i, /spoofer/i, /spoof(?:ed|ing)?/i]
  },
  {
    id: 'product_status_question',
    label: 'Product Status Or Compatibility Question',
    category: 'Restricted Technical Support',
    restrictedTechnical: true,
    patterns: [/(?:cheat|spoofer|spoof|loader).{0,40}(?:working|work|up|down|online|offline|compatible)/i, /(?:working|work|up|down|online|offline|compatible).{0,40}(?:cheat|spoofer|spoof|loader)/i, /(?:rust|fortnite|apex|warzone|pubg).{0,30}(?:cheat|spoofer).{0,30}(?:work|working|up|down)/i]
  },
  {
    id: 'injection_driver_or_kernel',
    label: 'Injection, Driver Or Kernel Issue',
    category: 'Restricted Technical Support',
    restrictedTechnical: true,
    patterns: [/inject(?:or|ion|ing)?/i, /kernel/i, /driver (?:error|fail|failed|issue|problem|load)/i, /mapper/i, /map driver/i]
  },
  {
    id: 'performance_or_game_crash',
    label: 'Performance Or Game Crash',
    category: 'Technical Support',
    restrictedTechnical: true,
    patterns: [/fps/i, /frame(?:s)? (?:drop|low)/i, /lag(?:ging|gy)?/i, /stutter/i, /game (?:crash|crashes|crashing|freeze|freezes)/i, /bsod/i, /blue screen/i]
  },
  {
    id: 'update_or_service_outage',
    label: 'Update Or Service Outage',
    category: 'Service Status',
    patterns: [/outdated/i, /needs? (?:an )?update/i, /update (?:when|eta|issue|problem)/i, /maintenance/i, /service.*(?:down|offline)/i, /(?:loader|product|service|servers?) (?:is |are )?(?:down|offline)/i, /servers?.*(?:issue|down|offline)/i]
  },
  {
    id: 'replacement_request',
    label: 'Replacement Request',
    category: 'Orders & Delivery',
    patterns: [/replacement/i, /replace (?:it|this|my|the)/i, /need (?:a )?new (?:account|key|license)/i, /(?:account|key|license).*(?:dead|revoked)/i, /can i get (?:a )?new account/i]
  },
  {
    id: 'credential_change_or_recovery',
    label: 'Credential Change Or Recovery',
    category: 'Accounts',
    patterns: [/change (?:my )?(?:email|password)/i, /reset (?:my )?password/i, /forgot (?:my )?password/i, /recover (?:my )?account/i, /account recovery/i]
  },
  {
    id: 'remote_support',
    label: 'Remote Support Request',
    category: 'Technical Support',
    restrictedTechnical: true,
    patterns: [/anydesk/i, /teamviewer/i, /screen ?share/i, /remote (?:in|support|desktop)/i]
  },
  {
    id: 'product_configuration',
    label: 'Product Configuration Or Features',
    category: 'Restricted Technical Support',
    restrictedTechnical: true,
    patterns: [/config(?:uration)?/i, /settings?/i, /aimbot/i, /\besp\b/i, /menu (?:option|setting|feature)/i, /feature.*(?:work|enable|disable)/i, /controller.*(?:aim|lock)/i]
  },
  {
    id: 'support_followup_or_no_response',
    label: 'Support Follow-Up Or No Response',
    category: 'Ticket Administration',
    patterns: [/no reply/i, /not responding/i, /anyone available/i, /any admins/i, /you there/i, /are you there/i, /day no reply/i]
  }
];

function parseInteger(value, label, { min, max }) {
  if (!/^\d+$/.test(value ?? '')) throw new Error(`${label} must be an integer.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${label} must be between ${min} and ${max}.`);
  }
  return parsed;
}

export function parseArgs(argv) {
  const options = { dataDir: undefined, sampleLimit: DEFAULT_SAMPLE_LIMIT, force: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      if (index + 1 >= argv.length) throw new Error(`${arg} requires a value.`);
      index += 1;
      return argv[index];
    };
    switch (arg) {
      case '--data-dir': options.dataDir = next(); break;
      case '--sample-limit': options.sampleLimit = parseInteger(next(), '--sample-limit', { min: 3, max: 30 }); break;
      case '--force': options.force = true; break;
      case '--help':
      case '-h': options.help = true; break;
      default: throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!options.help) {
    if (!options.dataDir) throw new Error('--data-dir is required.');
    options.dataDir = resolve(options.dataDir);
    options.analysisDir = join(options.dataDir, ANALYSIS_SUBDIR);
    options.outputDir = join(options.analysisDir, OUTPUT_SUBDIR);
  }
  return options;
}

export function helpText() {
  return `CM Support Knowledge Miner v${TOOL_VERSION}\n\n` +
    'Usage:\n' +
    '  node mine-support-knowledge.mjs --data-dir <CM-Ticket-Transcripts> [options]\n\n' +
    'Builds deterministic, data-only intent candidates and phrase statistics from the complete transcript analysis pack.\n' +
    'Topic matching uses all deterministic review excerpts rather than relying only on the inferred opening customer.\n' +
    'This is a mining layer, not canonical support policy. Restricted technical subjects are flagged for human escalation.\n\n' +
    'Options:\n' +
    `  --sample-limit <n>   Evidence samples per intent, 3-30 (default: ${DEFAULT_SAMPLE_LIMIT}).\n` +
    '  --force              Replace an existing analysis-input/mining directory.\n';
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
    try { records.push(JSON.parse(line)); }
    catch { throw new Error(`Invalid JSON in ${label} at line ${lineNumber}.`); }
  }
  return records;
}

export function sanitizeExcerpt(input) {
  return String(input ?? '')
    .replace(/https?:\/\/\S+/gi, '<url>')
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '<email>')
    .replace(/<@!?\d+>/g, '<mention>')
    .replace(/\b\d{15,20}\b/g, '<id>')
    .replace(/\b(?=[A-Z0-9-]{8,}\b)(?=[A-Z0-9-]*[A-Z])(?=[A-Z0-9-]*\d)[A-Z0-9-]{8,}\b/g, '<token>')
    .replace(/\s+/g, ' ')
    .trim();
}

function customerText(record) {
  return (record.openingCustomerMessages ?? []).map((message) => message.content ?? '').join('\n').trim();
}

function staffTexts(record) {
  return (record.earlyOtherHumanResponses ?? []).map((message) => message.content ?? '').filter(Boolean);
}

function reviewTopicText(record) {
  const messages = [
    ...(record.openingCustomerMessages ?? []),
    ...(record.earlyOtherHumanResponses ?? []),
    ...(record.closingHumanMessages ?? [])
  ];
  const seen = new Set();
  const parts = [];
  for (const message of messages) {
    const content = String(message?.content ?? '').trim();
    if (!content) continue;
    const key = `${message?.timestamp ?? ''}|${message?.author?.id ?? ''}|${content}`;
    if (seen.has(key)) continue;
    seen.add(key);
    parts.push(content);
  }
  return parts.join('\n').trim();
}

function normalizeForMatching(text) {
  return sanitizeExcerpt(text).toLowerCase();
}

function tokenize(text) {
  return normalizeForMatching(text)
    .replace(/<[^>]+>/g, ' ')
    .split(/[^a-z0-9+._-]+/)
    .map((token) => token.replace(/^[-_.]+|[-_.]+$/g, ''))
    .filter((token) => token.length >= 2 && token.length <= 40 && !STOPWORDS.has(token));
}

function documentPhrases(text) {
  const tokens = tokenize(text);
  const phrases = new Set();
  for (const token of tokens) phrases.add(token);
  for (let index = 0; index + 1 < tokens.length; index += 1) {
    phrases.add(`${tokens[index]} ${tokens[index + 1]}`);
  }
  return phrases;
}

function increment(map, key, amount = 1) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function topEntries(map, limit, minimum = 1) {
  return [...map.entries()]
    .filter(([, count]) => count >= minimum)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([value, count]) => ({ value, count }));
}

function scoreIntent(text, rule) {
  let score = 0;
  for (const pattern of rule.patterns) if (pattern.test(text)) score += 1;
  return score;
}

function stableSamples(records, limit) {
  if (records.length <= limit) return records;
  const selected = [];
  const used = new Set();
  for (let index = 0; index < limit; index += 1) {
    const position = Math.floor((index * (records.length - 1)) / Math.max(1, limit - 1));
    if (!used.has(position)) {
      used.add(position);
      selected.push(records[position]);
    }
  }
  return selected;
}

function normalizedResponsePattern(text) {
  return sanitizeExcerpt(text)
    .toLowerCase()
    .replace(/[.!?,;:]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function informationDisposition(record, topicText) {
  if ((record.humanMessageCount ?? 0) === 0) return 'no_human_content';
  const informative = normalizeForMatching(topicText)
    .replace(/<(?:url|email|mention|token|id)>/g, ' ')
    .replace(/[^a-z0-9]+/g, '')
    .trim();
  if (informative.length < 8) return 'low_information';
  return 'reviewable';
}

export async function mineSupportKnowledge(options) {
  const manifest = await readJson(join(options.analysisDir, 'manifest.json'));
  const expectedCount = manifest?.sourceTranscriptCount;
  if (!Number.isSafeInteger(expectedCount) || expectedCount <= 0) {
    throw new Error('analysis-input/manifest.json is missing a valid sourceTranscriptCount.');
  }

  const review = await readNdjson(join(options.analysisDir, 'review.ndjson'), 'review.ndjson');
  if (review.length !== expectedCount) {
    throw new Error(`review.ndjson record count ${review.length} does not match manifest sourceTranscriptCount ${expectedCount}.`);
  }

  try {
    await readFile(join(options.outputDir, 'manifest.json'), 'utf8');
    if (!options.force) throw new Error(`Knowledge mining output already exists at ${options.outputDir}. Use --force to replace it.`);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  if (options.force) await rm(options.outputDir, { recursive: true, force: true });
  await mkdir(options.outputDir, { recursive: true });

  const ruleById = new Map(INTENT_RULES.map((rule) => [rule.id, rule]));
  const intentBuckets = new Map(INTENT_RULES.map((rule) => [rule.id, []]));
  const ticketAssignments = [];
  const customerPhraseDf = new Map();
  const topicPhraseDf = new Map();
  const staffResponseCounts = new Map();
  const tokenDf = new Map();
  const unclassified = [];
  const dispositionCounts = new Map();

  for (const record of review) {
    const rawCustomer = customerText(record);
    const rawTopic = reviewTopicText(record);
    const matchText = normalizeForMatching(rawTopic);
    const disposition = informationDisposition(record, rawTopic);
    increment(dispositionCounts, disposition);
    const assignments = [];

    if (disposition === 'reviewable') {
      for (const rule of INTENT_RULES) {
        const score = scoreIntent(matchText, rule);
        if (score > 0) {
          assignments.push({ id: rule.id, score });
          intentBuckets.get(rule.id).push({
            record,
            score,
            customer: sanitizeExcerpt(rawCustomer),
            topic: sanitizeExcerpt(rawTopic)
          });
        }
      }
    }

    assignments.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    if (assignments.length === 0) {
      unclassified.push({
        transcriptId: record.transcriptId,
        disposition,
        customer: sanitizeExcerpt(rawCustomer),
        topic: sanitizeExcerpt(rawTopic),
        messageCount: record.messageCount,
        humanMessageCount: record.humanMessageCount
      });
    }

    ticketAssignments.push({
      transcriptId: record.transcriptId,
      disposition,
      primaryIntent: assignments[0]?.id ?? null,
      intents: assignments,
      restrictedTechnical: assignments.some((assignment) => ruleById.get(assignment.id)?.restrictedTechnical === true)
    });

    for (const phrase of documentPhrases(rawCustomer)) increment(customerPhraseDf, phrase);
    for (const phrase of documentPhrases(rawTopic)) increment(topicPhraseDf, phrase);
    for (const token of new Set(tokenize(rawCustomer))) increment(tokenDf, token);
    for (const response of staffTexts(record)) {
      const normalized = normalizedResponsePattern(response);
      if (normalized.length >= 3 && normalized.length <= 300) increment(staffResponseCounts, normalized);
    }
  }

  const intents = INTENT_RULES.map((rule) => {
    const bucket = intentBuckets.get(rule.id);
    bucket.sort((a, b) => b.score - a.score || String(a.record.transcriptId).localeCompare(String(b.record.transcriptId)));
    const samples = stableSamples(bucket, options.sampleLimit).map(({ record, score, customer, topic }) => ({
      transcriptId: record.transcriptId,
      score,
      customer,
      topic,
      staffResponses: staffTexts(record).slice(0, 4).map(sanitizeExcerpt)
    }));

    const customerPhraseCounts = new Map();
    const topicPhraseCounts = new Map();
    const responseCounts = new Map();
    for (const item of bucket) {
      for (const phrase of documentPhrases(customerText(item.record))) increment(customerPhraseCounts, phrase);
      for (const phrase of documentPhrases(reviewTopicText(item.record))) increment(topicPhraseCounts, phrase);
      for (const response of staffTexts(item.record)) {
        const normalized = normalizedResponsePattern(response);
        if (normalized.length >= 3 && normalized.length <= 300) increment(responseCounts, normalized);
      }
    }

    return {
      id: rule.id,
      label: rule.label,
      category: rule.category,
      restrictedTechnical: rule.restrictedTechnical === true,
      ticketCount: bucket.length,
      topTopicPhrases: topEntries(topicPhraseCounts, 30, 2),
      topCustomerPhrases: topEntries(customerPhraseCounts, 25, 2),
      recurringStaffResponses: topEntries(responseCounts, 15, 2),
      samples
    };
  }).sort((a, b) => b.ticketCount - a.ticketCount || a.id.localeCompare(b.id));

  const classifiedTicketCount = ticketAssignments.filter((entry) => entry.intents.length > 0).length;
  const reviewableUnclassifiedCount = unclassified.filter((entry) => entry.disposition === 'reviewable').length;
  const outputManifest = {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    toolVersion: TOOL_VERSION,
    sourceAnalysisToolVersion: manifest.toolVersion,
    sourceTranscriptCount: expectedCount,
    classifiedTicketCount,
    unclassifiedTicketCount: unclassified.length,
    reviewableUnclassifiedCount,
    coveragePercent: Number(((classifiedTicketCount / expectedCount) * 100).toFixed(2)),
    dispositionCounts: Object.fromEntries([...dispositionCounts.entries()].sort(([a], [b]) => a.localeCompare(b))),
    intentCount: intents.length,
    restrictedIntentCount: intents.filter((intent) => intent.restrictedTechnical).length,
    note: 'Mining output is candidate evidence only. It must be reviewed against full corpus tickets before becoming canonical chatbot policy.'
  };

  const phrases = {
    schemaVersion: 2,
    customerDocumentPhrases: topEntries(customerPhraseDf, 300, 3),
    topicDocumentPhrases: topEntries(topicPhraseDf, 400, 3),
    customerTokens: topEntries(tokenDf, 250, 3),
    recurringStaffResponses: topEntries(staffResponseCounts, 200, 2)
  };

  const unclassifiedOutput = {
    schemaVersion: 2,
    count: unclassified.length,
    reviewableCount: reviewableUnclassifiedCount,
    samples: stableSamples(unclassified, Math.min(100, Math.max(20, options.sampleLimit * 5)))
  };

  const readme = `# Support Knowledge Mining\n\n` +
    `Deterministic mining over all ${expectedCount} transcript review records.\n\n` +
    `Topic classification uses opening, early-response and closing review excerpts so tickets with short or mis-inferred openings are still represented.\n\n` +
    `- \`intent-candidates.json\` — candidate intent buckets with counts, topic/customer phrases, recurring staff responses and evidence samples.\n` +
    `- \`ticket-intents.ndjson\` — per-ticket rule matches, primary intent, disposition and restricted-topic flag.\n` +
    `- \`phrases.json\` — corpus-wide customer/topic phrases and recurring staff response patterns.\n` +
    `- \`unclassified.json\` — representative unmatched tickets.\n` +
    `- \`unclassified.ndjson\` — every unmatched ticket, sanitized, for exhaustive follow-up review.\n` +
    `- \`manifest.json\` — provenance and coverage counts.\n\n` +
    `This output is not canonical support policy. Historical staff responses may be wrong, obsolete or contradictory. ` +
    `Restricted technical topics are explicitly flagged and should route to human review rather than become autonomous chatbot instructions.\n`;

  await writeFile(join(options.outputDir, 'manifest.json'), `${JSON.stringify(outputManifest, null, 2)}\n`);
  await writeFile(join(options.outputDir, 'intent-candidates.json'), `${JSON.stringify({ schemaVersion: 2, intents }, null, 2)}\n`);
  await writeFile(join(options.outputDir, 'phrases.json'), `${JSON.stringify(phrases, null, 2)}\n`);
  await writeFile(join(options.outputDir, 'unclassified.json'), `${JSON.stringify(unclassifiedOutput, null, 2)}\n`);
  await writeFile(join(options.outputDir, 'unclassified.ndjson'), `${unclassified.map((entry) => JSON.stringify(entry)).join('\n')}\n`);
  await writeFile(join(options.outputDir, 'ticket-intents.ndjson'), `${ticketAssignments.map((entry) => JSON.stringify(entry)).join('\n')}\n`);
  await writeFile(join(options.outputDir, 'README.md'), readme);

  return {
    transcriptCount: expectedCount,
    classifiedTicketCount,
    unclassifiedTicketCount: unclassified.length,
    reviewableUnclassifiedCount,
    coveragePercent: outputManifest.coveragePercent,
    outputDir: options.outputDir
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(helpText());
    return;
  }
  const result = await mineSupportKnowledge(options);
  console.log(`[transcripts] support mining complete: transcripts=${result.transcriptCount} classified=${result.classifiedTicketCount} unclassified=${result.unclassifiedTicketCount} reviewableUnclassified=${result.reviewableUnclassifiedCount} coverage=${result.coveragePercent}%`);
  console.log(`[transcripts] wrote data-only mining output to ${result.outputDir}`);
}

const entryUrl = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined;
if (entryUrl === import.meta.url) {
  main().catch((error) => {
    console.error(`[transcripts] support mining failed: ${String(error?.message ?? error).slice(0, 2000)}`);
    process.exitCode = 1;
  });
}

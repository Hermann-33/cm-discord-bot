import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const clarification = (value) => ({
  answerType: 'enum',
  options: [],
  setsContext: [],
  distinguishesCases: [],
  distinguishesFamilies: [],
  increasesCases: {},
  decreasesCases: {},
  rulesOutCases: {},
  liveLookupCanReplace: [],
  restrictedSafetyBoundary: 'ordinary_safe_support_context_only',
  effort: 1,
  ...value
});

export const CANONICAL_CLARIFICATIONS = [
  clarification({
    id: 'clarify.support_surface',
    scope: { global: true },
    question: "What isn't working: an NFA/account, a loader or product, or something with the website, payment, or order?",
    options: ['nfa_or_account', 'loader_or_product', 'website_payment_or_order', 'something_else'],
    setsContext: ['supportSurface'],
    distinguishesFamilies: ['accounts.nfa','accounts.delivery','technical.loader','technical.product','website.checkout','commerce.payment','commerce.order','commerce.fulfillment'],
    increasesCases: {
      nfa_or_account: ['case.nfa.invalid_first_use','case.nfa.invalid_after_use','case.nfa.owner_session_conflict','case.nfa.redemption_activation'],
      loader_or_product: ['case.loader.closes_runtime','case.loader.connection','case.loader.update','case.product.launch_failure'],
      website_payment_or_order: ['case.website.checkout_failure','case.payment.failed_or_pending','case.order.status','case.order.fulfillment_delayed']
    },
    liveLookupCanReplace: ['users.overview.read','orders.lookup.read']
  }),
  clarification({
    id: 'clarify.product_identity',
    scope: { families: ['technical.loader','technical.product','product.compatibility','catalog.dynamic'] },
    question: 'Which game or product is this about?',
    answerType: 'entity',
    setsContext: ['gameId','productId','vendorId'],
    distinguishesFamilies: ['technical.loader','technical.product','product.compatibility','catalog.dynamic'],
    liveLookupCanReplace: ['users.overview.read','orders.lookup.read']
  }),
  clarification({
    id: 'clarify.account_type',
    scope: { families: ['accounts.nfa','accounts.delivery','accounts.access','accounts.full_access'] },
    question: 'Is this an NFA account, a full-access account, or a manually delivered account/service?',
    options: ['nfa','full_access','manual_service','not_sure'],
    setsContext: ['accountModel'],
    distinguishesCases: ['case.nfa.access_model_question','case.account.full_access','case.account.manual_service'],
    distinguishesFamilies: ['accounts.nfa','accounts.full_access','accounts.manual_service'],
    liveLookupCanReplace: ['orders.details.read','orders.fulfillment.read']
  }),
  clarification({
    id: 'clarify.nfa.failure_stage',
    scope: { accountModels: ['account_model.nfa'], families: ['accounts.nfa'] },
    question: 'Did the NFA account never work, did it work before and become invalid later, or are you being logged out because someone else is using it?',
    options: ['never_worked','worked_then_invalid','owner_or_session_conflict','activation_or_token_issue','not_sure'],
    setsContext: ['nfaFailureStage','workedBefore','ownerSessionConflict'],
    distinguishesCases: ['case.nfa.invalid_first_use','case.nfa.invalid_after_use','case.nfa.owner_session_conflict','case.nfa.redemption_activation'],
    distinguishesFamilies: ['accounts.nfa'],
    increasesCases: {
      never_worked: ['case.nfa.invalid_first_use'],
      worked_then_invalid: ['case.nfa.invalid_after_use'],
      owner_or_session_conflict: ['case.nfa.owner_session_conflict'],
      activation_or_token_issue: ['case.nfa.redemption_activation']
    },
    rulesOutCases: {
      never_worked: ['case.nfa.invalid_after_use'],
      worked_then_invalid: ['case.nfa.invalid_first_use']
    },
    liveLookupCanReplace: ['orders.details.read']
  }),
  clarification({
    id: 'clarify.nfa.session_state',
    scope: { accountModels: ['account_model.nfa'], families: ['accounts.nfa'] },
    question: 'What happens now: invalid/locked, password requested, logged out, or another person is active on the account?',
    options: ['invalid_or_locked','password_requested','logged_out','other_person_active','different_issue'],
    setsContext: ['nfaSessionState','ownerSessionConflict'],
    distinguishesCases: ['case.nfa.invalid_first_use','case.nfa.invalid_after_use','case.nfa.owner_session_conflict'],
    distinguishesFamilies: ['accounts.nfa']
  }),
  clarification({
    id: 'clarify.account.delivery_state',
    scope: { families: ['accounts.delivery','commerce.fulfillment'] },
    question: 'Did you receive no account/key at all, receive the wrong account, or receive one that cannot be accessed?',
    options: ['nothing_received','wrong_delivery','received_cannot_access','not_sure'],
    setsContext: ['deliveryState'],
    distinguishesCases: ['case.order.fulfillment_delayed','case.order.wrong_delivery','case.account.login_access','case.account.wrong_specification'],
    distinguishesFamilies: ['accounts.delivery','commerce.fulfillment','accounts.access'],
    liveLookupCanReplace: ['orders.details.read','orders.fulfillment.read']
  }),
  clarification({
    id: 'clarify.payment_state',
    scope: { families: ['commerce.payment','commerce.wallet'] },
    question: 'Was the payment declined, is it still pending, or was it completed but nothing appeared?',
    options: ['declined','pending','completed_missing','wallet_balance_issue','not_sure'],
    setsContext: ['paymentState'],
    distinguishesCases: ['case.payment.card_declined','case.payment.failed_or_pending','case.payment.completed_missing_order','case.payment.crypto_pending','case.wallet.balance'],
    distinguishesFamilies: ['commerce.payment','commerce.wallet'],
    liveLookupCanReplace: ['purchase-intents.lookup.read','purchase-intents.process.status.read','users.overview.read']
  }),
  clarification({
    id: 'clarify.order.fulfillment_state',
    scope: { families: ['commerce.order','commerce.fulfillment'] },
    question: 'Are you checking the current order status, waiting for delivery, or saying the delivered item is wrong?',
    options: ['current_status','waiting_for_delivery','wrong_delivery','refund_or_cancel'],
    setsContext: ['orderQuestionType','deliveryState'],
    distinguishesCases: ['case.order.status','case.order.fulfillment_delayed','case.order.wrong_delivery','case.order.refund_cancel'],
    distinguishesFamilies: ['commerce.order','commerce.fulfillment','commerce.policy'],
    liveLookupCanReplace: ['orders.details.read','orders.fulfillment.read']
  }),
  clarification({
    id: 'clarify.order_selector',
    scope: { families: ['commerce.order','commerce.fulfillment','commerce.payment'] },
    question: 'Which recent order or payment is this about? Please use its order/reference selector if more than one is possible.',
    answerType: 'selector',
    setsContext: ['orderSelector','purchaseSelector'],
    distinguishesFamilies: ['commerce.order','commerce.fulfillment','commerce.payment'],
    liveLookupCanReplace: ['orders.lookup.read','purchase-intents.lookup.read']
  }),
  clarification({
    id: 'clarify.loader.failure_stage',
    scope: { families: ['technical.loader'] },
    question: 'What happens with the loader: it closes immediately, fails to connect, fails while downloading/updating, or shows a key/license error?',
    options: ['closes_immediately','connection_failure','download_or_update_failure','key_or_license_error','other'],
    setsContext: ['loaderFailureStage'],
    distinguishesCases: ['case.loader.closes_runtime','case.loader.connection','case.loader.update','case.loader.key_error','case.license.activation'],
    distinguishesFamilies: ['technical.loader','product.license'],
    increasesCases: {
      closes_immediately: ['case.loader.closes_runtime'],
      connection_failure: ['case.loader.connection'],
      download_or_update_failure: ['case.loader.update'],
      key_or_license_error: ['case.loader.key_error','case.license.activation']
    }
  }),
  clarification({
    id: 'clarify.technical.failure_stage',
    scope: { families: ['technical.product','technical.game','product.requirements'] },
    question: 'Where does it fail: before launch/setup, while opening or injecting, while loading the game, or after you are in-game?',
    options: ['setup_or_requirements','launch_or_injection','game_loading','in_game_feature'],
    setsContext: ['technicalFailureStage'],
    distinguishesCases: ['case.product.requirements','case.product.launch_failure','case.game.crash_loading','case.game.crash_general','case.game.feature_behavior','case.game.overlay_menu'],
    distinguishesFamilies: ['technical.product','technical.game','product.requirements'],
    restrictedSafetyBoundary: 'do_not_request_bypass_or_evasion_details'
  }),
  clarification({
    id: 'clarify.catalog.question_type',
    scope: { families: ['catalog.dynamic','catalog.commercial'] },
    question: 'Are you asking about current stock/status, compatibility, price, or access duration?',
    options: ['stock_or_status','compatibility','price','duration'],
    setsContext: ['catalogQuestionType'],
    distinguishesCases: ['case.catalog.availability_status','case.catalog.pricing_duration','case.product.compatibility'],
    distinguishesFamilies: ['catalog.dynamic','catalog.commercial','product.compatibility'],
    liveLookupCanReplace: ['orders.lookup.read']
  }),
  clarification({
    id: 'clarify.website_stage',
    scope: { families: ['website.checkout','website.account','website.dashboard'] },
    question: 'Is the problem signing in/linking Discord, opening checkout or paying, or finding the purchase on your dashboard?',
    options: ['login_or_link','checkout_or_payment','dashboard_or_purchase'],
    setsContext: ['websiteFailureStage'],
    distinguishesCases: ['case.website.login','case.website.checkout_failure','case.dashboard.verification'],
    distinguishesFamilies: ['website.account','website.checkout','website.dashboard'],
    liveLookupCanReplace: ['users.overview.read','orders.lookup.read']
  }),
  clarification({
    id: 'clarify.policy.remedy_request',
    scope: { families: ['commerce.policy','accounts.delivery'] },
    question: 'Are you requesting a refund/cancellation, disputing a replacement, or reporting a wrong delivery?',
    options: ['refund_or_cancel','replacement_dispute','wrong_delivery','information_only'],
    setsContext: ['requestedRemedy'],
    distinguishesCases: ['case.order.refund_cancel','case.nfa.replacement_dispute','case.order.wrong_delivery','case.account.wrong_specification'],
    distinguishesFamilies: ['commerce.policy','accounts.delivery'],
    liveLookupCanReplace: ['orders.details.read'],
    restrictedSafetyBoundary: 'collect_request_type_only_human_authority_decides'
  })
];

export const ACTION_ROUTING_CONTEXT_POLICY = {
  schemaVersion: 1,
  offlineReferenceOnly: true,
  productionApiCallsPerformed: false,
  decisionOrder: ['resolve_explicit_entities','detect_control_plane','use_known_session_context','request_minimum_approved_lookup','evaluate_information_sufficiency','select_clarification','persist_answer','continue_statefully'],
  approvedLookups: [
    { id: 'users.overview.read', useWhen: ['linked user context may identify recent relevant commerce/account state'], suppliesContext: ['recentOrders','walletBalance','auraBalance','entitlements'] },
    { id: 'orders.lookup.read', useWhen: ['order is implied but selector is unknown'], suppliesContext: ['candidateOrderSelectors'] },
    { id: 'orders.details.read', useWhen: ['one order selector is known and product/type/state affects routing'], suppliesContext: ['orderState','productId','variantId','accountModel'] },
    { id: 'orders.fulfillment.read', useWhen: ['delivery or missing key/account is reported'], suppliesContext: ['fulfillmentState','deliveryType'] },
    { id: 'purchase-intents.lookup.read', useWhen: ['payment is reported without an order'], suppliesContext: ['purchaseIntentState','purchaseSelector'] },
    { id: 'purchase-intents.process.status.read', useWhen: ['current payment processing state is required'], suppliesContext: ['paymentState'] },
    { id: 'aura.lookup.read', useWhen: ['Aura balance or adjustment is explicitly requested'], suppliesContext: ['auraBalance','auraState'] }
  ],
  forbidden: ['direct_database_access','unapproved_fields','historical_state_as_current','production_call_from_offline_tooling']
};

function markdown(record) {
  return `# ${record.id}\n\n${record.question}\n\n- Answer type: \`${record.answerType}\`\n- Sets context: ${record.setsContext.join(', ') || 'none'}\n- Distinguishes cases: ${record.distinguishesCases.join(', ') || 'none'}\n- Distinguishes families: ${record.distinguishesFamilies.join(', ') || 'none'}\n- Live lookup can replace: ${record.liveLookupCanReplace.join(', ') || 'none'}\n- Safety boundary: ${record.restrictedSafetyBoundary}\n`;
}

export async function buildCanonicalClarifications(dataDir) {
  const root = resolve(dataDir);
  const directory = join(root, 'knowledge-canonical', 'Clarifications');
  await mkdir(directory, { recursive: true });
  await writeFile(join(root, 'runtime-kb', 'clarifications.json'), `${JSON.stringify(CANONICAL_CLARIFICATIONS, null, 2)}\n`, 'utf8');
  await writeFile(join(root, 'runtime-kb', 'action-routing.json'), `${JSON.stringify(ACTION_ROUTING_CONTEXT_POLICY, null, 2)}\n`, 'utf8');
  await writeFile(join(directory, '00 - Clarifications.md'), `# Clarifications\n\nCanonical reusable clarification objects: ${CANONICAL_CLARIFICATIONS.map((item) => item.id).join(', ')}.\n`, 'utf8');
  for (const record of CANONICAL_CLARIFICATIONS) await writeFile(join(directory, `${record.id}.md`), markdown(record), 'utf8');
  return { clarificationCount: CANONICAL_CLARIFICATIONS.length, output: directory };
}

async function main() {
  const args = process.argv.slice(2); const index = args.indexOf('--data-dir');
  if (index === -1 || !args[index + 1]) throw new Error('--data-dir is required.');
  process.stdout.write(`${JSON.stringify(await buildCanonicalClarifications(args[index + 1]), null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => { process.stderr.write(`${error.stack ?? error.message}\n`); process.exitCode = 1; });

import { buildAliasIndex, resolveAliases } from './evaluate-canonical-support-retrieval.mjs';

const unique = (values) => [...new Set(values.filter(Boolean))];

function normalized(value) {
  return String(value ?? '').toLowerCase().replace(/[’']/gu, '').replace(/\s+/gu, ' ').trim();
}

export function resolveObservableEntities(query, aliases) {
  const index = aliases instanceof Map ? aliases : buildAliasIndex(aliases);
  return unique(resolveAliases(query, index).flatMap((match) => match.targetIds).filter((id) => /^(?:game|vendor|product|variant|account_model|account_listing)\./u.test(id)));
}

function exactCase(caseId, reason, extras = {}) {
  return { inferability: 'exact_case', primaryDecision: 'direct_static_case', observableCaseIds: [caseId], clarificationId: null, decisionReason: reason, ...extras };
}

function control(primaryDecision, cases, reason, extras = {}) {
  return { inferability: 'control_plane_only', primaryDecision, observableCaseIds: unique(cases), clarificationId: null, decisionReason: reason, ...extras };
}

function clarification(inferability, primaryDecision, clarificationId, cases, families, reason, extras = {}) {
  return { inferability, primaryDecision, observableCaseIds: unique(cases), observableFamilyIds: unique(families), clarificationId, decisionReason: reason, ...extras };
}

export function reviewFirstTurnObservability(query, aliases) {
  const text = normalized(query);
  const entities = resolveObservableEntities(query, aliases);
  const has = (pattern) => pattern.test(text);
  const result = { observableEntityIds: entities, observableFamilyIds: [] };

  const paymentSignal = has(/\b(?:paid|payment|charged|card|paypal|crypto|btc|ltc|stripe|checkout)\b/u);
  const deliverySignal = has(/\b(?:order|deliver|delivery|received?|arrive|key|account)\b/u) && has(/\b(?:didnt|dont|not|missing|where|waiting|need|nothing|failed)\b/u);
  const nfaSignal = has(/\bnfa\b/u) || entities.includes('account_model.nfa');
  const loaderSignal = has(/\b(?:loader|loadder|loder|nfa\.exe)\b/u);
  const technicalSignal = loaderSignal || has(/\b(?:inject|launch|open|crash|closes?|error|driver|overlay|menu|aimbot|esp|game)\b/u);
  const commerceAndTechnical = (paymentSignal || deliverySignal) && (nfaSignal || loaderSignal || has(/\b(?:invalid|logged out|banned|crash|inject)\b/u));
  if (commerceAndTechnical && has(/\b(?:and|also|plus)\b/u) && has(/\b(?:paid|payment|order|key|delivery)\b.*\b(?:invalid|logged|banned|crash|loader|inject)\b|\b(?:invalid|logged|banned|crash|loader|inject)\b.*\b(?:paid|payment|order|key|delivery)\b/u)) {
    return { ...result, inferability: 'multi_intent', primaryDecision: 'multi_intent_route', observableCaseIds: [], observableFamilyIds: ['commerce.payment','commerce.fulfillment', nfaSignal ? 'accounts.nfa' : 'technical.loader'], clarificationId: null, decisionReason: 'The opening message explicitly contains more than one independent support intent.' };
  }

  if (has(/\b(?:bypass|evad(?:e|ing|ion)|unban|anti.?cheat|anti cheat|failed to load driver|inject(?:ion)?)\b/u)) {
    return { ...result, ...control('direct_restricted_escalation', ['case.restricted.technical'], 'The first turn explicitly enters the restricted technical support boundary.') };
  }
  if (has(/\b(?:refund|cancel(?:lation)?|replacement|replace|warranty|wrong delivery|wrong account|charged twice|double charged)\b/u)) {
    const cases = [];
    if (has(/\breplace|replacement|warranty\b/u) && nfaSignal) cases.push('case.nfa.replacement_dispute');
    if (has(/\bwrong delivery|wrong account\b/u)) cases.push('case.order.wrong_delivery','case.account.wrong_specification');
    if (has(/\brefund|cancel\b/u)) cases.push('case.order.refund_cancel');
    return { ...result, ...control('direct_policy_route', cases, 'The customer explicitly requests or disputes a current-authority remedy.', { policyRoute: true }) };
  }
  if (has(/\b(?:customer role|link(?:ed|ing)? (?:my )?discord|discord (?:is )?linked|dont close (?:the )?ticket|do not close (?:the )?ticket|close (?:the )?ticket)\b/u)) {
    return { ...result, ...control('direct_support_operation', ['case.dashboard.verification','case.support.followup'], 'The opening request is an observable support-operation task.') };
  }
  if (has(/\[attachment omitted\]/u) && (!technicalSignal || has(/\b(?:this|that|what|why|issue|problem|error)\b/u))) {
    return { ...result, ...control('direct_attachment_route', ['case.attachment.review'], 'The issue depends on customer-provided visual evidence that requires attachment review.') };
  }

  if (has(/\b(?:aura)\b/u)) return { ...result, ...control('direct_dynamic_lookup', ['case.aura.balance_or_adjustment'], 'Aura state is current user data and requires an approved lookup.', { lookupIds: ['aura.lookup.read'] }) };
  if (has(/\b(?:wallet balance|site balance|balance (?:didnt|doesnt|not|missing)|convert .* balance)\b/u)) return { ...result, ...control('direct_dynamic_lookup', ['case.wallet.balance'], 'Current wallet/user state is required before answering.', { lookupIds: ['users.overview.read'] }) };
  if (paymentSignal && has(/\b(?:pending|processing|under review|checking|charged|paid|completed|declined|disabled|unavailable|processor down|failed|didnt go through|doesnt go through|nothing (?:appeared|arrived)|not credited|can i (?:buy|pay)|buy .{0,30} (?:with|using) (?:card|paypal|pp|crypto|btc))\b/u)) {
    const cases = [];
    if (has(/\b(?:card payments? (?:are )?(?:disabled|unavailable)|card|stripe|processor down|declined)\b/u)) cases.push('case.payment.card_declined');
    if (has(/\b(?:paypal|\bpp\b)\b/u)) cases.push('case.payment.paypal_unavailable');
    if (has(/\b(?:pending|processing|under review|checking|failed|didnt go through|doesnt go through)\b/u)) cases.push('case.payment.failed_or_pending');
    if (has(/\b(?:paid|completed|charged)\b/u) && has(/\b(?:nothing|didnt receive|not credited|not appear)\b/u)) cases.push('case.payment.completed_missing_order');
    if (has(/\b(?:crypto|btc|ltc|eth|solana)\b/u)) cases.push('case.payment.crypto_pending');
    return { ...result, ...control('direct_dynamic_lookup', cases, 'Payment state is time-sensitive and must be resolved through approved purchase-intent context.', { lookupIds: ['purchase-intents.lookup.read','purchase-intents.process.status.read'] }) };
  }
  if (deliverySignal || has(/\b(?:where is my order|order status|didnt get (?:my )?(?:key|account|order)|need (?:my )?key|manual fulfil|manual fulfill)\b/u)) {
    const cases = has(/\b(?:where|status|check)\b/u) ? ['case.order.status'] : ['case.order.fulfillment_delayed'];
    return { ...result, ...control('direct_dynamic_lookup', cases, 'The current order or fulfillment state is required instead of a historical guess.', { lookupIds: ['orders.lookup.read','orders.details.read','orders.fulfillment.read'] }) };
  }
  if (has(/\b(?:in stock|out of stock|restock|available|status|working rn|up rn|undetected rn|price|how much)\b/u) && has(/\b(?:product|cheat|spoofer|account|nfa|rust|cs2|fortnite|apex|exodus|ancient|venom)\b/u)) {
    const cases = has(/\b(?:price|how much)\b/u) ? ['case.catalog.pricing_duration'] : ['case.catalog.availability_status'];
    return { ...result, ...control('direct_dynamic_lookup', cases, 'The customer asks for current catalog state, stock, status, or price.', { dynamicLookupIds: ['dynamic.catalog.product_status'] }) };
  }

  if (has(/\b(?:do media|make media|media creator|media for|looking for media|need media)\b/u)) return { ...result, ...exactCase('case.media.application', 'The first turn explicitly asks about becoming a media creator.') };
  if (has(/\b(?:become|apply|want|interested|looking)\b.{0,30}\b(?:resell|reseller|partner|partnership|affiliate)|\b(?:reseller|partnership) (?:application|program)\b|\b(?:sell|resell) (?:your|cm|cheaters market) (?:product|cheat|keys?)\b/u)) return { ...result, ...exactCase('case.reseller.application', 'The first turn explicitly asks to become a reseller or partner.') };
  if (has(/\b(?:resell|reseller|resold)\b/u)) return { ...result, ...clarification('family_only','family_scoped_clarification','clarify.catalog.question_type',['case.catalog.availability_status','case.reseller.application'],['catalog.dynamic','business.reseller'],'Reseller language is present, but the message does not establish whether this is a product-origin question or an application to resell.') };
  if (has(/\b(?:discount|coupon|promo code|discount code)\b/u)) return { ...result, ...exactCase('case.discount.coupon', 'The first turn explicitly asks for a discount or coupon.') };
  if (has(/\b(?:compatible|compatibility|work (?:on|with) windows|windows 11|win 11|support (?:valorant|fortnite|rust|cs2))\b/u)) return { ...result, ...exactCase('case.product.compatibility', 'The first turn explicitly asks about product/platform compatibility.') };
  if (has(/\b(?:spoofer|spoof)\b/u) && has(/\b(?:put|restore|change).{0,25}\b(?:pc|computer|hwid|machine)\b.{0,20}\b(?:back|normal)|\b(?:revert|reverse|reset|unspoof|remove)\b/u)) return { ...result, ...exactCase('case.spoofer.reversal_reset', 'The opening message explicitly asks to reverse or reset a temporary spoof state.') };
  if (has(/\b(?:expired|key is no longer valid|license.*not valid)\b/u) && has(/\b(?:key|license)\b/u)) return { ...result, ...exactCase('case.license.expired_time', 'The opening message explicitly identifies an expired license/key state.') };
  if (has(/\b(?:where.*activate|how.*activate|redeem.*key|use my key|paste.*key)\b/u) && !nfaSignal) return { ...result, ...exactCase('case.license.activation', 'The first turn explicitly asks how to activate or redeem a product license.') };

  if (nfaSignal && has(/\b(?:where.*(?:token|redeem|access)|how.*(?:token|redeem|use (?:the )?account)|what.*(?:token|key)|enter.*token|paste.*token|got.*token|dont know how to redeem)\b/u)) return { ...result, ...exactCase('case.nfa.redemption_activation', 'NFA identity and token/redemption stage are both explicit in the first turn.') };
  if (nfaSignal && has(/\b(?:someone else|owner.*(?:online|active|playing|joined|kicked)|owner joined|kicked me out|keeps logging|logged me out|sign(?:ed)? me out|asking for (?:a )?password|password (?:changed|required)|owner.{0,30}(?:no access|lost access))\b/u)) return { ...result, ...exactCase('case.nfa.owner_session_conflict', 'The first turn explicitly identifies NFA owner/session conflict behavior.') };
  if (nfaSignal && has(/\b(?:worked (?:before|yesterday|earlier)|used to work|stopped working|became invalid|invalid after|no longer works|later invalid)\b/u)) return { ...result, ...exactCase('case.nfa.invalid_after_use', 'The first turn states that the NFA worked before and later became invalid.') };
  if (nfaSignal && has(/\b(?:invalid|locked|doesnt work|didnt work|wont work|cant login|cannot login)\b/u) && has(/\b(?:just bought|first (?:use|time)|never (?:worked|logged)|from (?:the )?(?:start|beginning)|on arrival|at first)\b/u)) return { ...result, ...exactCase('case.nfa.invalid_first_use', 'The opening message explicitly combines first-use timing with NFA invalidity or lockout.') };
  if (nfaSignal && has(/\b(?:what (?:is|does).*nfa|nfa meaning|temporary|permanent|how long.*(?:account|nfa)|(?:account|nfa).*(?:lasts?|duration)|activated once|owner (?:can|could|may)|access model)\b/u)) return { ...result, ...exactCase('case.nfa.access_model_question', 'The first turn explicitly asks how the NFA access or ownership model works.') };
  if (nfaSignal && has(/\b(?:buy|purchase|order)\b/u) && has(/\b(?:\d+\s*x|multiple|bulk|several|many)\b/u)) return { ...result, ...exactCase('case.account.bulk_purchase', 'The opening message explicitly asks about a bulk NFA purchase.') };
  if (nfaSignal && has(/\b(?:how|where|can)\b.{0,24}\b(?:buy|purchase|order|get)\b|\b(?:trying|want|need) to (?:buy|purchase)\b/u) && !has(/\b(?:error|failed|wont|cant|cannot|disabled|unavailable|not working|doesnt work|payment|card|paypal|\bpp\b|crypto|btc|processor|owner|logged|kicked)\b/u)) return { ...result, ...exactCase('case.account.purchase_question', 'The opening message is an explicit NFA purchase or listing question without an unresolved payment or account-state issue.') };
  if (nfaSignal) return { ...result, ...clarification('family_only','family_scoped_clarification','clarify.nfa.failure_stage',['case.nfa.invalid_first_use','case.nfa.invalid_after_use','case.nfa.owner_session_conflict','case.nfa.redemption_activation'],['accounts.nfa'],'NFA is observable, but the failure stage needed to distinguish sibling cases is not.') };

  if (loaderSignal && has(/\b(?:closes?|shuts?|exits?|disappear).*(?:immediately|instantly|after|when|open)|(?:immediately|instantly).*(?:close|exit)\b/u)) return { ...result, ...exactCase('case.loader.closes_runtime', 'The loader and immediate-close runtime symptom are explicit.') };
  if (loaderSignal && has(/\b(?:connection|connect|bad connection|failed to fetch|network)\b/u)) return { ...result, ...exactCase('case.loader.connection', 'The loader connection failure is explicit.') };
  if (loaderSignal && has(/\b(?:download|update|link).*(?:not work|doesnt|wont|cant|fail|invalid)|(?:cant|cannot|wont).*(?:download|update)\b/u)) return { ...result, ...exactCase('case.loader.update', 'The loader download/update stage is explicit.') };
  if (loaderSignal && has(/\b(?:key|license).*(?:error|invalid|bad|not work)\b/u)) return { ...result, ...exactCase('case.loader.key_error', 'The loader key/license error stage is explicit.') };
  if (loaderSignal) return { ...result, ...clarification('family_only','family_scoped_clarification','clarify.loader.failure_stage',['case.loader.closes_runtime','case.loader.connection','case.loader.update','case.loader.key_error'],['technical.loader'],'The loader surface is observable but its failure stage is not.') };

  if (has(/\b(?:website|site)\b/u) && has(/\b(?:login|sign in|link discord)\b/u)) return { ...result, ...exactCase('case.website.login', 'The website login/linking surface is explicit.') };
  if (has(/\b(?:website|site|checkout)\b/u) && has(/\b(?:not work|doesnt work|wont work|error|invalid|down|cant buy|cannot buy)\b/u)) return { ...result, ...clarification('family_only','family_scoped_clarification','clarify.website_stage',['case.website.login','case.website.checkout_failure','case.dashboard.verification'],['website.account','website.checkout','website.dashboard'],'The website surface is clear, but the failing stage is not specific enough.') };

  if (has(/\b(?:banned|game banned|vac banned|cooldown|limited matchmaking)\b/u)) return { ...result, ...control('direct_policy_route', ['case.account.banned'], 'The opening message explicitly reports an account enforcement state requiring current policy handling.') };
  if (has(/\b(?:account|acc)\b/u) && has(/\b(?:login|log in|access|password)\b/u)) return { ...result, ...clarification('family_only','family_scoped_clarification','clarify.account.delivery_state',['case.account.login_access','case.account.wrong_specification','case.order.fulfillment_delayed'],['accounts.access','accounts.delivery'],'An account access/delivery family is observable, but delivery versus access failure remains ambiguous.') };
  if (paymentSignal) return { ...result, ...clarification('family_only','family_scoped_clarification','clarify.payment_state',['case.payment.card_declined','case.payment.failed_or_pending','case.payment.completed_missing_order','case.payment.crypto_pending'],['commerce.payment'],'A payment issue is observable, but the current payment state is not.') };
  if (has(/\b(?:order|delivery|key)\b/u)) return { ...result, ...clarification('family_only','family_scoped_clarification','clarify.order.fulfillment_state',['case.order.status','case.order.fulfillment_delayed','case.order.wrong_delivery','case.order.refund_cancel'],['commerce.order','commerce.fulfillment'],'The commerce/order family is observable, but the requested state or remedy is unclear.') };
  if (technicalSignal) return { ...result, ...clarification('family_only','family_scoped_clarification','clarify.technical.failure_stage',['case.product.requirements','case.product.launch_failure','case.game.crash_loading','case.game.crash_general','case.game.feature_behavior'],['technical.product','technical.game'],'A technical/product issue is observable, but the failure stage is not sufficiently specified.') };

  if (entities.length > 0) return { ...result, ...clarification('entity_only','entity_scoped_clarification','clarify.support_surface',[],[],'An entity is explicit, but the support surface and requested action are not.') };
  if (has(/\b(?:problem|issue|not working|doesnt work|dont work|wont work|help|support|this shit)\b/u)) return { ...result, ...clarification('insufficient_context','generic_clarification','clarify.support_surface',[],[],'The first turn does not establish a support surface, entity, family, or safe control route.') };
  return { ...result, ...clarification('insufficient_context','generic_clarification','clarify.support_surface',[],[],'The opening message lacks enough observable support information for a safe case or control-plane action.') };
}

export function attachObservableFamilies(result, caseById) {
  const families = unique([
    ...(result.observableFamilyIds ?? []),
    ...(result.observableCaseIds ?? []).map((caseId) => caseById.get(caseId)?.family)
  ]);
  return { ...result, observableFamilyIds: families };
}

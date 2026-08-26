export type RuntimeAliasRecord = {
  alias?: unknown;
  value?: unknown;
  name?: unknown;
  target_ids?: unknown;
  targetIds?: unknown;
  targets?: unknown;
  target?: unknown;
  id?: unknown;
};

export type FirstTurnDecision = {
  inferability: string;
  primaryDecision: string;
  observableCaseIds: string[];
  observableFamilyIds: string[];
  observableEntityIds: string[];
  clarificationId: string | null;
  decisionReason: string;
  lookupIds?: string[];
  dynamicLookupIds?: string[];
  deterministicClarificationIds?: string[];
  policyIds?: string[];
  policyRoute?: boolean;
};

type AliasEntry = { alias: string; targetIds: string[] };

const unique = (values: readonly string[] = []) => [...new Set(values.filter(Boolean))];

function normalizeAliasText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[’']/gu, "")
    .replace(/[^a-z0-9+._-]+/gu, " ")
    .replace(/\bldr\b/gu, "loader")
    .replace(/\bconnct\b/gu, "connect")
    .replace(/\bwont\b/gu, "will not")
    .trim()
    .replace(/\s+/gu, " ");
}

function buildAliasIndex(value: readonly RuntimeAliasRecord[]): AliasEntry[] {
  const entries: AliasEntry[] = [];
  for (const record of value) {
    const alias = record.alias ?? record.value ?? record.name;
    const targets = record.target_ids ?? record.targetIds ?? record.targets ?? record.target ?? record.id;
    const targetIds = Array.isArray(targets)
      ? targets.filter((item): item is string => typeof item === "string")
      : typeof targets === "string" ? [targets] : [];
    if (typeof alias === "string" && alias.trim() && targetIds.length > 0) {
      entries.push({ alias: normalizeAliasText(alias), targetIds });
    }
  }
  return entries.sort((a, b) => b.alias.length - a.alias.length || a.alias.localeCompare(b.alias));
}

function resolveAliases(query: string, aliasEntries: readonly AliasEntry[]): AliasEntry[] {
  const normalized = ` ${normalizeAliasText(query)} `;
  return aliasEntries.filter((entry) => entry.alias && normalized.includes(` ${entry.alias} `));
}

function normalized(value: unknown): string {
  return String(value ?? "").toLowerCase().replace(/[’']/gu, "").replace(/\bpayed\b/gu, "paid").replace(/\s+/gu, " ").trim();
}

export function resolveObservableEntities(query: string, aliases: readonly RuntimeAliasRecord[]): string[] {
  const index = buildAliasIndex(aliases);
  return unique(resolveAliases(query, index)
    .flatMap((match) => match.targetIds)
    .filter((id) => /^(?:game|vendor|product|variant|account_model|account_listing)\./u.test(id)));
}

function baseDecision(entities: string[]): Pick<FirstTurnDecision, "observableEntityIds" | "observableFamilyIds"> {
  return { observableEntityIds: entities, observableFamilyIds: [] };
}

function exactCase(caseId: string, reason: string, extras: Partial<FirstTurnDecision> = {}): FirstTurnDecision {
  return {
    inferability: "exact_case",
    primaryDecision: "direct_static_case",
    observableCaseIds: [caseId],
    observableFamilyIds: [],
    observableEntityIds: [],
    clarificationId: null,
    decisionReason: reason,
    ...extras
  };
}

function control(primaryDecision: string, cases: readonly string[], reason: string, extras: Partial<FirstTurnDecision> = {}): FirstTurnDecision {
  return {
    inferability: "control_plane_only",
    primaryDecision,
    observableCaseIds: unique(cases),
    observableFamilyIds: [],
    observableEntityIds: [],
    clarificationId: null,
    decisionReason: reason,
    ...extras
  };
}

function clarification(
  inferability: string,
  primaryDecision: string,
  clarificationId: string,
  cases: readonly string[],
  families: readonly string[],
  reason: string,
  extras: Partial<FirstTurnDecision> = {}
): FirstTurnDecision {
  return {
    inferability,
    primaryDecision,
    observableCaseIds: unique(cases),
    observableFamilyIds: unique(families),
    observableEntityIds: [],
    clarificationId,
    decisionReason: reason,
    ...extras
  };
}

function withBase(base: Pick<FirstTurnDecision, "observableEntityIds" | "observableFamilyIds">, decision: FirstTurnDecision): FirstTurnDecision {
  return {
    ...decision,
    observableEntityIds: unique([...base.observableEntityIds, ...decision.observableEntityIds]),
    observableFamilyIds: unique([...base.observableFamilyIds, ...decision.observableFamilyIds])
  };
}

export function reviewFirstTurnObservability(query: string, aliases: readonly RuntimeAliasRecord[]): FirstTurnDecision {
  const text = normalized(query);
  const entities = resolveObservableEntities(query, aliases);
  const has = (pattern: RegExp) => pattern.test(text);
  const result = baseDecision(entities);

  const paymentSignal = has(/\b(?:paid|payment|charged|card|paypal|\bpp\b|venmo|gift ?card|crypto|btc|ltc|stripe|checkout)\b/u);
  const explicitOrderReference = has(/\b(?:order id|order identifier|order reference)\b|\[(?:order identifier|order reference) omitted\]|\b(?:cm|order)-[a-z0-9-]{4,}\b/u);
  const deliverySignal = (
    has(/\b(?:order|deliver|delivery|received?|arrive|key)\b/u) &&
    has(/\b(?:didnt|did not|dont|not|missing|where|waiting|need|nothing|failed)\b/u)
  ) || (
    has(/\baccount\b/u) &&
    has(/\b(?:didnt receive|did not receive|never received|missing|waiting for|where is)\b/u)
  );
  const explicitOrderStateIntent = deliverySignal || has(/\b(?:where is my order|order status|check (?:my )?order|check order|didnt get (?:my )?(?:key|account|order)|need (?:my )?key|manual fulfil|manual fulfill)\b/u) || has(/\border\b.{0,24}\b(?:pending|processing|delivered|missing|wrong|failed)\b|\b(?:pending|processing|delivered|missing|wrong|failed)\b.{0,24}\border\b/u);
  const deliveredOrderAccessProblem = has(/\bdelivered\b/u) && has(/\b(?:view order|order link|order page)\b/u) && has(/\b(?:cant|cannot|dont|doesnt|wont|will not|unable|not able)\b.{0,24}\b(?:click|open|view)\b/u);
  const nfaSignal = has(/\bnfa\b/u) || entities.includes("account_model.nfa");
  const spooferSignal = has(/\b(?:spoofer|spoof(?:er|ing)?|hwid)\b/u);
  const loaderSignal = has(/\b(?:loader|loadder|loder|nfa\.exe)\b/u);
  const technicalSignal = loaderSignal || has(/\b(?:inject|launch(?:ing|ed|es)?|open(?:ing)?|crash(?:es|ing)?|bsod|closes?|error|driver|vbs|virtualization|secure boot|tpm|overlay|menu|aimbot|esp|game)\b/u);
  const independentCommerceSignal = paymentSignal || (deliverySignal && has(/\b(?:order|deliver|delivery|received?|arrive|account)\b/u));
  const commerceAndTechnical = independentCommerceSignal && (nfaSignal || loaderSignal || has(/\b(?:invalid|logged out|banned|crash|inject)\b/u));

  if (has(/\b(?:phishing|security report|malware|bot token|discords? team|cloudflare|vercel)\b/u) && has(/\b(?:report(?:ed|ing)?|reverse(?:d| engineered)?|token|proof|banned|phishing|rat|malware)\b/u)) {
    return withBase(result, control("human_escalation", [], "The opening message is a security or abuse report that requires human review.", { observableFamilyIds: ["support.security"] }));
  }
  if (commerceAndTechnical && has(/\b(?:and|also|plus)\b/u) && has(/\b(?:paid|payment|order|key|delivery)\b.*\b(?:invalid|logged|banned|crash|loader|inject)\b|\b(?:invalid|logged|banned|crash|loader|inject)\b.*\b(?:paid|payment|order|key|delivery)\b/u)) {
    return withBase(result, {
      inferability: "multi_intent", primaryDecision: "multi_intent_route", observableCaseIds: [],
      observableFamilyIds: ["commerce.payment", "commerce.fulfillment", nfaSignal ? "accounts.nfa" : "technical.loader"],
      observableEntityIds: [], clarificationId: null,
      decisionReason: "The opening message explicitly contains more than one independent support intent."
    });
  }
  if (has(/\b(?:bypass|evad(?:e|ing|ion)|unban|anti.?cheat|anti cheat|failed to load driver|inject(?:ion)?)\b/u) || has(/\b(?:is|are|still|currently|rn)\b.{0,25}\b(?:undetected|detected|ud)\b|\b(?:undetected|detected|ud)\b.{0,20}\b(?:rn|right now|currently|status)\b/u)) {
    return withBase(result, control("direct_restricted_escalation", ["case.restricted.technical"], "The first turn explicitly enters the restricted technical or detection-status boundary.", { observableFamilyIds: ["restricted"] }));
  }
  if (has(/\b(?:refund(?:ed|ing)?|cancel(?:lation)?|replacement|replace|warranty|wrong delivery|wrong account|charged twice|double charged)\b/u)) {
    const cases: string[] = [];
    if (has(/\breplace|replacement|warranty\b/u) && nfaSignal) cases.push("case.nfa.replacement_dispute");
    if (has(/\bwrong delivery|wrong account\b/u)) cases.push("case.order.wrong_delivery", "case.account.wrong_specification");
    if (has(/\brefund(?:ed|ing)?\b|\bcancel\b/u)) cases.push("case.order.refund_cancel");
    return withBase(result, control("direct_policy_route", cases, "The customer explicitly requests or disputes a current-authority remedy.", {
      policyIds: ["policy.refund_or_replacement.current_state_required"],
      policyRoute: true,
      observableFamilyIds: ["commerce.policy"]
    }));
  }
  if (has(/\b(?:customer role|link(?:ed|ing)? (?:my )?discord|discord (?:is )?linked|dont close (?:the )?ticket|do not close (?:the )?ticket|close (?:the )?ticket)\b/u)) {
    return withBase(result, control("direct_support_operation", ["case.dashboard.verification", "case.support.followup"], "The opening request is an observable support-operation task.", { observableFamilyIds: ["support.operations"] }));
  }
  if (has(/\[attachment omitted\]/u) && (!technicalSignal || has(/\b(?:this|that|what|why|issue|problem|error)\b/u))) {
    return withBase(result, control("direct_attachment_route", ["case.attachment.review"], "The issue depends on customer-provided visual evidence that requires attachment review.", { observableFamilyIds: ["support.attachment"] }));
  }

  if (has(/\b(?:do|make|create|be|become|apply for|looking for|looking to do|need)\s+(?:some\s+)?media\b|\bapply\b.{0,30}\bmedia\b|\bmedia\s+(?:creator|application)\b|\bmedia\b.{0,24}\b(?:tiktok|youtube)\b/u)) return withBase(result, exactCase("case.media.application", "The first turn explicitly asks about media or creator work."));
  if (has(/\b(?:rebrand(?:ed|ing)?|white ?label|cooperat(?:e|ion)|partner(?:ship)?|affiliate|resell(?:er|ing)?|resold)\b/u) || has(/\b(?:(?:interested|intrested) in|offer|use)\b.{0,35}\b(?:discord )?payment bot\b/u)) return withBase(result, exactCase("case.reseller.application", "The first turn explicitly asks about reselling, rebranding, partnership, or cooperation."));
  if (has(/\bhwid\b.{0,20}\breset\b|\breset\b.{0,20}\bhwid\b/u)) return withBase(result, exactCase("case.spoofer.hwid_state", "The opening request explicitly asks about an HWID reset or state change."));
  if (nfaSignal && has(/\b(?:activate|activation|redeem|token|setup guide|guide|how (?:do i|to) use)\b/u)) return withBase(result, exactCase("case.nfa.redemption_activation", "NFA identity and activation, token, guide, or redemption intent are explicit."));
  if (has(/\b(?:where(?: is|'s)? (?:the )?(?:config(?:uration)? file|guide|setup guide)|how (?:do i|to) (?:start|set up|setup|set (?:this|it) up|install|configure)|defender is (?:on|off)|windows defender)\b/u)) return withBase(result, exactCase("case.product.requirements", "The opening message explicitly asks for setup, guide, configuration, or prerequisite help."));
  if (has(/\b(?:compatible|compatibility|work (?:on|with) windows|windows 11|win 11|support (?:valorant|fortnite|rust|cs2))\b/u) || has(/\b(?:work|works|working|support(?:ed)?|compatible)\b.{0,24}\b(?:controller|gamepad)\b|\b(?:controller|gamepad)\b.{0,24}\b(?:work|works|working|support(?:ed)?|compatible)\b/u) || has(/\b(?:can|could|may)\b.{0,16}\buse\b.{0,16}\b(?:a\s+)?(?:controller|gamepad)\b/u)) return withBase(result, exactCase("case.product.compatibility", "The first turn explicitly asks about product, platform, or controller compatibility."));
  if (spooferSignal && has(/\b(?:put|restore|change).{0,25}\b(?:pc|computer|hwid|machine)\b.{0,20}\b(?:back|normal)|\b(?:revert|reverse|unspoof|remove)\b/u)) return withBase(result, exactCase("case.spoofer.reversal_reset", "The opening message explicitly asks to reverse or reset a temporary spoof state."));
  if (spooferSignal && has(/\b(?:perm(?:anent)?|temp(?:orary)?|duration|lifetime|how long)\b/u)) return withBase(result, exactCase("case.catalog.pricing_duration", "The first turn explicitly asks about the spoofer duration or permanent/temporary offering."));
  if (has(/\b(?:key|license)\b.{0,35}\b(?:isnt working|not working|doesnt work|wont work|invalid|error)\b|\b(?:invalid|bad)\s+(?:key|license)\b/u) && !loaderSignal) return withBase(result, exactCase("case.license.activation", "The opening message explicitly reports a product key or license activation problem."));
  if (has(/\b(?:where|how)\b.{0,20}\bactivate\b.{0,30}\b(?:product )?key\b|\b(?:redeem|use|paste)\b.{0,20}\b(?:product )?key\b/u) && !nfaSignal) return withBase(result, exactCase("case.license.activation", "The first turn explicitly asks how to activate or redeem a product license."));
  if (has(/\b(?:generate|create|issue|need|get)\b.{0,24}\baccount token\b/u)) return withBase(result, control("direct_dynamic_lookup", [], "Generating or retrieving an account token requires current order and fulfillment context.", { lookupIds: ["orders.lookup.read", "orders.details.read", "orders.fulfillment.read"], observableFamilyIds: ["commerce.order", "commerce.fulfillment"] }));

  if (has(/\b(?:aura)\b/u)) return withBase(result, control("direct_dynamic_lookup", ["case.aura.balance_or_adjustment"], "Aura state is current user data and requires an approved lookup.", { lookupIds: ["aura.lookup.read"], observableFamilyIds: ["commerce.aura"] }));
  if (has(/\b(?:wallet balance|site balance|balance (?:didnt|doesnt|not|missing)|convert .* balance)\b/u)) return withBase(result, control("direct_dynamic_lookup", ["case.wallet.balance"], "Current wallet/user state is required before answering.", { lookupIds: ["users.overview.read"], observableFamilyIds: ["commerce.wallet"] }));

  const explicitPaymentMethodPurchase = has(/\b(?:buy|buyed|bought|get|purchase|purchased|pay)\b.{0,50}\b(?:with|using|via|w|through)\s+(?:paypal|pp|card|venmo|gift ?card|crypto|btc)\b|\b(?:paypal|pp|venmo|gift ?card)\b.{0,50}\b(?:buy|buyed|bought|get|purchase|purchased|pay)\b/u);
  if (paymentSignal && (explicitPaymentMethodPurchase || has(/\b(?:pending|processing|under review|checking|charged|paid|completed|declined|disabled|unavailable|locked|processor down|failed|wont work|doesnt work|didnt go through|doesnt go through|did not arrive|nothing (?:appeared|arrived)|not credited|can i (?:buy|pay)|isnt detecting|not detecting|not detected)\b/u))) {
    const cases: string[] = [];
    if (has(/\b(?:card payments? (?:are )?(?:disabled|unavailable)|card|stripe|processor down|declined|locked)\b/u)) cases.push("case.payment.card_declined");
    if (has(/\b(?:paypal|\bpp\b)\b/u)) cases.push("case.payment.paypal_unavailable");
    if (has(/\b(?:pending|processing|under review|checking|failed|didnt go through|doesnt go through|did not arrive|wont work|doesnt work|isnt detecting|not detecting|not detected)\b/u)) cases.push("case.payment.failed_or_pending");
    if (has(/\b(?:paid|completed|charged|bought|buyed|purchased)\b/u) && has(/\b(?:nothing|didnt receive|did not receive|not credited|not appear|did not arrive)\b/u)) cases.push("case.payment.completed_missing_order");
    if (has(/\b(?:crypto|btc|ltc|eth|solana)\b/u)) cases.push("case.payment.crypto_pending");
    return withBase(result, control("direct_dynamic_lookup", cases, "Payment state or current payment-method availability is time-sensitive and must use approved purchase-intent context.", { lookupIds: ["purchase-intents.lookup.read", "purchase-intents.process.status.read"], observableFamilyIds: ["commerce.payment"] }));
  }
  if (deliveredOrderAccessProblem) return withBase(result, exactCase("case.dashboard.verification", "The customer says the order is delivered but the View Order access path itself cannot be opened."));
  if (explicitOrderReference && !explicitOrderStateIntent) {
    const hasAdditionalOrderContext = entities.length > 0 || technicalSignal || paymentSignal || has(/\b(?:manual delivery|make a ticket|open(?:ed)? (?:a )?ticket)\b/u);
    return withBase(result, clarification("family_only", "family_scoped_clarification", "clarify.order.fulfillment_state", ["case.order.status", "case.order.fulfillment_delayed", "case.order.wrong_delivery", "case.order.refund_cancel"], ["commerce.order", "commerce.fulfillment"], "An order selector is observable, but the customer has not said what they need about that order.", { deterministicClarificationIds: hasAdditionalOrderContext ? [] : ["clarify.order.fulfillment_state"] }));
  }
  if (explicitOrderStateIntent) {
    const cases = has(/\b(?:where|status|check)\b/u) ? ["case.order.status"] : ["case.order.fulfillment_delayed"];
    return withBase(result, control("direct_dynamic_lookup", cases, "The customer explicitly asks about current order or fulfillment state, so live order context is required.", { lookupIds: ["orders.lookup.read", "orders.details.read", "orders.fulfillment.read"], observableFamilyIds: ["commerce.order", "commerce.fulfillment"] }));
  }
  if (has(/\b(?:in stock|out of stock|restock|available|status|working rn|up rn|price|how much|is .{0,30} working)\b/u) && (has(/\b(?:product|cheat|spoofer|account|nfa|rust|cs2|fortnite|apex|pubg|eft|warzone|r6|exodus|ancient|venom)\b/u) || entities.length > 0)) {
    const cases = has(/\b(?:price|how much)\b/u) ? ["case.catalog.pricing_duration"] : ["case.catalog.availability_status"];
    const families = has(/\b(?:price|how much)\b/u) ? ["catalog.commercial"] : ["catalog.dynamic"];
    return withBase(result, control("direct_dynamic_lookup", cases, "The customer asks for current catalog state, stock, status, or price.", { dynamicLookupIds: ["dynamic.catalog.product_status"], observableFamilyIds: families }));
  }

  if (has(/\b(?:spoofer|spoof)\b/u) && has(/\b(?:put|restore|change).{0,25}\b(?:pc|computer|hwid|machine)\b.{0,20}\b(?:back|normal)|\b(?:revert|reverse|unspoof|remove)\b/u)) return withBase(result, exactCase("case.spoofer.reversal_reset", "The opening message explicitly asks to reverse or reset a temporary spoof state."));
  if (has(/\b(?:expired|key is no longer valid|license.*not valid)\b/u) && has(/\b(?:key|license)\b/u)) return withBase(result, exactCase("case.license.expired_time", "The opening message explicitly identifies an expired license/key state."));
  if (has(/\b(?:where.*activate|how.*activate|redeem.*key|use my key|paste.*key)\b/u) && !nfaSignal) return withBase(result, exactCase("case.license.activation", "The first turn explicitly asks how to activate or redeem a product license."));

  if (nfaSignal && has(/\b(?:someone else|owner.*(?:online|active|playing|joined|kicked)|owner joined|kicked me out|keeps logging|logged me out|sign(?:ed|ing)? me out|asking for (?:a )?password|password (?:changed|required)|owner.{0,30}(?:no access|lost access))\b/u)) return withBase(result, exactCase("case.nfa.owner_session_conflict", "The first turn explicitly identifies NFA owner/session conflict behavior."));
  if (nfaSignal && has(/\b(?:worked (?:before|yesterday|earlier)|was (?:fine|working) (?:before|yesterday|earlier)|used to work|stopped working|became invalid|invalid after|no longer works|later invalid)\b/u)) return withBase(result, exactCase("case.nfa.invalid_after_use", "The first turn states that the NFA worked before and later became invalid."));
  if (nfaSignal && has(/\b(?:invalid|locked|doesnt work|didnt work|wont work|never worked|cant login|cannot login)\b/u) && has(/\b(?:just bought|first (?:use|time)|never (?:worked|logged)|from (?:the )?(?:start|beginning)|on arrival|at first)\b/u)) return withBase(result, exactCase("case.nfa.invalid_first_use", "The opening message explicitly combines first-use timing with NFA invalidity or lockout."));
  if (nfaSignal && has(/\b(?:what (?:is|does).*nfa|nfa meaning|temporary|permanent|how long.*(?:account|nfa)|(?:account|nfa).*(?:lasts?|duration)|activated once|owner (?:can|could|may)|access model)\b/u)) return withBase(result, exactCase("case.nfa.access_model_question", "The first turn explicitly asks how the NFA access or ownership model works."));
  if (nfaSignal && has(/\b(?:buy|purchase|order)\b/u) && has(/\b(?:\d+\s*x|multiple|bulk|several|many)\b/u)) return withBase(result, exactCase("case.account.bulk_purchase", "The opening message explicitly asks about a bulk NFA purchase."));
  if (nfaSignal && has(/\b(?:how|where|can)\b.{0,24}\b(?:buy|purchase|order|get)\b|\b(?:trying|want|need) to (?:buy|purchase)\b/u) && !has(/\b(?:error|failed|wont|cant|cannot|disabled|unavailable|not working|doesnt work|payment|card|paypal|\bpp\b|crypto|btc|processor|owner|logged|kicked)\b/u)) return withBase(result, exactCase("case.account.purchase_question", "The opening message is an explicit NFA purchase or listing question without an unresolved payment or account-state issue."));
  if (nfaSignal) return withBase(result, clarification("family_only", "family_scoped_clarification", "clarify.nfa.failure_stage", ["case.nfa.invalid_first_use", "case.nfa.invalid_after_use", "case.nfa.owner_session_conflict", "case.nfa.redemption_activation"], ["accounts.nfa"], "NFA is observable, but the failure stage needed to distinguish sibling cases is not.", { deterministicClarificationIds: ["clarify.nfa.failure_stage"] }));

  if (loaderSignal && has(/\b(?:closes?|shuts?|exits?|disappear).*(?:immediately|instantly|after|when|open)|(?:immediately|instantly).*(?:close|exit)\b/u)) return withBase(result, exactCase("case.loader.closes_runtime", "The loader and immediate-close runtime symptom are explicit."));
  if (loaderSignal && has(/\b(?:connection|connect|bad connection|failed to fetch|network)\b/u)) return withBase(result, exactCase("case.loader.connection", "The loader connection failure is explicit."));
  if (loaderSignal && has(/\b(?:loader link|download link|link for (?:the )?loader)\b|\b(?:download|update|link).*(?:not work|doesnt|wont|cant|fail|invalid)|(?:cant|cannot|wont).*(?:download|update)\b/u)) return withBase(result, exactCase("case.loader.update", "The loader download/update stage is explicit."));
  if (loaderSignal && has(/\b(?:key|license).*(?:error|invalid|bad|not work)\b/u)) return withBase(result, exactCase("case.loader.key_error", "The loader key/license error stage is explicit."));
  if (loaderSignal) return withBase(result, clarification("family_only", "family_scoped_clarification", "clarify.loader.failure_stage", ["case.loader.closes_runtime", "case.loader.connection", "case.loader.update", "case.loader.key_error"], ["technical.loader"], "The loader surface is observable but its failure stage is not."));

  if (spooferSignal && has(/\b(?:not working|doesnt work|dont work|wont work|problem|launch(?:ing|ed)?|bsod|crash(?:es|ing)?|error)\b/u)) return withBase(result, clarification("family_only", "family_scoped_clarification", "clarify.technical.failure_stage", ["case.product.requirements", "case.product.launch_failure", "case.game.crash_loading", "case.game.crash_general"], ["technical.product", "technical.game"], "A spoofer/product technical problem is explicit, but the failure stage still needs to be established."));
  if (has(/\b(?:not like|different from|different than|compared? (?:to|with)|compare .{0,25} (?:to|with))\b/u) && (has(/\b(?:cheat|product|loader|spoofer)\b/u) || entities.length > 0)) return withBase(result, clarification("family_only", "family_scoped_clarification", "clarify.technical.failure_stage", ["case.product.requirements", "case.product.launch_failure", "case.game.crash_loading", "case.game.crash_general", "case.game.feature_behavior"], ["technical.product", "technical.game"], "A product comparison or behavior mismatch is explicit, but the exact technical surface still needs clarification."));

  if (has(/\b(?:website|site)\b/u) && has(/\b(?:login|sign in|link discord)\b/u)) return withBase(result, exactCase("case.website.login", "The website login/linking surface is explicit."));
  if (has(/\b(?:website|site|checkout)\b/u) && has(/\b(?:not work|not working|doesnt work|wont work|error|invalid|down|cant buy|cannot buy)\b/u)) return withBase(result, clarification("family_only", "family_scoped_clarification", "clarify.website_stage", ["case.website.login", "case.website.checkout_failure", "case.dashboard.verification"], ["website.account", "website.checkout", "website.dashboard"], "The website surface is clear, but the failing stage is not specific enough."));

  if (has(/\b(?:banned|game banned|vac banned|cooldown|limited matchmaking)\b/u)) return withBase(result, control("direct_policy_route", ["case.account.banned"], "The opening message explicitly reports an account enforcement state requiring current policy handling.", { observableFamilyIds: ["commerce.policy"] }));
  if (has(/\b(?:account|acc)\b/u) && has(/\b(?:login|log in|access|password)\b/u)) return withBase(result, clarification("family_only", "family_scoped_clarification", "clarify.account.delivery_state", ["case.account.login_access", "case.account.wrong_specification", "case.order.fulfillment_delayed"], ["accounts.access", "accounts.delivery"], "An account access/delivery family is observable, but delivery versus access failure remains ambiguous."));
  if (paymentSignal) return withBase(result, clarification("family_only", "family_scoped_clarification", "clarify.payment_state", ["case.payment.card_declined", "case.payment.failed_or_pending", "case.payment.completed_missing_order", "case.payment.crypto_pending"], ["commerce.payment"], "A payment issue is observable, but the current payment state is not."));
  if (has(/\b(?:order|delivery|key)\b/u)) return withBase(result, clarification("family_only", "family_scoped_clarification", "clarify.order.fulfillment_state", ["case.order.status", "case.order.fulfillment_delayed", "case.order.wrong_delivery", "case.order.refund_cancel"], ["commerce.order", "commerce.fulfillment"], "The commerce/order family is observable, but the requested state or remedy is unclear.", { deterministicClarificationIds: ["clarify.order.fulfillment_state"] }));

  if (technicalSignal && has(/\b(?:i only use|i dont use|i do not use|best|great|good|love|amazing)\b/u) && !has(/\b(?:not working|doesnt work|dont work|wont work|help|issue|problem|error|why|how|can|does|will)\b/u)) return withBase(result, clarification("insufficient_context", "generic_clarification", "clarify.support_surface", [], [], "The message names technical features but does not contain an observable support request.", { deterministicClarificationIds: ["clarify.support_surface"] }));
  if (technicalSignal) return withBase(result, clarification("family_only", "family_scoped_clarification", "clarify.technical.failure_stage", ["case.product.requirements", "case.product.launch_failure", "case.game.crash_loading", "case.game.crash_general", "case.game.feature_behavior"], ["technical.product", "technical.game"], "A technical/product issue is observable, but the failure stage is not sufficiently specified."));

  if (entities.length > 0) return withBase(result, clarification("entity_only", "entity_scoped_clarification", "clarify.support_surface", [], [], "An entity is explicit, but the support surface and requested action are not.", { deterministicClarificationIds: ["clarify.support_surface"] }));
  if (has(/\b(?:problem|issue|not working|doesnt work|dont work|wont work|help|support|this shit)\b/u)) return withBase(result, clarification("insufficient_context", "generic_clarification", "clarify.support_surface", [], [], "The first turn does not establish a support surface, entity, family, or safe control route.", { deterministicClarificationIds: ["clarify.support_surface"] }));
  return withBase(result, clarification("insufficient_context", "generic_clarification", "clarify.support_surface", [], [], "The opening message lacks enough observable support information for a safe case or control-plane action.", { deterministicClarificationIds: ["clarify.support_surface"] }));
}

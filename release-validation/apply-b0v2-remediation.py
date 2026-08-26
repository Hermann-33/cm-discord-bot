from pathlib import Path

router = Path("src/ai/firstTurnRouter.ts")
text = router.read_text()

replacements = [
    (
        'if (has(/\\b(?:do|make|create|be|become|apply for|looking for|looking to do|need)\\s+(?:some\\s+)?media\\b|\\bmedia\\s+(?:creator|application)\\b|\\bmedia\\b.{0,24}\\b(?:tiktok|youtube)\\b/u))',
        'if (has(/\\b(?:do|make|create|be|become|apply for|looking for|looking to do|need)\\s+(?:some\\s+)?media\\b|\\bapply\\b.{0,30}\\bmedia\\b|\\bmedia\\s+(?:creator|application)\\b|\\bmedia\\b.{0,24}\\b(?:tiktok|youtube)\\b/u))',
    ),
    (
        '(?:start|set up|setup|install|configure)',
        '(?:start|set up|setup|set (?:this|it) up|install|configure)',
    ),
    (
        '(?:worked (?:before|yesterday|earlier)|used to work|stopped working|became invalid|invalid after|no longer works|later invalid)',
        '(?:worked (?:before|yesterday|earlier)|was (?:fine|working) (?:before|yesterday|earlier)|used to work|stopped working|became invalid|invalid after|no longer works|later invalid)',
    ),
    (
        '(?:refund|cancel(?:lation)?|replacement|replace|warranty|wrong delivery|wrong account|charged twice|double charged)',
        '(?:refund(?:ed|ing)?|cancel(?:lation)?|replacement|replace|warranty|wrong delivery|wrong account|charged twice|double charged)',
    ),
    (
        'if (has(/\\brefund|cancel\\b/u)) cases.push("case.order.refund_cancel");',
        'if (has(/\\brefund(?:ed|ing)?\\b|\\bcancel\\b/u)) cases.push("case.order.refund_cancel");',
    ),
    (
        '  if (has(/\\b(?:generate|create|issue|need|get)\\b.{0,24}\\baccount token\\b/u)) return withBase(result, control("direct_dynamic_lookup", [], "Generating or retrieving an account token requires current order and fulfillment context.", { lookupIds: ["orders.lookup.read", "orders.details.read", "orders.fulfillment.read"], observableFamilyIds: ["commerce.order", "commerce.fulfillment"] }));',
        '  if (has(/\\b(?:where|how)\\b.{0,20}\\bactivate\\b.{0,30}\\b(?:product )?key\\b|\\b(?:redeem|use|paste)\\b.{0,20}\\b(?:product )?key\\b/u) && !nfaSignal) return withBase(result, exactCase("case.license.activation", "The first turn explicitly asks how to activate or redeem a product license."));\n  if (has(/\\b(?:generate|create|issue|need|get)\\b.{0,24}\\baccount token\\b/u)) return withBase(result, control("direct_dynamic_lookup", [], "Generating or retrieving an account token requires current order and fulfillment context.", { lookupIds: ["orders.lookup.read", "orders.details.read", "orders.fulfillment.read"], observableFamilyIds: ["commerce.order", "commerce.fulfillment"] }));',
    ),
    (
        '\n  if (has(/\\b(?:where.*activate|how.*activate|redeem.*key|use my key|paste.*key)\\b/u) && !nfaSignal) return withBase(result, exactCase("case.license.activation", "The first turn explicitly asks how to activate or redeem a product license."));\n\n  if (nfaSignal',
        '\n\n  if (nfaSignal',
    ),
    (
        '(?:not work|doesnt work|wont work|error|invalid|down|cant buy|cannot buy)',
        '(?:not work|not working|doesnt work|wont work|error|invalid|down|cant buy|cannot buy)',
    ),
]

changed = False
for old, new in replacements:
    if new in text:
        continue
    if old not in text:
        raise SystemExit(f"expected router fragment missing: {old[:140]}")
    text = text.replace(old, new, 1)
    changed = True
if changed:
    router.write_text(text)

tests = Path("tests/ai/deterministicResolver.test.ts")
test_text = tests.read_text()
marker = 'test("B0 v2 regression: apply-to-make media phrasing resolves media application"'
if marker not in test_text:
    additions = [
        '',
        'test("B0 v2 regression: apply-to-make media phrasing resolves media application", () => {',
        '  const result = reviewFirstTurnObservability("How can I apply to make YouTube media for CM?", runtime.aliases);',
        '  assert.equal(result.primaryDecision, "direct_static_case");',
        '  assert.deepEqual(result.observableCaseIds, ["case.media.application"]);',
        '});',
        '',
        'test("B0 v2 regression: set-this-up phrasing resolves product requirements", () => {',
        '  const result = reviewFirstTurnObservability("How do I set this up and where is the configuration guide?", runtime.aliases);',
        '  assert.equal(result.primaryDecision, "direct_static_case");',
        '  assert.deepEqual(result.observableCaseIds, ["case.product.requirements"]);',
        '});',
        '',
        'test("B0 v2 regression: was-fine-earlier phrasing resolves NFA invalid after use", () => {',
        '  const result = reviewFirstTurnObservability("This NFA was fine earlier but it has become invalid now.", runtime.aliases);',
        '  assert.equal(result.primaryDecision, "direct_static_case");',
        '  assert.deepEqual(result.observableCaseIds, ["case.nfa.invalid_after_use"]);',
        '});',
        '',
        'test("B0 v2 regression: refunded wording enters current-authority policy route", () => {',
        '  const result = reviewFirstTurnObservability("I want this purchase refunded.", runtime.aliases);',
        '  assert.equal(result.primaryDecision, "direct_policy_route");',
        '  assert.equal(result.policyRoute, true);',
        '});',
        '',
        'test("B0 v2 regression: product-key activation outranks order-key delivery routing", () => {',
        '  const result = reviewFirstTurnObservability("Where do I activate the product key I already bought?", runtime.aliases);',
        '  assert.equal(result.primaryDecision, "direct_static_case");',
        '  assert.deepEqual(result.observableCaseIds, ["case.license.activation"]);',
        '});',
        '',
        'test("B0 v2 regression: website not-working phrasing keeps website-stage clarification", () => {',
        '  const result = reviewFirstTurnObservability("The website is not working when I try to buy.", runtime.aliases);',
        '  assert.equal(result.primaryDecision, "family_scoped_clarification");',
        '  assert.equal(result.clarificationId, "clarify.website_stage");',
        '});',
        '',
    ]
    test_text += "\n".join(additions)
    tests.write_text(test_text)

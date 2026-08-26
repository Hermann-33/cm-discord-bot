from pathlib import Path

router = Path("src/ai/firstTurnRouter.ts")
text = router.read_text()

replacements = [
    (
        '  const deliveredOrderAccessProblem = has(/\\bdelivered\\b/u) && has(/\\b(?:view order|order link|order page)\\b/u) && has(/\\b(?:cant|cannot|dont|doesnt|wont|unable|not able)\\b.{0,24}\\b(?:click|open|view)\\b/u);',
        '  const deliveredOrderAccessProblem = has(/\\bdelivered\\b/u) && has(/\\b(?:view order|order link|order page)\\b/u) && has(/\\b(?:cant|cannot|dont|doesnt|wont|will not|unable|not able)\\b.{0,24}\\b(?:click|open|view)\\b/u);',
    ),
    (
        '  const commerceAndTechnical = (paymentSignal || deliverySignal) && (nfaSignal || loaderSignal || has(/\\b(?:invalid|logged out|banned|crash|inject)\\b/u));',
        '  const independentCommerceSignal = paymentSignal || (deliverySignal && has(/\\b(?:order|deliver|delivery|received?|arrive|account)\\b/u));\n  const commerceAndTechnical = independentCommerceSignal && (nfaSignal || loaderSignal || has(/\\b(?:invalid|logged out|banned|crash|inject)\\b/u));',
    ),
    (
        '  if (spooferSignal && has(/\\b(?:perm(?:anent)?|temp(?:orary)?|duration|lifetime|how long)\\b/u)) return withBase(result, exactCase("case.catalog.pricing_duration", "The first turn explicitly asks about the spoofer duration or permanent/temporary offering."));',
        '  if (spooferSignal && has(/\\b(?:put|restore|change).{0,25}\\b(?:pc|computer|hwid|machine)\\b.{0,20}\\b(?:back|normal)|\\b(?:revert|reverse|unspoof|remove)\\b/u)) return withBase(result, exactCase("case.spoofer.reversal_reset", "The opening message explicitly asks to reverse or reset a temporary spoof state."));\n  if (spooferSignal && has(/\\b(?:perm(?:anent)?|temp(?:orary)?|duration|lifetime|how long)\\b/u)) return withBase(result, exactCase("case.catalog.pricing_duration", "The first turn explicitly asks about the spoofer duration or permanent/temporary offering."));',
    ),
    (
        '\n  if (has(/\\b(?:spoofer|spoof)\\b/u) && has(/\\b(?:put|restore|change).{0,25}\\b(?:pc|computer|hwid|machine)\\b.{0,20}\\b(?:back|normal)|\\b(?:revert|reverse|unspoof|remove)\\b/u)) return withBase(result, exactCase("case.spoofer.reversal_reset", "The opening message explicitly asks to reverse or reset a temporary spoof state."));\n  if (has(/\\b(?:expired|key is no longer valid|license.*not valid)\\b/u)',
        '\n  if (has(/\\b(?:expired|key is no longer valid|license.*not valid)\\b/u)',
    ),
    ('sign(?:ed)? me out', 'sign(?:ed|ing)? me out'),
    (
        '(?:invalid|locked|doesnt work|didnt work|wont work|cant login|cannot login)',
        '(?:invalid|locked|doesnt work|didnt work|wont work|never worked|cant login|cannot login)',
    ),
]

changed = False
for old, new in replacements:
    if new in text:
        continue
    if old not in text:
        raise SystemExit(f"expected router fragment missing: {old[:120]}")
    text = text.replace(old, new, 1)
    changed = True
if changed:
    router.write_text(text)

tests = Path("tests/ai/deterministicResolver.test.ts")
test_text = tests.read_text()
import_line = 'import { reviewFirstTurnObservability } from "../../src/ai/firstTurnRouter";\n'
if import_line not in test_text:
    anchor = 'import { RuntimeDeterministicSupportResolver } from "../../src/ai/deterministicResolver";\n'
    if anchor not in test_text:
        raise SystemExit("deterministic resolver import anchor missing")
    test_text = test_text.replace(anchor, anchor + import_line, 1)

marker = 'test("B0 regression: invalid product license remains a single license activation case"'
if marker not in test_text:
    additions = [
        '',
        'test("B0 regression: invalid product license remains a single license activation case", () => {',
        '  const result = reviewFirstTurnObservability("My license key is invalid and will not activate.", runtime.aliases);',
        '  assert.equal(result.primaryDecision, "direct_static_case");',
        '  assert.deepEqual(result.observableCaseIds, ["case.license.activation"]);',
        '});',
        '',
        'test("B0 regression: NFA never worked from first login resolves first-use invalidity", () => {',
        '  const result = reviewFirstTurnObservability("I just bought an NFA and it never worked from the first login.", runtime.aliases);',
        '  assert.equal(result.primaryDecision, "direct_static_case");',
        '  assert.deepEqual(result.observableCaseIds, ["case.nfa.invalid_first_use"]);',
        '});',
        '',
        'test("B0 regression: signing-me-out wording resolves NFA owner/session conflict", () => {',
        '  const result = reviewFirstTurnObservability("The NFA owner keeps signing me out whenever I log in.", runtime.aliases);',
        '  assert.equal(result.primaryDecision, "direct_static_case");',
        '  assert.deepEqual(result.observableCaseIds, ["case.nfa.owner_session_conflict"]);',
        '});',
        '',
        'test("B0 regression: delivered order with View Order access failure routes to dashboard verification", () => {',
        '  const result = reviewFirstTurnObservability("My order is delivered but the View Order button will not open.", runtime.aliases);',
        '  assert.equal(result.primaryDecision, "direct_static_case");',
        '  assert.deepEqual(result.observableCaseIds, ["case.dashboard.verification"]);',
        '});',
        '',
        'test("B0 regression: explicit spoof reversal outranks incidental temporary-duration wording", () => {',
        '  const result = reviewFirstTurnObservability("I want to remove the temporary spoof and put my PC back to normal.", runtime.aliases);',
        '  assert.equal(result.primaryDecision, "direct_static_case");',
        '  assert.deepEqual(result.observableCaseIds, ["case.spoofer.reversal_reset"]);',
        '});',
        '',
    ]
    test_text += "\n".join(additions)

tests.write_text(test_text)

function normalizeText(value) {
  return String(value ?? '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();
}

export function firstTurnRoutingSignals(value) {
  const text = normalizeText(value);
  const hits = [];
  const add = (...ids) => { for (const id of ids) if (!hits.includes(id)) hits.push(id); };

  if (/\b(?:media|tiktok|youtube|yt|creator|make (?:a )?video|stream(?:ing)?)\b/.test(text)) add('case.media.application');
  if (/\b(?:resell|reseller|affiliate|partnership|partner with|sell (?:you|your)|supplier|supply offer)\b/.test(text)) add('case.reseller.application');
  if (/\b(?:refund|cancel|money back)\b/.test(text)) add('case.order.refund_cancel');
  if (/\baura\b/.test(text)) add('case.aura.balance_or_adjustment');
  if (/\b(?:wallet|site balance|store balance|added to balance)\b/.test(text)) add('case.wallet.balance');
  if (/\b(?:coupon|discount|promo code|voucher)\b/.test(text)) add('case.discount.coupon');

  if (/\b(?:paid|charged|payment confirmed)\b.*\b(?:nothing|not receive|didnt receive|missing|no key|no order)\b|\b(?:nothing|no key|no order)\b.*\b(?:paid|charged)\b/.test(text)) add('case.payment.completed_missing_order');
  if (/\b(?:crypto|bitcoin|btc|ltc|coinbase)\b.*\b(?:pending|confirm|waiting|stuck|failed)\b/.test(text)) add('case.payment.crypto_pending');
  if (/\b(?:paypal|pay pal|\bpp\b)\b/.test(text)) add('case.payment.paypal_unavailable');
  if (/\b(?:card|stripe|gift card|giftcard|3ds|visa|mastercard|apple pay|venmo|revolut)\b/.test(text)) add('case.payment.card_declined');
  if (/\bpayment\b.*\b(?:failed|pending|declined|stuck|issue|error|not work)\b/.test(text)) add('case.payment.failed_or_pending');
  if (/\b(?:manual payment|pay manually|bank transfer|buy me a coffee|buymeacoffee)\b/.test(text)) add('case.payment.manual');

  if (/\b(?:where|track|status|find)\b.*\b(?:order|purchase|invoice)\b/.test(text)) add('case.order.status');
  if (/\b(?:order|key|account|delivery)\b.*\b(?:not arrived|not received|hasnt arrived|missing|delayed|waiting|need my|details arent here|didnt generate)\b|\b(?:need|get|receive)\b.*\b(?:my )?(?:key|account|order)\b/.test(text)) add('case.order.fulfillment_delayed');
  if (/\bwrong\b.*\b(?:account|hours|product|key|delivery|game)\b|\bthought i bought\b.*\b(?:but|this)\b/.test(text)) add('case.account.wrong_specification');

  if (/\b(?:restock|out of stock|in stock|stock rn|stock please|available|availability|still work|working right now|working today|down right now|undetected|\bud\b|detected|back in stock)\b/.test(text)) add('case.catalog.availability_status');
  if (/\b(?:how much|price|cost|1 day|one day|3 day|week key|month key|lifetime|duration)\b/.test(text)) add('case.catalog.pricing_duration');

  const nfa = /\b(?:nfa|account token)\b/.test(text);
  if (nfa && /\b(?:loader|token|redeem|activate|download|link|how (?:do|can) i (?:login|log in)|where.*loader|need.*key)\b/.test(text)) add('case.nfa.redemption_activation');
  if (nfa && /\b(?:owner|someone else|other person|logged out|signed out|password changed|asking for (?:a )?password|session)\b/.test(text)) add('case.nfa.owner_session_conflict');
  if (nfa && /\binvalid\b/.test(text) && /\b(?:first|never|just bought|new|instantly|didnt use|havent used)\b/.test(text)) add('case.nfa.invalid_first_use');
  if (nfa && /\binvalid\b/.test(text) && /\b(?:worked|before|later|days? ago|stopped)\b/.test(text)) add('case.nfa.invalid_after_use');
  if (nfa && /\b(?:replacement|replace|exchange|warranty)\b/.test(text)) add('case.nfa.replacement_dispute');
  if (nfa && /\b(?:what is|meaning|ownership|email|session|login and password|details)\b/.test(text)) add('case.nfa.access_model_question');
  if (/\b(?:bulk|multiple|many|[2-9]\s+(?:nfa|accounts?))\b/.test(text)) add('case.account.bulk_purchase');
  if (/\b(?:buy|purchase|want|need|looking for|sell)\b.*\b(?:account|nfa|accs?)\b|\b(?:account|nfa|accs?)\b.*\b(?:buy|purchase|stock)\b/.test(text)) add('case.account.purchase_question');
  if (/\b(?:account|nfa)\b.*\b(?:banned|ban|cooldown|vac|game banned)\b|\b(?:banned|vac banned)\b.*\b(?:account|nfa)\b/.test(text)) add('case.account.banned');
  if (/\b(?:account|credentials|email|password)\b.*\b(?:cant login|cannot login|log in|login|invalid|access|not work)\b/.test(text)) add('case.account.login_access');

  if (/\b(?:website|site|checkout|secure checkout|internal server)\b.*\b(?:not work|wont work|error|failed|issue|cant|cannot|down)\b/.test(text)) add('case.website.checkout_failure');
  if (/\b(?:website|dashboard)\b.*\b(?:login|discord|link)\b/.test(text)) add('case.website.login');
  if (/\bdashboard\b.*\b(?:verify|purchase|order|missing|not show)\b/.test(text)) add('case.dashboard.verification');

  if (/\b(?:license|key)\b.*\b(?:invalid|expired|activate|activation|incorrect|not work|reset)\b/.test(text)) add(/\bexpired\b/.test(text) ? 'case.license.expired_time' : 'case.license.activation');
  if (/\b(?:loader|launcher|program|exe)\b.*\b(?:closes|closing|instantly closes|wont open|cant open|doesnt open|not open)\b/.test(text)) add('case.loader.closes_runtime');
  if (/\b(?:loader|launcher)\b.*\b(?:connection|connect|bad connection|failed to fetch|stuck at zero)\b|\bconnection failed\b/.test(text)) add('case.loader.connection');
  if (!nfa && /\b(?:loader|launcher|updater)\b.*\b(?:update|download|reinstall|new version)\b/.test(text)) add('case.loader.update');
  if (/\b(?:product|cheat|inject|injected|injection)\b.*\b(?:nothing happens|not launch|wont launch|doesnt work|not coming up|failed)\b/.test(text)) add('case.product.launch_failure');
  if (/\b(?:secure boot|virtualization|tpm|aes|irst|raid|vbs|hyper-v|windows 11|windows 10|25h2)\b/.test(text)) add(/\b(?:support|compatible|work(?:ing)? (?:on|with)|controller|linux)\b/.test(text) ? 'case.product.compatibility' : 'case.product.requirements');
  if (/\b(?:compatible|compatibility|controller supported|work on linux|work with|supports?)\b/.test(text)) add('case.product.compatibility');

  if (/\b(?:crash|closes|freezes?)\b.*\b(?:loading|joining|server|world|downloading data)\b/.test(text)) add('case.game.crash_loading');
  if (/\b(?:game|rust|fortnite|cs2|apex|valorant)\b.*\b(?:crash|closes|freezes?|not responding)\b/.test(text)) add('case.game.crash_general');
  if (/\b(?:menu|overlay|ui)\b.*\b(?:not load|not show|wont open|cant open|frozen|freezes|mouse 1|bind)\b/.test(text)) add('case.game.overlay_menu');
  if (/\b(?:aimbot|esp|triggerbot|feature|config|setting|keybind)\b.*\b(?:not work|doesnt work|missing|reset|bind|broken)\b/.test(text)) add('case.game.feature_behavior');
  if (/\bvpn\b|\bnetwork\b.*\b(?:block|failed|error)\b/.test(text)) add('case.network.vpn');
  if (/\bwindows\b.*\b(?:activation|reactivate|0xc004f211)\b/.test(text)) add('case.windows.activation_after_spoofer');
  if (/\b(?:hwid reset|reset hwid|revert spoof|reverse spoof|already spoofed|temp spoof)\b/.test(text)) add('case.spoofer.reversal_reset');
  if (/\b(?:spoofer|hwid|spoof)\b.*\b(?:work|working|failed|error|state|status|tpm|ban)\b/.test(text)) add('case.spoofer.hwid_state');
  if (/\b(?:inject|injection|driver block|load driver|bypass|anti cheat|anticheat|undetected|detection)\b/.test(text)) add('case.restricted.technical');
  if (/\b(?:no response|any updates?|support reply|check dm|unanswered)\b/.test(text)) add('case.support.followup');
  if (/\b(?:screenshot|image|video like this|got this|says this|see attached|attachment)\b/.test(text)) add('case.attachment.review');

  return hits;
}

# Current Status

Owner-updated snapshot for AI agents. Keep this short and current.

**Last updated:** 2026-07-14
**Last updated by:** Codex
**MVP target:** This week  
**Sprint goal:** Stabilize EDM-first flow through checkout

## Blockers
- Fresh vendor-signed sandbox handoffs are required to collect the remaining
  cross-system evidence. Request one normal paid order and one zero-value order
  in a coordinated window; each complete payload must include all signed
  `webhookUrl` query fields.
- The paid handoff must remain unpaid past Kexiaozhan's normal 15-minute
  cancellation point before Snapcase completes Stripe Checkout. The zero-total
  handoff must be completed while the staging-only no-cost flag and prices are
  temporarily enabled.
- Alejandro acts only after Snapcase verifies the paid vendor order is restored
  to `Pending Print`; he then selects Merchant Portal `Send to Print` once.

## Top 3 Next Tasks
1. P0: Coordinate fresh complete vendor-signed paid and zero-value handoffs (#39, #51).
2. P0: Run the delayed and no-cost callbacks with exact allowlists, then reset
   every temporary staging gate (#30, #36, #40, #51).
3. P0: After Pending Print is verified, have Alejandro release the paid order
   once in Merchant Portal and record the physical result (#35, #40).

## Now / Next / Later
**Now**
- P0: Internal prerequisites are complete. Staging isolation is verified, the
  zero-total path is merged/deployed but disabled by default, and #43 is closed
  after Stripe delivered a signed test Checkout event with HTTP 200.

**Next**
- P0: Request two fresh vendor-signed handoffs in one coordinated test window:
  paid/delayed and zero-total. Do not reuse the expired July 13 payloads.
- P0: Complete the delayed `deferredPrint` callback, one-job, no-auto-print,
  zero-total, and physical Merchant Portal release evidence in #30, #35, #36,
  #39, and #40.
- P0: Production cutover readiness - production secrets, rollback runbook, and first supervised pilot order.

**Later**
- None

## Notes
- Use `Docs/BACKLOG.md` for priorities.
- Use `Docs/PRODUCTION_ROADMAP.md` for the controlled Kexiaozhan/onshore production pilot plan and coordination messages.
- Run `Docs/QA_SMOKE_TEST_CHECKLIST.md` before go-live.
- QA smoke test: PASS (live-mode order; test-mode run skipped per owner).
- SEO: pre-rendered `/` and `/catalog` with indexable HTML; app routes use noindex fallback.
- Promo codes: pre-checkout apply with Stripe validation; enforce eligibility at checkout.
- UAT: cart persists after Stripe cancel; My Orders thumbnails restored.
- UAT: multi-item checkout metadata limit handled.
- Onshore staging: Stripe sandbox checkout, webhook routing, duplicate replay, operator allowlist/update, tracking, and provider rollback smoke passed.
- Onshore staging: owner dry-run job `a059d2eb-3ada-4dd5-8f32-a4fa88e1a873` is queued from paid Stripe test order `d89cfec5-d190-4209-aff5-c017c22225c6`; duplicate routing reused the same job.
- Vendor designer research: do not expose the tokenized vendor URL as a public CTA. Preferred target is vendor designer output returning to Snapcase-owned Stripe checkout and onshore queue; lead engineer/vendor questions are in `Docs/VENDOR_DESIGNER_RESEARCH.md`.
- Fake vendor handoff: staging-only signed endpoint added for the proposed vendor design-complete -> Snapcase Stripe checkout flow. Contract is in `Docs/VENDOR_HANDOFF_CONTRACT.md`.
- Kexiaozhan Apifox reference: API contract findings, signature rules, endpoint inventory, and remaining vendor blockers are in `Docs/KEXIAOZHAN_APIFOX_REFERENCE.md`.
- Latest vendor payment guide: vendor confirmed the target flow of catalog/designer -> unpaid vendor order -> Snapcase Stripe Checkout -> server-side Stripe webhook confirmation -> Snapcase payment callback -> vendor print queue. Latest fixed payment endpoints and HMAC-SHA256 `machineKey` signing are saved in `Docs/KEXIAOZHAN_WEBHOOK_PAYMENT_GUIDE.md`; this supersedes older MD5 payment callback notes unless vendor reconfirms otherwise.
- Kexiaozhan 2026-06-08 clarification: chief engineer confirmed `webhookUrl` query payload, HMAC-SHA256 signing, timestamp/nonce fields, and signature-only auth for `/client/process-payment-notify` and `/client/query-status`; no JWT/Cookie/Bearer token should be required.
- Kexiaozhan latest clarification: chief engineer confirmed Snapcase should send Stripe PaymentIntent ID as `transactionId`, and `payTime` should be UTC RFC3339.
- Kexiaozhan latest status clarification: no order validation API exists today; `/client/query-status` is payment-status only (`0=unpaid`, `1=paid`) and polling should be slower than every 2 seconds; unpaid vendor orders cancel after 15 minutes; print/order detail APIs and reprint API are forthcoming.
- Kexiaozhan 2026-06-10 clarification: chief engineer confirmed test API base `https://kxzcnt.kexiaozhan.com`, production API base `https://kxzus.kexiaozhan.com`, no current IP restriction/VPN requirement, and provided test machine credentials out of band. Do not commit the test `machineKey`.
- Kexiaozhan redirect checkout intake: `/kexiaozhan/checkout`, `kexiaozhan-create-checkout`, and `kexiaozhan_handoffs` now accept signed vendor query parameters, verify HMAC server-side, create Snapcase-owned Stripe Checkout, and persist handoff state keyed by `out_trade_no`.
- Kexiaozhan staging deployment: `https://staging.snapcase.ai` is mapped to the dedicated Vercel project `snapcase-staging`, whose public production deployment is built against isolated Supabase staging `onztuktjcmjukfhcuphh`. It is independent from the production Vercel project `snapcase_app_v2`; do not use branch-scoped preview aliases for vendor tests. The bridge does not validate payment truth; `kexiaozhan-create-checkout` remains the authoritative HMAC verifier.
- Kexiaozhan payment scaffold: server-only HMAC helpers, vendor-vector tests, fake handoff payment context, real redirect handoff context, and `route-fulfillment-order` notification metadata are implemented. Live vendor POSTs require explicit `KEXIAOZHAN_PAYMENT_NOTIFY_ENABLED=true` plus backend `KEXIAOZHAN_MACHINE_KEY`. For staging vendor smoke tests, require an exact/prefix allowlist with `KEXIAOZHAN_PAYMENT_NOTIFY_REQUIRE_ALLOWLIST=true`, `KEXIAOZHAN_PAYMENT_NOTIFY_ALLOWED_OUT_TRADE_NOS`, or `KEXIAOZHAN_PAYMENT_NOTIFY_ALLOWED_PREFIXES` so only the real Kexiaozhan sandbox order is mutated.
- Kexiaozhan staging smoke on 2026-06-16: deployed `20260616034837_add_kexiaozhan_handoffs`, `kexiaozhan-create-checkout`, `stripe-webhook`, and `route-fulfillment-order` to Supabase staging `onztuktjcmjukfhcuphh`; configured sandbox Kexiaozhan secrets without committing them; verified signed checkout creation, duplicate retry reuse, changed replay rejection, bad signature rejection, wrong-machine rejection, real Stripe test payment, webhook order update, one onshore production job, and dry-run signed Kexiaozhan callback metadata.
- Historical note: a private Vercel preview-bypass URL was used during the initial staging setup. It is not part of the current vendor test path; do not post or reuse bypass tokens.
- Kexiaozhan timeout policy: vendor cancellation still occurs after 15 minutes, but
  a valid signed `deferredPrint` success callback is accepted after cancellation
  and restores the order to Pending Print, with no vendor-enforced 30-minute
  callback cutoff. Snapcase accepts expired handoffs only when its server-side
  callback configuration is exactly `deferredPrint`; `immediatePrint`, missing,
  or invalid configuration remains fail-closed. `kexiaozhan-checkout-expirer`
  continues to cap local open Checkout Sessions and replay lifetime.
- Kexiaozhan expirer staging smoke on 2026-06-17 UTC: deployed `kexiaozhan-checkout-expirer`, updated `kexiaozhan-create-checkout` and `route-fulfillment-order`, applied migrations `20260617182057` and `20260617183024` to staging, configured dedicated staging expirer auth via Supabase Vault, confirmed cron `kexiaozhan-checkout-expirer-1m` is active, and verified HTTP 200 dry-run response.
- Kexiaozhan live callback gate: staging can now enable `/client/process-payment-notify` for only one vendor-originated sandbox `outTradeNo` or agreed prefix, while unrelated synthetic handoffs remain dry-run.
- Kexiaozhan vendor-originated live callback smoke on 2026-06-17 UTC: Kexiaozhan generated four real sandbox handoffs through the clean bridge; Snapcase Stripe test payment succeeded for all four; each handoff reached `vendor_notified`; each order is `processing` with one `onshore_manual` queued job; each live `/client/process-payment-notify` response was HTTP 200 with `{"code":0,"msg":"success","data":{}}`. Staging live callback was disabled afterward.
- Corrected operating model on 2026-07-12: Snapcase `/operations` is an internal
  queue, separate from the Kexiaozhan Merchant Portal. Alejandro does not need a
  Snapcase login for the Kexiaozhan physical test. His sole test action is to
  release the identified `Pending Print` order with Merchant Portal `Send to
  Print` after Snapcase verifies the delayed payment callback. A Snapcase operator
  records internal job status separately.
- Readiness audit on 2026-07-14: staging Edge Functions are active and their
  callback gate is correctly fail-closed (`deferredPrint`, callback disabled,
  exact allowlist required, empty allowlists). `staging.snapcase.ai` is now
  permanently mapped to the dedicated `snapcase-staging` Vercel project; an
  unauthenticated check returned HTTP 200, the browser bundle used only
  `snapcase-onshore-staging` (no production Supabase reference), and CORS
  permitted the staging origin. Issue #50 is complete.
- The server-controlled zero-total Kexiaozhan Checkout path is merged and
  deployed to isolated staging. It remains disabled by default and requires all
  three server-side conditions: explicit opt-in, zero configured unit/shipping
  prices, and a valid signed vendor amount of zero. #51 remains open only for a
  real vendor-originated no-cost Checkout/callback/job evidence run.
- Stripe Dashboard cleanup completed on 2026-07-13: duplicate staging
  destinations were removed, the original test-mode destination remains scoped
  to two Checkout events, and a synthetic `checkout.session.completed` delivery
  returned HTTP 200 `Ignored`. This proves the staging signing secret matches
  while unrelated Checkout Sessions remain non-mutating. Issue #43 is closed.
- Kexiaozhan 2026-07-11 timeout clarification: for `deferredPrint`, a valid
  signed success callback is processed even after the vendor order has been
  canceled and restores it to Pending Print; `/process-payment-notify` has no
  enforced 30-minute callback cutoff. Other fulfillment modes retain the
  15-minute timeout. No additional vendor API is needed; #30 now needs Snapcase
  deployment and delayed-payment staging evidence.
- Kexiaozhan fulfillment-mode update on 2026-07-10: successful callbacks now
  require a signed `fulfillmentMethod` with exact values `immediatePrint` or
  `deferredPrint`. Snapcase will use server-controlled `deferredPrint` through
  `KEXIAOZHAN_PAYMENT_NOTIFY_EXTRA_FIELDS_JSON`; customers do not choose print
  timing. Snapcase blocks invalid configuration before sending a success callback
  and uses a deterministic Snapcase transaction reference for verified zero-total
  Checkout Sessions without a Stripe PaymentIntent. Issue #36 remains open for
  staging evidence and the vendor administrator release/batch-print procedure.

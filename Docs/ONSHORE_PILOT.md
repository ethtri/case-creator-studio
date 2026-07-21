# Onshore Operations Pilot

Concise operating guide for moving Snapcase site orders from Printful fulfillment to Snapcase-operated production without disabling the live site.

## Pilot Scope

- V1 is Snapcase site orders only.
- Customers continue paying through Stripe.
- Production default remains Printful. `onshore_manual` requires both `FULFILLMENT_PROVIDER=onshore_manual` and `ALLOW_ONSHORE_MANUAL=true` in the target Supabase environment.
- Onshore pilot orders route to an internal manual production queue. They do not call Kexiazhan mutating APIs.
- Amazon orders, customer-facing machine payment, and automatic machine submission stay out of v1.

## Operating Model

- Parent agent acts as PM/PO: scope, backlog, acceptance criteria, PR readiness, risk tracking, and sprint retrospective.
- Sub-agents can be assigned bounded roles such as backend worker, QA reviewer, challenge reviewer, and API researcher.
- Use high reasoning by default for sub-agents; use extra-high for security-critical or ambiguous integration work.
- Do not interrupt sub-agents once assigned. Wait at integration checkpoints only.
- Each implementation agent works in a separate `../wt-<slug>` worktree on an `agent/<slug>` branch.

## Current Implementation

- `route-fulfillment-order` is the provider gate after Stripe payment.
- `printful` remains the default provider and forwards to `submit-printful-order`.
- `onshore_manual` creates or reuses one `production_jobs` row per order.
- `/operations` is an authenticated internal queue backed by server-side operator allowlist checks.
- Operator updates can move jobs through `queued`, `artwork_ready`, `printed`, `packed`, `shipped`, or `failed`.
- When `EASYPOST_AUTOMATION_ENABLED=true`, job creation strictly verifies the
  recipient and stores one approved EasyPost rate. Postage is purchased only
  when the job first reaches `printed`; `packed` and `shipped` require a
  purchased label with tracking.
- EasyPost labels are private PDF artifacts. Set
  `EASYPOST_LABEL_FORMAT=pdf_4x6` for a thermal printer or
  `EASYPOST_LABEL_FORMAT=pdf_letter` for an 8.5x11 printer; the backward-compatible
  default is `pdf_4x6`.
  `/operations` requests a short-lived signed print URL and never receives a
  permanent provider or storage URL.
- Signed EasyPost tracker webhooks update tracking and delivery status through a
  leased event ledger. Failed or interrupted processing is retried by
  `shipping-webhook-drain` without retaining recipient payloads.
- `fake-vendor-design-complete` is a staging-only signed handoff rehearsal. It creates a Snapcase Stripe Checkout Session from mock vendor design metadata, then the existing Stripe webhook routes paid orders to `production_jobs`.
- Kexiaozhan payment callback rehearsal is dry-run by default and records the
  signed callback body under `production_jobs.metadata.kexiaozhan` when fake
  handoff payment context is present.

## Deployment Notes

- Apply the database migration before deploying Edge Functions that write `orders.fulfillment_*` columns or `production_jobs`.
- Keep production unset or set to `FULFILLMENT_PROVIDER=printful`; keep `ALLOW_ONSHORE_MANUAL` unset in production until cutover gates pass.
- Use `FULFILLMENT_PROVIDER=onshore_manual` and `ALLOW_ONSHORE_MANUAL=true` only in staging/preview until pilot approval.
- Configure `OPERATOR_EMAILS` as a comma-separated allowlist in environments where `/operations` should be usable.
- EasyPost staging uses `EASYPOST_MODE=test`,
  `EASYPOST_API_KEY_TEST`, `EASYPOST_FROM_ADDRESS_ID`,
  `EASYPOST_PARCEL_JSON`, `EASYPOST_RATE_POLICY_JSON`,
  `EASYPOST_LABEL_FORMAT`,
  `EASYPOST_WEBHOOK_SECRET`, `SHIPPING_INTERNAL_AUTH_SECRET`, and
  `SHIPPING_WEBHOOK_DRAIN_AUTH_SECRET`. Do not commit their values.
- Production EasyPost calls require `EASYPOST_MODE=production`,
  `EASYPOST_API_KEY_PRODUCTION`, and the independent
  `EASYPOST_PRODUCTION_ENABLED=true` kill switch. Keep the switch false until
  the supervised cutover.
- Supabase Vault must contain `project_url` and
  `shipping_webhook_drain_auth_secret`; run
  `configure_shipping_webhook_drain_schedule()` after both values exist.
- Configure `VERCEL_PREVIEW_ORIGINS` as exact comma-separated preview origins. Do not rely on broad `*.vercel.app` matching.
- For fake vendor handoff tests only, configure `FAKE_VENDOR_HANDOFF_SECRET` and `VENDOR_HANDOFF_CHECKOUT_ORIGIN` in staging/preview.
- For Kexiaozhan redirect checkout tests, configure `KEXIAOZHAN_API_BASE_URL`,
  `KEXIAOZHAN_MACHINE_KEY`, `KEXIAOZHAN_ALLOWED_MACHINE_SN`,
  `KEXIAOZHAN_CHECKOUT_UNIT_AMOUNT_CENTS`,
  `KEXIAOZHAN_CHECKOUT_SHIPPING_CENTS`, and
  `KEXIAOZHAN_CHECKOUT_CURRENCY`; keep `KEXIAOZHAN_PAYMENT_NOTIFY_ENABLED=false`
  until live vendor mutation is explicitly approved.
- When live Kexiaozhan sandbox callback is approved for a vendor-originated
  smoke test, set `KEXIAOZHAN_PAYMENT_NOTIFY_REQUIRE_ALLOWLIST=true` and scope
  the mutation to the exact vendor `outTradeNo` with
  `KEXIAOZHAN_PAYMENT_NOTIFY_ALLOWED_OUT_TRADE_NOS` or to a coordinated test
  prefix with `KEXIAOZHAN_PAYMENT_NOTIFY_ALLOWED_PREFIXES`.
- Kexiaozhan confirmed the fixed `/client` payment APIs are signature-only; do
  not configure JWT, Cookie, or Bearer token headers unless this changes.
- Kexiaozhan confirmed payment callbacks should use Stripe PaymentIntent ID as
  `transactionId` and UTC RFC3339 for `payTime`.
- Kexiaozhan confirmed there is no order validation API today; use
  `/client/query-status` for payment status only, poll slower than every 2
  seconds, and expect unpaid vendor orders to cancel after 15 minutes.
- Kexiaozhan confirmed test API base `https://kxzcnt.kexiaozhan.com`,
  production API base `https://kxzus.kexiaozhan.com`, no current IP/VPN
  requirement, and test machine credentials out of band. Do not commit the test
  `machineKey`.
- Kexiaozhan's browser redirect intake is `/kexiaozhan/checkout?<signed query>`.
  It calls `kexiaozhan-create-checkout`, stores `kexiaozhan_handoffs`, creates
  Stripe Checkout, and keeps the existing fake handoff separate.
- `https://staging.snapcase.ai` is the vendor-facing staging URL. It is mapped to
  the dedicated Vercel project `snapcase-staging`, whose public deployment is
  built against the isolated Supabase staging project
  `onztuktjcmjukfhcuphh`. Keep it separate from the production Vercel project;
  do not use branch-scoped preview aliases or Vercel bypass tokens for vendor
  tests.
- Readiness audit on 2026-07-14 verified unauthenticated HTTP 200 access, a
  browser bundle containing the staging Supabase project and no production
  project reference, and CORS permission for `staging.snapcase.ai`.
- Stripe Dashboard validation completed on 2026-07-13. The retained staging
  destination is test-mode-only, listens to the two required Checkout events,
  and returned HTTP 200 for a signed unrelated Checkout fixture. Duplicate
  staging destinations were removed; issue #43 is closed.
- For the Kexiaozhan physical test, Alejandro needs no Snapcase account, email
  allowlist entry, or customer checkout action. After Snapcase verifies the
  vendor order is `Pending Print`, he opens Merchant Portal **Order Center > Order
  List**, locates the supplied order ID, selects **Send to Print** once, and
  reports the physical outcome. A Snapcase operator records internal job status
  separately.
- A zero-total Kexiaozhan Checkout is disabled by default. It may be enabled only
  in isolated staging with `KEXIAOZHAN_ALLOW_ZERO_TOTAL_CHECKOUTS=true` and both
  checkout price settings at 0, for a vendor handoff whose signed `amount` is 0.
  Restore the normal staging price and disable the flag after the evidence run.
- Kexiaozhan late-payment policy: vendor cancellation still occurs after 15
  minutes, but a valid signed `deferredPrint` success callback is accepted after
  cancellation and restores Pending Print. Snapcase permits an expired handoff
  only for exactly configured `deferredPrint`; `immediatePrint`, missing, and
  invalid fulfillment configuration remain fail-closed.
- `stripe-webhook` ignores completed Stripe Checkout Sessions that do not carry
  Snapcase ownership metadata and have no matching order row. Missing rows for
  Snapcase-owned sessions still fail loudly for investigation.
- `kexiaozhan-checkout-expirer` is the scheduled local Checkout Session/replay
  cap. It expires sessions close to the Snapcase handoff deadline and marks the
  handoff `expired`; schedule it every minute through the Supabase cron migration
  before production pilot traffic.
- Staging smoke on 2026-06-17 UTC proved real Kexiaozhan-originated signed
  redirect payloads, Stripe test payment, webhook update, single onshore job per
  order, and live signed Kexiaozhan callback responses from the vendor sandbox.
- Do not enable production traffic until issue #30 has staging evidence for the
  accepted vendor behavior: a delayed valid `deferredPrint` callback restores
  Pending Print and Snapcase creates only one production job.
- `route-fulfillment-order` accepts Supabase's runtime service-role key and can also accept `ROUTE_FULFILLMENT_AUTH_SECRET` for staging/QA service-role calls. Never expose that secret to browsers.
- The isolated Supabase staging project is `snapcase-onshore-staging` (`onztuktjcmjukfhcuphh`). Do not commit keys or service-role credentials.
- Rollback by environment change affects newly created checkouts. Orders already persisted with `fulfillment_provider=onshore_manual` stay in the manual queue unless an operator explicitly cancels, completes, or reroutes them.

## Vendor Questions Before Automation

- File upload: what endpoint creates the `filePath` required by `POST /v1/order`, and can it accept Snapcase-hosted artwork?
- Prepaid payment: can Stripe-paid orders use an internal/free payment method such as `machineFree` or `couponFree`, and which payment fields are required?
- Machine targeting: is the target machine selected by token scope, order payload, or a separate print-routing endpoint?
- SKU/material mapping: what are the authoritative `brandId`, `goodsSkuId`, `materialIds`, shelf, stock, and magnetic/ordinary mappings?
- Artwork specs: what dimensions, crop, bleed, color profile, file formats, and safe-area templates are required per SKU?
- Idempotency/failure: what keys, callbacks, retries, cancellation/reprint APIs, and machine failure states are canonical?

## Rollout Gates

- Staging test proves Stripe test payment creates exactly one onshore manual job.
- Duplicate webhook or success-page verification does not duplicate jobs.
- A delayed valid `deferredPrint` Kexiaozhan payment callback restores `Pending
  Print`, creates exactly one production job, and does not dispatch a print task
  automatically. Missing, invalid, or non-deferred fulfillment mode remains
  fail-closed.
- Operator allowlist blocks non-operators from reading or updating jobs.
- A test-mode EasyPost order proves strict address verification, policy-approved
  rating, exactly one label purchase after `printed`, private label printing,
  signed tracking updates, and provider-backed refund recovery.
- Ambiguous EasyPost purchases enter `purchase_reconciliation`; ambiguous
  refunds remain `refund_pending`. Resolve them by provider retrieval, never by
  blind retry.
- A verified `Pending Print` test order can be released once through the Merchant
  Portal and the physical result is recorded without output-slot blockage.
- Rollback for new orders is one environment change from `onshore_manual` back to `printful`; already-queued onshore jobs require manual operator disposition.
- Machine automation waits until vendor questions are answered and tested in a non-production machine flow.

## Controlled Production Pilot Checklist

- The #51 zero-total implementation and isolated staging deployment are ready;
  its live evidence requires the vendor order and is not a prerequisite to
  requesting it. Coordinate fresh paid and zero-value sandbox handoffs using the
  approved isolated staging redirect and require the complete signed query
  payloads. Snapcase
  waits past the normal cancellation point for the paid order, completes the
  Stripe test Checkout, and confirms the signed `deferredPrint` callback restores
  `Pending Print` with exactly one production job.
- Alejandro then completes the supervised physical release from Merchant Portal
  **Order Center > Order List > Send to Print**. He does not use Snapcase
  `/operations`, create an order, or make a payment.
- Issue #30 staging evidence confirms the vendor's deferred-print exception:
  after cancellation, a valid signed callback restores Pending Print and does
  not create duplicate Snapcase jobs.
- Issue #36 now has Kexiaozhan's exact signed callback field contract:
  `fulfillmentMethod=deferredPrint` for admin-controlled printing. Customers do
  not choose whether orders print immediately. Keep the issue open until the
  staging positive/zero-amount callbacks and the vendor admin-release procedure
  are verified.
- Production secrets are configured without exposing keys; keep `KEXIAOZHAN_PAYMENT_NOTIFY_ENABLED=false` until go/no-go.
- Production env cutover is approved: `FULFILLMENT_PROVIDER=onshore_manual`, `ALLOW_ONSHORE_MANUAL=true`, exact `OPERATOR_EMAILS`, Stripe live webhook, production Kexiaozhan base URL, production machine key, allowed production machine SN, and checkout pricing.
- Rollback is reviewed: switch new orders back to `printful`; manually disposition already queued onshore jobs.
- First production order is supervised; verify Stripe live payment, Kexiaozhan callback, exactly one production job, and Alejandro workflow.
- Disable or narrow live Kexiaozhan callback after the pilot if monitoring shows any issue.

## Completed Hardening

- Public Edge Function CORS now uses shared exact-origin matching. Preview access is allowed only through configured exact origins.
- Stripe configuration now fails closed. `STRIPE_MODE=test` requires `STRIPE_SECRET_KEY_TEST` and `STRIPE_WEBHOOK_SECRET_TEST`; it does not fall back to live/generic secret names.
- The public checkout endpoint rejects present but disallowed origins for Stripe success/cancel URLs.

## Open Hardening Items

- Disable/delete the staging Stripe webhook endpoint when not actively testing,
  or keep it narrowed to test-mode `checkout.session.completed` and
  `checkout.session.async_payment_succeeded` only.
- Rotate the pasted Stripe test secret and any staging-only route/preview bypass secrets after staging validation.
- Revoke or rotate the temporary Vercel preview bypass after Kexiaozhan completes
  the real sandbox redirect smoke.
- Remove or reset temporary staging operator credentials after the manual dry run.
- Keep the current tokenized Kexiaozhan/Xiaojiang URL operator-only. Do not expose it through public Snapcase CTAs, docs, logs, screenshots, or customer-visible redirects.

## Sprint Retro Log

### 2026-05-03 - Pilot Foundation

- Product: Keep Stripe and Snapcase checkout as the source of truth; the machine UI is a local kiosk flow, not a shipped-order checkout.
- Functionality: Use a manual production queue first because `filePath`, prepaid payment, and machine-targeted print submission remain unverified.
- Operating model: Sub-agents worked best when split by backend implementation and independent QA/challenge review with explicit no-interruption guidance.

### 2026-05-03 - Staging Validation Attempt

- Product: No cutover. PR #27 remains open and production stays Printful-backed.
- Functionality: Code checks passed, but full staging QA is blocked until there is an accessible preview/staging target plus a non-production Supabase environment with the migration, Edge Functions, `FULFILLMENT_PROVIDER=onshore_manual`, and `OPERATOR_EMAILS`.
- Operating model: Parallel staging, QA, challenge, and API research agents surfaced useful blockers quickly; next validation sprint should start by provisioning staging access before checkout smoke tests.

### 2026-05-03 - Sprint 1 Staging Lane Checkpoint

- Product: Production remains Printful-backed; staging is the only intended lane for `onshore_manual`.
- Functionality: Created an isolated Supabase staging project, repaired local migration history so a fresh staging database can be built, deployed staging Edge Functions, set branch-scoped Vercel Supabase env, and enabled protected-preview automation bypass. Full checkout QA still needs Stripe test/email secrets.
- Operating model: Challenge review added one extra production-safety gate, `ALLOW_ONSHORE_MANUAL=true`, so an accidental provider env change alone cannot send live orders to the manual queue.

### 2026-05-03 - Sprint 2 Stripe Staging Smoke

- Product: Stripe test checkout can fund a staging onshore order without touching Printful or Kexiazhan.
- Functionality: Created the staging Stripe webhook, completed a Stripe sandbox Checkout payment, fixed the Edge runtime webhook verifier to use Stripe's async signature path, and confirmed exactly one `onshore_manual` job. Duplicate event replay kept one job, operator allowlist blocked a non-operator, operator status/tracking updates persisted, and a temporary `printful` provider rollback checkout created no onshore job.
- Operating model: Owner only had to supply the Stripe test secret; PM/agent team handled webhook creation, Supabase secret setup, browser checkout, QA replay, operator auth test users, rollback smoke, and PR hardening.

### 2026-05-03 - Owner Dry Run Ready

- Product: Production remains unchanged and PR #27 remains open/unmerged; this is still a staging-only manual onshore pilot.
- Functionality: Created a fresh Stripe sandbox payment for order `d89cfec5-d190-4209-aff5-c017c22225c6`, which queued production job `a059d2eb-3ada-4dd5-8f32-a4fa88e1a873`. A second route call returned the existing job with `created=false`, confirming no duplicate job was created.
- Operating model: QA confirmed staging/production isolation and challenge review approved a staging dry run while calling out origin matching, Stripe test fail-closed behavior, and secret rotation as required hardening before merge/cutover.

### 2026-05-03 - Vendor Designer Research Sprint

- Product: Vendor catalog breadth is better than Snapcase's current catalog, but the current vendor URL is token-gated and is not safe as a public CTA.
- Functionality: The viable target is vendor designer output feeding back into Snapcase-owned cart, Stripe checkout, order record, and onshore queue. The vendor `Print` path remains the unsafe order/payment boundary until API answers confirm an internal/prepaid path.
- Operating model: API, UX, vendor UI, and security sub-agents independently converged on the same recommendation: pursue a hybrid integration only after lead engineer/vendor questions are answered.

### 2026-05-04 - Fake Vendor Handoff Hardening

- Product: The next safe prototype is not a public vendor redirect. It is a signed server-to-server design-complete handoff that returns the customer to Snapcase-owned Stripe checkout.
- Functionality: Added a staging-only fake vendor handoff endpoint, centralized exact-origin CORS, and made Stripe test mode fail closed. No Kexiazhan mutating calls were added.
- Operating model: Implementation and challenge agents converged on the same guardrail: vendor metadata can describe production artwork, but it cannot be accepted from public checkout or treated as payment/order truth.

### 2026-06-16 - Kexiaozhan Redirect Staging Smoke

- Product: Snapcase can now receive Kexiaozhan-shaped signed browser handoffs and keep Stripe as the payment source of truth in staging. A real vendor-originated redirect still needs an accessible public test URL because the current PR preview is Vercel-protected without bypass.
- Functionality: Deployed `kexiaozhan_handoffs`, `kexiaozhan-create-checkout`, `stripe-webhook`, and `route-fulfillment-order` to Supabase staging. Verified signed checkout creation, duplicate retry reuse, changed replay rejection, bad signature rejection, wrong-machine rejection, real Stripe test payment, webhook order/handoff update, exactly one onshore job, and dry-run signed Kexiaozhan callback metadata.
- Operating model: Keep `KEXIAOZHAN_PAYMENT_NOTIFY_ENABLED=false` until the handoff comes from Kexiaozhan's sandbox order system, then test the live sandbox callback with an exact/prefix allowlist before any production traffic.

### 2026-06-17 UTC - Kexiaozhan Vendor-Originated Callback Smoke

- Product: Kexiaozhan's sandbox can now hand off unpaid orders to Snapcase Checkout, let Snapcase collect Stripe test payment, and accept Snapcase's signed payment-complete callback.
- Functionality: Verified four Kexiaozhan-generated sandbox orders through the clean Supabase bridge. Each handoff reached `vendor_notified`, each Snapcase order is `processing`, each has exactly one `onshore_manual` queued production job, and each live `/client/process-payment-notify` response was HTTP 200 with `{"code":0,"msg":"success","data":{}}`.
- Operating model: Disable staging live callback after the smoke. Production remains blocked on the 15-minute Kexiaozhan unpaid-order TTL versus Stripe Checkout's 30-minute minimum expiration; issue #30 tracks the required production decision.

### 2026-06-17 UTC - Kexiaozhan Checkout Expirer Staging Smoke

- Product: Snapcase now has an executable fallback for the Kexiaozhan 15-minute TTL mismatch if the vendor cannot extend TTL before pilot.
- Functionality: Added `kexiaozhan-checkout-expirer`, scheduled it every minute in staging with a dedicated Vault-backed auth secret, and verified HTTP 200 responses. The scheduled run cleaned up already-expired historical staging handoffs; manual dry-run returned 200 with no current candidates.
- Operating model: Production still needs the accepted issue #30 decision. If the expirer fallback is chosen, production must configure matching Edge Function and Vault secrets before enabling Kexiaozhan traffic.

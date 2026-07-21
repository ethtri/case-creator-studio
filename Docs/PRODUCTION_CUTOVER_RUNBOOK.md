# Production Cutover Runbook

Controlled Kexiaozhan/onshore production pilot runbook. This is not a full public launch runbook.

## Preconditions

- PR #27 is merged and production deploy is healthy.
- Issue #35 physical staging evidence confirms that Alejandro can release one
  verified `Pending Print` order through the Kexiaozhan Merchant Portal. This
  action does not require Snapcase `/operations` access or a Snapcase login.
- Issue #30 staging evidence confirms Kexiaozhan's accepted deferred-print
  behavior: a valid signed callback after cancellation restores Pending Print,
  produces exactly one Snapcase job, and does not dispatch immediate printing.
- Issue #36 staging validation is complete: the signed success callback uses
  `fulfillmentMethod=deferredPrint`, and the vendor administrator release/batch
  procedure is documented and tested.
- Production remains Printful-backed until explicit go/no-go approval.

## Required Production Environment

Configure these only after dry-run and TTL/print-mode gates are accepted. Do not commit or paste secret values.

| Area | Setting |
| --- | --- |
| Fulfillment | `FULFILLMENT_PROVIDER=onshore_manual` |
| Fulfillment safety | `ALLOW_ONSHORE_MANUAL=true` |
| Operators | `OPERATOR_EMAILS=<Snapcase administrator email(s)>` |
| Transactional email | `RESEND_API_KEY`, `RESEND_FROM_EMAIL=hello@snapcase.ai`, `RESEND_FROM_NAME=Snapcase` |
| Email support routing | `SUPPORT_EMAIL=support@snapcase.ai`, `RESEND_WEBHOOK_SECRET` |
| Email smoke test | `SEND_TEST_EMAIL_SECRET=<random environment-specific value>` |
| Stripe | `STRIPE_MODE=live`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` |
| Shipping automation | `EASYPOST_AUTOMATION_ENABLED=true` |
| EasyPost production gate | `EASYPOST_MODE=production`, `EASYPOST_PRODUCTION_ENABLED=true` |
| EasyPost credentials | `EASYPOST_API_KEY_PRODUCTION`, `EASYPOST_FROM_ADDRESS_ID` |
| EasyPost package/rates | `EASYPOST_PARCEL_JSON`, `EASYPOST_RATE_POLICY_JSON`, `EASYPOST_LABEL_FORMAT=pdf_4x6|pdf_letter` |
| EasyPost webhook | `EASYPOST_WEBHOOK_SECRET`, `SHIPPING_WEBHOOK_DRAIN_AUTH_SECRET` |
| Private label links | `SHIPPING_LABEL_SIGNED_URL_TTL_SECONDS` |
| Analytics | `GA4_MEASUREMENT_ID`, `GA4_API_SECRET` (server-only Measurement Protocol credential), `GA4_OUTBOX_DRAIN_AUTH_SECRET` |
| Kexiaozhan API | `KEXIAOZHAN_API_BASE_URL=https://kxzus.kexiaozhan.com` |
| Kexiaozhan auth | `KEXIAOZHAN_MACHINE_KEY`, `KEXIAOZHAN_ALLOWED_MACHINE_SN` |
| Checkout pricing | `KEXIAOZHAN_CHECKOUT_UNIT_AMOUNT_CENTS`, `KEXIAOZHAN_CHECKOUT_SHIPPING_CENTS`, `KEXIAOZHAN_CHECKOUT_CURRENCY` |
| No-cost checkout guard | `KEXIAOZHAN_ALLOW_ZERO_TOTAL_CHECKOUTS=false` |
| Handoff window | `KEXIAOZHAN_HANDOFF_MAX_AGE_SECONDS=2100` for deferred printing; non-deferred modes remain capped at 15 minutes |
| Checkout expirer | `KEXIAOZHAN_CHECKOUT_EXPIRY_LEEWAY_SECONDS=60` for local session/replay expiry |
| Checkout expirer auth | `KEXIAOZHAN_CHECKOUT_EXPIRER_AUTH_SECRET` |
| Print-mode field | `KEXIAOZHAN_PAYMENT_NOTIFY_EXTRA_FIELDS_JSON={"fulfillmentMethod":"deferredPrint"}` |
| Callback gate | `KEXIAOZHAN_PAYMENT_NOTIFY_ENABLED=false` until supervised go/no-go |
| Pilot allowlist | `KEXIAOZHAN_PAYMENT_NOTIFY_REQUIRE_ALLOWLIST=true` and exact `KEXIAOZHAN_PAYMENT_NOTIFY_ALLOWED_OUT_TRADE_NOS` for first order if practical |

Before production cutover, confirm the Resend domain is verified and Supabase
Auth custom SMTP uses `hello@snapcase.ai` as its sender. Transactional order
mail uses `hello@snapcase.ai` as its sender and `support@snapcase.ai` as its
reply-to address. Partnership mail uses `partnerships@snapcase.ai`; creator and
social outreach uses `social@snapcase.ai`.

### Resend configuration baseline (verified 2026-07-20)

- Resend workspace owner: `hello@snapcase.ai`.
- `snapcase.ai` is verified in Resend. GoDaddy retains the Microsoft 365 root
  MX and related records; Resend uses only `resend._domainkey` plus the `send`
  subdomain MX/SPF records.
- Production and staging use separate sending-only Resend API keys restricted
  to `snapcase.ai`. Store them only as each project's `RESEND_API_KEY` secret.
- Both environments use `hello@snapcase.ai` for `RESEND_FROM_EMAIL`,
  `support@snapcase.ai` for `SUPPORT_EMAIL`, and `Snapcase` for
  `RESEND_FROM_NAME`.
- Supabase Auth custom SMTP is enabled in production and staging with
  `smtp.resend.com:587`, username `resend`, sender `Snapcase
  <hello@snapcase.ai>`, and the environment-specific Resend key as its encrypted
  password.
- Resend has separate production and staging webhook endpoints at each
  project's `/functions/v1/resend-webhook` URL. Each listens for `email.sent`,
  `email.delivered`, `email.bounced`, `email.complained`, `email.failed`,
  `email.opened`, and `email.clicked`, with its own signing secret stored as
  `RESEND_WEBHOOK_SECRET` in the matching Supabase project.
- Store a different random `SEND_TEST_EMAIL_SECRET` (at least 32 characters) in
  each Supabase project. Send it only in the `x-snapcase-smoke-secret` header
  when invoking the operator-only `send-test-email` function.
- The webhook fails closed if its signing secret is missing, rejects signatures
  outside the five-minute freshness window, and records each `svix-id`
  atomically before applying a monotonic delivery-state update. Database errors
  must return HTTP 5xx so Resend retries the event.
- A controlled `hello@snapcase.ai` delivery test must show both `sent` and
  `delivered`, and signed webhook deliveries must return HTTP 200 after any
  signing-secret rotation.

`KEXIAOZHAN_PAYMENT_NOTIFY_EXTRA_FIELDS_JSON` is a server-controlled, signed
field. The first pilot must use deferred admin printing:

```json
{"fulfillmentMethod":"deferredPrint"}
```

## Deploy/Confirm Functions

Deploy or confirm these Supabase Edge Functions in production before the pilot:

- `kexiaozhan-create-checkout`
- `kexiaozhan-checkout-redirect`
- `kexiaozhan-checkout-expirer`
- `stripe-webhook`
- `ga4-outbox-drain`
- `verify-payment`
- `route-fulfillment-order`
- `production-jobs`
- `update-production-job`
- `shipping-label-actions`
- `shipping-prepare-order`
- `shipping-purchase-label`
- `shipping-refund-label`
- `easypost-webhook`
- `shipping-webhook-drain`
- `printful-retry`
- `submit-printful-order`

Deploy the three server-to-server shipping functions from the checked-in
`supabase/config.toml`. Their gateway JWT verification must remain disabled;
each handler still rejects browser-origin traffic and requires the project
service credential or `SHIPPING_INTERNAL_AUTH_SECRET`.

Keep the analytics scheduler disabled before applying its migration chain:

1. Store `project_url`, a matching dedicated scheduler credential, and the
   literal Vault value `ga4_outbox_drain_enabled=false`.
2. Deploy `ga4-outbox-drain`. It remains unreachable to cron while the flag is
   false.
3. In a clean environment, apply every migration in filename order. This puts
   `20260721020000_harden_analytics_outbox_schedule` after the `20260719...`
   shipping migrations, as its timestamp requires.
4. Deploy the updated `stripe-webhook` only after
   `20260717160000_harden_analytics_event_outbox` has executed.

For an environment whose migration history already contains later shipping
migrations but is missing an earlier analytics migration, do not run a broad
push. With the flag still false, execute each missing analytics SQL file in
filename order, deploy the functions at the point above, and record a migration
as applied only after that file executes successfully. Finish with
`20260721020000_harden_analytics_outbox_schedule`, then confirm the linked
migration list is clean.

Confirm Supabase Vault contains:

- `project_url`
- `ga4_outbox_drain_auth_secret`
- `ga4_outbox_drain_enabled` (keep `false` until GA4 credentials, consent
  approval, evidence, and monitoring are ready)
- `kexiaozhan_checkout_expirer_auth_secret`
- `shipping_webhook_drain_auth_secret`

The Vault `ga4_outbox_drain_auth_secret` value must match the Edge Function env
`GA4_OUTBOX_DRAIN_AUTH_SECRET`. The worker uses this dedicated cron credential
instead of placing the Supabase service-role key in the scheduled request.
Scheduled requests are sent only while `ga4_outbox_drain_enabled` is exactly
`true` and the live Vault URL and credential still pass validation. Run
`configure_ga4_outbox_drain_schedule()` after changing the flag, URL, or
credential so the cron row itself is removed or recreated to match the current
configuration.

After applying the scheduler migrations, run the rollback-only database
acceptance test against the intended project:

```powershell
supabase db query --linked --file scripts/sql/analytics-outbox-schedule-gate.acceptance.sql
```

The script verifies disabled, invalid, enabled, legacy-upgrade, runtime-gate,
and function-privilege behavior inside one transaction, then restores all Vault
and cron state with `ROLLBACK`.
The Vault `kexiaozhan_checkout_expirer_auth_secret` value must match the Edge Function env `KEXIAOZHAN_CHECKOUT_EXPIRER_AUTH_SECRET`. This avoids storing the service-role key in the expirer cron header.
The Vault `shipping_webhook_drain_auth_secret` value must match the Edge Function
env `SHIPPING_WEBHOOK_DRAIN_AUTH_SECRET`. Run
`configure_shipping_webhook_drain_schedule()` after both it and `project_url`
exist.

## Stripe Webhook

- Production Stripe webhook target:
  - `https://<production-supabase-ref>.supabase.co/functions/v1/stripe-webhook`
- Required events:
  - `checkout.session.completed`
  - `checkout.session.async_payment_succeeded`
  - `checkout.session.async_payment_failed`
  - `checkout.session.expired`
  - `refund.created`
- Confirm the live webhook signing secret is in production as `STRIPE_WEBHOOK_SECRET`.

## Cutover Sequence

1. Confirm PR #27 production deploy is live and healthy.
2. Confirm `/operations` access works for a designated Snapcase administrator.
3. Confirm production Kexiaozhan redirect URL:
   - `https://www.snapcase.ai/kexiaozhan/checkout`
4. Configure production envs, leaving `KEXIAOZHAN_PAYMENT_NOTIFY_ENABLED=false`.
5. Deploy/confirm functions and migrations.
6. Keep `EASYPOST_PRODUCTION_ENABLED=false` while verifying the production
   configuration, then enable it only for the supervised pilot window.
7. Run `kexiaozhan-checkout-expirer` once with `dryRun=true` and verify a 200 response.
8. Enable callback only for the supervised pilot:
   - `KEXIAOZHAN_PAYMENT_NOTIFY_ENABLED=true`
   - `KEXIAOZHAN_PAYMENT_NOTIFY_REQUIRE_ALLOWLIST=true`
   - exact first-order `KEXIAOZHAN_PAYMENT_NOTIFY_ALLOWED_OUT_TRADE_NOS` if available
9. Run one supervised production pilot order.
10. Verify all pilot evidence before broadening scope.

## Pilot Verification

For the first order, record evidence in issue #32:

- Kexiaozhan redirect reached Snapcase Checkout.
- Stripe live PaymentIntent succeeded, or a verified zero-total Checkout Session
  used its Snapcase transaction reference.
- `kexiaozhan_handoffs` row has expected `out_trade_no`, `machine_sn`, `stripe_session_id`, and final status.
- `/client/process-payment-notify` response is successful.
- The signed callback body contains the confirmed admin/batch print-mode field from issue #36.
- Exactly one `production_jobs` row exists for the order.
- Exactly one approved EasyPost rate and one purchased postage label exist.
- The label PDF is private and its operator print URL expires.
- Signed EasyPost tracking updates reach the order without duplicate customer
  notifications.
- A designated Snapcase administrator can see the job in `/operations`.
- Alejandro finds the verified `Pending Print` order in Kexiaozhan Merchant
  Portal **Order Center > Order List**, selects `Send to Print` once, and
  confirms the physical outcome.
- No immediate uncontrolled print occurs unless operations explicitly approved it.

## Rollback

Rollback for new orders:

1. Set `FULFILLMENT_PROVIDER=printful`.
2. Set `ALLOW_ONSHORE_MANUAL=false` or unset it.
3. Set `KEXIAOZHAN_PAYMENT_NOTIFY_ENABLED=false`.
4. Clear any pilot `KEXIAOZHAN_PAYMENT_NOTIFY_ALLOWED_OUT_TRADE_NOS`.
5. Set `EASYPOST_PRODUCTION_ENABLED=false` and
   `EASYPOST_AUTOMATION_ENABLED=false`.
6. Confirm new normal site orders route to Printful.

Already queued onshore jobs are not automatically moved. An operator must manually complete, cancel, fail, or otherwise disposition each existing `production_jobs` row.

## Go/No-Go

Go only if:

- #35 dry run passed.
- #30 delayed deferred-print callback behavior passed.
- #36 print-mode field is confirmed and verified, or callbacks remain disabled.
- #115, #118, and #116 staging validation passed.
- #117 async shipping dry run passed with the measured package profile.
- #33 production env/secrets are configured without exposure.
- #34 runbook has been reviewed.
- First #32 pilot order passes all checks.

No-go if:

- A delayed deferred-print callback does not restore Pending Print, creates a
  duplicate job, or triggers immediate printing.
- Callback fails or signs the wrong body.
- Duplicate production jobs appear.
- Alejandro cannot handle the physical process.
- Immediate printing creates output-slot risk.
- Rollback cannot be executed quickly.

## Sign-Off

- Product/go-no-go: Ethan
- On-site operations: Alejandro
- Kexiaozhan API confirmation: Kexiaozhan chief engineer

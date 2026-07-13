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
| Stripe | `STRIPE_MODE=live`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` |
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
- `verify-payment`
- `route-fulfillment-order`
- `production-jobs`
- `update-production-job`
- `printful-retry`
- `submit-printful-order`

Apply migrations through `20260617183024_secure_kexiaozhan_checkout_expirer_schedule`.

Confirm Supabase Vault contains:

- `project_url`
- `kexiaozhan_checkout_expirer_auth_secret`

The Vault `kexiaozhan_checkout_expirer_auth_secret` value must match the Edge Function env `KEXIAOZHAN_CHECKOUT_EXPIRER_AUTH_SECRET`. This avoids storing the service-role key in the expirer cron header.

## Stripe Webhook

- Production Stripe webhook target:
  - `https://<production-supabase-ref>.supabase.co/functions/v1/stripe-webhook`
- Required events:
  - `checkout.session.completed`
  - `checkout.session.async_payment_succeeded`
- Confirm the live webhook signing secret is in production as `STRIPE_WEBHOOK_SECRET`.

## Cutover Sequence

1. Confirm PR #27 production deploy is live and healthy.
2. Confirm `/operations` access works for a designated Snapcase administrator.
3. Confirm production Kexiaozhan redirect URL:
   - `https://www.snapcase.ai/kexiaozhan/checkout`
4. Configure production envs, leaving `KEXIAOZHAN_PAYMENT_NOTIFY_ENABLED=false`.
5. Deploy/confirm functions and migrations.
6. Run `kexiaozhan-checkout-expirer` once with `dryRun=true` and verify a 200 response.
7. Enable callback only for the supervised pilot:
   - `KEXIAOZHAN_PAYMENT_NOTIFY_ENABLED=true`
   - `KEXIAOZHAN_PAYMENT_NOTIFY_REQUIRE_ALLOWLIST=true`
   - exact first-order `KEXIAOZHAN_PAYMENT_NOTIFY_ALLOWED_OUT_TRADE_NOS` if available
8. Run one supervised production pilot order.
9. Verify all pilot evidence before broadening scope.

## Pilot Verification

For the first order, record evidence in issue #32:

- Kexiaozhan redirect reached Snapcase Checkout.
- Stripe live PaymentIntent succeeded, or a verified zero-total Checkout Session
  used its Snapcase transaction reference.
- `kexiaozhan_handoffs` row has expected `out_trade_no`, `machine_sn`, `stripe_session_id`, and final status.
- `/client/process-payment-notify` response is successful.
- The signed callback body contains the confirmed admin/batch print-mode field from issue #36.
- Exactly one `production_jobs` row exists for the order.
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
5. Confirm new normal site orders route to Printful.

Already queued onshore jobs are not automatically moved. An operator must manually complete, cancel, fail, or otherwise disposition each existing `production_jobs` row.

## Go/No-Go

Go only if:

- #35 dry run passed.
- #30 delayed deferred-print callback behavior passed.
- #36 print-mode field is confirmed and verified, or callbacks remain disabled.
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

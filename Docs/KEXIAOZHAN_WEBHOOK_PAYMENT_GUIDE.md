# Kexiaozhan Webhook Payment Integration Guide

Last updated: 2026-07-16

Purpose: preserve the latest vendor-provided payment webhook guide and email
confirmation so future agents do not have to recover this from chat history,
Downloads, or Gmail.

Source: user-provided `Webhook_Payment_Integration_Guide.md`, the vendor email
response shared on 2026-06-07, the latest chief engineer WeChat
clarifications, the 2026-06-09 Gmail attachments containing local verification
tools, and the 2026-07-10 fulfillment-mode update guide. The chat attachment,
Gmail attachment, and local download are not the durable source; this document
is.

Source handling: do not commit real `machineKey` values, sandbox credentials,
tokenized designer URLs, customer artwork, Stripe secrets, webhook secrets, or
shared callback secrets. The guide's `machine_test_key` is an example only.

## Status

The vendor confirmed the intended high-level flow:

1. Customer completes the vendor catalog/designer flow.
2. Vendor system creates an unpaid order.
3. Customer proceeds to Snapcase Checkout.
4. Snapcase confirms payment through the server-side Stripe webhook.
5. Snapcase calls the vendor payment completion callback.
6. Vendor system pushes the print job into the production queue.

The vendor has now confirmed the `webhookUrl` payload shape, HMAC-SHA256
signature rules, and that the fixed `/client/process-payment-notify` and
`/client/query-status` APIs rely only on signature verification. The vendor also
confirmed `transactionId` should be the Stripe PaymentIntent ID, and `payTime`
should be UTC RFC3339.

### Fulfillment Mode Update (2026-07-10)

For every successful (`orderStatus=1`) payment callback, Snapcase must send a
non-empty, exactly spelled `fulfillmentMethod` field and include it in the same
HMAC-SHA256 signature as the other non-empty callback fields.

| Value | Vendor behavior | Snapcase policy |
| --- | --- | --- |
| `immediatePrint` | Dispatches one print task immediately. | Supported by the contract, but not used for the staging or first pilot physical test. |
| `deferredPrint` | Moves the paid order to pending print without dispatching a task. | Required default. Snapcase operations, not customers, controls when the order is released for printing. |

The first valid success callback fixes the vendor fulfillment mode. Retries must
reuse the same value. A missing, whitespace-padded, or invalid value causes the
vendor to reject the callback, so Snapcase blocks the callback before sending it
when its server-side configuration is invalid.

The exact staging and first-pilot configuration is:

```json
{"fulfillmentMethod":"deferredPrint"}
```

Store it only in `KEXIAOZHAN_PAYMENT_NOTIFY_EXTRA_FIELDS_JSON`. Do not expose a
print-timing choice in customer UI.

Latest vendor clarification:

- There is no order validation API right now. Vendor can add one later if
  Snapcase needs it.
- `/client/query-status` is currently the payment-status query API and returns
  `status: 0` for unpaid or `status: 1` for paid.
- Print status and detailed order-status query APIs are still forthcoming.
- Polling frequency should be slower than every 2 seconds.
- Reprint API details are still forthcoming.
- Unpaid vendor orders time out after 15 minutes and then become canceled. For
  `deferredPrint`, Kexiaozhan accepts a valid signed success callback after that
  cancellation, restores the order to Pending Print, and does not enforce a
  30-minute callback cutoff. Non-deferred modes keep the 15-minute timeout.

## Relationship To Existing API Notes

This guide is newer than the earlier Apifox payment callback notes in
`Docs/KEXIAOZHAN_APIFOX_REFERENCE.md`.

Use this guide as the current source for payment webhook URL verification,
payment completion callback signing, fixed payment callback endpoint, and fixed
payment status query endpoint.

Keep the older Apifox notes for catalog, order, material, SKU, receipt, printer
queue, and historical endpoint context until the vendor provides the final full
integration document.

Important conflict: the earlier Apifox notes described an MD5 signature using
`access_token`. The latest payment guide describes HMAC-SHA256 using
`machineKey`. For new payment integration work, use HMAC-SHA256 unless the
vendor explicitly says a specific endpoint still uses MD5.

## Fixed Endpoints

| Purpose | Method | Endpoint | Notes |
| --- | --- | --- | --- |
| Payment result callback | `POST` | `${KEXIAOZHAN_API_BASE_URL}/client/process-payment-notify` | Snapcase calls this after server-confirmed payment result. Do not derive this from `webhookUrl`. |
| Payment status query | `GET` | `${KEXIAOZHAN_API_BASE_URL}/client/query-status` | Query by `outTradeNo`, `machineSn`, and `sign`. Use the fixed Kexiaozhan domain, not the third-party payment page domain. |

Domain note from the 2026-06-09 local trigger guide and 2026-06-10 vendor
confirmation:

- Test domain: `https://kxzcnt.kexiaozhan.com`
- Production domain: `https://kxzus.kexiaozhan.com`
- Earlier payment guide examples and the Python proxy default also mention
  `https://kxzsg.kexiaozhan.com`.

Keep `KEXIAOZHAN_API_BASE_URL` environment-configured. Use
`https://kxzcnt.kexiaozhan.com` for sandbox/test and
`https://kxzus.kexiaozhan.com` for production. Treat
`https://kxzsg.kexiaozhan.com` as historical unless the vendor explicitly
reintroduces it.

The vendor also confirmed no current IP restriction or VPN requirement for the
test environment. Test machine credentials were provided out of band; do not
commit `machineKey` values.

The latest guide says `webhookUrl` no longer includes `notify_url`.

Authentication: the chief engineer confirmed on 2026-06-08 that these fixed
`/client` APIs do not require JWT, Cookie, or Bearer token authentication. They
rely on the HMAC-SHA256 `sign` field.

## webhookUrl Contract

`webhookUrl` is the redirect link generated by the vendor system when sending
the customer back to Snapcase checkout. Snapcase should parse it, verify its
signature, save the payment number, and continue with Snapcase-controlled
checkout/payment.

Snapcase test redirect URL shape:

```text
https://<snapcase-test-domain>/kexiaozhan/checkout?order_no=...&out_trade_no=...&amount=...&goods_name=...&currency=CNY&machine_sn=...&timestamp=...&nonce=...&sign=...
```

For protected PR preview smoke tests, Snapcase may instead provide a clean
staging bridge URL:

```text
https://<supabase-staging-domain>/functions/v1/kexiaozhan-checkout-redirect?order_no=...&out_trade_no=...&amount=...&goods_name=...&currency=CNY&machine_sn=...&timestamp=...&nonce=...&sign=...
```

The bridge only hides preview-access mechanics from the vendor. It preserves the
Kexiaozhan query parameters and redirects the browser to the real
`/kexiaozhan/checkout` page. Authoritative HMAC verification still happens in
`kexiaozhan-create-checkout`.

The browser page only collects customer email and starts the server-side
checkout function. The authoritative signature verification and Stripe Session
creation happen in `kexiaozhan-create-checkout`.

Expected query fields:

| Field | Required | Notes |
| --- | --- | --- |
| `order_no` | Yes | Business order number. Useful for display, logs, and reconciliation assistance. |
| `out_trade_no` | Yes | Unique payment number. Save this exactly; it becomes callback/query `outTradeNo`. |
| `amount` | Yes | String amount such as `12.30`; `0` and `0.00` are valid coupon-full-deduction cases. |
| `goods_name` | Yes | Product name or order item description. |
| `currency` | Yes | Currency such as `CNY` or `USD`. |
| `machine_sn` | Yes | Machine serial number. |
| `timestamp` | Yes | Unix timestamp in seconds. |
| `nonce` | Yes | Random string to reduce replay risk. |
| `sign` | Yes | Lowercase HMAC-SHA256 hex signature. |

Signature rules:

1. Collect all `webhookUrl` query parameters.
2. Exclude `sign`.
3. Exclude empty fields.
4. Sort parameter names by ascending ASCII lexicographical order.
5. Join `key=value` pairs with `&`.
6. Sign the resulting string with HMAC-SHA256 using `machineKey`.
7. Output lowercase hexadecimal.

Signing must use the original values before URL encoding. After parsing a URL,
use decoded values for verification.

Example signing string from the vendor guide:

```text
amount=12.30&currency=CNY&goods_name=Photo Print&machine_sn=MACHINE_SN_001&nonce=n6Y8pK2z&order_no=ORDER202606030001&out_trade_no=PAY202606030001&timestamp=1780497600
```

## Payment Completion Callback

Endpoint:

```http
POST ${KEXIAOZHAN_API_BASE_URL}/client/process-payment-notify
Content-Type: application/json
```

Authentication: signature-only. Do not add JWT, Cookie, or Bearer token headers
unless the vendor changes this requirement.

Snapcase should call this only from the backend after Stripe has confirmed the
payment status server-side. Do not trigger this from the browser or from an
untrusted return URL.

Request body fields:

| Field | Required | Notes |
| --- | --- | --- |
| `sign` | Yes | Lowercase HMAC-SHA256 request signature. Field name is lowercase in the latest guide. |
| `outTradeNo` | Yes | Must match `out_trade_no` from `webhookUrl`. This is the core reconciliation/idempotency key. |
| `transactionId` | Yes | Stripe PaymentIntent ID, such as `pi_...`. Vendor also allows a Snapcase-generated unique transaction serial if needed. |
| `amount` | Yes | Actual paid amount string. Must match `webhookUrl` amount; `0` or `0.00` is valid when the vendor payment amount is zero. |
| `extraInfo` | No | Optional. Prefer opaque Snapcase order references, not customer PII. |
| `orderStatus` | Yes | `0=unpaid/processing`, `1=payment succeeded`, `2=payment failed`. |
| `payTime` | Yes | UTC RFC3339, for example `2026-06-03T20:10:30Z`. Vendor's Go layout reference is `2006-01-02T15:04:05Z07:00`. |

Callback signature rules:

1. Collect all JSON request body fields.
2. Exclude `sign`.
3. Exclude empty fields.
4. Convert values to strings.
5. Sort field names by ascending ASCII lexicographical order.
6. Join `key=value` pairs with `&`.
7. Sign the string with HMAC-SHA256 using `machineKey`.
8. Output lowercase hexadecimal.

Example body shape:

```json
{
  "sign": "<lowercase-hmac-sha256>",
  "outTradeNo": "PAY202606030001",
  "transactionId": "pi_3Abc123Stripe456",
  "amount": "12.30",
  "extraInfo": "payment success",
  "orderStatus": 1,
  "payTime": "2026-06-03T20:10:30Z"
}
```

Example signing string for the current Stripe/RFC3339 shape:

```text
amount=12.30&extraInfo=payment success&orderStatus=1&outTradeNo=PAY202606030001&payTime=2026-06-03T20:10:30Z&transactionId=pi_3Abc123Stripe456
```

Note: a later WeChat sample reused the earlier `b947...` signature while also
changing `transactionId` and `payTime`. Do not hard-code that sample signature;
calculate `sign` from the actual request body fields.

Success response:

```json
{
  "code": 0,
  "message": "success"
}
```

Failure example:

```json
{
  "code": 400,
  "message": "invalid sign"
}
```

Known failure reasons include `invalid sign`, `payment not found`,
`amount mismatch`, `invalid orderStatus`, and `system error`.

## Payment Status Query

Endpoint:

```http
GET ${KEXIAOZHAN_API_BASE_URL}/client/query-status
```

Authentication: signature-only. Do not add JWT, Cookie, or Bearer token headers
unless the vendor changes this requirement.

Query parameters:

| Parameter | Required | Notes |
| --- | --- | --- |
| `outTradeNo` | Yes | Unique payment number. |
| `machineSn` | Yes | Machine serial number. The new flow first resolves machine context from the payment/order, but this remains required for compatibility and signature protection. |
| `sign` | Yes | Lowercase HMAC-SHA256 signature over `outTradeNo` and `machineSn`. |

Vendor guidance: poll no more frequently than once every 2 seconds. This API is
payment-status only; print status and detailed order-status APIs are still
forthcoming.

Query signature rules:

1. Collect `outTradeNo` and `machineSn`.
2. Exclude empty fields.
3. Sort field names by ascending ASCII lexicographical order.
4. Join `key=value` pairs with `&`.
5. Sign with HMAC-SHA256 using `machineKey`.
6. Output lowercase hexadecimal.

Example signing string from the vendor guide:

```text
machineSn=MACHINE_SN_001&outTradeNo=PAY202606030001
```

Paid response:

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "status": 1
  }
}
```

Unpaid or cannot-confirm response:

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "status": 0
  }
}
```

## Implementation Notes

- Server-only signer/verifier helpers now live in
  `supabase/functions/_shared/kexiaozhan-payment.ts`.
- Redirect handoff parsing, freshness checks, and signed payload comparison live
  in `supabase/functions/_shared/kexiaozhan-handoff.ts`.
- Vendor guide HMAC vectors are covered by
  `supabase/functions/_shared/kexiaozhan-payment_test.ts` and
  `supabase/functions/_shared/kexiaozhan-handoff_test.ts`.
- The real browser redirect page is `src/pages/KexiaozhanCheckout.tsx` at
  `/kexiaozhan/checkout`.
- Protected-preview staging can use
  `supabase/functions/kexiaozhan-checkout-redirect` as a clean vendor-facing
  bridge. Configure `KEXIAOZHAN_CHECKOUT_REDIRECT_TARGET_URL` to the real
  preview `/kexiaozhan/checkout` URL and, when Vercel preview protection is on,
  store the temporary bypass secret in `KEXIAOZHAN_VERCEL_BYPASS_SECRET`.
- `supabase/functions/kexiaozhan-create-checkout` verifies the signed query
  parameters with backend `KEXIAOZHAN_MACHINE_KEY`, rejects stale or changed
  replays, persists `kexiaozhan_handoffs`, and creates Stripe Checkout with
  Snapcase-controlled pricing.
- The `kexiaozhan_handoffs` table is unique on `out_trade_no` and on
  `(machine_sn, nonce)`. RLS is enabled and no public policies are defined.
- `fake-vendor-design-complete` accepts optional latest-guide payment fields
  and stores them under `items[].vendorDesign.kexiaozhanPayment`.
- `route-fulfillment-order` records a Kexiaozhan payment notification plan under
  `production_jobs.metadata.kexiaozhan.paymentNotification` for onshore jobs
  that include `outTradeNo`, `machineSn`, and `amount`.
- `stripe-webhook`, `verify-payment`, and `route-fulfillment-order` accept an
  expired handoff only when the server-side callback configuration is exactly
  `{"fulfillmentMethod":"deferredPrint"}`. Missing, invalid, or
  `immediatePrint` configuration remains fail-closed and records
  `payment_review` / `kexiaozhan_handoff_expired`.
- `kexiaozhan-checkout-expirer` is the local Checkout Session/replay cap. It is
  scheduled every minute, expires still-open sessions near the stored handoff
  deadline, and prevents the same signed payload from starting a new checkout.
- The route calls `/client/process-payment-notify` only when
  `KEXIAOZHAN_PAYMENT_NOTIFY_ENABLED=true`, `KEXIAOZHAN_MACHINE_KEY` is set, and
  a verified payment reference and valid `fulfillmentMethod` are present.
- `KEXIAOZHAN_PAYMENT_NOTIFY_EXTRA_FIELDS_JSON` is merged into the
  `/client/process-payment-notify` body and signed with the same HMAC-SHA256
  method as the core callback fields. Successful callbacks require the exact
  `{"fulfillmentMethod":"deferredPrint"}` configuration for staging and the
  first pilot. Do not expose print-mode choice to customers.
- For staging vendor-originated smoke tests, prefer enabling live callback with
  `KEXIAOZHAN_PAYMENT_NOTIFY_REQUIRE_ALLOWLIST=true` plus either
  `KEXIAOZHAN_PAYMENT_NOTIFY_ALLOWED_OUT_TRADE_NOS=<exact outTradeNo>` or
  `KEXIAOZHAN_PAYMENT_NOTIFY_ALLOWED_PREFIXES=<agreed prefix>`. This keeps
  unrelated synthetic handoffs in dry-run mode while allowing the one real
  Kexiaozhan sandbox order to receive `/client/process-payment-notify`.
- The route formats `payTime` as UTC RFC3339 and uses
  `orders.stripe_payment_intent_id` as `transactionId` when Stripe creates a
  PaymentIntent. A verified zero-total Checkout Session has no payment method;
  Snapcase uses a deterministic `SC` plus order UUID reference instead, without
  writing that synthetic value into Stripe-specific database columns.
- A previously successful live callback recorded on the production job is not
  resent by route retries.
- Staging validation on 2026-06-16 deployed the handoff migration and changed
  Edge Functions to Supabase staging, configured sandbox secrets, and verified:
  signed checkout creation from Kexiaozhan-shaped query params, duplicate retry
  reuse, changed replay rejection, bad signature rejection, wrong-machine
  rejection, real Stripe test payment, Stripe webhook order update,
  single-job onshore routing, and dry-run signed Kexiaozhan callback metadata.
- Vendor-originated live callback validation on 2026-06-17 UTC verified four
  real Kexiaozhan sandbox handoffs through the clean bridge. All four completed
  Stripe test payment within the vendor TTL, reached `vendor_notified`, created
  exactly one `onshore_manual` queued job, and recorded live
  `/client/process-payment-notify` responses with HTTP 200 and
  `{"code":0,"msg":"success","data":{}}`. Live callback was disabled afterward.
- Store `machineKey` only in backend secrets. Never expose it to frontend code,
  URLs, client logs, analytics, or public docs.
- Store `out_trade_no`/`outTradeNo` in Snapcase order or `production_jobs`
  metadata as the vendor payment idempotency key.
- Store `order_no`, `machine_sn`, `amount`, `currency`, `timestamp`, and `nonce`
  for reconciliation and replay defense.
- Snapcase should still keep its own idempotency record keyed by Snapcase order
  ID plus `outTradeNo` plus Stripe payment identifier.
- Treat `amount=0` as valid only when the vendor-originated payment amount is
  genuinely zero. Snapcase pricing and Stripe checkout totals remain
  Snapcase-controlled.
- Configure the API base as an environment variable. Use the confirmed test and
  production domains above; do not hard-code the historical `kxzsg` default into
  new code paths.
- Configure `KEXIAOZHAN_ALLOWED_MACHINE_SN` in staging/production to reject
  redirects for unexpected machines. Use the received test `machine_sn` value in
  sandbox, but never commit `machineKey`.
- Configure `KEXIAOZHAN_CHECKOUT_UNIT_AMOUNT_CENTS`,
  `KEXIAOZHAN_CHECKOUT_SHIPPING_CENTS`, and
  `KEXIAOZHAN_CHECKOUT_CURRENCY` for Snapcase-owned Stripe pricing. The vendor
  `amount` is stored and sent back in Kexiaozhan's payment callback, but it does
  not directly set the Stripe total.
- Configure `KEXIAOZHAN_CHECKOUT_EXPIRY_LEEWAY_SECONDS` for the scheduled
  expirer buffer. Default is 60 seconds.
- Configure `KEXIAOZHAN_HANDOFF_MAX_AGE_SECONDS=2100` for the server-controlled
  deferred-print flow. This gives the local signed handoff a bounded 35-minute
  replay/checkout window; non-deferred modes are capped locally at 15 minutes.
- Configure `KEXIAOZHAN_CHECKOUT_EXPIRER_AUTH_SECRET` in Edge Function secrets
  and the matching `kexiaozhan_checkout_expirer_auth_secret` in Supabase Vault;
  the scheduled cron uses this dedicated secret instead of the service-role key.
- Configure `KEXIAOZHAN_PAYMENT_NOTIFY_EXTRA_FIELDS_JSON` as
  `{"fulfillmentMethod":"deferredPrint"}` in staging and the first pilot.
  Successful vendor callbacks are blocked locally if the field is absent or not
  one of the two exact vendor values.
- `KEXIAOZHAN_ALLOW_ZERO_TOTAL_CHECKOUTS` is false by default. For the isolated
  staging no-cost test only, set it to true and set both
  `KEXIAOZHAN_CHECKOUT_UNIT_AMOUNT_CENTS` and
  `KEXIAOZHAN_CHECKOUT_SHIPPING_CENTS` to 0. Snapcase accepts this only when the
  signed vendor `amount` is also zero; the browser cannot select the price or
  enable the mode. Restore the normal staging price and disable the flag after
  the test.
- Stripe Checkout Sessions cannot be configured to expire sooner than 30
  minutes. Kexiaozhan's 2026-07-11 deferred-print exception resolves that
  payment risk: a valid signed `deferredPrint` callback is accepted after vendor
  cancellation and restores Pending Print, with no 30-minute callback cutoff.
  Snapcase still limits initial signed-handoff and Checkout Session reuse locally.
- The local trigger guide provides a browser HTML verifier plus a local proxy.
  These are debugging aids only and must not be committed or used as production
  integration code. Their historical default domain is outdated, and their
  browser/local logs can expose signed callback bodies or `machineKey` values.
- The HTML trigger is a debug aid, not the production contract. It includes
  older default callback values such as `transactionId=TP...` and
  `payTime=yyyy-MM-dd HH:mm:ss`; override those with the later-confirmed
  Stripe PaymentIntent ID and UTC RFC3339 `payTime`.
- The HTML query tool includes a camelCase/snake_case selector for debugging.
  Current confirmed `/client/query-status` fields are camelCase
  `outTradeNo` and `machineSn`.

## Coordinated Staging Test Procedure

The 2026-07-15 run did not reach payment. Although the signed URLs were shared
promptly, the paid handoff was persisted with the old 15-minute local deadline
and expired while Checkout details were being entered. Running the paid case
first also risked aging the zero-value handoff while waiting for the delayed
payment target. No PaymentIntent, vendor callback, or production job was
created.

Use this procedure for the next coordinated run. The vendor should not create
orders until step 1 passes.

1. At least 15 minutes before the agreed time, apply the fail-closed baseline:

   ```powershell
   npm run kexiaozhan:staging -- baseline
   ```

2. When the new paid and zero-value URLs arrive, run the preflight within five
   minutes of their signed timestamps. Stop if it does not print `READY`:

   ```powershell
   npm run kexiaozhan:preflight -- --paid-url '<paid URL>' --zero-url '<zero URL>'
   ```

3. Create both Stripe Checkout Sessions before completing either one. Start in
   paid mode and open the paid URL. Then switch to zero mode and open the zero
   URL. Restore paid mode immediately after both sessions exist:

   ```powershell
   # Apply paid pricing, then open the paid URL through Stripe Checkout.
   npm run kexiaozhan:staging -- paid

   # Apply zero pricing, then open the zero URL through Stripe Checkout.
   npm run kexiaozhan:staging -- zero

   # With both sessions open, restore normal paid pricing.
   npm run kexiaozhan:staging -- paid
   ```

4. Arm callbacks for only the two exact payment order numbers:

   ```powershell
   npm run kexiaozhan:staging -- arm --orders <paid-outTradeNo>,<zero-outTradeNo>
   ```

5. Complete the zero-value Checkout first and within ten minutes of receipt.
   Complete the paid Checkout no earlier than T+16 minutes from its signed
   timestamp. The preflight output prints the exact Pacific and China times.
6. Verify both callbacks succeeded, each order created exactly one Snapcase
   production job, both vendor orders are Pending Print, and no automatic print
   task was dispatched.
7. Always restore the fail-closed baseline, including after any partial failure:

   ```powershell
   npm run kexiaozhan:staging -- cleanup
   ```

Alejandro is not part of this server-side payment/callback run. Contact him only
after Snapcase and Kexiaozhan confirm the paid order is Pending Print; his later
task is one supervised Merchant Portal `Send to Print` action.

### 2026-07-16 Staging Result

The corrected procedure passed with real vendor-originated sandbox orders:

- Paid/delayed: Checkout was submitted after T+16 minutes, Snapcase recorded a
  Stripe PaymentIntent and exactly one queued onshore fulfillment job, and the
  signed vendor payment-status query returned paid.
- Zero-total: Checkout completed with `stripe_payment_intent_id=null`, exactly
  one queued onshore fulfillment job, and the signed vendor payment-status query
  returned paid.
- Cleanup succeeded: live callback disabled, exact allowlist cleared to the
  fail-closed sentinel, zero-total mode disabled, and normal staging pricing
  restored.
- Merchant Portal independently showed both orders as Payment Successful,
  Pending Print, Print Time `0`, with `Send to Print` available. This proves the
  signed `deferredPrint` callbacks did not automatically dispatch either order.

Do not run another payment test or ask the vendor for more confirmation.
Alejandro may now release the paid order once for the physical test. Do not
release the zero-value order.

## Still Open

These items remain unresolved after the latest WeChat clarification:

1. Detailed print status and order-status query APIs beyond
   `/client/query-status`.
2. Reprint API details and idempotency/failure rules.
3. Public mobile designer URL and return URL configuration.
4. A supervised deferred physical test of the documented Merchant Portal
   **Order List > Pending Print > Send to Print** procedure.

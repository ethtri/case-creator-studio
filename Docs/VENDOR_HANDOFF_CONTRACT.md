# Vendor Handoff Contract

Purpose: rehearse the vendor proposal where design/order information is handed
to Snapcase for Stripe payment, while Snapcase remains the system of record.

For the real Kexiaozhan Apifox API contracts, endpoint inventory, and signature
rules, see `Docs/KEXIAOZHAN_APIFOX_REFERENCE.md`.

For the latest payment-specific vendor guide, fixed `/client` payment endpoints,
and HMAC-SHA256 `machineKey` signing rules, see
`Docs/KEXIAOZHAN_WEBHOOK_PAYMENT_GUIDE.md`. The fake handoff contract below is
still staging-only and intentionally uses Snapcase-owned test secrets rather
than the real vendor `machineKey`.

## Staging-Only Mock Endpoint

`POST /functions/v1/fake-vendor-design-complete`

This endpoint is for staging validation only. It does not call
Kexiazhan/Xiaojiang and does not accept browser requests.

Required environment:

- `STRIPE_MODE=test`
- `STRIPE_SECRET_KEY_TEST`
- `STRIPE_WEBHOOK_SECRET_TEST`
- `FULFILLMENT_PROVIDER=onshore_manual`
- `ALLOW_ONSHORE_MANUAL=true`
- `FAKE_VENDOR_HANDOFF_SECRET`
- `VENDOR_HANDOFF_CHECKOUT_ORIGIN=<exact allowed preview origin>`
- `VERCEL_PREVIEW_ORIGINS=<exact allowed preview origin>`

Required headers:

- `x-snapcase-handoff-timestamp`: ISO timestamp within five minutes.
- `x-snapcase-handoff-signature`: HMAC-SHA256 hex digest of
  `<timestamp>.<raw-json-body>` using `FAKE_VENDOR_HANDOFF_SECRET`.

Example body:

```json
{
  "customerEmail": "buyer@example.com",
  "variantId": "iphone-15",
  "brand": "Apple",
  "model": "iPhone 15",
  "productName": "Apple iPhone 15 Custom Case",
  "quantity": 1,
  "handoffId": "fake_vendor_001",
  "design": {
    "previewUrl": "https://snapcase.ai/placeholder-vendor-preview.png",
    "filePath": "mock-vendor-filepath/fake_vendor_001.png",
    "sku": {
      "brandId": "fake-brand",
      "goodsSkuId": "fake-sku",
      "materialIds": ["fake-material"],
      "caseType": "ordinary"
    }
  }
}
```

Successful response:

```json
{
  "success": true,
  "provider": "onshore_manual",
  "handoffId": "fake_vendor_001",
  "sessionId": "cs_test_...",
  "checkoutUrl": "https://checkout.stripe.com/c/pay/...",
  "existingOrder": false
}
```

## Safety Rules

- The public `create-checkout` endpoint does not accept vendor design metadata.
- The mock handoff endpoint fails closed unless onshore manual mode is
  explicitly enabled.
- Stripe/Snapcase owns price, payment status, shipping address, order status,
  tracking, and support.
- Vendor data is stored as production-asset metadata only; it cannot set order
  totals, mark an order paid, or create a production job before Stripe payment.
- Duplicate handoff calls use a Stripe idempotency key based on `handoffId`;
  duplicate fulfillment routing still reuses one `production_jobs` row.
- Secret-like strings such as bearer tokens, Stripe keys, webhook secrets, or
  tokenized URLs are rejected from the mock vendor payload.

## Staging Smoke

1. Post a signed fake design-complete payload to staging.
2. Complete the returned Stripe Checkout URL with a Stripe test card.
3. Confirm the Stripe webhook marks the order paid.
4. Confirm `route-fulfillment-order` creates exactly one `production_jobs` row.
5. Replay the same handoff and fulfillment route; confirm no duplicate
   production job is created.
6. Confirm `/operations` exposes the queued job only to an allowlisted operator.

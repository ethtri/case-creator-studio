# Current Status

Owner-updated snapshot for AI agents. Keep this short and current.

**Last updated:** 2026-06-09
**Last updated by:** ethtr
**MVP target:** This week  
**Sprint goal:** Stabilize EDM-first flow through checkout

## Blockers
- Physical manual-production dry run remains: print/pack/ship a real test case from the staging queue process before production pilot.

## Top 3 Next Tasks
1. P0: Fake vendor handoff staging smoke - post a signed mock design-complete payload, pay through Stripe test checkout, and confirm one onshore job.
2. P0: Manual production dry run - use the queued staging onshore job to print/pack/ship manually, then verify status/tracking updates.
3. P0: Vendor validation for onshore automation - confirm `filePath` creation, prepaid/internal payment handling, machine targeting, artwork requirements, SKU/material mapping, and failure states.

## Now / Next / Later
**Now**
- P0: Fake vendor handoff staging smoke - post a signed mock design-complete payload, pay through Stripe test checkout, and confirm one onshore job.

**Next**
- P0: Manual production dry run - use the queued staging onshore job to print/pack/ship manually, then verify status/tracking updates.
- P0: Vendor validation for onshore automation - confirm `filePath` creation, prepaid/internal payment handling, machine targeting, artwork requirements, SKU/material mapping, and failure states.

**Later**
- None

## Notes
- Use `Docs/BACKLOG.md` for priorities.
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
- Kexiaozhan payment scaffold: server-only HMAC helpers, vendor-vector tests, optional fake handoff payment context, and dry-run `route-fulfillment-order` notification metadata are implemented. Live vendor POSTs require explicit `KEXIAOZHAN_PAYMENT_NOTIFY_ENABLED=true` plus backend `KEXIAOZHAN_MACHINE_KEY`.
- Remaining vendor blockers after latest response: detailed print/order status APIs, reprint API, sandbox URL/credentials/VPN/test data, public mobile designer URL/return URL configuration, and whether Snapcase can explicitly cancel instead of relying on the 15-minute vendor timeout.

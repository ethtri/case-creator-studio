# Production Roadmap

Roadmap for moving the proven Kexiaozhan/Snapcase staging integration into a controlled production pilot. This is not a full public launch plan.

## Current Readiness

- Kexiaozhan signed redirect, Stripe Checkout, Stripe webhook, Snapcase onshore job routing, and signed `/client/process-payment-notify` callback are proven in staging.
- Four real Kexiaozhan sandbox orders completed successfully on 2026-06-17 UTC.
- Production remains Printful-backed until an explicit cutover is approved.
- Issue #30 remains the production blocker for the Kexiaozhan 15-minute unpaid-order timeout versus Stripe Checkout's 30-minute minimum expiration.

## Production Gates

1. Alejandro completes one on-site staging dry run.
   - Use one fresh staging paid order routed to `onshore_manual`.
   - Alejandro prints, packs, and marks the job shipped from `/operations`.
   - Verify tracking/status update and exactly one `production_jobs` row.

2. Kexiaozhan resolves the production TTL risk.
   - Preferred: extend unpaid-order validity to at least 30 minutes.
   - Acceptable alternative: provide tested cancel, refresh, or recreate behavior.
   - Do not enable public production Kexiaozhan traffic until issue #30 is resolved.

3. Production environment is ready.
   - Configure production Supabase/Vercel secrets only after gates pass.
   - Required: `FULFILLMENT_PROVIDER=onshore_manual`, `ALLOW_ONSHORE_MANUAL=true`, `OPERATOR_EMAILS`, Stripe live keys/webhook, production Kexiaozhan base URL, production `machineKey`, allowed production `machine_sn`, checkout pricing, and callback gate settings.
   - Keep `KEXIAOZHAN_PAYMENT_NOTIFY_ENABLED=false` until go/no-go.

4. Cutover and rollback runbook is approved.
   - Include env switch, function deploy list, smoke order, callback enablement, rollback to Printful, and sign-off owners.
   - Rollback for new orders is one env change back to `printful`; already queued onshore jobs need operator disposition.

5. First production pilot order is supervised.
   - Use exact `outTradeNo` callback allowlist if practical.
   - Verify Stripe live payment, Kexiaozhan callback success, one production job, and Alejandro workflow.
   - Disable or narrow callback if anything unexpected appears.

## Production Board

- #30 - Resolve Kexiaozhan 15-minute timeout vs Stripe Checkout expiration.
- #35 - Alejandro on-site manual production dry run.
- #33 - Production environment and secret readiness.
- #34 - Production cutover and rollback runbook.
- #32 - Production pilot order and monitoring.
- #29 - Kexiaozhan print status/reprint APIs. Not required for the first manual pilot; required before automation or unattended scale.

## Coordination Messages

Alejandro:

```text
Hi Alejandro! We’re getting ready for a controlled Snapcase production pilot.

Before we launch, we need one on-site dry run with you. The goal is to take one test order from the internal operations queue, print it, pack it, and mark it shipped so we can confirm the full physical workflow.

We’ll send you the operations link and the specific test order when it’s ready. For now, can you please confirm when you’ll be available for a 30-45 minute dry run?
```

Kexiaozhan engineers:

```text
谢谢你们配合测试！我们这边确认四笔 sandbox 订单数据都正确，Stripe 测试支付和 /client/process-payment-notify 回调都成功了。

上线前我们这边只剩两个需要确认的生产事项：

1. 未支付订单有效期现在是 15 分钟，但 Stripe Checkout 最短是 30 分钟。生产环境最好需要把有效期延长到 30 分钟以上，或者提供取消/刷新/重新创建订单的方法，避免客户在订单过期后还能付款。

2. 请确认生产环境使用的 machine_sn 和 machineKey 应该如何提供或配置。生产回调域名我们会使用你们之前提供的：
https://kxzus.kexiaozhan.com

Snapcase 生产跳转地址预计是：
https://www.snapcase.ai/kexiaozhan/checkout

目前不需要新的接口文档；主要是确认以上两个生产上线事项。谢谢！
```

## Verification Before Cutover

- `npm ci`
- `npm run build`
- `npm test --if-present`
- `npm run lint --if-present`
- `npm run type-check --if-present`
- Deno tests for Kexiaozhan signing, handoff, callback gate, timeout guard, Stripe config, and CORS.
- Staging dry run with Alejandro.
- Delayed-payment or expired-handoff scenario proves fail-closed behavior.
- Production pilot order proves live Stripe payment, Kexiaozhan callback, exactly one production job, and operator workflow.

# Production Roadmap

Roadmap for moving the proven Kexiaozhan/Snapcase staging integration into a controlled production pilot. This is not a full public launch plan.

## Current Readiness

- Kexiaozhan signed redirect, Stripe Checkout, Stripe webhook, Snapcase onshore job routing, and signed `/client/process-payment-notify` callback are proven in staging.
- Four real Kexiaozhan sandbox orders completed successfully on 2026-06-17 UTC.
- Production remains Printful-backed until an explicit cutover is approved.
- Issue #30 remains a production gate for the Kexiaozhan 15-minute unpaid-order timeout versus Stripe Checkout's 30-minute minimum expiration. Snapcase now has fail-closed handling and a scheduled `kexiaozhan-checkout-expirer` fallback, but production still needs the accepted operating answer verified.
- Issue #36 tracks new Kexiaozhan/Alejandro guidance that paid online orders should use admin-controlled batch printing, not uncontrolled immediate continuous printing.

## Production Gates

1. Alejandro completes one async on-site staging dry run.
   - First verify a staging `/operations` URL that Alejandro can access and that points to staging Supabase data.
   - Current planned URL is `https://staging.snapcase.ai/operations`; GoDaddy DNS must add `A staging.snapcase.ai 76.76.21.21` before Vercel can finish the alias/certificate.
   - Use one fresh staging paid order routed to `onshore_manual` after Alejandro's operator email and rough timing are known.
   - Alejandro prints, packs, and marks the job shipped from `/operations` when he is available; a live call is not required.
   - Verify tracking/status update and exactly one `production_jobs` row.

2. Kexiaozhan resolves the production TTL risk.
   - Preferred: extend unpaid-order validity to at least 30 minutes.
   - Acceptable alternatives: provide tested cancel, refresh, or recreate behavior, or deploy and verify `kexiaozhan-checkout-expirer` so open Stripe Checkout Sessions are expired before the vendor TTL cutoff.
   - Do not enable public production Kexiaozhan traffic until issue #30 is resolved.

3. Kexiaozhan print mode is server-controlled.
   - Confirm the exact payment-callback field that controls immediate print versus admin/batch handling.
   - Snapcase controls this field server-side; customers do not choose the print behavior.
   - First production pilot should use admin/batch mode unless operations explicitly approves otherwise.

4. Production environment is ready.
   - Configure production Supabase/Vercel secrets only after gates pass.
   - Required: `FULFILLMENT_PROVIDER=onshore_manual`, `ALLOW_ONSHORE_MANUAL=true`, `OPERATOR_EMAILS`, Stripe live keys/webhook, production Kexiaozhan base URL, production `machineKey`, allowed production `machine_sn`, checkout pricing, and callback gate settings.
   - Keep `KEXIAOZHAN_PAYMENT_NOTIFY_ENABLED=false` until go/no-go.

5. Cutover and rollback runbook is approved.
   - Use `Docs/PRODUCTION_CUTOVER_RUNBOOK.md` for env switch, function deploy list, smoke order, callback enablement, rollback to Printful, and sign-off owners.
   - Rollback for new orders is one env change back to `printful`; already queued onshore jobs need operator disposition.

6. First production pilot order is supervised.
   - Use exact `outTradeNo` callback allowlist if practical.
   - Verify Stripe live payment, Kexiaozhan callback success, one production job, and Alejandro workflow.
   - Disable or narrow callback if anything unexpected appears.

## Production Board

- #30 - Resolve Kexiaozhan 15-minute timeout vs Stripe Checkout expiration.
- #36 - Confirm Kexiaozhan paid-order print mode control.
- #35 - Alejandro on-site manual production dry run.
- #38 - Prepare Alejandro async dry-run access packet.
- #39 - Create fresh staging dry-run order for Alejandro.
- #40 - Verify Alejandro async dry-run evidence.
- #41 - Provide Alejandro-accessible staging operations URL.
- #33 - Production environment and secret readiness.
- #34 - Production cutover and rollback runbook.
- #32 - Production pilot order and monitoring.
- #29 - Kexiaozhan print status/reprint APIs. Not required for the first manual pilot; required before automation or unattended scale.

## Coordination Messages

Alejandro:

```text
Hi Alejandro! We’re ready to do the Snapcase pre-production dry run.

This will not be live customer traffic. We’ll create one test order in staging and send you the operations link and the specific test order/job.

You do not need to do it live with us. When you have time, please open the operations queue, find the test job, print it, pack it, and mark it shipped with test tracking. The main goal is to confirm the physical workflow is workable and that the operations screen has everything you need.

Could you please send the email address you want to use for the operations login, and let me know roughly when you think you can try it?
```

Kexiaozhan engineers:

```text
谢谢你们配合测试！我们这边确认四笔 sandbox 订单数据都正确，Stripe 测试支付和 /client/process-payment-notify 回调都成功了。

上线前我们这边只剩三个需要确认的生产事项：

1. 未支付订单有效期现在是 15 分钟，但 Stripe Checkout 最短是 30 分钟。生产环境最好需要把有效期延长到 30 分钟以上，或者提供取消/刷新/重新创建订单的方法，避免客户在订单过期后还能付款。

2. 请确认生产环境使用的 machine_sn 和 machineKey 应该如何提供或配置。生产回调域名我们会使用你们之前提供的：
https://kxzus.kexiaozhan.com

Snapcase 生产跳转地址预计是：
https://www.snapcase.ai/kexiaozhan/checkout

3. 关于“是否立即打印”的字段，请确认字段名、取值、默认值、是否参与同样的 HMAC 签名，以及 sandbox/production 是否都支持。我们希望由 Snapcase 服务端控制，默认使用管理员集中打印，顾客不参与选择。

目前不需要新的接口文档；主要是确认以上三个生产上线事项。谢谢！
```

## Verification Before Cutover

- `npm ci`
- `npm run build`
- `npm test --if-present`
- `npm run lint --if-present`
- `npm run type-check --if-present`
- Deno tests for Kexiaozhan signing, handoff, callback gate, timeout guard, Stripe config, and CORS.
- Async staging dry run with Alejandro through a verified staging `/operations` URL.
- Delayed-payment or expired-handoff scenario proves fail-closed behavior.
- Kexiaozhan callback print-mode field proves admin/batch handling and no uncontrolled immediate printing.
- Production pilot order proves live Stripe payment, Kexiaozhan callback, exactly one production job, and operator workflow.

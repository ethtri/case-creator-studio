# Production Roadmap

Roadmap for moving the proven Kexiaozhan/Snapcase staging integration into a controlled production pilot. This is not a full public launch plan.

## Current Readiness

- Kexiaozhan signed redirect, Stripe Checkout, Stripe webhook, Snapcase onshore job routing, and signed `/client/process-payment-notify` callback are proven in staging.
- Four real Kexiaozhan sandbox orders completed successfully on 2026-06-17 UTC.
- Production remains Printful-backed until an explicit cutover is approved.
- Issue #30 remains a production gate only for final staging evidence. Kexiaozhan
  now accepts a valid signed `deferredPrint` callback after cancellation and
  restores Pending Print, with no enforced 30-minute callback cutoff; Snapcase
  must deploy and prove the corresponding local behavior.
- Issue #36 tracks new Kexiaozhan/Alejandro guidance that paid online orders should use admin-controlled batch printing, not uncontrolled immediate continuous printing.
- Internal staging prerequisites are complete: permanent staging deployment
  isolation (#50), Stripe
  Dashboard webhook validation (#43), and the disabled-by-default zero-total
  implementation/deployment (#51). The next dependency is a coordinated pair of
  fresh vendor-signed sandbox handoffs for live evidence.

## Production Gates

1. The delayed deferred-print staging and physical-release test passes.
   - Coordinate the vendor test window now that #43 and the #51 implementation
     gate are complete. Alejandro still has no action until Pending Print is
     verified.
   - Kexiaozhan creates one fresh unpaid sandbox order through the normal Snapcase
     staging redirect and provides the complete signed redirect query payload,
     including `order_no` and `out_trade_no`.
   - Snapcase waits past the normal 15-minute cancellation point, enables the
     callback only for that exact `outTradeNo`, and completes the Stripe test
     Checkout.
   - Verify the valid signed `deferredPrint` callback restores `Pending Print`,
     creates exactly one `production_jobs` row, and triggers no automatic print.
   - Alejandro then uses the Kexiaozhan Merchant Portal **Order Center > Order
     List > Send to Print** once for the identified order and confirms the
     physical result. He does not need Snapcase `/operations` access, a Snapcase
     login, or a payment task.

2. Zero-total callback safety is validated.
   - Run a fully discounted sandbox Checkout and verify that the signed
     `deferredPrint` callback uses Snapcase's deterministic transaction reference
     without setting a Stripe PaymentIntent ID.
   - Verify exactly one production job and no automatic print.

3. Kexiaozhan print mode remains server-controlled.
   - The confirmed signed callback field is `fulfillmentMethod`, with
     `deferredPrint` as Snapcase's first-pilot value.
   - Snapcase controls this field server-side; customers do not choose the print behavior.
   - The evidence from gates 1 and 2 must show no immediate automatic print.

4. Production environment is ready.
   - Configure production Supabase/Vercel secrets only after gates pass.
   - Required: `FULFILLMENT_PROVIDER=onshore_manual`, `ALLOW_ONSHORE_MANUAL=true`,
     Snapcase administrator `OPERATOR_EMAILS`, Stripe live keys/webhook,
     production Kexiaozhan base URL, production `machineKey`, allowed production
     `machine_sn`, checkout pricing, and callback gate settings.
   - Keep `KEXIAOZHAN_PAYMENT_NOTIFY_ENABLED=false` until go/no-go.

5. Cutover and rollback runbook is approved.
   - Use `Docs/PRODUCTION_CUTOVER_RUNBOOK.md` for env switch, function deploy list, smoke order, callback enablement, rollback to Printful, and sign-off owners.
   - Rollback for new orders is one env change back to `printful`; already queued onshore jobs need operator disposition.

6. First production pilot order is supervised.
   - Use exact `outTradeNo` callback allowlist if practical.
   - Verify Stripe live payment, Kexiaozhan callback success, one production job, and Alejandro workflow.
   - Disable or narrow callback if anything unexpected appears.

## Production Board

- #30 - Delayed Stripe Checkout payment recovery test.
- #36 - Validate Kexiaozhan deferred-print callback and release flow.
- #35 - Alejandro Kexiaozhan deferred-print physical release test.
- #38 - Obsolete: no Snapcase login is required for Alejandro's vendor-portal test.
- #39 - Create and run the vendor-originated staging deferred-print test order.
- #40 - Verify delayed callback and physical-release evidence.
- #43 - Clean up and verify the staging Stripe webhook endpoint (complete).
- #50 - Restore isolated staging domain for Kexiaozhan validation (complete;
  `staging.snapcase.ai` is permanently mapped to the dedicated `snapcase-staging`
  Vercel project as of 2026-07-14).
- #51 - Enable zero-total Kexiaozhan Checkout validation (implementation and
  deployment complete; vendor-originated live evidence pending).
- #33 - Production environment and secret readiness.
- #34 - Production cutover and rollback runbook.
- #32 - Production pilot order and monitoring.
- #29 - Kexiaozhan print status/reprint APIs. Not required for the first manual pilot; required before automation or unattended scale.

## Historical Coordination Messages (Superseded)

Do not use the messages below. They incorrectly instructed Alejandro to use
Snapcase `/operations`; they are retained only as historical record.

Alejandro:

```text
Hi Alejandro! We’re ready to do the Snapcase pre-production dry run.

This will not be live customer traffic. We’ll create one test order in staging and send you the operations link and the specific test order/job.

You do not need to do it live with us. When you have time, please open the operations queue, find the test job, print it, pack it, and mark it shipped with test tracking. The main goal is to confirm the physical workflow is workable and that the operations screen has everything you need.

Could you please send the email address you want to use for the operations login, and let me know roughly when you think you can try it?
```

Kexiaozhan engineers:

Historical draft only. Do not send it: its timeout and print-mode questions were
answered on 2026-07-10 and 2026-07-11. No further vendor message is needed until
Snapcase has a specific delayed-payment sandbox order ready for validation.

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

## Current Coordination Messages

Alejandro:

```text
Hi Alejandro, sorry for the earlier confusing instructions. You do not need to
create or pay for an order, and you do not need to use the Snapcase operations
site.

We will coordinate one staging test order with the Kexiaozhan engineers. Once we
confirm it appears in the Merchant Portal as Pending Print, we will send you its
order ID.

At that point, please open Order Center > Order List, find that order, click Send
to Print once, and tell us whether it printed normally. This is not live customer
traffic.
```

Kexiaozhan engineers:

```text
This request is ready to send once both teams agree on a bounded test window.

For the final staging test, please create the agreed fresh unpaid sandbox orders
using the approved Snapcase staging redirect. Please send the complete signed
webhookUrl query payload for each order, including order_no, out_trade_no,
amount, goods_name, currency, machine_sn, timestamp, nonce, and sign. Please do
not pay or print either order.

We will use the paid order for the delayed deferredPrint test and the zero-value
order for the no-cost Checkout test. We will coordinate the bounded test window
before you generate the signed redirects.
```

## Verification Before Cutover

- `npm ci`
- `npm run build`
- `npm test --if-present`
- `npm run lint --if-present`
- `npm run type-check --if-present`
- Deno tests for Kexiaozhan signing, handoff, callback gate, timeout guard, Stripe config, and CORS.
- Delayed staging test where Alejandro releases only the verified Merchant Portal
  `Pending Print` order with `Send to Print`.
- Delayed `deferredPrint` payment restores Pending Print and creates one job;
  expired non-deferred/misconfigured payment remains fail-closed.
- Kexiaozhan callback print-mode field proves admin/batch handling and no uncontrolled immediate printing.
- Production pilot order proves live Stripe payment, Kexiaozhan callback, exactly one production job, and operator workflow.

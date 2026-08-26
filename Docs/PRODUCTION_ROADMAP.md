# Production Roadmap

Roadmap for moving the proven Kexiaozhan/Snapcase staging integration into a controlled production pilot. This is not a full public launch plan.

## Current Readiness

- Kexiaozhan signed redirect, Stripe Checkout, Stripe webhook, Snapcase onshore job routing, and signed `/client/process-payment-notify` callback are proven in staging.
- Four real Kexiaozhan sandbox orders completed successfully on 2026-06-17 UTC.
- Production remains Printful-backed until an explicit cutover is approved.
- Issue #30 is complete. The 2026-07-16 staging run submitted the paid Checkout
  after T+16 minutes; Snapcase remained paid with one queued job and the signed
  Kexiaozhan payment-status query returned paid.
- Issue #36 tracks new Kexiaozhan/Alejandro guidance that paid online orders should use admin-controlled batch printing, not uncontrolled immediate continuous printing.
- Internal staging prerequisites are complete: permanent staging deployment
  isolation (#50), Stripe
  Dashboard webhook validation (#43), and the disabled-by-default zero-total
  implementation/deployment and vendor-originated live evidence (#51).
- The 2026-07-15 coordinated attempt exposed a Snapcase test-process gap: the
  effective handoff deadline was still 15 minutes and the sequential flow left
  too little time to submit payment. Automated staging modes and a signed-URL
  go/no-go preflight now guard the rerun.
- Merchant Portal verification on 2026-07-16 confirmed both successful rerun
  orders are Payment Successful, Pending Print, Print Time `0`, with `Send to
  Print` still available. No automatic print dispatch occurred.
- Alejandro released the existing device-689 deferred-print order through the
  Merchant Portal and reported on 2026-08-26 that the test "printed normally."
  Issues #35, #36, and #40 are complete.
- The normal print result does not prove the physical case-to-order-to-label
  identity chain. #148 and #122 remain the next production gates; no new vendor
  order or Kexiaozhan engineering request is needed for them.

## Production Gates

1. Delayed deferred-print staging and physical release passed. Complete 2026-08-26.
   - Kexiaozhan created one fresh paid and one fresh zero-value unpaid sandbox
     order through the normal Snapcase staging redirect and provided both
     complete signed redirect query payloads, including `order_no` and
     `out_trade_no`.
   - Snapcase ran the signed-URL preflight within five minutes of generation and
     started only after it reported `READY`.
   - Snapcase created both paid and zero-total Stripe Checkout Sessions, completed
     zero promptly, and held paid until T+16 minutes.
   - Snapcase enabled callbacks only for those two exact `outTradeNo` values.
   - The valid signed `deferredPrint` callbacks restored `Pending Print`, created
     exactly one `production_jobs` row each, and triggered no automatic print.
     This completed the paid/delayed and zero-total paths on 2026-07-16.
   - Alejandro used the Kexiaozhan Merchant Portal **Order Center > Order List >
     Send to Print** once for the identified device-689 order and reported normal
     physical output. He did not need Snapcase `/operations` access, a Snapcase
     login, or a payment task.

2. Zero-total callback safety is validated. Complete 2026-07-16.
   - A real vendor-originated zero-value Checkout completed with no Stripe
     PaymentIntent, one queued onshore job, and paid Kexiaozhan query status.
   - Merchant Portal confirmed Pending Print, Print Time `0`, and no automatic
     dispatch for the zero-total order on 2026-07-16.

3. Kexiaozhan print mode remains server-controlled. Complete 2026-08-26.
   - The confirmed signed callback field is `fulfillmentMethod`, with
     `deferredPrint` as Snapcase's first-pilot value.
   - Snapcase controls this field server-side; customers do not choose the print behavior.
   - Gates 1 and 2 showed no immediate automatic print, and the manual release
     produced normal physical output.

4. Physical identity and shipping inputs are approved.
   - #148 proves how the operator matches the intended Kexiaozhan job, finished
     case, and shipping label without relying on memory or guessing.
   - #148 records the safe concurrency and quarantine rules, including multiple
     orders for the same phone model.
   - #122 approves the actual packed dimensions and weight, label-printer format,
     sample-label legibility, origin/return address, and production rate policy.

5. Production environment is ready.
   - Configure production Supabase/Vercel secrets only after gates pass.
   - Required: `FULFILLMENT_PROVIDER=onshore_manual`, `ALLOW_ONSHORE_MANUAL=true`,
     Snapcase administrator `OPERATOR_EMAILS`, Stripe live keys/webhook,
     production Kexiaozhan base URL, production `machineKey`, allowed production
     `machine_sn`, checkout pricing, and callback gate settings.
   - Keep `KEXIAOZHAN_PAYMENT_NOTIFY_ENABLED=false` until go/no-go.

6. Cutover and rollback runbook is approved.
   - Use `Docs/PRODUCTION_CUTOVER_RUNBOOK.md` for env switch, function deploy list, smoke order, callback enablement, rollback to Printful, and sign-off owners.
   - Rollback for new orders is one env change back to `printful`; already queued onshore jobs need operator disposition.

7. First production pilot order is supervised.
   - Use exact `outTradeNo` callback allowlist if practical.
   - Verify Stripe live payment, Kexiaozhan callback success, one production job, and Alejandro workflow.
   - Disable or narrow callback if anything unexpected appears.

8. Commercial pricing is approved from physical evidence.
   - Keep the current `$29.99` case plus `$4.99` shipping defaults until #134
     records actual blank case, supplies, labor, quality control, packaging,
     postage, payment, remake/refund reserve, and vendor/machine costs.
   - Run `npm run pricing:economics-check -- <private-evidence.json>` against a
     private evidence file. Do not commit supplier terms, customer data, or
     private cost agreements.
   - The `$34.99` standard and `$44.99` magnetic free-shipping launch scenarios
     in the synthetic fixture are analysis only. They require physical-pilot
     evidence, an approved decision, at least 40% contribution before
     advertising, and completion of SKU/compatibility work before launch.
   - Treat contribution below 30% as a stop-and-review condition.

## Production Board

- #30 - Delayed Stripe Checkout payment recovery test (complete 2026-07-16).
- #36 - Validate Kexiaozhan deferred-print callback and release flow (complete
  2026-08-26).
- #35 - Alejandro Kexiaozhan deferred-print physical release test (complete
  2026-08-26; reported normal physical output).
- #38 - Obsolete: no Snapcase login is required for Alejandro's vendor-portal test.
- #39 - Create and run the vendor-originated staging deferred-print test order
  (complete 2026-07-16).
- #40 - Verify delayed callback and physical-release evidence (complete
  2026-08-26).
- #43 - Clean up and verify the staging Stripe webhook endpoint (complete).
- #50 - Restore isolated staging domain for Kexiaozhan validation (complete;
  `staging.snapcase.ai` is permanently mapped to the dedicated `snapcase-staging`
  Vercel project as of 2026-07-14).
- #51 - Enable zero-total Kexiaozhan Checkout validation (complete 2026-07-16).
- #148 - Prove the order-to-physical-case-to-label identity workflow (active P0).
- #122 - Approve the package, printer, origin, and rate profile (active P0).
- #116 - Implement the approved `/operations` workflow after #148 (blocked).
- #117 - Run the final synthetic Alejandro workflow dry run after #116 (blocked).
- #135 - Complete the next naturally available exact-order paid reconciliation
  evidence before production pilot.
- #33 - Production environment and secret readiness.
- #34 - Production cutover and rollback runbook.
- #32 - Production pilot order and monitoring.
- #29 - Kexiaozhan print status/reprint APIs. Not required for the first manual pilot; required before automation or unattended scale.
- #134 - Onshore unit economics and authoritative launch-pricing approval.

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

## Current Coordination Message

Alejandro:

```text
Hi Alejandro, thank you - that confirms the test case printed normally. We do
not need you to create, pay for, or print another order.

To finish the shipping workflow, could you please tell us what identifiers or
design preview you saw before printing, whether anything identifying the order
came out with the case, the packed mailer dimensions and weight, the shipping-
label printer/model and paper size available, and whether the device-689 site is
the correct ship-from and returns address? Please keep the printed test case and
do not include customer or address details in photos.
```

No Kexiaozhan engineering message is needed at this stage. The next work is
Snapcase/Alejandro physical identity and shipping-process validation.

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

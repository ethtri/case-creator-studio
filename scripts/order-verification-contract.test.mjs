import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildVerificationAnalyticsPayload,
  countPurchasedUnits,
  createOrderVerificationRunner,
  formatPurchasedUnits,
  formatSupportReference,
  normalizeVerificationResponse,
  trackVerificationOutcomeOnce,
} from "../src/lib/order-verification.ts";
import {
  classifyPaymentVerificationOrder,
} from "../supabase/functions/_shared/order-verification-state.ts";

const order = {
  id: "11111111-1111-4111-8111-111111111111",
  items: [{ quantity: 2 }, { quantity: 1 }, {}],
  total: "94.97",
  status: "paid",
  customer_email: "private@example.com",
  shipping_address: { address: "private" },
};

test("normalizes authoritative success without retaining sensitive order fields", () => {
  const result = normalizeVerificationResponse({
    success: true,
    order,
    supportReference: "SC-111111111111",
  });

  assert.equal(result.kind, "verified");
  assert.equal(result.supportReference, "SC-111111111111");
  assert.equal(result.order.total, 94.97);
  assert.equal("id" in result.order, false);
  assert.equal("customer_email" in result.order, false);
  assert.equal("shipping_address" in result.order, false);
  assert.equal("customer_email" in result.order.items[0], false);
});

test("models retryable delay, missing order record, and confirmed failure distinctly", () => {
  assert.deepEqual(
    normalizeVerificationResponse({
      success: false,
      retryable: true,
      code: "payment_pending",
      supportReference: "SC-111111111111",
    }),
    {
      kind: "retryable",
      errorCode: "payment_pending",
      supportReference: "SC-111111111111",
    },
  );
  assert.deepEqual(normalizeVerificationResponse({ success: true }), {
    kind: "retryable",
    errorCode: "order_record_pending",
    supportReference: undefined,
  });
  assert.deepEqual(
    normalizeVerificationResponse({
      success: true,
      order: { ...order, total: null },
      supportReference: "SC-111111111111",
    }),
    {
      kind: "retryable",
      errorCode: "order_record_pending",
      supportReference: "SC-111111111111",
    },
  );
  assert.deepEqual(
    normalizeVerificationResponse({
      success: false,
      retryable: false,
      code: "checkout_expired",
      order: { ...order, status: "failed" },
      supportReference: "SC-111111111111",
    }),
    {
      kind: "confirmed_failure",
      errorCode: "checkout_expired",
      supportReference: "SC-111111111111",
    },
  );
});

test("does not trust arbitrary server codes, support references, or identifiers", () => {
  assert.deepEqual(
    normalizeVerificationResponse({
      success: false,
      retryable: true,
      code: "private@example.com",
      supportReference: "test-session-secret",
    }),
    {
      kind: "retryable",
      errorCode: "verification_unavailable",
      supportReference: undefined,
    },
  );
  assert.equal(formatSupportReference("test-session-secret"), undefined);
  assert.equal(formatSupportReference(order.id), "SC-111111111111");
});

test("fails closed on hostile or malformed confirmed-failure payloads", () => {
  const malformedPayloads = [
    { success: false, retryable: false },
    {
      success: false,
      retryable: false,
      code: "private@example.com",
    },
    {
      success: false,
      retryable: false,
      code: "verification_unavailable",
    },
    {
      success: false,
      retryable: false,
      code: "payment_pending",
    },
    {
      success: false,
      retryable: false,
      code: "order_requires_review",
      supportReference: "private-session-secret",
    },
    {
      success: false,
      retryable: true,
      code: "order_requires_review",
      supportReference: "SC-111111111111",
    },
    {
      success: false,
      retryable: true,
      order: { ...order, status: "failed" },
      supportReference: "SC-111111111111",
    },
  ];

  for (const payload of malformedPayloads) {
    assert.deepEqual(normalizeVerificationResponse(payload), {
      kind: "retryable",
      errorCode: "verification_unavailable",
      supportReference: payload.supportReference === "SC-111111111111"
        ? "SC-111111111111"
        : undefined,
    });
  }

  assert.deepEqual(
    normalizeVerificationResponse({
      success: false,
      retryable: false,
      code: "order_requires_review",
      supportReference: "SC-111111111111",
    }),
    {
      kind: "confirmed_failure",
      errorCode: "order_requires_review",
      supportReference: "SC-111111111111",
    },
  );
});

test("requires a trusted paid-or-later status for verified success", () => {
  for (const status of ["pending", "failed", "payment_review", "private"]) {
    assert.deepEqual(
      normalizeVerificationResponse({
        success: true,
        order: { ...order, status },
        supportReference: "SC-111111111111",
      }),
      {
        kind: "retryable",
        errorCode: "order_record_pending",
        supportReference: "SC-111111111111",
      },
    );
  }
});

test("classifies canonical order truth for read-only shopper verification", () => {
  assert.equal(classifyPaymentVerificationOrder("pending"), "pending_payment");
  for (const status of ["paid", "processing", "shipped", "delivered"]) {
    assert.equal(classifyPaymentVerificationOrder(status), "verified");
  }
  for (
    const status of [
      "canceled",
      "cancelled",
      "failed",
      "payment_review",
    ]
  ) {
    assert.equal(
      classifyPaymentVerificationOrder(status),
      "confirmed_failure",
    );
  }
  for (const status of ["refunded", "private", "", null, undefined]) {
    assert.equal(classifyPaymentVerificationOrder(status), "unknown");
  }
});

test("sums purchased units and applies singular/plural grammar", () => {
  assert.equal(countPurchasedUnits(order.items), 4);
  assert.equal(formatPurchasedUnits(1), "1 case");
  assert.equal(formatPurchasedUnits(4), "4 cases");
});

test("coalesces repeated verification while a request is in flight and allows a later retry", async () => {
  let calls = 0;
  let release;
  const firstResponse = new Promise((resolve) => {
    release = resolve;
  });
  const runner = createOrderVerificationRunner(async () => {
    calls += 1;
    if (calls === 1) return await firstResponse;
    return {
      data: {
        success: true,
        order,
        supportReference: "SC-111111111111",
      },
      error: null,
    };
  });

  const first = runner.verify("test-session-existing");
  const repeated = runner.verify("test-session-existing");
  assert.equal(calls, 1);

  release({
    data: {
      success: false,
      retryable: true,
      code: "payment_pending",
      supportReference: "SC-111111111111",
    },
    error: null,
  });
  assert.equal((await first).kind, "retryable");
  assert.equal((await repeated).kind, "retryable");

  const retry = await runner.verify("test-session-existing");
  assert.equal(calls, 2);
  assert.equal(retry.kind, "verified");
});

test("maps invocation failures to bounded retryable errors", async () => {
  const runner = createOrderVerificationRunner(async () => ({
    data: null,
    error: {
      context: new Response(
        JSON.stringify({
          error: "private server detail",
          code: "verification_unavailable",
          retryable: true,
          supportReference: "SC-111111111111",
        }),
        { status: 503, headers: { "content-type": "application/json" } },
      ),
    },
  }));

  assert.deepEqual(await runner.verify("test-session-existing"), {
    kind: "retryable",
    errorCode: "verification_unavailable",
    supportReference: "SC-111111111111",
  });
});

test("deduplicates verification analytics by hashed session and outcome", async () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const tracked = [];
  const state = {
    kind: "retryable",
    errorCode: "payment_pending",
  };

  assert.equal(
    await trackVerificationOutcomeOnce({
      sessionId: "test-session-existing",
      state,
      storage,
      track: (payload) => tracked.push(payload),
    }),
    true,
  );
  assert.equal(
    await trackVerificationOutcomeOnce({
      sessionId: "test-session-existing",
      state,
      storage,
      track: (payload) => tracked.push(payload),
    }),
    false,
  );
  assert.deepEqual(tracked, [
    {
      stage: "retryable",
      error_code: "payment_pending",
    },
  ]);
  assert.equal(
    [...values.keys()].some((key) => key.includes("test-session-existing")),
    false,
  );
});

test("analytics payloads contain only bounded outcome and error code", () => {
  assert.deepEqual(
    buildVerificationAnalyticsPayload({
      kind: "confirmed_failure",
      errorCode: "order_requires_review",
      supportReference: "SC-111111111111",
    }),
    {
      stage: "confirmed_failure",
      error_code: "order_requires_review",
    },
  );
});

test("shopper recovery calls only verify-payment and never emits purchase", async () => {
  const [
    pageSource,
    verifySource,
    fulfillmentSource,
    printfulSource,
    jobMigration,
  ] = await Promise.all([
    readFile(new URL("../src/pages/OrderSuccess.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../supabase/functions/verify-payment/index.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        "../supabase/functions/route-fulfillment-order/index.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../supabase/functions/submit-printful-order/index.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../supabase/migrations/20260502090000_add_production_jobs.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);

  assert.match(pageSource, /functions\.invoke\("verify-payment"/);
  assert.doesNotMatch(pageSource, /functions\.invoke\("create-checkout"/);
  assert.doesNotMatch(pageSource, /trackMarketingEvent\("purchase"/);
  assert.match(
    pageSource,
    /result\.kind === "verified"[\s\S]{0,240}clearCart\(\)/,
  );
  assert.doesNotMatch(
    verifySource,
    /checkout\.sessions\.create|paymentIntents\.create|charges\.create|refunds\.create/,
  );
  assert.doesNotMatch(
    verifySource,
    /\.update\(|\.insert\(|\.upsert\(|sendOrderEmail|route-fulfillment-order|recordKexiaozhanPaymentNotification|kexiaozhan_handoffs/,
  );
  assert.doesNotMatch(verifySource, /customerEmail:\s*session/);
  assert.match(verifySource, /order:\s*buildPublicOrderSummary\(order\)/);
  assert.match(
    verifySource,
    /This shopper-triggered endpoint is read-only[\s\S]{0,300}return buildExistingOrderResponse/,
  );
  assert.match(jobMigration, /UNIQUE\s+\(order_id,\s*provider\)/);
  assert.match(
    fulfillmentSource,
    /if\s*\(existingJob\)[\s\S]*created:\s*false/,
  );
  assert.match(printfulSource, /existingPrintfulOrderId\s*&&\s*!needsConfirm/);
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  buildBeginCheckoutPayload,
  createHostedCheckoutRunner,
  normalizeHostedStripeCheckoutUrl,
} from "../src/lib/checkout-session.ts";

const hostedCheckoutUrl =
  "https://checkout.stripe.com/c/pay/cs_test_snapcase123#opaque-fragment";

const beginCheckoutPayload = buildBeginCheckoutPayload({
  subtotal: 59.98,
  shipping: 4.99,
  items: [
    {
      variantId: "iphone-17-pro-max",
      brand: "Apple",
      model: "iPhone 17 Pro Max",
      price: 29.99,
      quantity: 2,
      discount: 0,
    },
  ],
});

const buildAttempt = (overrides = {}) => ({
  buildRequestBody: () => ({ order: "bounded-checkout-request" }),
  beginCheckoutPayload,
  ...overrides,
});

test("accepts only canonical hosted Stripe Checkout Session URLs", () => {
  assert.equal(
    normalizeHostedStripeCheckoutUrl(hostedCheckoutUrl),
    hostedCheckoutUrl,
  );
  assert.equal(
    normalizeHostedStripeCheckoutUrl(
      "https://checkout.stripe.com/c/pay/cs_live_ABC123#another-opaque-fragment",
    ),
    "https://checkout.stripe.com/c/pay/cs_live_ABC123#another-opaque-fragment",
  );
  assert.equal(
    normalizeHostedStripeCheckoutUrl(
      "https://checkout.stripe.com:443/c/pay/cs_test_ABC123",
    ),
    "https://checkout.stripe.com/c/pay/cs_test_ABC123",
  );

  for (const value of [
    undefined,
    "",
    "not-a-url",
    "https://checkout.stripe.com/",
    "https://checkout.stripe.com/arbitrary",
    "https://checkout.stripe.com/c/pay/",
    "https://checkout.stripe.com/c/pay/cs_test_ABC123/extra",
    "https://checkout.stripe.com/c/pay/not_a_session",
    "http://checkout.stripe.com/c/pay/cs_test_ABC123",
    "https://checkout.stripe.com.evil.example/c/pay/cs_test_ABC123",
    "https://user:secret@checkout.stripe.com/c/pay/cs_test_ABC123",
    "https://checkout.stripe.com:444/c/pay/cs_test_ABC123",
    "https://checkout.stripe.com/c/pay/cs_test_ABC123?",
    "https://checkout.stripe.com/c/pay/cs_test_ABC123?client_secret=private",
    "https://buy.stripe.com/c/pay/cs_test_ABC123",
  ]) {
    assert.equal(normalizeHostedStripeCheckoutUrl(value), null, String(value));
  }
});

test("builds a whitelist-only begin-checkout payload without private checkout fields", () => {
  const payload = buildBeginCheckoutPayload({
    subtotal: 54.98,
    shipping: 4.99,
    coupon: "SAVE_5",
    items: [
      {
        variantId: "iphone-17-pro-max",
        brand: "Apple",
        model: "iPhone 17 Pro Max",
        price: 29.99,
        quantity: 2,
        discount: 2.5,
        customerEmail: "private@example.com",
        designPreview: "data:image/private",
        designId: "private-design-id",
        marketingAttribution: { gclid: "private-click-id" },
      },
      {
        variantId: "poisoned-brand",
        brand: "private@example.com",
        model: "Safe model",
        price: 29.99,
        quantity: 1,
        discount: 0,
      },
      {
        variantId: "poisoned-model",
        brand: "Safe brand",
        model: "Call 555-123-4567",
        price: 29.99,
        quantity: 1,
        discount: 0,
      },
    ],
  });

  assert.deepEqual(payload, {
    value: 54.98,
    currency: "USD",
    shipping: 4.99,
    items: [
      {
        item_id: "iphone-17-pro-max",
        item_name: "Apple iPhone 17 Pro Max Custom Case",
        item_brand: "Apple",
        item_category: "Custom Phone Case",
        item_variant: "iPhone 17 Pro Max",
        price: 29.99,
        quantity: 2,
        discount: 2.5,
      },
    ],
    coupon: "SAVE_5",
  });
  const serialized = JSON.stringify(payload);
  for (const privateValue of [
    "private@example.com",
    "data:image/private",
    "private-design-id",
    "private-click-id",
  ]) {
    assert.doesNotMatch(serialized, new RegExp(privateValue));
  }

  assert.deepEqual(
    buildBeginCheckoutPayload({
      subtotal: Number.NaN,
      shipping: Number.POSITIVE_INFINITY,
      coupon: "private@example.com",
      items: [],
    }),
    {
      value: 0,
      currency: "USD",
      shipping: 0,
      items: [],
    },
  );
});

test("runs provider request, one success event, and one redirect in exact order", async () => {
  const steps = [];
  const failures = [];
  const requestBody = { order: "bounded-checkout-request" };
  const runner = createHostedCheckoutRunner({
    invoke: async (body) => {
      steps.push("request");
      assert.equal(body, requestBody);
      return { data: { url: hostedCheckoutUrl }, error: null };
    },
    track: (eventName, payload) => {
      steps.push(`event:${eventName}`);
      assert.deepEqual(payload, beginCheckoutPayload);
      return true;
    },
    redirect: (url) => {
      steps.push("redirect");
      assert.equal(url, hostedCheckoutUrl);
    },
  });

  const result = await runner.start(
    buildAttempt({
      buildRequestBody: () => requestBody,
      onFailure: (failure) => failures.push(failure),
    }),
  );

  assert.deepEqual(result, { kind: "redirected", url: hostedCheckoutUrl });
  assert.deepEqual(steps, ["request", "event:begin_checkout", "redirect"]);
  assert.deepEqual(failures, []);
});

test("coalesces rapid duplicates across request, event, redirect, and failure UI", async () => {
  let releaseProvider;
  const providerResponse = new Promise((resolve) => {
    releaseProvider = resolve;
  });
  let builds = 0;
  let requests = 0;
  const events = [];
  const redirects = [];
  const failures = [];
  const runner = createHostedCheckoutRunner({
    invoke: async () => {
      requests += 1;
      return await providerResponse;
    },
    track: (eventName) => events.push(eventName),
    redirect: (url) => redirects.push(url),
  });
  const attempt = buildAttempt({
    buildRequestBody: () => {
      builds += 1;
      return { order: "first" };
    },
    onFailure: (failure) => failures.push(failure),
  });

  const first = runner.start(attempt);
  const repeated = runner.start(
    buildAttempt({
      buildRequestBody: () => {
        throw new Error("duplicate request body must not be built");
      },
    }),
  );
  assert.equal(first, repeated);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(builds, 1);
  assert.equal(requests, 1);

  releaseProvider({ data: { url: hostedCheckoutUrl }, error: null });
  await Promise.all([first, repeated]);
  const afterSuccess = runner.start(
    buildAttempt({
      buildRequestBody: () => {
        throw new Error("successful checkout must remain latched");
      },
    }),
  );
  assert.equal(afterSuccess, first);
  await afterSuccess;

  assert.equal(requests, 1);
  assert.deepEqual(events, ["begin_checkout"]);
  assert.deepEqual(redirects, [hostedCheckoutUrl]);
  assert.deepEqual(failures, []);
});

test("maps provider, invocation, thrown, missing, and invalid URL failures without redirecting", async () => {
  const cases = [
    {
      name: "provider response body",
      invoke: async () => ({
        data: null,
        error: {
          message: "Provider rejected checkout.",
          context: new Response(
            JSON.stringify({ error: "Promo code rejected by provider." }),
            { status: 400, headers: { "content-type": "application/json" } },
          ),
        },
      }),
      message: "Promo code rejected by provider.",
      errorCode: "promotion_rejected",
    },
    {
      name: "invocation error",
      invoke: async () => ({
        data: null,
        error: { message: "Provider unavailable." },
      }),
      message: "Provider unavailable.",
      errorCode: "checkout_start_failed",
    },
    {
      name: "thrown error",
      invoke: async () => {
        throw new Error("Network unavailable.");
      },
      message: "Network unavailable.",
      errorCode: "checkout_start_failed",
    },
    {
      name: "missing URL",
      invoke: async () => ({ data: {}, error: null }),
      message: "Checkout is temporarily unavailable.",
      errorCode: "checkout_start_failed",
    },
    {
      name: "invalid URL",
      invoke: async () => ({
        data: { url: "https://evil.example/c/pay/cs_test_private" },
        error: null,
      }),
      message: "Checkout is temporarily unavailable.",
      errorCode: "checkout_start_failed",
    },
  ];

  for (const scenario of cases) {
    const events = [];
    const redirects = [];
    const failures = [];
    const runner = createHostedCheckoutRunner({
      invoke: scenario.invoke,
      track: (eventName, payload) => events.push({ eventName, payload }),
      redirect: (url) => redirects.push(url),
    });

    const result = await runner.start(
      buildAttempt({ onFailure: (failure) => failures.push(failure) }),
    );

    assert.deepEqual(
      result,
      {
        kind: "failed",
        message: scenario.message,
        errorCode: scenario.errorCode,
      },
      scenario.name,
    );
    assert.deepEqual(redirects, [], scenario.name);
    assert.deepEqual(
      events,
      [
        {
          eventName: "checkout_error",
          payload: {
            error_code: scenario.errorCode,
            stage: "create_checkout",
          },
        },
      ],
      scenario.name,
    );
    assert.deepEqual(failures, [result], scenario.name);
    assert.doesNotMatch(JSON.stringify(events), new RegExp(scenario.message));
  }
});

test("bounds provider messages and permits a clean retry after failure", async () => {
  const privateTail = "x".repeat(300);
  let requests = 0;
  const events = [];
  const redirects = [];
  const failures = [];
  const runner = createHostedCheckoutRunner({
    invoke: async () => {
      requests += 1;
      return requests === 1
        ? { data: null, error: { message: `Provider unavailable ${privateTail}` } }
        : { data: { url: hostedCheckoutUrl }, error: null };
    },
    track: (eventName) => events.push(eventName),
    redirect: (url) => redirects.push(url),
  });

  const first = await runner.start(
    buildAttempt({ onFailure: (failure) => failures.push(failure) }),
  );
  const retry = await runner.start(buildAttempt());

  assert.equal(first.kind, "failed");
  assert.equal(first.message.length, 240);
  assert.deepEqual(retry, { kind: "redirected", url: hostedCheckoutUrl });
  assert.equal(requests, 2);
  assert.deepEqual(events, ["checkout_error", "begin_checkout"]);
  assert.deepEqual(redirects, [hostedCheckoutUrl]);
  assert.deepEqual(failures, [first]);
});

test("redirects when consent denies analytics or the tracker throws", async () => {
  for (const track of [
    () => false,
    () => {
      throw new Error("analytics unavailable");
    },
  ]) {
    const redirects = [];
    const runner = createHostedCheckoutRunner({
      invoke: async () => ({ data: { url: hostedCheckoutUrl }, error: null }),
      track,
      redirect: (url) => redirects.push(url),
    });

    assert.deepEqual(await runner.start(buildAttempt()), {
      kind: "redirected",
      url: hostedCheckoutUrl,
    });
    assert.deepEqual(redirects, [hostedCheckoutUrl]);
  }
});

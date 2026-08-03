import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildAnalyticsItem,
  buildAnalyticsItems,
} from "../src/lib/analytics-commerce.ts";
import {
  mergeMarketingAttribution,
  sanitizeMarketingPayload,
  setAnalyticsConsent,
  trackMarketingEvent,
} from "../src/lib/marketing.ts";
import {
  getMarketingPageLocation,
  getMarketingPagePath,
} from "../src/lib/marketing-routing.ts";
import {
  buildGa4PurchaseParams,
  buildGa4RefundParams,
  postGa4Measurement,
  sendGa4Event,
} from "../supabase/functions/_shared/ga4-measurement.ts";
import {
  normalizeGa4BrowserClientId,
  resolveGa4ClientId,
} from "../supabase/functions/_shared/ga4-client-id.ts";

const edmEditorPath = new URL(
  "../src/pages/DesignEditorEDM.tsx",
  import.meta.url,
);
const previewPath = new URL("../src/pages/Preview.tsx", import.meta.url);

test("editor preview CTAs stay explicit without dropping funnel analytics", async () => {
  const [editorSource, previewSource] = await Promise.all([
    readFile(edmEditorPath, "utf8"),
    readFile(previewPath, "utf8"),
  ]);

  const continueHandler = editorSource.match(
    /const handleContinue = \(\) => \{[\s\S]*?\n  \};/,
  )?.[0];
  const purchaseHandler = previewSource.match(
    /const handlePrimaryPurchaseAction = \(\) => \{[\s\S]*?\n  \};/,
  )?.[0];

  assert.ok(continueHandler, "The editor continue handler must exist.");
  assert.match(continueHandler, /trackEdmEvent\("edm_cta_next"/);
  assert.equal(
    editorSource.match(/onClick=\{handleContinue\}/g)?.length,
    2,
    "Mobile and desktop preview CTAs must use the tracked continue handler.",
  );
  assert.match(editorSource, /<span className="sr-only">Continue to <\/span>\s*Preview/);
  assert.match(editorSource, /"Continue to Preview"/);
  assert.doesNotMatch(editorSource, />\s*Next\s*</);
  assert.match(
    previewSource,
    /trackMarketingEvent\("preview_success", \{[\s\S]*?variant_id:/,
    "Successful previews must keep emitting the event normalized downstream to preview_generate.",
  );
  assert.ok(purchaseHandler, "The Preview primary purchase handler must exist.");
  assert.match(
    purchaseHandler,
    /if \(purchaseInFlightRef\.current\) return;[\s\S]*?if \(currentDesignInCart\) \{[\s\S]*?purchaseInFlightRef\.current = true;[\s\S]*?navigate\(`\/checkout\/\$\{variantId\}`\);/,
    "Every Preview purchase activation, including an in-cart continuation, must share the rapid-activation guard.",
  );
  assert.equal(
    purchaseHandler.match(/addToCart\(/g)?.length,
    1,
    "The primary action must expose only one cart-add branch.",
  );
  assert.equal(
    purchaseHandler.match(/trackMarketingEvent\("add_to_cart"/g)?.length,
    1,
    "The cart-add branch must emit exactly one ecommerce event.",
  );
  assert.equal(
    purchaseHandler.match(/navigate\(`\/checkout\/\$\{variantId\}`\)/g)?.length,
    2,
    "Both a new valid design and an already-in-cart design must continue to checkout from one activation.",
  );
  assert.match(
    purchaseHandler,
    /addToCart\([\s\S]*?trackMarketingEvent\("add_to_cart"[\s\S]*?if \(hasInvalidCartItems\) \{[\s\S]*?return;[\s\S]*?\}[\s\S]*?navigate\(`\/checkout\/\$\{variantId\}`\);/,
    "A new design must add and emit once before routing, while invalid stored cart state must stop navigation.",
  );
  assert.match(
    previewSource,
    /item\.variant\.id === variant\.id &&[\s\S]*?item\.edmTemplateId === edmTemplateId &&[\s\S]*?\(item\.designId \?\? null\) === \(designId \?\? null\)/,
    "Preview must restore its purchase state from stable variant, template, and design identity.",
  );
  assert.match(previewSource, /onClick=\{handlePrimaryPurchaseAction\}/);
  assert.match(previewSource, />\s*Continue to Checkout\s*</);
  assert.match(
    previewSource,
    /Continue to Checkout — \$\{variant\.price\.toFixed\(2\)\}/,
    "The ready Preview action must expose the complete checkout intent and current price.",
  );
  assert.doesNotMatch(
    previewSource,
    /begin_checkout/,
    "Arriving at Checkout from Preview must not emit begin_checkout.",
  );
  assert.doesNotMatch(previewSource, />\s*Proceed to Checkout\s*</);
  assert.doesNotMatch(previewSource, /setTimeout\(\(\) => setAddedToCart/);
});

test("normalizes generated and campaign query values out of page paths", () => {
  assert.equal(
    getMarketingPagePath(
      "/design/iphone-16",
      "?designId=6c00b46d-012b-4d9d-8329-4aa2327cf138&utm_source=launch",
    ),
    "/design/iphone-16",
  );
  assert.equal(
    getMarketingPagePath("/catalog", "?sort=popular&brand=Apple"),
    "/catalog?brand=Apple&sort=popular",
  );
  assert.equal(
    getMarketingPagePath("/catalog/", "?sort=popular&brand=Apple"),
    "/catalog?brand=Apple&sort=popular",
  );
  assert.equal(
    getMarketingPagePath("/order-success", "?session_id=cs_test_secret"),
    "/order-success",
  );
  assert.equal(
    getMarketingPageLocation(
      "https://www.snapcase.ai",
      "/design/iphone-16",
      "?utm_source=launch&designId=private-uuid",
    ),
    "https://www.snapcase.ai/design/iphone-16?utm_source=launch",
  );
  assert.equal(
    getMarketingPageLocation(
      "https://www.snapcase.ai",
      "/phone-cases/iphone-17-pro-max/",
      "?utm_source=launch",
    ),
    "https://www.snapcase.ai/phone-cases/iphone-17-pro-max?utm_source=launch",
  );
});

test("builds complete GA4 ecommerce items without design identifiers", () => {
  assert.deepEqual(
    buildAnalyticsItem({
      variantId: "iphone-16",
      brand: "Apple",
      model: "iPhone 16",
      price: 29.99,
      quantity: 2,
      discount: 3,
    }),
    {
      item_id: "iphone-16",
      item_name: "Apple iPhone 16 Custom Case",
      item_brand: "Apple",
      item_category: "Custom Phone Case",
      item_variant: "iPhone 16",
      price: 29.99,
      quantity: 2,
      discount: 3,
    },
  );
  assert.deepEqual(buildAnalyticsItems([{ variantId: "missing" }]), []);
});

test("preserves nested ecommerce items while removing sensitive values", () => {
  assert.deepEqual(
    sanitizeMarketingPayload({
      currency: "USD",
      customer_email: "private@example.com",
      items: [
        {
          item_id: "iphone-16",
          item_name: "Apple iPhone 16 Custom Case",
          preview_url: "https://private.example/art.png",
        },
      ],
    }),
    {
      currency: "USD",
      items: [
        {
          item_id: "iphone-16",
          item_name: "Apple iPhone 16 Custom Case",
        },
      ],
    },
  );
});

test("preserves first touch and refreshes only last touch", () => {
  const first = {
    landingPath: "/",
    capturedAt: "2026-07-16T00:00:00.000Z",
    utm_source: "launch",
  };
  const second = {
    landingPath: "/catalog",
    capturedAt: "2026-07-17T00:00:00.000Z",
    utm_source: "retargeting",
  };

  const initial = mergeMarketingAttribution(null, first);
  const updated = mergeMarketingAttribution(initial, second);

  assert.deepEqual(updated.firstTouch, first);
  assert.deepEqual(updated.lastTouch, second);
});

test("accepts only pseudonymous GA client IDs and falls back for hostile text", async () => {
  const orderId = "22222222-2222-4222-8222-222222222222";
  assert.equal(normalizeGa4BrowserClientId(" 123.456 "), "123.456");
  assert.equal(normalizeGa4BrowserClientId("private@example.com"), null);
  assert.equal(
    resolveGa4ClientId("private@example.com", orderId),
    `server.${orderId}`,
  );

  let fetchCalls = 0;
  await assert.rejects(
    postGa4Measurement({
      apiSecret: "secret",
      measurementId: "G-TEST",
      payload: {
        client_id: "private@example.com",
        events: [{ name: "purchase", params: {} }],
      },
      async fetchImpl() {
        fetchCalls += 1;
        return new Response(null, { status: 204 });
      },
    }),
    /not an approved pseudonymous identifier/,
  );
  assert.equal(fetchCalls, 0);
});

test("builds reconciled server purchase and refund payloads from order state", () => {
  const order = {
    id: "order-123",
    total: 64.97,
    shipping_cost: 4.99,
    discount_total: 4,
    promotion_code: "LAUNCH",
    items: [{
      variantId: "iphone-16",
      brand: "Apple",
      model: "iPhone 16",
      price: 29.99,
      quantity: 2,
      designPreview: "https://private.example/art.png",
    }],
  };

  assert.deepEqual(buildGa4PurchaseParams(order), {
    transaction_id: "order-123",
    currency: "USD",
    value: 59.98,
    tax: 0,
    shipping: 4.99,
    coupon: "LAUNCH",
    items: [{
      item_id: "iphone-16",
      item_name: "Apple iPhone 16 Custom Case",
      item_brand: "Apple",
      item_category: "Custom Phone Case",
      item_variant: "iPhone 16",
      price: 29.99,
      quantity: 2,
      discount: 2,
    }],
    analytics_contract_version: "1.0.0",
  });
  assert.equal(buildGa4RefundParams(order, 29.99).value, 29.99);
});

test("claims an event before sending and skips duplicate or in-flight claims", async () => {
  const updates = [];
  let request = null;
  const store = {
    async rpc(name, values) {
      updates.push({ name, values });
      if (name === "claim_analytics_event") {
        return {
          data: [{ id: "event-1", claim_token: "claim-1" }],
          error: null,
        };
      }
      if (name === "complete_analytics_event") {
        return { data: true, error: null };
      }
      throw new Error(`Unexpected RPC: ${name}`);
    },
  };

  const result = await sendGa4Event({
    store,
    measurementId: "G-TEST",
    apiSecret: "secret",
    clientId: "123.456",
    eventKey: "purchase:order-123",
    eventName: "purchase",
    eventParams: { transaction_id: "order-123", value: 29.99 },
    async fetchImpl(url, options) {
      request = { url, options };
      return new Response(null, { status: 204 });
    },
  });

  assert.equal(result.status, "sent");
  assert.match(request.url, /measurement_id=G-TEST/);
  assert.deepEqual(JSON.parse(request.options.body), {
    client_id: "123.456",
    events: [{
      name: "purchase",
      params: { transaction_id: "order-123", value: 29.99 },
    }],
  });
  assert.equal(updates.at(-1).name, "complete_analytics_event");
  assert.equal(updates.at(-1).values.p_claim_token, "claim-1");

  const duplicateStore = {
    async rpc(name) {
      assert.equal(name, "claim_analytics_event");
      return { data: [], error: null };
    },
  };
  const duplicate = await sendGa4Event({
    store: duplicateStore,
    measurementId: "G-TEST",
    apiSecret: "secret",
    clientId: "123.456",
    eventKey: "purchase:order-123",
    eventName: "purchase",
    eventParams: {},
    async fetchImpl() {
      throw new Error("duplicate claims must not send");
    },
  });
  assert.equal(duplicate.status, "duplicate_or_inflight");
});

test("records a bounded failure without making a production GA request when credentials are missing", async () => {
  const calls = [];
  let fetchCalls = 0;
  const store = {
    async rpc(name, values) {
      calls.push({ name, values });
      if (name === "claim_analytics_event") {
        return {
          data: [{ id: "event-1", claim_token: "claim-1" }],
          error: null,
        };
      }
      if (name === "fail_analytics_event") {
        return { data: [{ status: "failed" }], error: null };
      }
      throw new Error(`Unexpected RPC: ${name}`);
    },
  };

  await assert.rejects(
    sendGa4Event({
      store,
      clientId: "123.456",
      eventKey: "purchase:order-123",
      eventName: "purchase",
      eventParams: { transaction_id: "order-123", value: 29.99 },
      async fetchImpl() {
        fetchCalls += 1;
        throw new Error("must not fetch");
      },
    }),
    /credentials are not configured/,
  );

  assert.equal(fetchCalls, 0);
  assert.equal(calls.at(-1).name, "fail_analytics_event");
  assert.equal(calls.at(-1).values.p_failure_kind, "credentials");
});

test("records a network exception as uncertain delivery instead of auto-retrying", async () => {
  const calls = [];
  const store = {
    async rpc(name, values) {
      calls.push({ name, values });
      if (name === "claim_analytics_event") {
        return {
          data: [{ id: "event-1", claim_token: "claim-1" }],
          error: null,
        };
      }
      if (name === "mark_analytics_event_ambiguous") {
        return { data: true, error: null };
      }
      throw new Error(`Unexpected RPC: ${name}`);
    },
  };

  await assert.rejects(
    sendGa4Event({
      store,
      measurementId: "G-TEST",
      apiSecret: "secret",
      clientId: "123.456",
      eventKey: "purchase:order-123",
      eventName: "purchase",
      eventParams: { transaction_id: "order-123", value: 29.99 },
      async fetchImpl() {
        throw new Error("connection reset after upload");
      },
    }),
    /connection reset after upload/,
  );

  assert.deepEqual(
    calls.map((call) => call.name),
    ["claim_analytics_event", "mark_analytics_event_ambiguous"],
  );
  assert.equal(calls.at(-1).values.p_http_status, null);
  assert.match(calls.at(-1).values.p_error, /outcome is uncertain/);
});

test("marks a post-send state failure ambiguous instead of scheduling a silent replay", async () => {
  const calls = [];
  const store = {
    async rpc(name, values) {
      calls.push({ name, values });
      if (name === "claim_analytics_event") {
        return {
          data: [{ id: "event-1", claim_token: "claim-1" }],
          error: null,
        };
      }
      if (name === "complete_analytics_event") {
        return {
          data: null,
          error: { message: "database unavailable" },
        };
      }
      if (name === "mark_analytics_event_ambiguous") {
        return { data: true, error: null };
      }
      throw new Error(`Unexpected RPC: ${name}`);
    },
  };

  await assert.rejects(
    sendGa4Event({
      store,
      measurementId: "G-TEST",
      apiSecret: "secret",
      clientId: "123.456",
      eventKey: "refund:re_test",
      eventName: "refund",
      eventParams: { transaction_id: "order-123", value: 29.99 },
      async fetchImpl() {
        return new Response(null, { status: 204 });
      },
    }),
    /sent-state update was not confirmed/,
  );

  assert.deepEqual(
    calls.map((call) => call.name),
    [
      "claim_analytics_event",
      "complete_analytics_event",
      "mark_analytics_event_ambiguous",
    ],
  );
});

test("applies one consent update before loading Google Analytics", () => {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const previousCustomEvent = globalThis.CustomEvent;
  const storage = new Map();
  const scripts = [];

  globalThis.CustomEvent = class {
    constructor(type, init) {
      this.type = type;
      this.detail = init?.detail;
    }
  };
  globalThis.window = {
    location: { hostname: "www.snapcase.ai" },
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    },
    dispatchEvent() {},
  };
  globalThis.document = {
    createElement: () => ({}),
    head: {
      appendChild: (script) => scripts.push(script),
    },
  };

  try {
    setAnalyticsConsent("granted");
    trackMarketingEvent("page_view", { page_path: "/" });
    const commands = globalThis.window.dataLayer.filter(
      (entry) => typeof entry?.[0] === "string",
    );
    const consentCommands = globalThis.window.dataLayer.filter(
      (entry) => entry[0] === "consent",
    );

    assert.equal(commands.length, 5);
    for (const command of commands) {
      assert.equal(Object.prototype.toString.call(command), "[object Arguments]");
      assert.equal(Array.isArray(command), false);
    }
    assert.equal(consentCommands.length, 2);
    assert.equal(consentCommands[0][1], "default");
    assert.equal(consentCommands[0][2].analytics_storage, "denied");
    assert.equal(consentCommands[1][1], "update");
    assert.equal(consentCommands[1][2].analytics_storage, "granted");
    assert.equal(commands.at(-1)[0], "event");
    assert.equal(commands.at(-1)[1], "page_view");
    assert.equal(scripts.length, 1);
  } finally {
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
    globalThis.CustomEvent = previousCustomEvent;
  }
});

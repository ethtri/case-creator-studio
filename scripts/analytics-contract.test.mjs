import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAnalyticsItem,
  buildAnalyticsItems,
} from "../src/lib/analytics-commerce.ts";
import {
  mergeMarketingAttribution,
  sanitizeMarketingPayload,
} from "../src/lib/marketing.ts";
import {
  getMarketingPagePath,
} from "../src/lib/marketing-routing.ts";
import {
  buildGa4PurchaseParams,
  buildGa4RefundParams,
  sendGa4Event,
} from "../supabase/functions/_shared/ga4-measurement.ts";

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
    getMarketingPagePath("/order-success", "?session_id=cs_test_secret"),
    "/order-success",
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
    async rpc() {
      return { data: [{ id: "event-1" }], error: null };
    },
    from() {
      return {
        update(values) {
          return {
            async eq() {
              updates.push(values);
              return { error: null };
            },
          };
        },
      };
    },
  };

  const result = await sendGa4Event({
    store,
    measurementId: "G-TEST",
    apiSecret: "secret",
    clientId: "client.1",
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
    client_id: "client.1",
    events: [{
      name: "purchase",
      params: { transaction_id: "order-123", value: 29.99 },
    }],
  });
  assert.equal(updates.at(-1).status, "sent");

  const duplicateStore = {
    async rpc() {
      return { data: [], error: null };
    },
    from() {
      throw new Error("duplicate claims must not update");
    },
  };
  const duplicate = await sendGa4Event({
    store: duplicateStore,
    measurementId: "G-TEST",
    apiSecret: "secret",
    clientId: "client.1",
    eventKey: "purchase:order-123",
    eventName: "purchase",
    eventParams: {},
    async fetchImpl() {
      throw new Error("duplicate claims must not send");
    },
  });
  assert.equal(duplicate.status, "duplicate_or_inflight");
});

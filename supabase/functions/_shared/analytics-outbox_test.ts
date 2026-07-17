import {
  analyticsOutboxBackoffSeconds,
  drainAnalyticsOutbox,
  isAnalyticsOutboxRetryEligible,
  type AnalyticsOutboxClaim,
  type AnalyticsOutboxDependencies,
} from "./analytics-outbox.ts";
import { Ga4DeliveryError, type Ga4Order } from "./ga4-measurement.ts";

const assertEquals = (actual: unknown, expected: unknown) => {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) {
    throw new Error(`Expected ${right}, received ${left}`);
  }
};

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

const claim = (
  overrides: Partial<AnalyticsOutboxClaim> = {},
): AnalyticsOutboxClaim => ({
  attempts: 2,
  claim_token: "11111111-1111-4111-8111-111111111111",
  event_key: "purchase:22222222-2222-4222-8222-222222222222",
  event_name: "purchase",
  id: "33333333-3333-4333-8333-333333333333",
  max_attempts: 5,
  payload: {},
  source_amount: 59.98,
  source_order_id: "22222222-2222-4222-8222-222222222222",
  ...overrides,
});

const order = (overrides: Partial<Ga4Order> = {}): Ga4Order => ({
  analytics_client_id: "123.456",
  analytics_consent: "granted",
  discount_total: 0,
  id: "22222222-2222-4222-8222-222222222222",
  items: [{
    brand: "Apple",
    model: "iPhone 16",
    price: 29.99,
    quantity: 1,
    variantId: "iphone-16",
  }],
  shipping_cost: 4.99,
  total: 34.98,
  ...overrides,
});

const dependencies = (
  overrides: Partial<AnalyticsOutboxDependencies> = {},
): AnalyticsOutboxDependencies => ({
  claimBatch: () => Promise.resolve([claim()]),
  complete: () => Promise.resolve(true),
  deliver: () => Promise.resolve({ httpStatus: 204 }),
  fail: () => Promise.resolve("failed"),
  finalizeWithoutDelivery: () => Promise.resolve(true),
  loadOrder: () => Promise.resolve(order()),
  markAmbiguous: () => Promise.resolve(true),
  now: () => new Date("2026-07-17T17:00:00.000Z"),
  workerId: "deno-test-worker",
  ...overrides,
});

Deno.test("analytics outbox retry policy is deterministic and lease-aware", () => {
  assertEquals(
    [1, 2, 3, 4, 5].map(analyticsOutboxBackoffSeconds),
    [60, 300, 900, 3600, 3600],
  );
  assert(
    isAnalyticsOutboxRetryEligible({
      attempts: 1,
      createdAt: "2026-07-17T16:00:00.000Z",
      leaseExpiresAt: "2026-07-17T16:59:59.000Z",
      status: "sending",
    }, new Date("2026-07-17T17:00:00.000Z")),
    "expired lease should be reclaimable",
  );
});

Deno.test("analytics outbox retries once with a reconstructed safe payload", async () => {
  let body = "";
  const summary = await drainAnalyticsOutbox(dependencies({
    deliver(payload) {
      body = JSON.stringify(payload);
      return Promise.resolve({ httpStatus: 204 });
    },
  }), 25);

  assertEquals(summary.sent, 1);
  assert(body.includes("iphone-16"), "safe merchandise data should be present");
  assert(!body.includes("email"), "contact fields must not be present");
});

Deno.test("concurrent drains cannot send the same atomic claim", async () => {
  let available = true;
  let sends = 0;
  const shared = dependencies({
    claimBatch() {
      if (!available) return Promise.resolve([]);
      available = false;
      return Promise.resolve([claim()]);
    },
    deliver() {
      sends += 1;
      return Promise.resolve({ httpStatus: 204 });
    },
  });

  await Promise.all([
    drainAnalyticsOutbox({ ...shared, workerId: "a" }, 25),
    drainAnalyticsOutbox({ ...shared, workerId: "b" }, 25),
  ]);
  assertEquals(sends, 1);
});

Deno.test("missing credentials remain retryable without network access", async () => {
  let failureKind = "";
  const summary = await drainAnalyticsOutbox(dependencies({
    deliver() {
      return Promise.reject(
        new Ga4DeliveryError(
          "GA4 server credentials are not configured",
          "credentials",
        ),
      );
    },
    fail(_claim, failure) {
      failureKind = failure.failureKind;
      return Promise.resolve("failed");
    },
  }), 25);

  assertEquals(failureKind, "credentials");
  assertEquals(summary.failed, 1);
});

Deno.test("denied consent suppresses delivery", async () => {
  let sends = 0;
  const summary = await drainAnalyticsOutbox(dependencies({
    deliver() {
      sends += 1;
      return Promise.resolve({ httpStatus: 204 });
    },
    loadOrder: () => Promise.resolve(order({ analytics_consent: "denied" })),
  }), 25);

  assertEquals(sends, 0);
  assertEquals(summary.suppressed, 1);
});

Deno.test("post-send state failure is surfaced as ambiguous", async () => {
  let marked = false;
  const summary = await drainAnalyticsOutbox(dependencies({
    complete: () => Promise.reject(new Error("database unavailable")),
    markAmbiguous() {
      marked = true;
      return Promise.resolve(true);
    },
  }), 25);

  assert(marked, "split-brain row should be marked ambiguous");
  assertEquals(summary.ambiguous, 1);
});

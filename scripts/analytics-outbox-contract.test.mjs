import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  analyticsOutboxBackoffSeconds,
  buildGa4RetryPayload,
  drainAnalyticsOutbox,
  isAnalyticsOutboxRetryEligible,
} from "../supabase/functions/_shared/analytics-outbox.ts";
import {
  Ga4DeliveryError,
} from "../supabase/functions/_shared/ga4-measurement.ts";

const claim = (overrides = {}) => ({
  attempts: 2,
  claim_token: "11111111-1111-4111-8111-111111111111",
  event_key: "purchase:22222222-2222-4222-8222-222222222222",
  event_name: "purchase",
  id: "33333333-3333-4333-8333-333333333333",
  max_attempts: 5,
  payload: {
    events: [{
      name: "purchase",
      params: { transaction_id: "22222222-2222-4222-8222-222222222222" },
    }],
  },
  source_amount: 59.98,
  source_order_id: "22222222-2222-4222-8222-222222222222",
  ...overrides,
});

const order = (overrides = {}) => ({
  id: "22222222-2222-4222-8222-222222222222",
  analytics_client_id: "123.456",
  analytics_consent: "granted",
  discount_total: 4,
  items: [{
    variantId: "iphone-16",
    brand: "Apple",
    model: "iPhone 16",
    price: 29.99,
    quantity: 2,
    designPreview: "https://private.example/artwork.png",
    customer_email: "private@example.com",
  }],
  promotion_code: "LAUNCH",
  shipping_cost: 4.99,
  total: 64.97,
  ...overrides,
});

const dependencies = (overrides = {}) => ({
  async claimBatch() {
    return [claim()];
  },
  async complete() {
    return true;
  },
  async deliver() {
    return { httpStatus: 204 };
  },
  async fail() {
    return "failed";
  },
  async finalizeWithoutDelivery() {
    return true;
  },
  async loadOrder() {
    return order();
  },
  async markAmbiguous() {
    return true;
  },
  async renewLease() {
    return true;
  },
  now: () => new Date("2026-07-17T17:00:00.000Z"),
  workerId: "test-worker",
  ...overrides,
});

test("retry policy has deterministic backoff, a hard cap, and stale-lease recovery", () => {
  assert.deepEqual(
    [1, 2, 3, 4, 5].map(analyticsOutboxBackoffSeconds),
    [60, 300, 900, 3600, 3600],
  );

  const now = new Date("2026-07-17T17:00:00.000Z");
  assert.equal(
    isAnalyticsOutboxRetryEligible({
      attempts: 1,
      createdAt: "2026-07-17T16:00:00.000Z",
      leaseExpiresAt: "2026-07-17T16:59:59.000Z",
      status: "sending",
    }, now),
    true,
  );
  assert.equal(
    isAnalyticsOutboxRetryEligible({
      attempts: 1,
      createdAt: "2026-07-17T16:00:00.000Z",
      leaseExpiresAt: "2026-07-17T17:00:01.000Z",
      status: "sending",
    }, now),
    false,
  );
  assert.equal(
    isAnalyticsOutboxRetryEligible({
      attempts: 5,
      createdAt: "2026-07-17T16:00:00.000Z",
      nextAttemptAt: "2026-07-17T16:30:00.000Z",
      status: "failed",
    }, now),
    false,
  );
});

test("retries a failed purchase independently and rebuilds a privacy-safe payload", async () => {
  let delivered = null;
  const result = await drainAnalyticsOutbox(dependencies({
    async deliver(payload) {
      delivered = payload;
      return { httpStatus: 204 };
    },
  }), 25);

  assert.equal(result.claimed, 1);
  assert.equal(result.sent, 1);
  assert.equal(delivered.events[0].name, "purchase");
  assert.equal(
    delivered.events[0].params.transaction_id,
    "22222222-2222-4222-8222-222222222222",
  );
  assert.equal(delivered.events[0].params.value, 59.98);
  assert.equal(JSON.stringify(delivered).includes("private@example.com"), false);
  assert.equal(JSON.stringify(delivered).includes("artwork.png"), false);
});

test("hostile stored client text is never forwarded to GA", () => {
  const retryPayload = buildGa4RetryPayload(
    claim(),
    order({ analytics_client_id: "private@example.com" }),
  );

  assert.equal(
    retryPayload.client_id,
    "server.22222222-2222-4222-8222-222222222222",
  );
  assert.equal(
    JSON.stringify(retryPayload).includes("private@example.com"),
    false,
  );
});

test("two concurrent drains receive one database claim and send exactly once", async () => {
  let available = true;
  let sends = 0;
  const shared = dependencies({
    async claimBatch() {
      if (!available) return [];
      available = false;
      return [claim()];
    },
    async deliver() {
      sends += 1;
      return { httpStatus: 204 };
    },
  });

  const results = await Promise.all([
    drainAnalyticsOutbox({ ...shared, workerId: "worker-a" }, 25),
    drainAnalyticsOutbox({ ...shared, workerId: "worker-b" }, 25),
  ]);

  assert.equal(results.reduce((sum, result) => sum + result.claimed, 0), 1);
  assert.equal(sends, 1);
});

test("a worker that lost its lease cannot send after another worker reclaimed it", async () => {
  let sends = 0;
  const result = await drainAnalyticsOutbox(dependencies({
    async deliver() {
      sends += 1;
      return { httpStatus: 204 };
    },
    async renewLease() {
      return false;
    },
  }), 25);

  assert.equal(sends, 0);
  assert.equal(result.leaseLost, 1);
  assert.equal(result.sent, 0);
});

test("denied and unset consent are suppressed without delivery", async (t) => {
  for (const consent of ["denied", "unset"]) {
    await t.test(consent, async () => {
      let sends = 0;
      let terminalStatus = null;
      const result = await drainAnalyticsOutbox(dependencies({
        async deliver() {
          sends += 1;
          return { httpStatus: 204 };
        },
        async finalizeWithoutDelivery(
          _claim,
          status,
          _reason,
          failureKind,
        ) {
          terminalStatus = { failureKind, status };
          return true;
        },
        async loadOrder() {
          return order({ analytics_consent: consent });
        },
      }), 25);

      assert.equal(sends, 0);
      assert.deepEqual(terminalStatus, {
        failureKind: "consent_not_granted",
        status: "suppressed",
      });
      assert.equal(result.suppressed, 1);
    });
  }
});

test("refund retries preserve the stored cents-to-dollars amount", () => {
  const retryPayload = buildGa4RetryPayload(
    claim({
      event_key: "refund:re_test_123",
      event_name: "refund",
      source_amount: "29.99",
    }),
    order(),
  );

  assert.equal(retryPayload.events[0].name, "refund");
  assert.equal(retryPayload.events[0].params.value, 29.99);
});

test("a refund without an authoritative stored amount fails closed", () => {
  assert.throws(
    () =>
      buildGa4RetryPayload(
        claim({
          event_key: "refund:re_test_missing",
          event_name: "refund",
          source_amount: null,
        }),
        order(),
      ),
    /source amount is missing or invalid/,
  );
});

test("GA HTTP failures remain retryable and never use an unmocked network", async () => {
  let recorded = null;
  const result = await drainAnalyticsOutbox(dependencies({
    async deliver() {
      throw new Ga4DeliveryError(
        "GA4 Measurement Protocol returned 503",
        "http",
        503,
      );
    },
    async fail(_claim, failure) {
      recorded = failure;
      return "failed";
    },
  }), 25);

  assert.deepEqual(recorded, {
    failureKind: "http",
    httpStatus: 503,
    message: "GA4 Measurement Protocol returned 503",
  });
  assert.equal(result.failed, 1);
  assert.equal(result.sent, 0);
});

test("a network exception is terminal ambiguous because GA may have accepted it", async () => {
  let failures = 0;
  let ambiguous = null;
  const result = await drainAnalyticsOutbox(dependencies({
    async deliver() {
      throw new Ga4DeliveryError(
        "request timed out after upload",
        "network",
      );
    },
    async fail() {
      failures += 1;
      return "failed";
    },
    async markAmbiguous(_claim, reason, httpStatus) {
      ambiguous = { httpStatus, reason };
      return true;
    },
  }), 25);

  assert.equal(failures, 0);
  assert.equal(result.ambiguous, 1);
  assert.equal(ambiguous.httpStatus, null);
  assert.match(ambiguous.reason, /outcome is uncertain/);
});

test("database claim failure prevents every downstream send", async () => {
  let sends = 0;
  await assert.rejects(
    drainAnalyticsOutbox(dependencies({
      async claimBatch() {
        throw new Error("claim RPC unavailable");
      },
      async deliver() {
        sends += 1;
        return { httpStatus: 204 };
      },
    }), 25),
    /claim RPC unavailable/,
  );
  assert.equal(sends, 0);
});

test("post-send state failure becomes terminal ambiguous", async () => {
  let ambiguousReason = "";
  const result = await drainAnalyticsOutbox(dependencies({
    async complete() {
      throw new Error("sent update unavailable");
    },
    async markAmbiguous(_claim, reason) {
      ambiguousReason = reason;
      return true;
    },
  }), 25);

  assert.equal(result.sent, 0);
  assert.equal(result.ambiguous, 1);
  assert.match(ambiguousReason, /sent update unavailable/);
});

test("the SQL contract uses unique event keys, lease tokens, and skip-locked claims", async () => {
  const initialSql = await readFile(
    new URL(
      "../supabase/migrations/20260717090000_add_analytics_event_outbox.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const hardeningSql = await readFile(
    new URL(
      "../supabase/migrations/20260717160000_harden_analytics_event_outbox.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(initialSql, /event_key TEXT NOT NULL UNIQUE/i);
  assert.match(initialSql, /ON CONFLICT \(event_key\) DO NOTHING/i);
  assert.match(hardeningSql, /FOR UPDATE SKIP LOCKED/i);
  assert.match(hardeningSql, /claim_token = gen_random_uuid\(\)/i);
  assert.match(hardeningSql, /claim_token = p_claim_token/i);
  assert.match(hardeningSql, /attempts < (?:event\.)?max_attempts/i);
  assert.match(hardeningSql, /INTERVAL '5 minutes'/i);
  assert.match(hardeningSql, /status = 'ambiguous'/i);
  assert.match(hardeningSql, /renew_analytics_event_lease/i);
  assert.match(
    hardeningSql,
    /WHERE status IN \('pending', 'failed'\)/i,
  );
  assert.match(hardeningSql, /WHERE status = 'sending'/i);
});

test("migration-first rollout keeps failures from the legacy webhook retryable", async () => {
  const hardeningSql = await readFile(
    new URL(
      "../supabase/migrations/20260717160000_harden_analytics_event_outbox.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(
    hardeningSql,
    /worker_id = 'stripe-webhook',[\s\S]{0,240}next_attempt_at = v_now \+ make_interval\(\s+secs => public\.analytics_event_backoff_seconds\(attempts \+ 1\)/i,
  );

  const legacyFailure = {
    attempts: 1,
    createdAt: "2026-07-17T16:59:00.000Z",
    nextAttemptAt: "2026-07-17T17:00:00.000Z",
    status: "failed",
  };
  assert.equal(
    isAnalyticsOutboxRetryEligible(
      legacyFailure,
      new Date("2026-07-17T16:59:59.999Z"),
    ),
    false,
  );
  assert.equal(
    isAnalyticsOutboxRetryEligible(
      legacyFailure,
      new Date("2026-07-17T17:00:00.000Z"),
    ),
    true,
  );
});

test("the scheduled worker uses a dedicated auth secret, not the service-role key", async () => {
  const scheduleSql = await readFile(
    new URL(
      "../supabase/migrations/20260717161000_schedule_analytics_outbox_drain.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const config = await readFile(
    new URL("../supabase/config.toml", import.meta.url),
    "utf8",
  );

  assert.match(scheduleSql, /ga4_outbox_drain_auth_secret/g);
  assert.match(scheduleSql, /ga4_outbox_drain_enabled/g);
  assert.match(scheduleSql, /configure_ga4_outbox_drain_schedule/g);
  assert.doesNotMatch(scheduleSql, /service_role_key/i);
  assert.match(
    config,
    /\[functions\.ga4-outbox-drain\]\s+verify_jwt = false/i,
  );
});

test("the analytics schedule is removed before its explicit enable gate is evaluated", async () => {
  const scheduleSql = await readFile(
    new URL(
      "../supabase/migrations/20260721020000_harden_analytics_outbox_schedule.sql",
      import.meta.url,
    ),
    "utf8",
  );

  const unscheduleIndex = scheduleSql.indexOf("cron.unschedule");
  const enableGateIndex = scheduleSql.indexOf(
    "LOWER(BTRIM(COALESCE(v_enabled, '')))",
  );
  const scheduleIndex = scheduleSql.lastIndexOf("cron.schedule");
  assert.ok(unscheduleIndex >= 0);
  assert.ok(enableGateIndex > unscheduleIndex);
  assert.ok(scheduleIndex > enableGateIndex);
  assert.match(scheduleSql, /RETURN FALSE/);
  assert.match(
    scheduleSql,
    /REVOKE ALL ON FUNCTION public\.configure_ga4_outbox_drain_schedule\(\)/,
  );
});

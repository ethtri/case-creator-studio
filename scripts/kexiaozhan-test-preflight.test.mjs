import assert from "node:assert/strict";
import test from "node:test";
import {
  assessTestWindow,
  parseHandoffUrl,
} from "./kexiaozhan-test-preflight.mjs";
import { configurationFor } from "./kexiaozhan-staging-mode.mjs";

const BASE_TIME = Date.parse("2026-07-16T16:30:00Z");

function handoffUrl({ kind, timestampMs = BASE_TIME, suffix = "1" }) {
  const amount = kind === "zero" ? "0.00" : "150.00";
  const params = new URLSearchParams({
    order_no: `ORDER${suffix}`,
    out_trade_no: `PAY${suffix}`,
    amount,
    goods_name: kind === "zero" ? "Phone Case - Free" : "Phone Case",
    currency: "CNY",
    machine_sn: "1000001",
    timestamp: String(timestampMs / 1000),
    nonce: `nonce${suffix}`,
    sign: "a".repeat(64),
  });
  return `https://staging.example/functions/v1/kexiaozhan-checkout-redirect?${params}`;
}

test("accepts a fresh paid and zero order pair", () => {
  const result = assessTestWindow({
    paidUrl: handoffUrl({ kind: "paid", suffix: "1" }),
    zeroUrl: handoffUrl({
      kind: "zero",
      suffix: "2",
      timestampMs: BASE_TIME + 30_000,
    }),
    now: new Date(BASE_TIME + 60_000),
  });

  assert.equal(result.ready, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.paidDelayedAtMs, BASE_TIME + 16 * 60_000);
});

test("rejects the nearly expired window that caused the July 15 failure", () => {
  const result = assessTestWindow({
    paidUrl: handoffUrl({ kind: "paid", suffix: "1" }),
    zeroUrl: handoffUrl({ kind: "zero", suffix: "2" }),
    now: new Date(BASE_TIME + 32 * 60_000),
  });

  assert.equal(result.ready, false);
  assert.match(result.errors.join("\n"), /request a fresh order pair/);
  assert.match(result.errors.join("\n"), /safe completion buffer/);
});

test("rejects duplicate signed fields", () => {
  const url = `${handoffUrl({ kind: "paid", suffix: "1" })}&nonce=duplicate`;
  assert.throws(() => parseHandoffUrl(url, "paid"), /exactly one nonce/);
});

test("rejects a non-zero order in the zero slot", () => {
  assert.throws(
    () => parseHandoffUrl(handoffUrl({ kind: "paid", suffix: "1" }), "zero"),
    /amount of zero/,
  );
});

test("rejects an invalid preflight time", () => {
  assert.throws(
    () =>
      assessTestWindow({
        paidUrl: handoffUrl({ kind: "paid", suffix: "1" }),
        zeroUrl: handoffUrl({ kind: "zero", suffix: "2" }),
        now: new Date("invalid"),
      }),
    /Preflight time is invalid/,
  );
});

test("staging modes fail closed before and after a coordinated test", () => {
  const baseline = configurationFor("baseline");
  assert.equal(baseline.KEXIAOZHAN_HANDOFF_MAX_AGE_SECONDS, "2100");
  assert.equal(baseline.KEXIAOZHAN_PAYMENT_NOTIFY_ENABLED, "false");
  assert.equal(baseline.KEXIAOZHAN_ALLOW_ZERO_TOTAL_CHECKOUTS, "false");
  assert.equal(
    baseline.KEXIAOZHAN_PAYMENT_NOTIFY_EXTRA_FIELDS_JSON,
    '{"fulfillmentMethod":"deferredPrint"}',
  );

  const armed = configurationFor("arm", "123,456");
  assert.equal(armed.KEXIAOZHAN_PAYMENT_NOTIFY_ENABLED, "true");
  assert.equal(
    armed.KEXIAOZHAN_PAYMENT_NOTIFY_ALLOWED_OUT_TRADE_NOS,
    "123,456",
  );
  assert.throws(() => configurationFor("arm", "123"), /exactly two/);
});

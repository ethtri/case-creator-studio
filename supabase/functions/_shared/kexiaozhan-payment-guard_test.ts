import { assertEquals, assertExists } from "jsr:@std/assert";
import {
  buildExpiredKexiaozhanOrderUpdate,
  extractKexiaozhanOutTradeNo,
  isKexiaozhanHandoffExpired,
  KEXIAOZHAN_EXPIRED_FULFILLMENT_STATUS,
  KEXIAOZHAN_EXPIRED_HANDOFF_ERROR,
  KEXIAOZHAN_EXPIRED_PAYMENT_REVIEW_STATUS,
  parseKexiaozhanHandoffExpiresAt,
  shouldBlockExpiredKexiaozhanHandoff,
} from "./kexiaozhan-payment-guard.ts";

Deno.test("extractKexiaozhanOutTradeNo returns the first non-empty vendor payment id", () => {
  const outTradeNo = extractKexiaozhanOutTradeNo([
    { vendorDesign: { kexiaozhanPayment: { outTradeNo: "   " } } },
    {
      vendorDesign: {
        kexiaozhanPayment: { outTradeNo: "PAY202606160001" },
      },
    },
  ]);

  assertEquals(outTradeNo, "PAY202606160001");
});

Deno.test("extractKexiaozhanOutTradeNo ignores non-Kexiaozhan orders", () => {
  assertEquals(extractKexiaozhanOutTradeNo([{ sku: "snapcase" }]), null);
  assertEquals(extractKexiaozhanOutTradeNo(null), null);
});

Deno.test("parseKexiaozhanHandoffExpiresAt accepts valid timestamps only", () => {
  const parsed = parseKexiaozhanHandoffExpiresAt("2026-06-16T05:10:00Z");
  assertExists(parsed);
  assertEquals(parsed.toISOString(), "2026-06-16T05:10:00.000Z");
  assertEquals(parseKexiaozhanHandoffExpiresAt("not-a-date"), null);
  assertEquals(parseKexiaozhanHandoffExpiresAt(null), null);
});

Deno.test("isKexiaozhanHandoffExpired only expires after the cutoff", () => {
  const expiresAt = "2026-06-16T05:10:00Z";

  assertEquals(
    isKexiaozhanHandoffExpired(
      { expires_at: expiresAt },
      new Date("2026-06-16T05:09:59Z"),
    ),
    false,
  );
  assertEquals(
    isKexiaozhanHandoffExpired(
      { expires_at: expiresAt },
      new Date("2026-06-16T05:10:00Z"),
    ),
    false,
  );
  assertEquals(
    isKexiaozhanHandoffExpired(
      { expires_at: expiresAt },
      new Date("2026-06-16T05:10:01Z"),
    ),
    true,
  );
});

Deno.test("allows only configured deferred-print payments after local checkout expiry", () => {
  const expired = { expires_at: "2026-06-16T05:10:00Z" };
  const now = new Date("2026-06-16T05:10:01Z");

  assertEquals(
    shouldBlockExpiredKexiaozhanHandoff(
      expired,
      '{"fulfillmentMethod":"deferredPrint"}',
      now,
    ),
    false,
  );
  assertEquals(
    shouldBlockExpiredKexiaozhanHandoff(
      expired,
      '{"fulfillmentMethod":"immediatePrint"}',
      now,
    ),
    true,
  );
  assertEquals(
    shouldBlockExpiredKexiaozhanHandoff(expired, "{", now),
    true,
  );
  assertEquals(
    shouldBlockExpiredKexiaozhanHandoff(
      { expires_at: "2026-06-16T05:10:02Z" },
      undefined,
      now,
    ),
    false,
  );
});

Deno.test("buildExpiredKexiaozhanOrderUpdate preserves payment fields and blocks fulfillment", () => {
  const update = buildExpiredKexiaozhanOrderUpdate({
    stripe_payment_intent_id: "pi_test",
    total: 34.98,
  });

  assertEquals(update.stripe_payment_intent_id, "pi_test");
  assertEquals(update.total, 34.98);
  assertEquals(update.status, KEXIAOZHAN_EXPIRED_PAYMENT_REVIEW_STATUS);
  assertEquals(
    update.fulfillment_status,
    KEXIAOZHAN_EXPIRED_FULFILLMENT_STATUS,
  );
  assertEquals(update.fulfillment_last_error, KEXIAOZHAN_EXPIRED_HANDOFF_ERROR);
});

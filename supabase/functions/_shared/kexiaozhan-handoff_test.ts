import { assertEquals, assertRejects, assertThrows } from "jsr:@std/assert";
import { signKexiaozhanPayload } from "./kexiaozhan-payment.ts";
import {
  buildKexiaozhanRedirectSigningString,
  isAllowedKexiaozhanMachineSn,
  KEXIAOZHAN_DEFERRED_HANDOFF_MAX_AGE_SECONDS,
  KEXIAOZHAN_LEGACY_HANDOFF_MAX_AGE_SECONDS,
  normalizeKexiaozhanRedirectParams,
  resolveKexiaozhanHandoffMaxAgeSeconds,
  sameKexiaozhanSignedPayload,
  validateKexiaozhanHandoffFreshness,
  verifyKexiaozhanRedirectSignature,
} from "./kexiaozhan-handoff.ts";

const MACHINE_KEY = "machine_test_key";

async function signedParams(overrides: Record<string, string> = {}) {
  const params = {
    order_no: "ORDER202606030001",
    out_trade_no: "PAY202606030001",
    amount: "12.30",
    goods_name: "Photo Print",
    currency: "CNY",
    machine_sn: "MACHINE_SN_001",
    timestamp: "1780497600",
    nonce: "n6Y8pK2z",
    ...overrides,
  };
  const sign = await signKexiaozhanPayload(params, MACHINE_KEY);
  return { ...params, sign };
}

Deno.test("normalizes and verifies Kexiaozhan redirect params", async () => {
  const params = normalizeKexiaozhanRedirectParams(await signedParams());

  assertEquals(
    buildKexiaozhanRedirectSigningString(params),
    "amount=12.30&currency=CNY&goods_name=Photo Print&machine_sn=MACHINE_SN_001&nonce=n6Y8pK2z&order_no=ORDER202606030001&out_trade_no=PAY202606030001&timestamp=1780497600",
  );
  assertEquals(
    await verifyKexiaozhanRedirectSignature(params, MACHINE_KEY),
    true,
  );
});

Deno.test("rejects missing and malformed redirect fields", () => {
  assertThrows(
    () => normalizeKexiaozhanRedirectParams({}),
    Error,
    "Missing Kexiaozhan field: order_no",
  );

  assertThrows(
    () =>
      normalizeKexiaozhanRedirectParams({
        order_no: "ORDER",
        out_trade_no: "PAY",
        amount: "-1.00",
        goods_name: "Case",
        currency: "CNY",
        machine_sn: "MACHINE",
        timestamp: "1780497600",
        nonce: "nonce",
        sign: "a".repeat(64),
      }),
    Error,
    "Invalid Kexiaozhan amount",
  );
});

Deno.test("rejects changed signed payloads", async () => {
  const params = normalizeKexiaozhanRedirectParams(await signedParams());
  const changed = normalizeKexiaozhanRedirectParams(
    await signedParams({ amount: "13.00" }),
  );

  assertEquals(sameKexiaozhanSignedPayload(params, params), true);
  assertEquals(sameKexiaozhanSignedPayload(params, changed), false);
});

Deno.test("detects stale and future handoff timestamps", () => {
  const now = new Date("2026-06-03T20:10:00Z");
  const fresh = validateKexiaozhanHandoffFreshness(
    { timestamp: String(Date.parse("2026-06-03T20:00:00Z") / 1000) },
    now,
    15 * 60,
  );
  assertEquals(fresh.expiresAt.toISOString(), "2026-06-03T20:15:00.000Z");

  assertThrows(
    () =>
      validateKexiaozhanHandoffFreshness(
        { timestamp: String(Date.parse("2026-06-03T19:54:59Z") / 1000) },
        now,
        15 * 60,
      ),
    Error,
    "expired",
  );

  assertThrows(
    () =>
      validateKexiaozhanHandoffFreshness(
        { timestamp: String(Date.parse("2026-06-03T20:16:00Z") / 1000) },
        now,
        15 * 60,
        5 * 60,
      ),
    Error,
    "future",
  );
});

Deno.test("extends the local checkout window only for deferred printing", () => {
  assertEquals(
    resolveKexiaozhanHandoffMaxAgeSeconds(
      KEXIAOZHAN_DEFERRED_HANDOFF_MAX_AGE_SECONDS,
      "deferredPrint",
    ),
    35 * 60,
  );
  assertEquals(
    resolveKexiaozhanHandoffMaxAgeSeconds(
      KEXIAOZHAN_DEFERRED_HANDOFF_MAX_AGE_SECONDS,
      "immediatePrint",
    ),
    KEXIAOZHAN_LEGACY_HANDOFF_MAX_AGE_SECONDS,
  );
  assertEquals(
    resolveKexiaozhanHandoffMaxAgeSeconds(10 * 60, null),
    10 * 60,
  );
});

Deno.test("rejects bad signatures", async () => {
  const params = normalizeKexiaozhanRedirectParams({
    ...(await signedParams()),
    sign: "0".repeat(64),
  });

  assertEquals(
    await verifyKexiaozhanRedirectSignature(params, MACHINE_KEY),
    false,
  );
  await assertRejects(
    () => verifyKexiaozhanRedirectSignature(params, ""),
    Error,
    "machineKey",
  );
});

Deno.test("requires a comma-separated machine SN allowlist", () => {
  assertEquals(isAllowedKexiaozhanMachineSn("1000450", ""), false);
  assertEquals(isAllowedKexiaozhanMachineSn("1000450", " , "), false);
  assertEquals(
    isAllowedKexiaozhanMachineSn("1000450", "1000001,1000450"),
    true,
  );
  assertEquals(isAllowedKexiaozhanMachineSn("1000450", "1000001"), false);
});

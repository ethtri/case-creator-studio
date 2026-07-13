import { assertEquals } from "jsr:@std/assert";
import { resolveKexiaozhanLiveNotifyGate } from "./kexiaozhan-notify-gate.ts";

Deno.test("resolveKexiaozhanLiveNotifyGate blocks when notify is disabled", () => {
  const result = resolveKexiaozhanLiveNotifyGate("PAY123", {
    enabled: "false",
  });

  assertEquals(result.allowed, false);
  assertEquals(result.reason, "KEXIAOZHAN_PAYMENT_NOTIFY_ENABLED is not true");
});

Deno.test("resolveKexiaozhanLiveNotifyGate allows all when enabled and no allowlist is configured", () => {
  const result = resolveKexiaozhanLiveNotifyGate("PAY123", {
    enabled: "true",
  });

  assertEquals(result.allowed, true);
  assertEquals(result.reason, null);
});

Deno.test("resolveKexiaozhanLiveNotifyGate blocks enabled notify when allowlist is required but missing", () => {
  const result = resolveKexiaozhanLiveNotifyGate("PAY123", {
    enabled: "true",
    requireAllowlist: "true",
  });

  assertEquals(result.allowed, false);
  assertEquals(result.reason, "live Kexiaozhan notify requires an allowlist");
});

Deno.test("resolveKexiaozhanLiveNotifyGate supports exact outTradeNo allowlist", () => {
  const result = resolveKexiaozhanLiveNotifyGate("PAY_REAL_2", {
    enabled: "yes",
    requireAllowlist: "true",
    allowedOutTradeNos: "PAY_REAL_1, PAY_REAL_2",
  });

  assertEquals(result.allowed, true);
  assertEquals(result.reason, null);
});

Deno.test("resolveKexiaozhanLiveNotifyGate supports outTradeNo prefix allowlist", () => {
  const result = resolveKexiaozhanLiveNotifyGate("PAYREAL202606160001", {
    enabled: "1",
    allowedPrefixes: "PAYREAL,PAYVENDOR",
  });

  assertEquals(result.allowed, true);
  assertEquals(result.reason, null);
});

Deno.test("resolveKexiaozhanLiveNotifyGate blocks enabled live notify when allowlist misses", () => {
  const result = resolveKexiaozhanLiveNotifyGate("PAYSYNTHETIC", {
    enabled: "true",
    allowedOutTradeNos: "PAY_REAL_1",
    allowedPrefixes: "PAYREAL",
  });

  assertEquals(result.allowed, false);
  assertEquals(
    result.reason,
    "outTradeNo is not allowlisted for live Kexiaozhan notify",
  );
});

import { assertEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import {
  isMissingSupabaseRowError,
  isSnapcaseCheckoutSession,
} from "./stripe-webhook-ownership.ts";

Deno.test("isSnapcaseCheckoutSession accepts explicit site checkout source", () => {
  assertEquals(
    isSnapcaseCheckoutSession({
      metadata: { source: "snapcase_site" },
    }),
    true,
  );
});

Deno.test("isSnapcaseCheckoutSession accepts legacy site checkout metadata", () => {
  assertEquals(
    isSnapcaseCheckoutSession({
      metadata: { itemsJson: '[{"variantId":"case-1"}]' },
    }),
    true,
  );
});

Deno.test("isSnapcaseCheckoutSession accepts Kexiaozhan checkout source", () => {
  assertEquals(
    isSnapcaseCheckoutSession({
      metadata: { source: "kexiaozhan" },
    }),
    true,
  );
});

Deno.test("isSnapcaseCheckoutSession accepts Kexiaozhan order metadata", () => {
  assertEquals(
    isSnapcaseCheckoutSession({
      client_reference_id: "PAY202606030001",
      metadata: {
        outTradeNo: "PAY202606030001",
        machineSn: "1000450",
      },
    }),
    true,
  );
});

Deno.test("isSnapcaseCheckoutSession rejects unrelated checkout sessions", () => {
  assertEquals(isSnapcaseCheckoutSession({ metadata: {} }), false);
  assertEquals(
    isSnapcaseCheckoutSession({
      client_reference_id: "external-ref",
      metadata: { source: "other_app" },
    }),
    false,
  );
});

Deno.test("isMissingSupabaseRowError only accepts no-row lookup errors", () => {
  assertEquals(isMissingSupabaseRowError({ code: "PGRST116" }), true);
  assertEquals(isMissingSupabaseRowError({ code: "42501" }), false);
  assertEquals(isMissingSupabaseRowError(null), false);
});

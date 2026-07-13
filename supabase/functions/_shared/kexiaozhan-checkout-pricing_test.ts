import { assertEquals, assertThrows } from "jsr:@std/assert";
import { resolveKexiaozhanCheckoutPricing } from "./kexiaozhan-checkout-pricing.ts";

Deno.test("Kexiaozhan checkout preserves normal paid pricing", () => {
  assertEquals(
    resolveKexiaozhanCheckoutPricing({
      unitAmountCents: 2999,
      shippingCents: 499,
      vendorAmount: "12.30",
      allowZeroTotalCheckout: false,
    }),
    {
      unitAmountCents: 2999,
      shippingCents: 499,
      totalCents: 3498,
      isNoCostCheckout: false,
    },
  );
});

Deno.test("Kexiaozhan checkout requires explicit server enablement for zero total", () => {
  assertThrows(
    () =>
      resolveKexiaozhanCheckoutPricing({
        unitAmountCents: 0,
        shippingCents: 0,
        vendorAmount: "0.00",
        allowZeroTotalCheckout: false,
      }),
    Error,
    "zero-total checkout is not enabled",
  );
});

Deno.test("Kexiaozhan checkout accepts an enabled zero-total vendor order", () => {
  assertEquals(
    resolveKexiaozhanCheckoutPricing({
      unitAmountCents: 0,
      shippingCents: 0,
      vendorAmount: "0",
      allowZeroTotalCheckout: true,
    }),
    {
      unitAmountCents: 0,
      shippingCents: 0,
      totalCents: 0,
      isNoCostCheckout: true,
    },
  );
});

Deno.test("Kexiaozhan checkout rejects a nonzero vendor amount for no-cost Checkout", () => {
  assertThrows(
    () =>
      resolveKexiaozhanCheckoutPricing({
        unitAmountCents: 0,
        shippingCents: 0,
        vendorAmount: "12.30",
        allowZeroTotalCheckout: true,
      }),
    Error,
    "zero-total checkout requires a zero vendor amount",
  );
});

Deno.test("Kexiaozhan checkout rejects a free item with paid shipping", () => {
  assertThrows(
    () =>
      resolveKexiaozhanCheckoutPricing({
        unitAmountCents: 0,
        shippingCents: 499,
        vendorAmount: "0.00",
        allowZeroTotalCheckout: true,
      }),
    Error,
    "unit amount must be greater than zero for paid checkout",
  );
});

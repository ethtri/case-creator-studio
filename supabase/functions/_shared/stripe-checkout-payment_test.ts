import { assertEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { isStripeCheckoutPaymentFulfilled } from "./stripe-checkout-payment.ts";

Deno.test("Stripe fulfilled checkout accepts paid sessions", () => {
  assertEquals(
    isStripeCheckoutPaymentFulfilled({
      checkoutStatus: "complete",
      paymentStatus: "paid",
      amountTotal: 1230,
    }),
    true,
  );
});

Deno.test("Stripe fulfilled checkout accepts only zero-total no-cost sessions", () => {
  assertEquals(
    isStripeCheckoutPaymentFulfilled({
      checkoutStatus: "complete",
      paymentStatus: "no_payment_required",
      amountTotal: 0,
    }),
    true,
  );
  assertEquals(
    isStripeCheckoutPaymentFulfilled({
      checkoutStatus: "complete",
      paymentStatus: "no_payment_required",
      amountTotal: 1230,
    }),
    false,
  );
});

Deno.test("Stripe fulfilled checkout rejects incomplete payment states", () => {
  assertEquals(
    isStripeCheckoutPaymentFulfilled({
      checkoutStatus: "complete",
      paymentStatus: "unpaid",
      amountTotal: 1230,
    }),
    false,
  );
  assertEquals(
    isStripeCheckoutPaymentFulfilled({
      checkoutStatus: "open",
      paymentStatus: null,
      amountTotal: 0,
    }),
    false,
  );
  assertEquals(
    isStripeCheckoutPaymentFulfilled({
      checkoutStatus: "open",
      paymentStatus: "paid",
      amountTotal: 1230,
    }),
    false,
  );
});

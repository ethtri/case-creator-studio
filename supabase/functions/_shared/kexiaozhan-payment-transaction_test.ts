import { assertEquals } from "jsr:@std/assert";
import { resolveKexiaozhanPaymentTransaction } from "./kexiaozhan-payment-transaction.ts";

const ORDER_ID = "a059d2eb-3ada-4dd5-8f32-a4fa88e1a873";

Deno.test("Kexiaozhan callback uses the Stripe PaymentIntent when present", () => {
  assertEquals(
    resolveKexiaozhanPaymentTransaction({
      orderId: ORDER_ID,
      orderStatus: "paid",
      orderTotal: 12.3,
      stripeSessionId: "cs_test_paid",
      stripePaymentIntentId: "pi_3Abc123Stripe456",
    }),
    {
      transactionId: "pi_3Abc123Stripe456",
      source: "stripe_payment_intent",
      stripePaymentIntentId: "pi_3Abc123Stripe456",
    },
  );
});

Deno.test("Kexiaozhan callback uses a deterministic Snapcase reference for paid zero-total orders", () => {
  assertEquals(
    resolveKexiaozhanPaymentTransaction({
      orderId: ORDER_ID,
      orderStatus: "paid",
      orderTotal: "0.00",
      stripeSessionId: "cs_test_no_cost",
      stripePaymentIntentId: null,
    }),
    {
      transactionId: "SCA059D2EB3ADA4DD58F32A4FA88E1A873",
      source: "snapcase_zero_amount",
      stripePaymentIntentId: null,
    },
  );
});

Deno.test("Kexiaozhan callback refuses synthetic transaction IDs for unverified zero-total orders", () => {
  assertEquals(
    resolveKexiaozhanPaymentTransaction({
      orderId: ORDER_ID,
      orderStatus: "pending",
      orderTotal: 0,
      stripeSessionId: "cs_test_no_cost",
      stripePaymentIntentId: null,
    }),
    null,
  );
  assertEquals(
    resolveKexiaozhanPaymentTransaction({
      orderId: ORDER_ID,
      orderStatus: "paid",
      orderTotal: 0.01,
      stripeSessionId: "cs_test_no_cost",
      stripePaymentIntentId: null,
    }),
    null,
  );
});

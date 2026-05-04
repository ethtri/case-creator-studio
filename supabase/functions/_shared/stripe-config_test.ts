import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { getStripeMode, getStripeSecretKey } from "./stripe-config.ts";

const ENV_KEYS = [
  "STRIPE_MODE",
  "STRIPE_SECRET_KEY",
  "STRIPE_SECRET_KEY_TEST",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_WEBHOOK_SECRET_TEST",
];

function withStripeEnv(
  values: Record<string, string | undefined>,
  test: () => void,
): void {
  const previous = new Map(ENV_KEYS.map((key) => [key, Deno.env.get(key)]));
  for (const key of ENV_KEYS) {
    const nextValue = values[key];
    if (nextValue === undefined) {
      Deno.env.delete(key);
    } else {
      Deno.env.set(key, nextValue);
    }
  }

  try {
    test();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) {
        Deno.env.delete(key);
      } else {
        Deno.env.set(key, value);
      }
    }
  }
}

Deno.test("Stripe test mode uses only the test secret key", () => {
  withStripeEnv({
    STRIPE_MODE: "test",
    STRIPE_SECRET_KEY: "sk_live_should_not_be_used",
    STRIPE_SECRET_KEY_TEST: "sk_test_123",
  }, () => {
    assertEquals(getStripeMode(), "test");
    assertEquals(getStripeSecretKey("TEST"), "sk_test_123");
  });
});

Deno.test("Stripe test mode fails closed without STRIPE_SECRET_KEY_TEST", () => {
  withStripeEnv({
    STRIPE_MODE: "test",
    STRIPE_SECRET_KEY: "sk_live_should_not_be_used",
  }, () => {
    assertThrows(
      () => getStripeSecretKey("TEST"),
      Error,
      "STRIPE_SECRET_KEY_TEST",
    );
  });
});

Deno.test("Stripe mode rejects key prefixes that do not match the mode", () => {
  withStripeEnv({
    STRIPE_MODE: "live",
    STRIPE_SECRET_KEY: "sk_test_wrong_mode",
  }, () => {
    assertThrows(
      () => getStripeSecretKey("TEST"),
      Error,
      "does not match live mode",
    );
  });
});

Deno.test("Stripe mode rejects unsupported mode values", () => {
  withStripeEnv({
    STRIPE_MODE: "sandbox",
    STRIPE_SECRET_KEY_TEST: "sk_test_123",
  }, () => {
    assertThrows(() => getStripeMode(), Error, "Unsupported STRIPE_MODE");
  });
});

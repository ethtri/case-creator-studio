import { assertEquals, assertThrows } from "jsr:@std/assert";
import {
  parseKexiaozhanCheckoutExpiryLeewaySeconds,
  shouldExpireKexiaozhanCheckout,
} from "./kexiaozhan-checkout-expiry.ts";

Deno.test("shouldExpireKexiaozhanCheckout expires active handoffs inside leeway", () => {
  const now = new Date("2026-06-17T12:00:00Z");

  assertEquals(
    shouldExpireKexiaozhanCheckout(
      {
        status: "checkout_created",
        expires_at: "2026-06-17T12:00:59Z",
      },
      now,
      60,
    ),
    true,
  );
  assertEquals(
    shouldExpireKexiaozhanCheckout(
      {
        status: "checkout_created",
        expires_at: "2026-06-17T12:01:01Z",
      },
      now,
      60,
    ),
    false,
  );
});

Deno.test("shouldExpireKexiaozhanCheckout ignores inactive or malformed handoffs", () => {
  const now = new Date("2026-06-17T12:00:00Z");

  assertEquals(
    shouldExpireKexiaozhanCheckout(
      { status: "paid", expires_at: "2026-06-17T12:00:01Z" },
      now,
      60,
    ),
    false,
  );
  assertEquals(
    shouldExpireKexiaozhanCheckout(
      { status: "checkout_created", expires_at: "not-a-date" },
      now,
      60,
    ),
    false,
  );
});

Deno.test("parseKexiaozhanCheckoutExpiryLeewaySeconds validates env text", () => {
  assertEquals(parseKexiaozhanCheckoutExpiryLeewaySeconds(undefined, 60), 60);
  assertEquals(parseKexiaozhanCheckoutExpiryLeewaySeconds("120", 60), 120);
  assertThrows(
    () => parseKexiaozhanCheckoutExpiryLeewaySeconds("-1", 60),
    Error,
    "non-negative integer",
  );
});

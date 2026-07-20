import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.190.0/testing/asserts.ts";
import {
  assertCheckoutQuantityAllowed,
  ONSHORE_MAX_UNITS_PER_CHECKOUT,
} from "./checkout-fulfillment.ts";

Deno.test("onshore checkout accepts one unit", () => {
  assertEquals(ONSHORE_MAX_UNITS_PER_CHECKOUT, 1);
  assertCheckoutQuantityAllowed("onshore_manual", 1);
});

Deno.test("onshore checkout rejects a parcel-unsafe quantity", () => {
  const error = assertThrows(
    () => assertCheckoutQuantityAllowed("onshore_manual", 2),
    Error,
  );
  assertEquals(
    error.message,
    "Onshore production currently supports one case per checkout. Please place separate orders for additional cases.",
  );
});

Deno.test("Printful retains the existing multi-unit behavior", () => {
  assertCheckoutQuantityAllowed("printful", 100);
});

Deno.test("invalid totals fail closed for every provider", () => {
  assertThrows(() => assertCheckoutQuantityAllowed("printful", 0));
  assertThrows(() => assertCheckoutQuantityAllowed("onshore_manual", 1.5));
});

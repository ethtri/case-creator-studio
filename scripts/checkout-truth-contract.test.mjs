import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import "./checkout-session-contract.test.mjs";

import {
  assertCheckoutQuantityAllowed,
  ONSHORE_MAX_UNITS_PER_CHECKOUT,
} from "../supabase/functions/_shared/checkout-fulfillment.ts";

const read = (path) => readFile(path, "utf8");

test("Stripe checkout paths omit unsupported delivery estimates", async () => {
  const [normal, vendor, fakeVendor, pricing] = await Promise.all([
    read("supabase/functions/create-checkout/index.ts"),
    read("supabase/functions/kexiaozhan-create-checkout/index.ts"),
    read("supabase/functions/fake-vendor-design-complete/index.ts"),
    read("supabase/functions/_shared/catalog-pricing.ts"),
  ]);

  for (const source of [normal, vendor, fakeVendor]) {
    assert.doesNotMatch(source, /delivery_estimate/);
    assert.match(source, /SNAPCASE_STANDARD_SHIPPING_DISPLAY_NAME/);
    assert.match(source, /automatic_tax:\s*\{\s*enabled:\s*false\s*\}/);
  }
  assert.match(
    pricing,
    /Standard shipping \(carrier transit begins after production\)/,
  );
});

test("onshore checkout fails closed above the current parcel evidence", () => {
  assert.equal(ONSHORE_MAX_UNITS_PER_CHECKOUT, 1);
  assert.doesNotThrow(() =>
    assertCheckoutQuantityAllowed("onshore_manual", 1)
  );
  assert.throws(
    () => assertCheckoutQuantityAllowed("onshore_manual", 2),
    /one case per checkout/i,
  );
  assert.doesNotThrow(() => assertCheckoutQuantityAllowed("printful", 100));
});

test("normal checkout resolves provider and quantity before Stripe creation", async () => {
  const source = await read("supabase/functions/create-checkout/index.ts");
  const providerIndex = source.indexOf(
    "const fulfillmentProvider = getFulfillmentProvider()",
  );
  const quantityIndex = source.indexOf(
    "assertCheckoutQuantityAllowed(fulfillmentProvider, totalQuantity)",
  );
  const stripeIndex = source.indexOf("stripe.checkout.sessions.create");

  assert.ok(providerIndex >= 0);
  assert.ok(quantityIndex > providerIndex);
  assert.ok(stripeIndex > quantityIndex);
  assert.match(source, /fulfillment_provider:\s*fulfillmentProvider/);
});

test("promotion behavior is explicit and has one normal entry point", async () => {
  const [normal, vendor, fakeVendor, vendorPage] = await Promise.all([
    read("supabase/functions/create-checkout/index.ts"),
    read("supabase/functions/kexiaozhan-create-checkout/index.ts"),
    read("supabase/functions/fake-vendor-design-complete/index.ts"),
    read("src/pages/KexiaozhanCheckout.tsx"),
  ]);

  assert.match(normal, /discounts:\s*\[\{\s*promotion_code:/);
  assert.match(normal, /allow_promotion_codes:\s*false/);
  assert.match(vendor, /allow_promotion_codes:\s*false/);
  assert.match(fakeVendor, /allow_promotion_codes:\s*false/);
  assert.match(
    vendorPage,
    /Promo codes are not available for this vendor-handoff checkout\./,
  );
});

test("public tax and production copy matches executable configuration", async () => {
  const [checkout, vendorCheckout, terms] = await Promise.all([
    read("src/pages/Checkout.tsx"),
    read("src/pages/KexiaozhanCheckout.tsx"),
    read("src/pages/Terms.tsx"),
  ]);

  assert.match(checkout, /<span>\$0\.00<\/span>/);
  assert.match(checkout, /does not add automatic sales tax/);
  assert.match(checkout, /Carrier transit begins after your/);
  assert.match(vendorCheckout, /Automatic sales tax is not currently added/);
  assert.match(vendorCheckout, /No delivery date is/);
  assert.match(terms, /does not add automatic sales tax/);
  assert.match(terms, /Production time varies/);
  assert.doesNotMatch(terms, /Taxes and shipping are calculated\s+at checkout/);
});

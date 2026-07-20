import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = (relativePath) =>
  readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

const [
  catalogSource,
  checkoutPageSource,
  checkoutFunctionSource,
  promoFunctionSource,
  kexiaozhanCheckoutSource,
] = await Promise.all([
  readSource("src/data/phoneVariants.ts"),
  readSource("src/pages/Checkout.tsx"),
  readSource("supabase/functions/create-checkout/index.ts"),
  readSource("supabase/functions/validate-promo/index.ts"),
  readSource("supabase/functions/kexiaozhan-create-checkout/index.ts"),
]);

test("all executable default pricing paths use the shared contract", () => {
  assert.match(catalogSource, /SNAPCASE_DEFAULT_PRODUCT_PRICE/);
  assert.equal(
    catalogSource.match(/price: SNAPCASE_DEFAULT_PRODUCT_PRICE/g)?.length,
    18,
  );
  assert.match(
    checkoutPageSource,
    /const SHIPPING_COST = SNAPCASE_DEFAULT_SHIPPING;/,
  );
  assert.match(
    checkoutFunctionSource,
    /price: SNAPCASE_DEFAULT_PRODUCT_PRICE,/,
  );
  assert.match(
    checkoutFunctionSource,
    /unit_amount: SNAPCASE_DEFAULT_PRODUCT_PRICE_CENTS,/,
  );
  assert.match(
    checkoutFunctionSource,
    /amount: SNAPCASE_DEFAULT_SHIPPING_CENTS,/,
  );
  assert.match(
    promoFunctionSource,
    /SNAPCASE_DEFAULT_PRODUCT_PRICE \* item\.quantity/,
  );
  assert.match(
    kexiaozhanCheckoutSource,
    /SNAPCASE_DEFAULT_PRODUCT_PRICE_CENTS/,
  );
  assert.match(
    kexiaozhanCheckoutSource,
    /SNAPCASE_DEFAULT_SHIPPING_CENTS/,
  );
});

test("browser-supplied item prices remain non-authoritative", () => {
  assert.match(
    checkoutFunctionSource,
    /const items = requestItems\.map\(\(item\) => \(\{\s*\.\.\.item,\s*price: SNAPCASE_DEFAULT_PRODUCT_PRICE,/s,
  );
  assert.doesNotMatch(
    checkoutFunctionSource,
    /unit_amount:\s*Math\.round\(item\.price \* 100\)/,
  );
});

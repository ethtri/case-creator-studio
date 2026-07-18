import assert from "node:assert/strict";
import test from "node:test";

import {
  formatCheckoutItemCount,
  getCheckoutLineTotal,
  getCheckoutUnitCount,
} from "../src/lib/checkout-review.ts";

test("checkout review counts units rather than cart lines", () => {
  assert.equal(getCheckoutUnitCount([{ quantity: 2 }]), 2);
  assert.equal(getCheckoutUnitCount([{ quantity: 2 }, { quantity: 1 }]), 3);
});

test("checkout review uses correct singular and plural item copy", () => {
  assert.equal(formatCheckoutItemCount(1), "1 item");
  assert.equal(formatCheckoutItemCount(2), "2 items");
});

test("checkout review keeps line-total math tied to unit price and quantity", () => {
  assert.equal(getCheckoutLineTotal(29.99, 1), 29.99);
  assert.equal(getCheckoutLineTotal(29.99, 2), 59.98);
});

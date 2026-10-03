import assert from "node:assert/strict";
import test from "node:test";
import { hasVisibleFocusRing } from "./focus-ring-contract.mjs";

test("focus checks accept visible v3 and v4 composed rings", () => {
  assert.equal(hasVisibleFocusRing("rgb(29, 114, 96) 0px 0px 0px 4px"), true);
  assert.equal(hasVisibleFocusRing("rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgb(29, 114, 96) 0px 0px 0px 4px"), true);
});

test("focus checks reject absent, transparent and decorative shadows", () => {
  for (const shadow of ["none", "rgba(0, 0, 0, 0) 0px 0px 0px 4px", "rgb(29, 114, 96) 0px 8px 30px -4px", "rgb(29, 114, 96) 0px 0px 40px 0px"]) {
    assert.equal(hasVisibleFocusRing(shadow), false);
  }
});

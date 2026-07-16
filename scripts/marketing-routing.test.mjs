import assert from "node:assert/strict";
import test from "node:test";

import { getMarketingPagePath } from "../src/lib/marketing-routing.ts";

test("does not create a new marketing page path for an internal design id", () => {
  const initialPath = getMarketingPagePath("/design/iphone-16", "");
  const hydratedPath = getMarketingPagePath(
    "/design/iphone-16",
    "?designId=6c00b46d-012b-4d9d-8329-4aa2327cf138"
  );

  assert.equal(initialPath, "/design/iphone-16");
  assert.equal(hydratedPath, initialPath);
});

test("retains query parameters that may identify a distinct marketing page", () => {
  assert.equal(
    getMarketingPagePath("/catalog", "?brand=Apple&designId=internal"),
    "/catalog?brand=Apple"
  );
});

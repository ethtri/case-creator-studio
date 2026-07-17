import assert from "node:assert/strict";
import test from "node:test";
import { normalizeRoutePath } from "../src/lib/route-path.ts";

test("route path normalization preserves root and canonical paths", () => {
  assert.equal(normalizeRoutePath("/"), "/");
  assert.equal(normalizeRoutePath("/custom-samsung-case"), "/custom-samsung-case");
});

test("route path normalization removes one or more trailing slashes", () => {
  assert.equal(normalizeRoutePath("/custom-samsung-case/"), "/custom-samsung-case");
  assert.equal(normalizeRoutePath("/custom-samsung-case///"), "/custom-samsung-case");
});

test("route path normalization fails empty input closed to root", () => {
  assert.equal(normalizeRoutePath(""), "/");
});

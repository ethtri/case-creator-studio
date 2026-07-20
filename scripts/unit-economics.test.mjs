import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { validateUnitEconomicsEvidence } from "./unit-economics.mjs";

const fixture = JSON.parse(
  await readFile(
    new URL(
      "./fixtures/onshore-unit-economics.synthetic.example.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

const cloneFixture = () => structuredClone(fixture);

test("accepts complete synthetic analysis without treating it as approval", () => {
  const result = validateUnitEconomicsEvidence(cloneFixture());
  assert.equal(result.ok, true, result.errors.join("\n"));
  assert.equal(result.summaries.length, 2);
  assert.equal(fixture.decision.type, "analysis_only");
  assert.equal(fixture.approval.status, "not_approved");
});

test("rejects a missing physical cost category", () => {
  const evidence = cloneFixture();
  delete evidence.products[0].costs.outboundShippingCents;
  const result = validateUnitEconomicsEvidence(evidence);
  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some((error) => error.includes("outboundShippingCents")),
  );
});

test("rejects claimed arithmetic drift", () => {
  const evidence = cloneFixture();
  evidence.products[0].claimed.contributionCents += 1;
  const result = validateUnitEconomicsEvidence(evidence);
  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some((error) => error.includes("claimed.contributionCents")),
  );
});

test("rejects a scenario below the contribution review floor", () => {
  const evidence = cloneFixture();
  evidence.products[0].costs.blankCaseCents += 1000;
  evidence.products[0].claimed.operatingCostCents += 1000;
  evidence.products[0].claimed.totalVariableCostCents += 1000;
  evidence.products[0].claimed.contributionCents -= 1000;
  evidence.products[0].claimed.contributionMarginBps = 1838;
  const result = validateUnitEconomicsEvidence(evidence);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("review floor")));
});

test("rejects an unapproved launch recommendation", () => {
  const evidence = cloneFixture();
  evidence.decision.type = "launch_approved";
  const result = validateUnitEconomicsEvidence(evidence);
  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some((error) => error.includes("physical_pilot")) &&
      result.errors.some((error) => error.includes("status=approved")),
  );
});

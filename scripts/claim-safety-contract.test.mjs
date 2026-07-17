import assert from "node:assert/strict";
import test from "node:test";
import {
  findUnsafeClaims,
  validatePublicClaims,
} from "./validate-claim-safety.mjs";

test("claim-safety contract catches representative unapproved claims", () => {
  const unsafeExamples = [
    "Made in USA",
    "Printed in the U.S.",
    "We print and ship in the U.S.",
    "Ships within 2-4 business days",
    "Premium Polycarbonate",
    "Impact-resistant polycarbonate",
    "Contact us within 30 days and we will make it right.",
  ];

  for (const example of unsafeExamples) {
    assert.ok(
      findUnsafeClaims(example).length > 0,
      `Expected the contract to reject: ${example}`,
    );
  }
});

test("claim-safety contract allows directly verifiable flow copy", () => {
  const safeExamples = [
    "Choose a supported phone model.",
    "Review your preview before checkout.",
    "Payments run through Stripe.",
    "Tracking is added when it becomes available.",
  ];

  for (const example of safeExamples) {
    assert.equal(
      findUnsafeClaims(example).length,
      0,
      `Expected the contract to allow: ${example}`,
    );
  }
});

test("current public source and built output satisfy the claim-safety contract", async () => {
  await validatePublicClaims();
});

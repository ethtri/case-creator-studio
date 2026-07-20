import assert from "node:assert/strict";
import { stat } from "node:fs/promises";
import test from "node:test";

import { phoneVariants } from "../src/data/phoneVariants.ts";

const expectedFinishSampleIds = [
  "iphone-17-pro-max",
  "iphone-17-pro",
  "iphone-17-air",
  "iphone-17",
];

test("every catalog variant has a packaged KeMore image asset", async () => {
  assert.equal(phoneVariants.length, 18);

  for (const variant of phoneVariants) {
    assert.match(variant.imageUrl, /^\/catalog\/kemore\/.+\.webp$/);
    assert.doesNotMatch(variant.imageUrl, /placeholder|mockup/i);

    const imageFile = new URL(`../public${variant.imageUrl}`, import.meta.url);
    const imageStat = await stat(imageFile);
    assert.ok(
      imageStat.size > 4_000,
      `${variant.id} image should be a substantive local asset`,
    );
  }
});

test("only iPhone 17 uses the clearly labeled KeMore finish sample", () => {
  const finishSampleIds = phoneVariants
    .filter((variant) => variant.imageRole === "finish-sample")
    .map((variant) => variant.id);

  assert.deepEqual(finishSampleIds, expectedFinishSampleIds);
  assert.equal(
    phoneVariants.filter((variant) => variant.imageRole === "device-reference")
      .length,
    14,
  );
});

import assert from "node:assert/strict";
import { stat } from "node:fs/promises";
import test from "node:test";

import { phoneVariants } from "../src/data/phoneVariants.ts";

const expectedOpenReferences = new Map([
  ["iphone-17-pro-max", "/catalog/commons/iphone-17-pro-max.jpg"],
  ["iphone-17-pro", "/catalog/commons/iphone-17-pro.jpg"],
  ["iphone-17-air", "/catalog/commons/iphone-air.jpg"],
  ["iphone-17", "/catalog/commons/iphone-17.jpg"],
]);

test("every catalog variant has a substantive packaged image asset", async () => {
  assert.equal(phoneVariants.length, 18);

  for (const variant of phoneVariants) {
    assert.match(
      variant.imageUrl,
      /^\/catalog\/(?:kemore\/.+\.webp|commons\/.+\.jpg)$/,
    );
    assert.doesNotMatch(variant.imageUrl, /placeholder|mockup|finish-sample/i);

    const imageFile = new URL(`../public${variant.imageUrl}`, import.meta.url);
    const imageStat = await stat(imageFile);
    assert.ok(
      imageStat.size > 4_000,
      `${variant.id} image should be a substantive local asset`,
    );
  }
});

test("iPhone 17 uses exact-model open references without a finish fallback", () => {
  const openReferences = phoneVariants.filter(
    (variant) => variant.imageRole === "open-reference",
  );

  assert.equal(openReferences.length, expectedOpenReferences.size);
  for (const variant of openReferences) {
    assert.equal(variant.imageUrl, expectedOpenReferences.get(variant.id));
    assert.equal(variant.imageWidth, 960);
    assert.ok((variant.imageHeight ?? 0) >= 720);
  }
  assert.equal(
    phoneVariants.filter((variant) => variant.imageRole === "device-reference")
      .length,
    14,
  );
  assert.equal(
    phoneVariants.find((variant) => variant.id === "iphone-17-air")?.model,
    "iPhone Air",
  );
});

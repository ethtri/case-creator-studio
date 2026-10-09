import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
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


test("catalog puts exact-model selection before inspiration without changing actions", async () => {
  const source = await readFile(new URL("../src/pages/Catalog.tsx", import.meta.url), "utf8");
  const gridIndex = source.indexOf('id="catalog-models"');
  const inspirationIndex = source.indexOf('aria-label="Pet photo case inspiration"');
  assert.ok(gridIndex >= 0);
  assert.ok(inspirationIndex >= 0);
  assert.ok(gridIndex < inspirationIndex);
  assert.match(source, /id="phone-search"/);
  assert.match(source, /aria-label="Filter by brand"/);
  assert.match(source, /catalog_view_details/);
  assert.match(source, /catalog_start_design/);
  assert.match(source, /href="#catalog-models"/);
});

test("Apple product facts reuse the approved policy and shared support identity", async () => {
  const source = await readFile(new URL("../src/pages/PhoneCaseSeo.tsx", import.meta.url), "utf8");
  const samsung = await readFile(new URL("../src/pages/SamsungPhotoLanding.tsx", import.meta.url), "utf8");
  for (const fact of ["Preview your design before adding it to your cart.", "Shipping is shown before payment. Production time varies."]) {
    assert.ok(source.includes(fact));
    assert.ok(samsung.includes(fact));
  }
  assert.match(source, /variant.brand === "Apple" && \(\s*<section\s*aria-label="Purchase details"/);
  assert.match(source, /mailto:\$\{SNAPCASE_EMAILS.support\}/);
  assert.match(source, /to="\/terms"/);
  assert.match(source, /const visiblePrice = formatProductPrice\(variant\)/);
});

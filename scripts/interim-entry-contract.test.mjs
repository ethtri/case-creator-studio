import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { phoneVariants } from "../src/data/phoneVariants.ts";
import {
  getCatalogResultCopy,
  getSharedCatalogPriceContext,
  HOME_PRIMARY_CTA,
  HOME_STARTING_MODELS,
} from "../src/lib/entry-page-contract.ts";

const indexSource = await readFile(
  new URL("../src/pages/Index.tsx", import.meta.url),
  "utf8",
);
const catalogSource = await readFile(
  new URL("../src/pages/Catalog.tsx", import.meta.url),
  "utf8",
);

test("entry-page CTA, starting-list, and shared price contracts are truthful", () => {
  assert.deepEqual(HOME_PRIMARY_CTA, {
    destination: "/catalog",
    label: "Choose your phone",
    placement: "home_hero",
  });
  assert.deepEqual(HOME_STARTING_MODELS, {
    itemListId: "home_starting_models",
    itemListName: "Starting models",
    placement: "home_starting_models",
  });
  assert.equal(
    getSharedCatalogPriceContext(phoneVariants),
    "Cases $29.99 USD",
  );
  assert.equal(
    getSharedCatalogPriceContext([
      phoneVariants[0],
      { ...phoneVariants[1], price: 30.99 },
    ]),
    null,
  );
});

test("catalog result copy covers zero, singular, and plural states", () => {
  assert.equal(getCatalogResultCopy(0), "0 phone models shown.");
  assert.equal(getCatalogResultCopy(1), "1 phone model shown.");
  assert.equal(getCatalogResultCopy(18), "18 phone models shown.");
});

test("public entry-page source removes unsupported merchandising language", () => {
  assert.doesNotMatch(indexSource, /\blatest\b/i);
  assert.doesNotMatch(indexSource, />\s*Popular models\s*</i);
  assert.match(indexSource, />\s*Choose a starting model\s*</);
  assert.match(indexSource, /Pick from supported iPhone and Samsung models\./);
});

test("catalog cards keep two routes and remove the always-selected overlay", () => {
  assert.doesNotMatch(catalogSource, /ring-accent|ring-opacity-0/);
  assert.match(catalogSource, /data-catalog-card=\{variant\.id\}/);
  assert.equal(
    catalogSource.match(/data-model-selection-cue="true"/g)?.length,
    1,
  );
  assert.match(catalogSource, /to=\{`\/phone-cases\/\$\{variant\.id\}`\}/);
  assert.match(catalogSource, /to=\{`\/design\/\$\{variant\.id\}`\}/);
  assert.match(catalogSource, /catalog_view_details/);
  assert.match(catalogSource, /catalog_start_design/);
  assert.match(catalogSource, /data-catalog-offer=\{variant\.id\}/);
  assert.match(catalogSource, /focus-within:border-cta/);
});

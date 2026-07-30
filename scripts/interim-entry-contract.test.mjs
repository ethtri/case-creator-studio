import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
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
const indexHtml = await readFile(
  new URL("../index.html", import.meta.url),
  "utf8",
);
const manifest = JSON.parse(
  await readFile(
    new URL("../public/site.webmanifest", import.meta.url),
    "utf8",
  ),
);

const brandedIconPaths = [
  "snapcase-favicon.svg",
  "snapcase-favicon-96.png",
  "snapcase-favicon.ico",
  "snapcase-apple-touch-icon.png",
];

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

test("home starting-model cards render the catalog device imagery", () => {
  assert.match(indexSource, /src=\{variant\.imageUrl\}/);
  assert.match(indexSource, /data-home-starting-model-image=\{variant\.id\}/);
  assert.match(indexSource, /phone not included/i);
  assert.doesNotMatch(indexSource, /w-20 h-40 rounded-2xl/);
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
  assert.match(catalogSource, />\s*Design case\s*</);
  assert.doesNotMatch(catalogSource, />\s*Choose model\s*</);
  assert.match(catalogSource, /data-catalog-offer=\{variant\.id\}/);
  assert.match(catalogSource, /focus-within:border-cta/);
});

test("browser metadata uses only Snapcase-named icon URLs", () => {
  assert.match(indexHtml, /href="\/snapcase-favicon\.svg"/);
  assert.match(indexHtml, /href="\/snapcase-favicon-96\.png"/);
  assert.match(indexHtml, /href="\/snapcase-favicon\.ico"/);
  assert.match(indexHtml, /href="\/snapcase-apple-touch-icon\.png"/);
  assert.match(indexHtml, /href="\/site\.webmanifest"/);
  assert.match(indexHtml, /name="theme-color" content="#120B1A"/);
  assert.doesNotMatch(indexHtml, /lovable/i);
});

test("Snapcase browser icons and manifest assets are packaged", async () => {
  for (const path of brandedIconPaths) {
    const iconFile = new URL(`../public/${path}`, import.meta.url);
    assert.ok((await stat(iconFile)).size > 0, `${path} is empty`);
  }

  assert.equal(manifest.name, "Snapcase");
  assert.equal(manifest.short_name, "Snapcase");
  assert.equal(manifest.theme_color, "#120B1A");
  assert.deepEqual(
    manifest.icons.map(({ src }) => src),
    ["/snapcase-favicon-96.png", "/brand/snapcase-mark-512.png"],
  );

  for (const { src } of manifest.icons) {
    const manifestIcon = new URL(`../public${src}`, import.meta.url);
    assert.ok((await stat(manifestIcon)).size > 0, `${src} is missing`);
  }
});

test("conventional root icons stay synchronized with branded URLs", async () => {
  const svgPairs = [["favicon.svg", "snapcase-favicon.svg"]];
  const binaryPairs = [
    ["favicon-96.png", "snapcase-favicon-96.png"],
    ["favicon.ico", "snapcase-favicon.ico"],
    ["apple-touch-icon.png", "snapcase-apple-touch-icon.png"],
  ];

  for (const [rootPath, brandedPath] of svgPairs) {
    const normalizeLineEndings = (value) => value.replaceAll("\r\n", "\n");
    assert.equal(
      normalizeLineEndings(
        await readFile(new URL(`../public/${rootPath}`, import.meta.url), "utf8"),
      ),
      normalizeLineEndings(
        await readFile(
          new URL(`../public/${brandedPath}`, import.meta.url),
          "utf8",
        ),
      ),
      `${rootPath} drifted from ${brandedPath}`,
    );
  }

  for (const [rootPath, brandedPath] of binaryPairs) {
    assert.deepEqual(
      await readFile(new URL(`../public/${rootPath}`, import.meta.url)),
      await readFile(new URL(`../public/${brandedPath}`, import.meta.url)),
      `${rootPath} drifted from ${brandedPath}`,
    );
  }
});

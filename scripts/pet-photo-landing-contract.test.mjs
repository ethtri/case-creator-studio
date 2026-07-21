import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appRoutesPath = new URL("../src/AppRoutes.tsx", import.meta.url);
const pagePath = new URL("../src/pages/SeoLanding.tsx", import.meta.url);
const routeLoadersPath = new URL("../src/route-loaders.ts", import.meta.url);
const seoRoutesPath = new URL("../src/data/seoRoutes.ts", import.meta.url);

test("pet photo landing is routed, prerendered, and buyer-useful", async () => {
  const [appRoutes, pageSource, routeLoaders, seoRoutes] = await Promise.all([
    readFile(appRoutesPath, "utf8"),
    readFile(pagePath, "utf8"),
    readFile(routeLoadersPath, "utf8"),
    readFile(seoRoutesPath, "utf8"),
  ]);

  const route = "/custom-phone-case/pet-photo-phone-case";
  assert.match(appRoutes, new RegExp(route));
  assert.match(routeLoaders, new RegExp(route));
  assert.match(seoRoutes, /Custom Pet Photo Phone Case \| Snapcase/);
  assert.match(
    seoRoutes,
    /Turn one favorite pet photo into a phone case you can carry every day\./,
  );
  assert.match(pageSource, /const isPetLanding/);
  assert.match(pageSource, /Pick a photo that reads clearly\./);
  assert.match(pageSource, /Confirm the exact phone model first\./);
  assert.match(pageSource, /Can I preview the design before ordering\?/);
  assert.match(pageSource, /"@type": "FAQPage"/);
  assert.match(
    pageSource,
    /Generic examples shown for photo-selection guidance\./,
  );
  assert.match(pageSource, /See all supported models/);
});

test("pet photo landing uses rights-safe local creative and one primary destination", async () => {
  const [pageSource, seoRoutes] = await Promise.all([
    readFile(pagePath, "utf8"),
    readFile(seoRoutesPath, "utf8"),
  ]);

  assert.match(
    pageSource,
    /\/marketing\/pet-photo-landing\/pet-photo-case-hero\.webp/,
  );
  assert.match(
    pageSource,
    /\/marketing\/pet-photo-landing\/clear-pet-photo-examples\.webp/,
  );
  assert.match(
    seoRoutes,
    /PET_PHOTO_IMAGE = `\$\{SITE_URL\}\/marketing\/pet-photo-landing\/pet-photo-case-hero\.webp`/,
  );
  assert.doesNotMatch(pageSource, /testimonial|five-star|best seller/i);
});

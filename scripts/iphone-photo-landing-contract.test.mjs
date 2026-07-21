import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const appRoutesPath = new URL("../src/AppRoutes.tsx", import.meta.url);
const pagePath = new URL("../src/pages/IphonePhotoLanding.tsx", import.meta.url);
const routeLoadersPath = new URL("../src/route-loaders.ts", import.meta.url);
const seoRoutesPath = new URL("../src/data/seoRoutes.ts", import.meta.url);
const heroPath = new URL(
  "../public/marketing/iphone-photo-landing/iphone-photo-case-hero.webp",
  import.meta.url,
);
const guidePath = new URL(
  "../public/marketing/iphone-photo-landing/photo-crop-guidance.webp",
  import.meta.url,
);

test("iPhone photo landing is routed, prerendered, and model-first", async () => {
  const [appRoutes, pageSource, routeLoaders, seoRoutes] = await Promise.all([
    readFile(appRoutesPath, "utf8"),
    readFile(pagePath, "utf8"),
    readFile(routeLoadersPath, "utf8"),
    readFile(seoRoutesPath, "utf8"),
  ]);

  const route = "/custom-phone-case/photo-case-for-new-phone";
  assert.match(appRoutes, new RegExp(route));
  assert.match(routeLoaders, new RegExp(route));
  assert.match(seoRoutes, /Custom iPhone Case with Photo \| Snapcase/);
  assert.match(
    seoRoutes,
    /A photo case for your new iPhone — matched to the exact model\./,
  );
  assert.match(pageSource, /Choose your iPhone/);
  assert.match(pageSource, /phoneVariants/);
  assert.match(pageSource, /variant\.brand === "Apple"/);
  assert.match(pageSource, /buildSeoLandingSelectionPayload/);
  assert.match(pageSource, /buildSeoLandingCtaPayload/);
  assert.match(pageSource, /"@type": "FAQPage"/);
  assert.match(pageSource, /Generic example shown for photo-selection guidance\./);
});

test("iPhone photo landing uses local rights-safe creative and approved claim language", async () => {
  const [pageSource, seoRoutes] = await Promise.all([
    readFile(pagePath, "utf8"),
    readFile(seoRoutesPath, "utf8"),
    access(heroPath),
    access(guidePath),
  ]);

  assert.match(
    pageSource,
    /\/marketing\/iphone-photo-landing\/iphone-photo-case-hero\.webp/,
  );
  assert.match(
    pageSource,
    /\/marketing\/iphone-photo-landing\/photo-crop-guidance\.webp/,
  );
  assert.match(
    seoRoutes,
    /IPHONE_PHOTO_IMAGE = `\$\{SITE_URL\}\/marketing\/iphone-photo-landing\/iphone-photo-case-hero\.webp`/,
  );
  assert.match(pageSource, /upload an image, add optional text/i);
  assert.doesNotMatch(
    pageSource,
    /testimonial|five-star|best seller|perfect fit|drop-proof|fast shipping/i,
  );
});

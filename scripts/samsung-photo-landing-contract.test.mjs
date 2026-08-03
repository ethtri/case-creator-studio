import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const appRoutesPath = new URL("../src/AppRoutes.tsx", import.meta.url);
const pagePath = new URL(
  "../src/pages/SamsungPhotoLanding.tsx",
  import.meta.url,
);
const routeLoadersPath = new URL("../src/route-loaders.ts", import.meta.url);
const seoRoutesPath = new URL("../src/data/seoRoutes.ts", import.meta.url);
const variantsPath = new URL("../src/data/phoneVariants.ts", import.meta.url);
const heroPath = new URL(
  "../src/assets/mockups/samsung-case-front.png",
  import.meta.url,
);

test("Samsung photo intent improves the one existing canonical route", async () => {
  const [appRoutes, pageSource, routeLoaders, seoRoutes, variants] =
    await Promise.all([
      readFile(appRoutesPath, "utf8"),
      readFile(pagePath, "utf8"),
      readFile(routeLoadersPath, "utf8"),
      readFile(seoRoutesPath, "utf8"),
      readFile(variantsPath, "utf8"),
    ]);

  const route = "/custom-samsung-case";
  assert.equal(appRoutes.split(`path="${route}"`).length - 1, 1);
  assert.match(appRoutes, /element={<SamsungPhotoLanding \/>}/);
  assert.match(routeLoaders, /loadSamsungPhotoLanding/);
  assert.match(
    routeLoaders,
    /routePath === "\/custom-samsung-case"\) return loadSamsungPhotoLanding\(\)/,
  );
  assert.match(
    seoRoutes,
    /Custom Samsung Galaxy Case with Photo \| Snapcase/,
  );
  assert.match(
    seoRoutes,
    /Design a custom Samsung Galaxy case with a photo—and start with the exact model\./,
  );
  assert.match(
    seoRoutes,
    /Design a custom Samsung Galaxy S24-series case with your photo, then review the crop and camera area in the preview before checkout\./,
  );
  assert.match(pageSource, /variant\.brand === "Samsung"/);
  assert.match(pageSource, /buildSeoLandingSelectionPayload/);
  assert.match(pageSource, /buildSeoLandingCtaPayload/);
  assert.match(pageSource, /"@type": "FAQPage"/);
  assert.match(pageSource, /id="galaxy-models"/);

  for (const model of ["Galaxy S24", "Galaxy S24+", "Galaxy S24 Ultra"]) {
    assert.match(variants, new RegExp(`model: "${model.replace("+", "\\+")}"`));
  }
});

test("Samsung page gives buyer-useful photo, crop, preview, and model guidance", async () => {
  const [pageSource, seoRoutes] = await Promise.all([
    readFile(pagePath, "utf8"),
    readFile(seoRoutesPath, "utf8"),
    access(heroPath),
  ]);

  assert.match(pageSource, /Choose one clear photo/);
  assert.match(pageSource, /Leave edge room/);
  assert.match(pageSource, /Check the camera area/);
  assert.match(pageSource, /selected model\s+controls the final preview/i);
  assert.match(
    pageSource,
    /Generic case reference shown for layout guidance\./,
  );
  assert.match(pageSource, /samsungCaseFront/);
  assert.match(
    seoRoutes,
    /page\.path === "\/custom-samsung-case"[\s\S]*Custom Samsung Galaxy Case with Photo/,
  );
  assert.doesNotMatch(pageSource, /src=["']https?:\/\//i);
  assert.doesNotMatch(
    pageSource,
    /testimonial|five-star|best seller|perfect fit|drop-proof|fast shipping|guaranteed/i,
  );
});

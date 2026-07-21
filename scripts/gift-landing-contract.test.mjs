import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pagePath = new URL("../src/pages/SeoLanding.tsx", import.meta.url);
const routesPath = new URL("../src/data/seoRoutes.ts", import.meta.url);

test("gift landing keeps one primary design path and removes its self-link", async () => {
  const [pageSource, routesSource] = await Promise.all([
    readFile(pagePath, "utf8"),
    readFile(routesPath, "utf8"),
  ]);

  assert.match(
    pageSource,
    /const isGiftLanding = page\.path === "\/gifts\/custom-phone-case"/,
  );
  assert.match(pageSource, /\{!isGiftLanding && \(/);
  assert.match(
    routesSource,
    /path: "\/gifts\/custom-phone-case"[\s\S]*cta: "Start designing"/,
  );
  assert.match(pageSource, /Confirm the exact phone model/);
  assert.match(pageSource, /"@type": "FAQPage"/);
  assert.match(pageSource, /variant\.brand === "Samsung"/);
});

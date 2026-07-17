import fs from "node:fs/promises";
import path from "node:path";

import { phoneVariants } from "../src/data/phoneVariants.ts";
import { buildAnalyticsItems } from "../src/lib/analytics-commerce.ts";
import { validateMerchantCatalog } from "./merchant-catalog-contract.mjs";

const DIST_PRODUCT_ROUTES = path.resolve("dist", "phone-cases");
const CHECKOUT_FUNCTION = path.resolve(
  "supabase",
  "functions",
  "create-checkout",
  "index.ts",
);
const SITE_URL = "https://www.snapcase.ai";

const checkoutSource = await fs.readFile(CHECKOUT_FUNCTION, "utf8");
const checkoutPrice = Number(
  checkoutSource.match(/const PRODUCT_PRICE = (\d+(?:\.\d+)?);/)?.[1],
);
const checkoutCurrency = checkoutSource.match(
  /price_data:\s*\{[\s\S]*?currency:\s*"([a-zA-Z]{3})"/,
)?.[1];

if (!Number.isFinite(checkoutPrice)) {
  throw new Error("Unable to read the server-controlled checkout product price.");
}
if (!checkoutCurrency) {
  throw new Error("Unable to read the server-controlled checkout currency.");
}

const routeEntries = await fs.readdir(DIST_PRODUCT_ROUTES, {
  withFileTypes: true,
});
const pages = new Map();
for (const entry of routeEntries) {
  if (!entry.isDirectory()) continue;
  const html = await fs.readFile(
    path.join(DIST_PRODUCT_ROUTES, entry.name, "index.html"),
    "utf8",
  );
  pages.set(entry.name, html);
}

const analyticsItems = buildAnalyticsItems(
  phoneVariants.map((variant) => ({ variant })),
);
const findings = validateMerchantCatalog({
  variants: phoneVariants,
  analyticsItems,
  checkoutPrice,
  checkoutCurrency,
  pages,
  siteUrl: SITE_URL,
});

if (findings.length > 0) {
  for (const finding of findings) {
    console.error(
      `[${finding.code}] ${finding.variantId}: ${finding.message}`,
    );
  }
  process.exitCode = 1;
} else {
  console.log(
    `Merchant catalog contract passed for ${phoneVariants.length} product routes.`,
  );
}

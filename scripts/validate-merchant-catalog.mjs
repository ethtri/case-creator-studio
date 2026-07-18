import fs from "node:fs/promises";
import path from "node:path";

import { phoneVariants } from "../src/data/phoneVariants.ts";
import { buildAnalyticsItems } from "../src/lib/analytics-commerce.ts";
import { validateMerchantCatalog } from "./merchant-catalog-contract.mjs";

const CHECKOUT_FUNCTION = path.resolve(
  "supabase",
  "functions",
  "create-checkout",
  "index.ts",
);
const SITE_URL = "https://www.snapcase.ai";

const collectIndexFiles = async (directory) => {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectIndexFiles(fullPath)));
    } else if (entry.isFile() && entry.name === "index.html") {
      files.push(fullPath);
    }
  }
  return files;
};

const routeFromFile = (file) => {
  const relativeDirectory = path
    .relative(path.resolve("dist"), path.dirname(file))
    .replaceAll("\\", "/");
  return relativeDirectory ? `/${relativeDirectory}` : "/";
};

const checkoutSource = await fs.readFile(CHECKOUT_FUNCTION, "utf8");
const checkoutPrice = Number(
  checkoutSource.match(/const PRODUCT_PRICE = (\d+(?:\.\d+)?);/)?.[1],
);
const checkoutCurrency = checkoutSource.match(
  /price_data:\s*\{[\s\S]*?currency:\s*"([a-zA-Z]{3})"/,
)?.[1];

if (!Number.isFinite(checkoutPrice)) {
  throw new Error(
    "Unable to read the server-controlled checkout product price.",
  );
}
if (!checkoutCurrency) {
  throw new Error("Unable to read the server-controlled checkout currency.");
}

const indexFiles = await collectIndexFiles(path.resolve("dist"));
const internalPages = new Map();
for (const file of indexFiles) {
  internalPages.set(routeFromFile(file), await fs.readFile(file, "utf8"));
}

const pages = new Map();
for (const [route, html] of internalPages) {
  const variantId = route.match(/^\/phone-cases\/([^/]+)$/)?.[1];
  if (variantId) pages.set(variantId, html);
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
  internalPages,
  siteUrl: SITE_URL,
});

if (findings.length > 0) {
  for (const finding of findings) {
    console.error(`[${finding.code}] ${finding.variantId}: ${finding.message}`);
  }
  process.exitCode = 1;
} else {
  console.log(
    `Merchant catalog contract passed for ${phoneVariants.length} product routes.`,
  );
}

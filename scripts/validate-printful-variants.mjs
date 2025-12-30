import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as ts from "typescript";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const variantsPath = path.join(repoRoot, "src", "data", "phoneVariants.ts");

const PRODUCT_ID_BY_BRAND = {
  apple: 683,
  samsung: 684,
};

const loadEnvFile = (filePath) => {
  if (!fs.existsSync(filePath)) return {};
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  const values = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [key, ...rest] = trimmed.split("=");
    if (!key) continue;
    const rawValue = rest.join("=").trim();
    const value = rawValue.replace(/^"(.*)"$/, "$1");
    values[key] = value;
  }
  return values;
};

const envFileValues = loadEnvFile(path.join(repoRoot, ".env"));
const env = { ...envFileValues, ...process.env };
const apiKey = env.PRINTFUL_API_KEY;
const storeId = env.PRINTFUL_STORE_ID;

if (!apiKey) {
  console.error("Missing PRINTFUL_API_KEY. Add it to .env or your environment.");
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${apiKey}`,
  "Content-Type": "application/json",
};

if (storeId) {
  headers["X-PF-Store-ID"] = storeId;
}

const getResult = (payload) => payload?.result ?? payload?.data ?? payload;

const readPhoneVariants = () => {
  const sourceText = fs.readFileSync(variantsPath, "utf8");
  const sourceFile = ts.createSourceFile(
    variantsPath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );

  let arrayNode = null;
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(sourceFile) === "phoneVariants") {
      if (node.initializer && ts.isArrayLiteralExpression(node.initializer)) {
        arrayNode = node.initializer;
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  if (!arrayNode) {
    throw new Error("Unable to locate phoneVariants array in src/data/phoneVariants.ts.");
  }

  const variants = [];
  for (const element of arrayNode.elements) {
    if (!ts.isObjectLiteralExpression(element)) continue;
    const variant = {};
    for (const prop of element.properties) {
      if (!ts.isPropertyAssignment(prop)) continue;
      const name = prop.name.getText(sourceFile).replace(/['"]/g, "");
      const valueNode = prop.initializer;
      if (ts.isStringLiteral(valueNode) || ts.isNoSubstitutionTemplateLiteral(valueNode)) {
        variant[name] = valueNode.text;
      } else if (ts.isNumericLiteral(valueNode)) {
        variant[name] = Number(valueNode.text);
      }
    }
    if (variant.id && variant.printfulVariantId) {
      variants.push(variant);
    }
  }

  return variants;
};

const fetchJson = async (url) => {
  const response = await fetch(url, { headers });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`Printful request failed (${response.status}): ${payload?.error?.message ?? response.statusText}`);
  }
  return getResult(payload);
};

const fetchProductSizes = async (productId) => {
  const data = await fetchJson(`https://api.printful.com/v2/catalog-products/${productId}`);
  const sizes = Array.isArray(data?.sizes) ? data.sizes : [];
  return sizes;
};

const fetchVariantDetails = async (variantId) => {
  const data = await fetchJson(`https://api.printful.com/v2/catalog-variants/${variantId}`);
  return data ?? {};
};

const main = async () => {
  const variants = readPhoneVariants();
  const productIds = Array.from(
    new Set(
      variants
        .map((variant) => PRODUCT_ID_BY_BRAND[String(variant.brand ?? "").toLowerCase()])
        .filter(Boolean)
    )
  );

  const sizesByProduct = new Map();
  for (const productId of productIds) {
    const sizes = await fetchProductSizes(productId);
    sizesByProduct.set(productId, new Set(sizes));
  }

  const failures = [];
  const warnings = [];

  for (const variant of variants) {
    const brandKey = String(variant.brand ?? "").toLowerCase();
    const productId = PRODUCT_ID_BY_BRAND[brandKey];
    if (!productId) {
      warnings.push(`Skipping ${variant.id}: no productId mapping for brand "${variant.brand}".`);
      continue;
    }

    const expectedSize = variant.edmSizeName ?? variant.model;
    const sizeSet = sizesByProduct.get(productId);
    if (expectedSize && sizeSet && !sizeSet.has(expectedSize)) {
      failures.push(
        `Size mismatch for ${variant.id}: "${expectedSize}" not found in Printful sizes for product ${productId}.`
      );
    }

    const details = await fetchVariantDetails(variant.printfulVariantId);
    if (details?.catalog_product_id && details.catalog_product_id !== productId) {
      failures.push(
        `Variant ${variant.id} (${variant.printfulVariantId}) belongs to product ${details.catalog_product_id}, expected ${productId}.`
      );
    }
    if (expectedSize && details?.size && details.size !== expectedSize) {
      failures.push(
        `Variant ${variant.id} (${variant.printfulVariantId}) size "${details.size}" does not match "${expectedSize}".`
      );
    }
  }

  for (const warning of warnings) {
    console.warn(`Warning: ${warning}`);
  }

  if (failures.length > 0) {
    console.error("Printful variant validation failed:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log("Printful variant validation passed.");
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

const getMatches = (value, pattern) =>
  [...value.matchAll(pattern)].map((match) => match[1]);

const getJsonLd = (html) =>
  getMatches(
    html,
    /<script\s+type="application\/ld\+json">(.*?)<\/script>/gs,
  ).flatMap((value) => {
    try {
      return [JSON.parse(value)];
    } catch {
      return [];
    }
  });

const decodeHtml = (value) =>
  value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&#39;", "'");

const textContent = (html) =>
  decodeHtml(html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim());

const absoluteUrl = (value, pageUrl) => new URL(value, pageUrl).href;

export const extractVisibleBreadcrumbs = (html, pageUrl) => {
  const navigation = html.match(
    /<nav\b(?=[^>]*\bdata-product-breadcrumb(?:=|[\s>]))[^>]*>(.*?)<\/nav>/s,
  )?.[1];

  if (!navigation) return [];

  return [...navigation.matchAll(
    /<li\b[^>]*data-breadcrumb-position="(\d+)"[^>]*>(.*?)<\/li>/gs,
  )]
    .map((match) => {
      const position = Number(match[1]);
      const content = match[2];
      const href = content.match(/<a\b[^>]*href="([^"]+)"/)?.[1];

      return {
        position,
        name: textContent(content),
        item: href ? absoluteUrl(decodeHtml(href), pageUrl) : pageUrl,
      };
    })
    .sort((left, right) => left.position - right.position);
};

const compareBreadcrumbs = (findings, variantId, source, actual, expected) => {
  if (actual.length !== expected.length) {
    findings.push({
      code: `${source}_breadcrumb_count`,
      variantId,
      message: `${source} has ${actual.length} breadcrumbs; expected ${expected.length}`,
    });
    return;
  }

  expected.forEach((expectedItem, index) => {
    const actualItem = actual[index];
    if (actualItem.position !== expectedItem.position) {
      findings.push({
        code: `${source}_breadcrumb_position`,
        variantId,
        message: `${source} breadcrumb ${index + 1} has position ${actualItem.position}`,
      });
    }
    if (actualItem.name !== expectedItem.name) {
      findings.push({
        code: `${source}_breadcrumb_name`,
        variantId,
        message:
          `${source} breadcrumb ${index + 1} is "${actualItem.name}"; expected "${expectedItem.name}"`,
      });
    }
    if (actualItem.item !== expectedItem.item) {
      findings.push({
        code: `${source}_breadcrumb_url`,
        variantId,
        message:
          `${source} breadcrumb ${index + 1} uses ${actualItem.item}; expected ${expectedItem.item}`,
      });
    }
  });
};

export const validateMerchantCatalog = ({
  variants,
  analyticsItems,
  checkoutPrice,
  checkoutCurrency,
  pages,
  siteUrl,
}) => {
  const findings = [];
  const variantIds = new Set();
  const analyticsById = new Map(
    analyticsItems.map((item) => [item.item_id, item]),
  );

  for (const variant of variants) {
    if (variantIds.has(variant.id)) {
      findings.push({
        code: "duplicate_variant_id",
        variantId: variant.id,
        message: `Canonical catalog contains duplicate ID ${variant.id}`,
      });
    }
    variantIds.add(variant.id);

    if (variant.price !== checkoutPrice) {
      findings.push({
        code: "checkout_price_drift",
        variantId: variant.id,
        message:
          `Catalog price ${variant.price.toFixed(2)} differs from server checkout price ${checkoutPrice.toFixed(2)}`,
      });
    }
    if (variant.currency.toLowerCase() !== checkoutCurrency.toLowerCase()) {
      findings.push({
        code: "checkout_currency_drift",
        variantId: variant.id,
        message:
          `Catalog currency ${variant.currency} differs from server checkout currency ${checkoutCurrency}`,
      });
    }

    const analyticsItem = analyticsById.get(variant.id);
    if (!analyticsItem) {
      findings.push({
        code: "missing_analytics_item",
        variantId: variant.id,
        message: `No analytics item was generated for ${variant.id}`,
      });
    } else {
      if (analyticsItem.item_id !== variant.id) {
        findings.push({
          code: "analytics_item_id_drift",
          variantId: variant.id,
          message:
            `Analytics item ID ${analyticsItem.item_id} differs from canonical ID ${variant.id}`,
        });
      }
      if (analyticsItem.price !== variant.price) {
        findings.push({
          code: "analytics_price_drift",
          variantId: variant.id,
          message:
            `Analytics price ${analyticsItem.price} differs from catalog price ${variant.price}`,
        });
      }
      if (
        analyticsItem.item_brand !== variant.brand ||
        analyticsItem.item_variant !== variant.model
      ) {
        findings.push({
          code: "analytics_identity_drift",
          variantId: variant.id,
          message: `Analytics brand/model differs from the canonical catalog`,
        });
      }
    }

    const pageUrl = `${siteUrl}/phone-cases/${variant.id}`;
    const html = pages.get(variant.id);
    if (!html) {
      findings.push({
        code: "missing_product_page",
        variantId: variant.id,
        message: `Missing prerendered page for ${pageUrl}`,
      });
      continue;
    }

    const jsonLd = getJsonLd(html);
    const product = jsonLd.find((value) => value?.["@type"] === "Product");
    if (!product) {
      findings.push({
        code: "missing_product_json_ld",
        variantId: variant.id,
        message: `Missing Product JSON-LD`,
      });
    } else {
      if (product.productID !== variant.id) {
        findings.push({
          code: "structured_product_id_drift",
          variantId: variant.id,
          message:
            `Product JSON-LD productID ${product.productID ?? "(missing)"} differs from ${variant.id}`,
        });
      }
      if (Number(product.offers?.price) !== variant.price) {
        findings.push({
          code: "structured_price_drift",
          variantId: variant.id,
          message:
            `Product JSON-LD price ${product.offers?.price ?? "(missing)"} differs from ${variant.price.toFixed(2)}`,
        });
      }
      if (product.offers?.priceCurrency !== variant.currency) {
        findings.push({
          code: "structured_currency_drift",
          variantId: variant.id,
          message:
            `Product JSON-LD currency ${product.offers?.priceCurrency ?? "(missing)"} differs from ${variant.currency}`,
        });
      }
      if (Object.hasOwn(product.offers ?? {}, "availability")) {
        findings.push({
          code: "unverified_availability",
          variantId: variant.id,
          message:
            `Product JSON-LD publishes availability without a verified inventory source`,
        });
      }
    }

    const expectedBreadcrumbs = [
      { position: 1, name: "Home", item: `${siteUrl}/` },
      { position: 2, name: "Phone cases", item: `${siteUrl}/catalog` },
      {
        position: 3,
        name: `${variant.model} custom case`,
        item: pageUrl,
      },
    ];
    const structuredBreadcrumb = jsonLd.find(
      (value) => value?.["@type"] === "BreadcrumbList",
    );
    const structuredItems = Array.isArray(structuredBreadcrumb?.itemListElement)
      ? structuredBreadcrumb.itemListElement.map((item) => ({
          position: item.position,
          name: item.name,
          item: item.item,
        }))
      : [];
    const visibleItems = extractVisibleBreadcrumbs(html, pageUrl);

    compareBreadcrumbs(
      findings,
      variant.id,
      "structured",
      structuredItems,
      expectedBreadcrumbs,
    );
    compareBreadcrumbs(
      findings,
      variant.id,
      "visible",
      visibleItems,
      expectedBreadcrumbs,
    );
  }

  for (const item of analyticsItems) {
    if (!variantIds.has(item.item_id)) {
      findings.push({
        code: "unknown_analytics_item",
        variantId: item.item_id,
        message: `Analytics emitted unknown catalog ID ${item.item_id}`,
      });
    }
  }

  for (const pageId of pages.keys()) {
    if (!variantIds.has(pageId)) {
      findings.push({
        code: "unknown_product_page",
        variantId: pageId,
        message: `Prerendered product route has unknown catalog ID ${pageId}`,
      });
    }
  }

  return findings;
};

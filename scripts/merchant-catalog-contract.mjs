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
  decodeHtml(
    html
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim(),
  );

const absoluteUrl = (value, pageUrl) => new URL(value, pageUrl).href;

const getAttribute = (tag, name) =>
  decodeHtml(tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] ?? "");

const getVisibleOffer = (html) => {
  const offerTags = [
    ...html.matchAll(
      /<([a-z][\w:-]*)\b(?=[^>]*\bdata-product-offer="true")[^>]*>/gi,
    ),
  ];

  if (offerTags.length !== 1) {
    return { count: offerTags.length, offer: null };
  }

  const match = offerTags[0];
  const tagName = match[1];
  const openingTag = match[0];
  const contentStart = (match.index ?? 0) + openingTag.length;
  const contentEnd = html.indexOf(`</${tagName}>`, contentStart);
  const content = contentEnd >= 0 ? html.slice(contentStart, contentEnd) : "";

  return {
    count: 1,
    offer: {
      productId: getAttribute(openingTag, "data-product-id"),
      price: getAttribute(openingTag, "data-price"),
      currency: getAttribute(openingTag, "data-currency"),
      itemCondition: getAttribute(openingTag, "data-item-condition"),
      text: textContent(content),
    },
  };
};

const getProductMockup = (html) => {
  const matches = [
    ...html.matchAll(/<img\b(?=[^>]*\bdata-product-mockup="true")[^>]*>/gi),
  ];

  if (matches.length !== 1) {
    return { count: matches.length, mockup: null };
  }

  const tag = matches[0][0];
  return {
    count: 1,
    mockup: {
      alt: getAttribute(tag, "alt"),
      width: Number(getAttribute(tag, "width")),
      height: Number(getAttribute(tag, "height")),
    },
  };
};

const getProductMetadata = (html) => ({
  titles: getMatches(html, /<title>(.*?)<\/title>/gs).map(textContent),
  descriptions: getMatches(
    html,
    /<meta\s+name="description"\s+content="([^"]*)"\s*\/?>/g,
  ).map(decodeHtml),
  canonicals: getMatches(
    html,
    /<link\s+rel="canonical"\s+href="([^"]*)"\s*\/?>/g,
  ).map(decodeHtml),
});

const normalizePath = (value) => {
  if (value === "/") return value;
  return value.replace(/\/+$/, "");
};

export const validateProductLinkGraph = ({
  variants,
  internalPages,
  siteUrl,
}) => {
  const findings = [];
  const knownIds = new Set(variants.map((variant) => variant.id));
  const inboundSources = new Map(
    variants.map((variant) => [variant.id, new Set()]),
  );

  for (const [sourcePath, html] of internalPages) {
    for (const match of html.matchAll(/<a\b[^>]*\bhref="([^"]+)"[^>]*>/gi)) {
      let target;
      try {
        target = new URL(decodeHtml(match[1]), `${siteUrl}${sourcePath}`);
      } catch {
        continue;
      }

      if (target.origin !== new URL(siteUrl).origin) continue;
      const targetPath = normalizePath(target.pathname);
      const targetId = targetPath.match(/^\/phone-cases\/([^/]+)$/)?.[1];
      if (!targetId) continue;

      if (!knownIds.has(targetId)) {
        findings.push({
          code: "unknown_internal_product_link",
          variantId: targetId,
          message: `${sourcePath} links to unsupported product route ${targetPath}`,
        });
        continue;
      }

      if (normalizePath(sourcePath) !== targetPath) {
        inboundSources.get(targetId).add(normalizePath(sourcePath));
      }
    }
  }

  for (const variant of variants) {
    if (inboundSources.get(variant.id).size === 0) {
      findings.push({
        code: "orphan_product_page",
        variantId: variant.id,
        message: `No crawlable internal page links to /phone-cases/${variant.id}`,
      });
    }
  }

  return findings;
};

export const extractVisibleBreadcrumbs = (html, pageUrl) => {
  const navigation = html.match(
    /<nav\b(?=[^>]*\bdata-product-breadcrumb(?:=|[\s>]))[^>]*>(.*?)<\/nav>/s,
  )?.[1];

  if (!navigation) return [];

  return [
    ...navigation.matchAll(
      /<li\b[^>]*data-breadcrumb-position="(\d+)"[^>]*>(.*?)<\/li>/gs,
    ),
  ]
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
        message: `${source} breadcrumb ${index + 1} is "${actualItem.name}"; expected "${expectedItem.name}"`,
      });
    }
    if (actualItem.item !== expectedItem.item) {
      findings.push({
        code: `${source}_breadcrumb_url`,
        variantId,
        message: `${source} breadcrumb ${index + 1} uses ${actualItem.item}; expected ${expectedItem.item}`,
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
  internalPages,
  siteUrl,
}) => {
  const findings = [];
  const variantIds = new Set();
  const canonicalOwners = new Map();
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
        message: `Catalog price ${variant.price.toFixed(2)} differs from server checkout price ${checkoutPrice.toFixed(2)}`,
      });
    }
    if (variant.currency.toLowerCase() !== checkoutCurrency.toLowerCase()) {
      findings.push({
        code: "checkout_currency_drift",
        variantId: variant.id,
        message: `Catalog currency ${variant.currency} differs from server checkout currency ${checkoutCurrency}`,
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
          message: `Analytics item ID ${analyticsItem.item_id} differs from canonical ID ${variant.id}`,
        });
      }
      if (analyticsItem.price !== variant.price) {
        findings.push({
          code: "analytics_price_drift",
          variantId: variant.id,
          message: `Analytics price ${analyticsItem.price} differs from catalog price ${variant.price}`,
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

    const metadata = getProductMetadata(html);
    if (metadata.titles.length !== 1 || !metadata.titles[0]) {
      findings.push({
        code: "invalid_product_title",
        variantId: variant.id,
        message: `Product page must publish exactly one non-empty title`,
      });
    }
    if (
      metadata.descriptions.length !== 1 ||
      !metadata.descriptions[0].trim()
    ) {
      findings.push({
        code: "invalid_product_description",
        variantId: variant.id,
        message: `Product page must publish exactly one non-empty description`,
      });
    }
    if (metadata.canonicals.length !== 1 || !metadata.canonicals[0]) {
      findings.push({
        code: "invalid_product_canonical",
        variantId: variant.id,
        message: `Product page must publish exactly one non-empty canonical URL`,
      });
    } else {
      const canonical = metadata.canonicals[0];
      const expectedCanonical = `${siteUrl}/phone-cases/${variant.id}`;
      if (canonical !== expectedCanonical) {
        findings.push({
          code: "product_canonical_drift",
          variantId: variant.id,
          message: `Product canonical ${canonical} differs from ${expectedCanonical}`,
        });
      }
      const existingOwner = canonicalOwners.get(canonical);
      if (existingOwner) {
        findings.push({
          code: "duplicate_product_canonical",
          variantId: variant.id,
          message: `Product canonical ${canonical} is also published by ${existingOwner}`,
        });
      } else {
        canonicalOwners.set(canonical, variant.id);
      }
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
          message: `Product JSON-LD productID ${product.productID ?? "(missing)"} differs from ${variant.id}`,
        });
      }
      if (Number(product.offers?.price) !== variant.price) {
        findings.push({
          code: "structured_price_drift",
          variantId: variant.id,
          message: `Product JSON-LD price ${product.offers?.price ?? "(missing)"} differs from ${variant.price.toFixed(2)}`,
        });
      }
      if (product.offers?.priceCurrency !== variant.currency) {
        findings.push({
          code: "structured_currency_drift",
          variantId: variant.id,
          message: `Product JSON-LD currency ${product.offers?.priceCurrency ?? "(missing)"} differs from ${variant.currency}`,
        });
      }
      if (Object.hasOwn(product.offers ?? {}, "availability")) {
        findings.push({
          code: "unverified_availability",
          variantId: variant.id,
          message: `Product JSON-LD publishes availability without a verified inventory source`,
        });
      }
    }

    const visibleOffer = getVisibleOffer(html);
    if (visibleOffer.count !== 1 || !visibleOffer.offer) {
      findings.push({
        code: "missing_visible_offer",
        variantId: variant.id,
        message: `Product page has ${visibleOffer.count} machine-testable visible offers; expected 1`,
      });
    } else {
      const expectedFormattedPrice = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: variant.currency,
      }).format(variant.price);

      if (visibleOffer.offer.productId !== variant.id) {
        findings.push({
          code: "visible_offer_id_drift",
          variantId: variant.id,
          message: `Visible offer ID ${visibleOffer.offer.productId || "(missing)"} differs from ${variant.id}`,
        });
      }
      if (Number(visibleOffer.offer.price) !== variant.price) {
        findings.push({
          code: "visible_price_drift",
          variantId: variant.id,
          message: `Visible offer price ${visibleOffer.offer.price || "(missing)"} differs from ${variant.price.toFixed(2)}`,
        });
      }
      if (visibleOffer.offer.currency !== variant.currency) {
        findings.push({
          code: "visible_currency_drift",
          variantId: variant.id,
          message: `Visible offer currency ${visibleOffer.offer.currency || "(missing)"} differs from ${variant.currency}`,
        });
      }
      if (
        !visibleOffer.offer.text.includes(expectedFormattedPrice) ||
        !visibleOffer.offer.text.includes(variant.currency)
      ) {
        findings.push({
          code: "visible_offer_text_drift",
          variantId: variant.id,
          message: `Visible offer text must include ${expectedFormattedPrice} and ${variant.currency}`,
        });
      }
      if (
        product?.offers?.itemCondition &&
        (visibleOffer.offer.itemCondition !== product.offers.itemCondition ||
          !/\bnew\b/i.test(visibleOffer.offer.text))
      ) {
        findings.push({
          code: "hidden_only_item_condition",
          variantId: variant.id,
          message: `Product JSON-LD itemCondition is not supported by matching visible offer content`,
        });
      }
    }

    const productMockup = getProductMockup(html);
    if (productMockup.count !== 1 || !productMockup.mockup) {
      findings.push({
        code: "missing_product_mockup_contract",
        variantId: variant.id,
        message: `Product page has ${productMockup.count} marked mockup images; expected 1`,
      });
    } else {
      if (productMockup.mockup.width <= 0 || productMockup.mockup.height <= 0) {
        findings.push({
          code: "missing_mockup_dimensions",
          variantId: variant.id,
          message: `Product mockup must include positive intrinsic dimensions`,
        });
      }
      if (!/\billustration\b/i.test(productMockup.mockup.alt)) {
        findings.push({
          code: "inaccurate_mockup_alt",
          variantId: variant.id,
          message: `Product mockup alt text must identify the non-photographic illustration`,
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

  if (internalPages) {
    findings.push(
      ...validateProductLinkGraph({
        variants,
        internalPages,
        siteUrl,
      }),
    );
  }

  return findings;
};

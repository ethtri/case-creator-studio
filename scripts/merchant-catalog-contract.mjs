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

const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);
const RESPONSIVE_PREFIX = /^(?:sm|md|lg|xl|2xl):/;
const VISIBLE_DISPLAY_CLASS =
  /^(?:sm|md|lg|xl|2xl):(?:block|flex|grid|inline|inline-block|inline-flex|inline-grid|table|visible)$/;
const VISIBLE_OPACITY_CLASS =
  /^(?:sm|md|lg|xl|2xl):opacity-(?!0$)\d+$/;

const parseAttributes = (tag) => {
  const attributes = new Map();
  const tagNameEnd = tag.search(/\s|\/?>/);
  const source = tag.slice(tagNameEnd < 0 ? tag.length : tagNameEnd);
  const pattern =
    /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;

  for (const match of source.matchAll(pattern)) {
    attributes.set(
      match[1].toLowerCase(),
      decodeHtml(match[2] ?? match[3] ?? match[4] ?? ""),
    );
  }

  return attributes;
};

const classTokens = (attributes) =>
  (attributes.get("class") ?? "").split(/\s+/).filter(Boolean);

const hasAlwaysHiddenClass = (attributes) => {
  const tokens = classTokens(attributes);
  const responsiveDisplay = tokens.some((token) =>
    VISIBLE_DISPLAY_CLASS.test(token),
  );
  const responsiveOpacity = tokens.some((token) =>
    VISIBLE_OPACITY_CLASS.test(token),
  );

  return (
    ((tokens.includes("hidden") || tokens.includes("!hidden")) &&
      !responsiveDisplay) ||
    ((tokens.includes("sr-only") || tokens.includes("!sr-only")) &&
      !tokens.some(
        (token) =>
          RESPONSIVE_PREFIX.test(token) && token.endsWith(":not-sr-only"),
      )) ||
    ((tokens.includes("invisible") || tokens.includes("!invisible")) &&
      !tokens.some(
        (token) =>
          RESPONSIVE_PREFIX.test(token) && token.endsWith(":visible"),
      )) ||
    ((tokens.includes("opacity-0") || tokens.includes("!opacity-0")) &&
      !responsiveOpacity)
  );
};

const hasHiddenStyle = (attributes) => {
  const style = (attributes.get("style") ?? "")
    .toLowerCase()
    .replace(/\s+/g, "");
  return (
    /(?:^|;)display:none(?:!important)?(?:;|$)/.test(style) ||
    /(?:^|;)visibility:hidden(?:!important)?(?:;|$)/.test(style) ||
    /(?:^|;)opacity:0(?:!important)?(?:;|$)/.test(style)
  );
};

const hasBlockedPointerStyle = (attributes) => {
  const style = (attributes.get("style") ?? "")
    .toLowerCase()
    .replace(/\s+/g, "");
  return (
    /(?:^|;)pointer-events:none(?:!important)?(?:;|$)/.test(style) ||
    classTokens(attributes).some(
      (token) =>
        token === "pointer-events-none" ||
        token === "!pointer-events-none",
    )
  );
};

const attributeIsTrue = (attributes, name) => {
  if (!attributes.has(name)) return false;
  const value = attributes.get(name).trim().toLowerCase();
  return value === "" || value === "true" || value === name;
};

const scanHtmlElements = (html) => {
  const elements = [];
  const byStart = new Map();
  const stack = [];
  const tagPattern = /<!--[\s\S]*?-->|<![^>]*>|<\/?[a-z][^>]*>/gi;

  for (const match of html.matchAll(tagPattern)) {
    const tag = match[0];
    if (tag.startsWith("<!--") || tag.startsWith("<!")) continue;
    const name = tag.match(/^<\/?\s*([a-z][\w:-]*)/i)?.[1]?.toLowerCase();
    if (!name) continue;

    if (/^<\//.test(tag)) {
      const stackIndex = stack.findLastIndex(
        (element) => element.name === name,
      );
      if (stackIndex < 0) continue;

      for (const element of stack.slice(stackIndex)) {
        if (element.contentEnd === null) {
          element.contentEnd = match.index;
          element.end = match.index + tag.length;
        }
      }
      stack.length = stackIndex;
      continue;
    }

    const attributes = parseAttributes(tag);
    const parent = stack.at(-1);
    const ownHidden =
      attributes.has("hidden") ||
      attributeIsTrue(attributes, "aria-hidden") ||
      hasHiddenStyle(attributes) ||
      hasAlwaysHiddenClass(attributes) ||
      name === "template" ||
      name === "script" ||
      name === "style";
    const ownInert = attributes.has("inert");
    const excludedFromUsers =
      Boolean(parent?.excludedFromUsers) || ownHidden || ownInert;
    const interactionBlocked =
      Boolean(parent?.interactionBlocked) ||
      excludedFromUsers ||
      hasBlockedPointerStyle(attributes);
    const element = {
      name,
      attributes,
      start: match.index,
      contentStart: match.index + tag.length,
      contentEnd: null,
      end: null,
      excludedFromUsers,
      interactionBlocked,
    };

    elements.push(element);
    byStart.set(element.start, element);

    if (VOID_ELEMENTS.has(name) || /\/>$/.test(tag)) {
      element.contentEnd = element.contentStart;
      element.end = element.contentStart;
    } else {
      stack.push(element);
    }
  }

  for (const element of stack) {
    element.contentEnd = html.length;
    element.end = html.length;
  }

  return { elements, byStart };
};

const getJsonLd = (html) => {
  const scan = scanHtmlElements(html);
  return scan.elements
    .filter(
      (element) =>
        element.name === "script" &&
        element.attributes.get("type")?.toLowerCase() ===
          "application/ld+json",
    )
    .flatMap((element) => {
      try {
        return [
          JSON.parse(
            html.slice(element.contentStart, element.contentEnd),
          ),
        ];
      } catch {
        return [];
      }
    });
};

const flattenJsonLdEntities = (values) => {
  const entities = [];
  const visited = new Set();
  const visit = (value) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== "object" || visited.has(value)) return;

    visited.add(value);
    entities.push(value);
    Object.values(value).forEach(visit);
  };

  visit(values);
  return entities;
};

const hasJsonLdType = (value, expectedType) => {
  const types = Array.isArray(value?.["@type"])
    ? value["@type"]
    : [value?.["@type"]];
  return types.includes(expectedType);
};

const visibleTextContent = (html, root, byStart) => {
  let cursor = root.contentStart;
  let visibleText = "";
  const stack = [root];
  const tagPattern = /<!--[\s\S]*?-->|<![^>]*>|<\/?[a-z][^>]*>/gi;
  tagPattern.lastIndex = root.contentStart;

  for (
    let match = tagPattern.exec(html);
    match && match.index < root.contentEnd;
    match = tagPattern.exec(html)
  ) {
    if (!stack.at(-1)?.excludedFromUsers) {
      visibleText += html.slice(cursor, match.index);
    }

    const tag = match[0];
    if (!tag.startsWith("<!--") && !tag.startsWith("<!")) {
      if (/^<\//.test(tag)) {
        if (stack.length > 1) stack.pop();
      } else {
        const element = byStart.get(match.index);
        if (
          element &&
          !VOID_ELEMENTS.has(element.name) &&
          !/\/>$/.test(tag)
        ) {
          stack.push(element);
        }
      }
    }
    cursor = match.index + tag.length;
  }

  if (!stack.at(-1)?.excludedFromUsers) {
    visibleText += html.slice(cursor, root.contentEnd);
  }

  return textContent(visibleText);
};

const getVisibleOffer = (html) => {
  const scan = scanHtmlElements(html);
  const offerElements = scan.elements.filter(
    (element) =>
      element.attributes.get("data-product-offer")?.toLowerCase() === "true",
  );

  if (
    offerElements.length !== 1 ||
    offerElements[0].excludedFromUsers
  ) {
    return {
      count: offerElements.length,
      excludedCount: offerElements.filter(
        (element) => element.excludedFromUsers,
      ).length,
      offer: null,
    };
  }

  const element = offerElements[0];

  return {
    count: 1,
    excludedCount: 0,
    offer: {
      productId: element.attributes.get("data-product-id") ?? "",
      price: element.attributes.get("data-price") ?? "",
      currency: element.attributes.get("data-currency") ?? "",
      itemCondition: element.attributes.get("data-item-condition") ?? "",
      text: visibleTextContent(html, element, scan.byStart),
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

const getProductMetadata = (html) => {
  const scan = scanHtmlElements(html);
  return {
    titles: scan.elements
      .filter((element) => element.name === "title")
      .map((element) => visibleTextContent(html, element, scan.byStart)),
    descriptions: scan.elements
      .filter(
        (element) =>
          element.name === "meta" &&
          element.attributes.get("name")?.toLowerCase() === "description",
      )
      .map((element) => element.attributes.get("content") ?? ""),
    canonicals: scan.elements
      .filter(
        (element) =>
          element.name === "link" &&
          (element.attributes.get("rel") ?? "")
            .toLowerCase()
            .split(/\s+/)
            .includes("canonical"),
      )
      .map((element) => element.attributes.get("href") ?? ""),
  };
};

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
    const scan = scanHtmlElements(html);
    for (const element of scan.elements) {
      if (element.name !== "a") continue;
      const href = element.attributes.get("href");
      if (!href) continue;

      let target;
      try {
        target = new URL(href, `${siteUrl}${sourcePath}`);
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

      const ariaDisabled = attributeIsTrue(
        element.attributes,
        "aria-disabled",
      );
      const removedFromTabOrder =
        element.attributes.get("tabindex")?.trim() === "-1";
      const accessibleName =
        visibleTextContent(html, element, scan.byStart) ||
        element.attributes.get("aria-label")?.trim();
      if (
        element.interactionBlocked ||
        ariaDisabled ||
        removedFromTabOrder ||
        !accessibleName
      ) {
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
        message:
          `No visible, named, interactive internal page links to /phone-cases/${variant.id}`,
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
    const jsonLdEntities = flattenJsonLdEntities(jsonLd);
    const products = jsonLdEntities.filter((value) =>
      hasJsonLdType(value, "Product"),
    );
    const product = products.length === 1 ? products[0] : null;
    if (products.length !== 1) {
      findings.push({
        code: "invalid_product_json_ld_count",
        variantId: variant.id,
        message:
          `Product page publishes ${products.length} Product JSON-LD entities; expected exactly 1`,
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
      if (visibleOffer.excludedCount > 0) {
        findings.push({
          code: "excluded_visible_offer",
          variantId: variant.id,
          message:
            `Product offer marker is hidden, inert, or excluded from assistive technology`,
        });
      }
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
    const structuredBreadcrumb = jsonLdEntities.find(
      (value) => hasJsonLdType(value, "BreadcrumbList"),
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

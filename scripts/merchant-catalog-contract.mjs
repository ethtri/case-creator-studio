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
const RAW_TEXT_ELEMENTS = new Set(["script", "style", "textarea", "title"]);
const NON_RENDERED_ELEMENTS = new Set([
  "head",
  "link",
  "meta",
  "script",
  "style",
  "template",
  "title",
]);
const NON_RENDERED_SVG_ELEMENTS = new Set([
  "clippath",
  "defs",
  "desc",
  "mask",
  "symbol",
  "title",
]);
const SVG_RENDERING_ELEMENTS = new Set([
  "circle",
  "ellipse",
  "foreignobject",
  "image",
  "line",
  "path",
  "polygon",
  "polyline",
  "rect",
  "text",
  "use",
]);
const RESPONSIVE_PREFIX = /^(?:sm|md|lg|xl|2xl):/;
const VISIBLE_DISPLAY_CLASS =
  /^(?:sm|md|lg|xl|2xl):(?:block|flex|grid|inline|inline-block|inline-flex|inline-grid|table|visible)$/;
const CSS_NUMBER_PATTERN =
  /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?%?$/i;

const isNumericZero = (value) => {
  const normalized = value.trim();
  if (!CSS_NUMBER_PATTERN.test(normalized)) return false;
  return Number(normalized.replace(/%$/, "")) === 0;
};

const getOpacityClassValue = (token) => {
  const normalized = token.replace(/^!/, "");
  const standard = normalized.match(/^opacity-(\d+)$/)?.[1];
  if (standard !== undefined) return standard;
  return normalized.match(/^opacity-\[([^\]]+)\]$/)?.[1] ?? null;
};

const isZeroOpacityClass = (token) => {
  const value = getOpacityClassValue(token);
  return value !== null && isNumericZero(value);
};

const isResponsiveVisibleOpacityClass = (token) => {
  const match = token.match(/^(?:sm|md|lg|xl|2xl):(.+)$/);
  if (!match) return false;
  const value = getOpacityClassValue(match[1]);
  return value !== null && !isNumericZero(value);
};

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
  const responsiveOpacity = tokens.some(isResponsiveVisibleOpacityClass);

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
    (tokens.some(isZeroOpacityClass) && !responsiveOpacity)
  );
};

const hasHiddenStyle = (attributes) => {
  const style = (attributes.get("style") ?? "")
    .toLowerCase()
    .replace(/\s+/g, "");
  const opacityValues = [
    ...style.matchAll(
      /(?:^|;)opacity:([^;!]+)(?:!important)?(?=;|$)/g,
    ),
  ].map((match) => match[1]);

  return (
    /(?:^|;)display:none(?:!important)?(?:;|$)/.test(style) ||
    /(?:^|;)visibility:hidden(?:!important)?(?:;|$)/.test(style) ||
    opacityValues.some(isNumericZero)
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
  const tokens = [];
  const stack = [];
  const tagPattern = /<!--[\s\S]*?-->|<![^>]*>|<\/?[a-z][^>]*>/gi;

  for (
    let match = tagPattern.exec(html);
    match;
    match = tagPattern.exec(html)
  ) {
    const tag = match[0];
    if (tag.startsWith("<!--") || tag.startsWith("<!")) {
      tokens.push({
        kind: "skip",
        start: match.index,
        end: match.index + tag.length,
      });
      continue;
    }
    const name = tag.match(/^<\/?\s*([a-z][\w:-]*)/i)?.[1]?.toLowerCase();
    if (!name) continue;

    if (/^<\//.test(tag)) {
      const stackIndex = stack.findLastIndex(
        (element) => element.name === name,
      );
      if (stackIndex < 0) continue;

      const closedElement = stack[stackIndex];
      for (const element of stack.slice(stackIndex)) {
        if (element.contentEnd === null) {
          element.contentEnd = match.index;
          element.end = match.index + tag.length;
        }
      }
      stack.length = stackIndex;
      tokens.push({
        kind: "close",
        start: match.index,
        end: match.index + tag.length,
        element: closedElement,
      });
      continue;
    }

    const attributes = parseAttributes(tag);
    const parent = stack.at(-1);
    const ownVisuallyHidden =
      attributes.has("hidden") ||
      hasHiddenStyle(attributes) ||
      hasAlwaysHiddenClass(attributes) ||
      name === "template" ||
      name === "script" ||
      name === "style";
    const ownExcludedFromUsers =
      attributeIsTrue(attributes, "aria-hidden") ||
      attributes.has("inert");
    let withinSvg = false;
    for (let ancestor = parent; ancestor; ancestor = ancestor.parent) {
      if (ancestor.name === "svg") {
        withinSvg = true;
        break;
      }
    }
    const excludedFromUsers =
      Boolean(parent?.excludedFromUsers) ||
      ownVisuallyHidden ||
      ownExcludedFromUsers;
    const excludedFromRendering =
      Boolean(parent?.excludedFromRendering) ||
      ownVisuallyHidden ||
      NON_RENDERED_ELEMENTS.has(name) ||
      (withinSvg && NON_RENDERED_SVG_ELEMENTS.has(name));
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
      parent,
      excludedFromUsers,
      excludedFromRendering,
      interactionBlocked,
    };

    elements.push(element);
    tokens.push({
      kind: "open",
      start: match.index,
      end: match.index + tag.length,
      element,
    });

    if (VOID_ELEMENTS.has(name) || /\/>$/.test(tag)) {
      element.contentEnd = element.contentStart;
      element.end = element.contentStart;
    } else if (RAW_TEXT_ELEMENTS.has(name)) {
      const closingPattern = new RegExp(`</\\s*${name}\\s*>`, "gi");
      closingPattern.lastIndex = element.contentStart;
      const closingMatch = closingPattern.exec(html);

      if (closingMatch) {
        element.contentEnd = closingMatch.index;
        element.end = closingMatch.index + closingMatch[0].length;
        tokens.push({
          kind: "close",
          start: closingMatch.index,
          end: element.end,
          element,
        });
        tagPattern.lastIndex = element.end;
      } else {
        element.contentEnd = html.length;
        element.end = html.length;
        tagPattern.lastIndex = html.length;
      }
    } else {
      stack.push(element);
    }
  }

  for (const element of stack) {
    element.contentEnd = html.length;
    element.end = html.length;
  }

  return { elements, tokens };
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

const scopedTextContent = (
  html,
  root,
  scan,
  exclusionProperty,
) => {
  if (RAW_TEXT_ELEMENTS.has(root.name)) {
    return decodeHtml(
      html
        .slice(root.contentStart, root.contentEnd)
        .replace(/\s+/g, " ")
        .trim(),
    );
  }

  let cursor = root.contentStart;
  let content = "";
  const stack = [root];

  for (const token of scan.tokens) {
    if (
      token.start < root.contentStart ||
      token.start >= root.contentEnd
    ) {
      continue;
    }

    if (!stack.at(-1)?.[exclusionProperty]) {
      content += html.slice(cursor, token.start);
    }

    if (
      token.kind === "open" &&
      token.element.contentEnd > token.element.contentStart
    ) {
      stack.push(token.element);
    } else if (token.kind === "close") {
      const stackIndex = stack.lastIndexOf(token.element);
      if (stackIndex > 0) {
        stack.length = stackIndex;
      }
    }
    cursor = token.end;
  }

  if (!stack.at(-1)?.[exclusionProperty]) {
    content += html.slice(cursor, root.contentEnd);
  }

  return textContent(content);
};

const visibleTextContent = (html, root, scan) =>
  scopedTextContent(html, root, scan, "excludedFromUsers");

const renderedTextContent = (html, root, scan) =>
  scopedTextContent(html, root, scan, "excludedFromRendering");

const isDescendantOf = (element, root) =>
  element.start >= root.contentStart && element.end <= root.contentEnd;

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
      text: visibleTextContent(html, element, scan),
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
  const isActiveHeadMetadata = (element) =>
    !element.excludedFromUsers && element.parent?.name === "head";

  return {
    titles: scan.elements
      .filter(
        (element) =>
          element.name === "title" && isActiveHeadMetadata(element),
      )
      .map((element) => visibleTextContent(html, element, scan)),
    descriptions: scan.elements
      .filter(
        (element) =>
          element.name === "meta" &&
          isActiveHeadMetadata(element) &&
          element.attributes.get("name")?.toLowerCase() === "description",
      )
      .map((element) => element.attributes.get("content") ?? ""),
    canonicals: scan.elements
      .filter(
        (element) =>
          element.name === "link" &&
          isActiveHeadMetadata(element) &&
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

const hasNonZeroAttribute = (element, name) => {
  const value = element.attributes.get(name)?.trim();
  return Boolean(value) && !isNumericZero(value);
};

const hasMeaningfulSvgContent = (html, svg, scan) =>
  scan.elements.some((element) => {
    if (
      !isDescendantOf(element, svg) ||
      element.excludedFromRendering ||
      !SVG_RENDERING_ELEMENTS.has(element.name)
    ) {
      return false;
    }

    switch (element.name) {
      case "path":
        return Boolean(element.attributes.get("d")?.trim());
      case "circle":
        return hasNonZeroAttribute(element, "r");
      case "ellipse":
        return (
          hasNonZeroAttribute(element, "rx") &&
          hasNonZeroAttribute(element, "ry")
        );
      case "rect":
        return (
          hasNonZeroAttribute(element, "width") &&
          hasNonZeroAttribute(element, "height")
        );
      case "polyline":
      case "polygon":
        return Boolean(element.attributes.get("points")?.trim());
      case "use":
      case "image":
        return Boolean(
          element.attributes.get("href")?.trim() ||
            element.attributes.get("xlink:href")?.trim(),
        );
      case "text":
      case "foreignobject":
        return Boolean(renderedTextContent(html, element, scan));
      case "line":
        return ["x1", "x2", "y1", "y2"].some((attribute) =>
          hasNonZeroAttribute(element, attribute),
        );
      default:
        return false;
    }
  });

const getRenderedGraphics = (html, root, scan) =>
  scan.elements.filter(
    (element) =>
      isDescendantOf(element, root) &&
      !element.excludedFromRendering &&
      ((element.name === "svg" &&
        hasMeaningfulSvgContent(html, element, scan)) ||
        (element.name === "img" &&
          Boolean(element.attributes.get("src")?.trim()))),
  );

const getGraphicAccessibleName = (html, element, scan) => {
  if (element.excludedFromUsers) return "";
  if (element.name === "img") {
    return element.attributes.get("alt")?.trim() ?? "";
  }
  return (
    element.attributes.get("aria-label")?.trim() ||
    visibleTextContent(html, element, scan)
  );
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
      const renderedGraphics = getRenderedGraphics(html, element, scan);
      const accessibleName =
        visibleTextContent(html, element, scan) ||
        element.attributes.get("aria-label")?.trim() ||
        renderedGraphics
          .map((graphic) =>
            getGraphicAccessibleName(html, graphic, scan),
          )
          .find(Boolean);
      const hasRenderedContent =
        Boolean(renderedTextContent(html, element, scan)) ||
        renderedGraphics.length > 0;
      if (
        element.interactionBlocked ||
        ariaDisabled ||
        removedFromTabOrder ||
        !accessibleName ||
        !hasRenderedContent
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

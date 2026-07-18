import assert from "node:assert/strict";
import test from "node:test";

import { validateMerchantCatalog } from "./merchant-catalog-contract.mjs";

const siteUrl = "https://www.snapcase.ai";
const variant = {
  id: "iphone-test",
  brand: "Apple",
  model: "iPhone Test",
  price: 29.99,
  currency: "USD",
};
const analyticsItem = {
  item_id: variant.id,
  item_name: "Apple iPhone Test Custom Case",
  item_brand: variant.brand,
  item_category: "Custom Phone Case",
  item_variant: variant.model,
  price: variant.price,
  quantity: 1,
  discount: 0,
};

const pageHtml = ({
  price = "29.99",
  visiblePrice = "29.99",
  visibleCurrency = "USD",
  visibleText = "$29.99 USD",
  availability,
  itemCondition,
  visibleItemCondition,
  middleBreadcrumb = "Phone cases",
  title = "iPhone Test Custom Phone Case | Snapcase",
  description = "Design a personalized iPhone Test phone case.",
  canonical = `${siteUrl}/phone-cases/iphone-test`,
  mockupWidth = "1600",
  mockupHeight = "800",
  mockupAlt = "Digital illustration of an iPhone Test custom phone case mockup",
} = {}) => {
  const offerAvailability = availability
    ? `,\"availability\":\"${availability}\"`
    : "";
  const offerCondition = itemCondition
    ? `,\"itemCondition\":\"${itemCondition}\"`
    : "";
  const visibleConditionAttribute = visibleItemCondition
    ? ` data-item-condition="${visibleItemCondition}"`
    : "";
  return `
    <title>${title}</title>
    <meta name="description" content="${description}" />
    <link rel="canonical" href="${canonical}" />
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","productID":"iphone-test","offers":{"price":"${price}","priceCurrency":"USD"${offerAvailability}${offerCondition}}}</script>
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Home","item":"${siteUrl}/"},{"@type":"ListItem","position":2,"name":"Phone cases","item":"${siteUrl}/catalog"},{"@type":"ListItem","position":3,"name":"iPhone Test custom case","item":"${siteUrl}/phone-cases/iphone-test"}]}</script>
    <nav aria-label="breadcrumb" data-product-breadcrumb="true">
      <ol>
        <li data-breadcrumb-position="1"><a href="/">Home</a></li>
        <li data-breadcrumb-position="2"><a href="/catalog">${middleBreadcrumb}</a></li>
        <li data-breadcrumb-position="3"><span aria-current="page">iPhone Test custom case</span></li>
      </ol>
    </nav>
    <div data-product-offer="true" data-product-id="iphone-test" data-price="${visiblePrice}" data-currency="${visibleCurrency}"${visibleConditionAttribute}>
      <p>${visibleText}</p>
    </div>
    <img data-product-mockup="true" src="/mockup.png" width="${mockupWidth}" height="${mockupHeight}" alt="${mockupAlt}" />
  `;
};

const validate = ({
  item = analyticsItem,
  html = pageHtml(),
  checkoutPrice = 29.99,
  internalPages = new Map([
    [
      "/catalog",
      '<a href="/phone-cases/iphone-test">View iPhone Test details</a>',
    ],
    ["/phone-cases/iphone-test", html],
  ]),
} = {}) =>
  validateMerchantCatalog({
    variants: [variant],
    analyticsItems: [item],
    checkoutPrice,
    checkoutCurrency: "usd",
    pages: new Map([[variant.id, html]]),
    internalPages,
    siteUrl,
  });

const wrapVisibleOffer = (html, before, after = "") =>
  html.replace(
    /(<div data-product-offer="true"[\s\S]*?<\/div>)/,
    `${before}$1${after}`,
  );

test("accepts a reconciled product route, analytics item, and checkout price", () => {
  assert.deepEqual(validate(), []);
});

test("detects checkout and structured price drift", () => {
  assert.ok(
    validate({ checkoutPrice: 30.99 }).some(
      (finding) => finding.code === "checkout_price_drift",
    ),
  );
  assert.ok(
    validate({ html: pageHtml({ price: "30.99" }) }).some(
      (finding) => finding.code === "structured_price_drift",
    ),
  );
});

test("detects visible price, currency, and text drift", () => {
  const findings = validate({
    html: pageHtml({
      visiblePrice: "30.99",
      visibleCurrency: "CAD",
      visibleText: "$30.99 CAD",
    }),
  });

  assert.ok(findings.some((finding) => finding.code === "visible_price_drift"));
  assert.ok(
    findings.some((finding) => finding.code === "visible_currency_drift"),
  );
  assert.ok(
    findings.some((finding) => finding.code === "visible_offer_text_drift"),
  );
});

test("rejects offer markers excluded from rendered or accessible content", () => {
  const hostilePages = [
    pageHtml().replace(
      'data-product-offer="true"',
      'hidden data-product-offer="true"',
    ),
    pageHtml().replace(
      'data-product-offer="true"',
      'class="sr-only" data-product-offer="true"',
    ),
    wrapVisibleOffer(pageHtml(), '<div aria-hidden="true">', "</div>"),
    wrapVisibleOffer(pageHtml(), '<div style="display: none">', "</div>"),
    wrapVisibleOffer(pageHtml(), "<div inert>", "</div>"),
  ];

  for (const html of hostilePages) {
    const findings = validate({
      html: `${html}<p>$99.99 USD</p>`,
    });
    assert.ok(
      findings.some((finding) => finding.code === "excluded_visible_offer"),
    );
  }
});

test("ignores hidden correct text inside a visibly wrong marked offer", () => {
  assert.ok(
    validate({
      html: pageHtml({
        visibleText:
          '<span aria-hidden="true">$29.99 USD</span><span>$99.99 USD</span>',
      }),
    }).some((finding) => finding.code === "visible_offer_text_drift"),
  );
});

test("detects hidden-only structured item condition claims", () => {
  assert.ok(
    validate({
      html: pageHtml({
        itemCondition: "https://schema.org/NewCondition",
      }),
    }).some((finding) => finding.code === "hidden_only_item_condition"),
  );
});

test("requires exactly one Product JSON-LD entity", () => {
  const hostileDuplicates = [
    '<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","productID":"iphone-test","offers":{"price":"29.99","priceCurrency":"USD"}}</script>',
    '<SCRIPT data-hostile="true" TYPE="application/ld+json">{"@context":"https://schema.org","@type":["Thing","Product"],"productID":"iphone-test"}</SCRIPT>',
    '<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Product","productID":"iphone-test"}]}</script>',
    '<script type="application/ld+json">{"@context":"https://schema.org","@type":"WebPage","mainEntity":{"@type":"Product","productID":"iphone-test"}}</script>',
  ];

  for (const duplicateProduct of hostileDuplicates) {
    assert.ok(
      validate({
        html: `${pageHtml()}${duplicateProduct}`,
      }).some(
        (finding) => finding.code === "invalid_product_json_ld_count",
      ),
    );
  }
});

test("detects unverified availability and visible breadcrumb drift", () => {
  assert.ok(
    validate({
      html: pageHtml({ availability: "https://schema.org/InStock" }),
    }).some((finding) => finding.code === "unverified_availability"),
  );
  assert.ok(
    validate({ html: pageHtml({ middleBreadcrumb: "Shop" }) }).some(
      (finding) => finding.code === "visible_breadcrumb_name",
    ),
  );
});

test("detects missing intrinsic mockup dimensions and inaccurate alt intent", () => {
  const findings = validate({
    html: pageHtml({
      mockupWidth: "",
      mockupHeight: "",
      mockupAlt: "iPhone Test product photo",
    }),
  });

  assert.ok(
    findings.some((finding) => finding.code === "missing_mockup_dimensions"),
  );
  assert.ok(
    findings.some((finding) => finding.code === "inaccurate_mockup_alt"),
  );
});

test("detects orphan product routes even when they only link to themselves", () => {
  assert.ok(
    validate({
      internalPages: new Map([
        [
          "/phone-cases/iphone-test",
          '<a href="/phone-cases/iphone-test">Current product</a>',
        ],
      ]),
    }).some((finding) => finding.code === "orphan_product_page"),
  );
});

test("hidden, inert, disabled, and unnamed links do not de-orphan routes", () => {
  const hostileLinks = [
    '<a hidden href="/phone-cases/iphone-test">Details</a>',
    '<div aria-hidden="true"><a href="/phone-cases/iphone-test">Details</a></div>',
    '<div style="display:none"><a href="/phone-cases/iphone-test">Details</a></div>',
    '<div inert><a href="/phone-cases/iphone-test">Details</a></div>',
    '<a class="sr-only" href="/phone-cases/iphone-test">Details</a>',
    '<a aria-disabled="true" href="/phone-cases/iphone-test">Details</a>',
    '<a tabindex="-1" href="/phone-cases/iphone-test">Details</a>',
    '<a href="/phone-cases/iphone-test"></a>',
  ];

  for (const link of hostileLinks) {
    assert.ok(
      validate({
        internalPages: new Map([["/catalog", link]]),
      }).some((finding) => finding.code === "orphan_product_page"),
    );
  }
});

test("metadata parsing catches case and attribute-order duplicate bypasses", () => {
  const hostileHtml = pageHtml()
    .replace(
      "</title>",
      "</title><TITLE>Duplicate product title</TITLE>",
    )
    .replace(
      '<meta name="description" content="Design a personalized iPhone Test phone case." />',
      '<meta name="description" content="Design a personalized iPhone Test phone case." /><META content="Duplicate description" name="description">',
    )
    .replace(
      `<link rel="canonical" href="${siteUrl}/phone-cases/iphone-test" />`,
      `<link rel="canonical" href="${siteUrl}/phone-cases/iphone-test" /><LINK href="${siteUrl}/phone-cases/duplicate" rel="canonical">`,
    );
  const findings = validate({ html: hostileHtml });

  assert.ok(
    findings.some((finding) => finding.code === "invalid_product_title"),
  );
  assert.ok(
    findings.some((finding) => finding.code === "invalid_product_description"),
  );
  assert.ok(
    findings.some((finding) => finding.code === "invalid_product_canonical"),
  );
});

test("detects duplicate and empty product metadata", () => {
  const secondVariant = {
    ...variant,
    id: "iphone-test-two",
    model: "iPhone Test Two",
  };
  const secondItem = {
    ...analyticsItem,
    item_id: secondVariant.id,
    item_name: "Apple iPhone Test Two Custom Case",
    item_variant: secondVariant.model,
  };
  const firstHtml = pageHtml({ title: "", description: "" });
  const duplicateCanonicalHtml = pageHtml()
    .replaceAll("iphone-test", "iphone-test-two")
    .replaceAll("iPhone Test", "iPhone Test Two")
    .replace(
      /(<link\s+rel="canonical"\s+href=")[^"]+/,
      `$1${siteUrl}/phone-cases/iphone-test`,
    );
  const findings = validateMerchantCatalog({
    variants: [variant, secondVariant],
    analyticsItems: [analyticsItem, secondItem],
    checkoutPrice: 29.99,
    checkoutCurrency: "usd",
    pages: new Map([
      [variant.id, firstHtml],
      [secondVariant.id, duplicateCanonicalHtml],
    ]),
    internalPages: new Map([
      [
        "/catalog",
        '<a href="/phone-cases/iphone-test">First</a><a href="/phone-cases/iphone-test-two">Second</a>',
      ],
    ]),
    siteUrl,
  });

  assert.ok(
    findings.some((finding) => finding.code === "invalid_product_title"),
  );
  assert.ok(
    findings.some((finding) => finding.code === "invalid_product_description"),
  );
  assert.ok(
    findings.some((finding) => finding.code === "duplicate_product_canonical"),
  );
});

test("detects analytics identifier and price drift", () => {
  const identifierFindings = validate({
    item: { ...analyticsItem, item_id: "wrong-id", price: 30.99 },
  });

  assert.ok(
    identifierFindings.some(
      (finding) => finding.code === "missing_analytics_item",
    ),
  );
  assert.ok(
    identifierFindings.some(
      (finding) => finding.code === "unknown_analytics_item",
    ),
  );

  assert.ok(
    validate({
      item: { ...analyticsItem, price: 30.99 },
    }).some((finding) => finding.code === "analytics_price_drift"),
  );
});

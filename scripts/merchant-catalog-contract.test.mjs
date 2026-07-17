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
  availability,
  middleBreadcrumb = "Phone cases",
} = {}) => {
  const offerAvailability = availability
    ? `,\"availability\":\"${availability}\"`
    : "";
  return `
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","productID":"iphone-test","offers":{"price":"${price}","priceCurrency":"USD"${offerAvailability}}}</script>
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Home","item":"${siteUrl}/"},{"@type":"ListItem","position":2,"name":"Phone cases","item":"${siteUrl}/catalog"},{"@type":"ListItem","position":3,"name":"iPhone Test custom case","item":"${siteUrl}/phone-cases/iphone-test"}]}</script>
    <nav aria-label="breadcrumb" data-product-breadcrumb="true">
      <ol>
        <li data-breadcrumb-position="1"><a href="/">Home</a></li>
        <li data-breadcrumb-position="2"><a href="/catalog">${middleBreadcrumb}</a></li>
        <li data-breadcrumb-position="3"><span aria-current="page">iPhone Test custom case</span></li>
      </ol>
    </nav>
  `;
};

const validate = ({
  item = analyticsItem,
  html = pageHtml(),
  checkoutPrice = 29.99,
} = {}) =>
  validateMerchantCatalog({
    variants: [variant],
    analyticsItems: [item],
    checkoutPrice,
    checkoutCurrency: "usd",
    pages: new Map([[variant.id, html]]),
    siteUrl,
  });

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

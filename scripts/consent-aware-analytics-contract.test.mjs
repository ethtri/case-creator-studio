import assert from "node:assert/strict";
import test from "node:test";

import { phoneVariants } from "../src/data/phoneVariants.ts";
import {
  BoundedMarketingViewRegistry,
  buildMarketingViewKey,
  trackMarketingViewOnce,
} from "../src/lib/consent-aware-marketing-view.ts";
import {
  buildSeoLandingCtaPayload,
  buildSeoLandingListPayload,
  buildSeoLandingSelectionPayload,
  getSeoLandingItemListId,
} from "../src/lib/seo-landing-analytics.ts";
import {
  getAnalyticsConsent,
  getMarketingAttribution,
  setAnalyticsConsent,
  subscribeToAnalyticsConsent,
  trackMarketingEvent,
} from "../src/lib/marketing.ts";

const seoPageFixtures = [
  {
    path: "/custom-phone-case",
    eyebrow: "Custom Phone Cases",
    cta: "Start your custom case",
  },
  {
    path: "/custom-iphone-case",
    eyebrow: "Custom iPhone Cases",
    cta: "Design an iPhone case",
    featuredBrand: "Apple",
  },
  {
    path: "/custom-samsung-case",
    eyebrow: "Custom Samsung Cases",
    cta: "Design a Samsung case",
    featuredBrand: "Samsung",
  },
  {
    path: "/gifts/custom-phone-case",
    eyebrow: "Custom Phone Case Gifts",
    cta: "Create a gift case",
  },
];

const completeItemKeys = [
  "discount",
  "item_brand",
  "item_category",
  "item_id",
  "item_name",
  "item_variant",
  "price",
  "quantity",
];

test("builds bounded collision-safe view keys and evicts deterministically", () => {
  const catalogKey = buildMarketingViewKey({
    eventName: "view_item_list",
    normalizedRoute: "/catalog",
    contractId: "phone_models",
  });
  assert.equal(
    catalogKey,
    "1.0.0\u001fview_item_list\u001f/catalog\u001fphone_models",
  );
  assert.equal(
    buildMarketingViewKey({
      eventName: "select_item",
      normalizedRoute: "/catalog",
      contractId: "phone_models",
    }),
    null,
    "Interaction events must never enter the late-consent view registry.",
  );
  assert.equal(
    buildMarketingViewKey({
      eventName: "view_item",
      normalizedRoute: `/${"a".repeat(201)}`,
      contractId: "phone",
    }),
    null,
  );
  assert.equal(
    buildMarketingViewKey({
      eventName: "view_item",
      normalizedRoute: "/phone-cases/example",
      contractId: "unsafe\u001fcontract",
    }),
    null,
  );

  const registry = new BoundedMarketingViewRegistry(2);
  registry.remember("first");
  registry.remember("second");
  registry.remember("second");
  assert.equal(registry.size, 2);
  registry.remember("third");
  assert.equal(registry.size, 2);
  assert.equal(registry.has("first"), false);
  assert.equal(registry.has("second"), true);
  assert.equal(registry.has("third"), true);
  assert.throws(() => new BoundedMarketingViewRegistry(0), /positive integer/);
});

test("builds complete route-specific SEO landing ecommerce payloads", () => {
  const listIds = new Set();

  for (const page of seoPageFixtures) {
    const models = page.featuredBrand
      ? phoneVariants
        .filter((variant) => variant.brand === page.featuredBrand)
        .slice(0, 6)
      : phoneVariants.slice(0, 6);
    const payload = buildSeoLandingListPayload(page, models);
    const listId = getSeoLandingItemListId(page);

    assert.match(listId, /^seo_landing_[a-z0-9_]+$/);
    assert.equal(listIds.has(listId), false);
    listIds.add(listId);
    assert.equal(payload.item_list_id, listId);
    assert.equal(payload.currency, "USD");
    assert.equal(payload.items.length, models.length);
    assert.equal(
      payload.items.length,
      page.featuredBrand === "Samsung" ? 3 : 6,
      "Analytics must match every model visibly rendered by the landing page.",
    );

    for (const [index, item] of payload.items.entries()) {
      assert.deepEqual(Object.keys(item).sort(), completeItemKeys);
      assert.equal(item.item_id, models[index].id);
      assert.equal(item.item_brand, models[index].brand);
      assert.equal(item.item_variant, models[index].model);
      assert.equal(item.price, models[index].price);
      assert.equal(item.quantity, 1);
      assert.equal(item.discount, 0);
    }

    const selection = buildSeoLandingSelectionPayload(page, models[0]);
    assert.equal(selection.item_list_id, listId);
    assert.equal(selection.placement, "seo_landing_popular_models");
    assert.equal(selection.items.length, 1);
    assert.deepEqual(Object.keys(selection.items[0]).sort(), completeItemKeys);
    assert.doesNotMatch(
      JSON.stringify({ payload, selection }),
      /artwork|preview_url|customer_|shipping_address|designId|session_id/i,
    );
    assert.deepEqual(buildSeoLandingCtaPayload(page, "hero_primary"), {
      placement: "seo_landing_hero_primary",
      destination: "/catalog",
      label: page.cta,
    });
    assert.deepEqual(buildSeoLandingCtaPayload(page, "hero_secondary"), {
      placement: "seo_landing_hero_secondary",
      destination: "/gifts/custom-phone-case",
      label: "Gift ideas",
    });
    assert.deepEqual(buildSeoLandingCtaPayload(page, "models_header"), {
      placement: "seo_landing_models_header",
      destination: "/catalog",
      label: "Browse all cases",
    });
  }

  assert.equal(listIds.size, seoPageFixtures.length);
});

test("fails consent closed and sends each eligible view once", () => {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const previousCustomEvent = globalThis.CustomEvent;
  const storage = new Map();
  const scripts = [];
  let throwOnRead = false;
  let throwOnWrite = false;
  let throwOnRemove = false;

  class TestCustomEvent extends Event {
    constructor(type, init) {
      super(type);
      this.detail = init?.detail;
    }
  }

  const target = new EventTarget();
  const localStorage = {
    getItem(key) {
      if (throwOnRead) throw new Error("read blocked");
      return storage.get(key) ?? null;
    },
    setItem(key, value) {
      if (throwOnWrite) throw new Error("write blocked");
      storage.set(key, value);
    },
    removeItem(key) {
      if (throwOnRemove) throw new Error("remove blocked");
      storage.delete(key);
    },
  };
  const windowMock = Object.assign(target, {
    location: {
      hostname: "www.snapcase.ai",
      origin: "https://www.snapcase.ai",
      pathname: "/catalog",
      search: "",
    },
    localStorage,
    setTimeout,
    clearTimeout,
  });

  globalThis.CustomEvent = TestCustomEvent;
  globalThis.window = windowMock;
  globalThis.document = {
    referrer: "",
    createElement: () => ({}),
    head: {
      appendChild: (script) => scripts.push(script),
    },
  };

  const consentKey = "snapcase_analytics_consent_v1";
  const attributionKey = "snapcase_marketing_attribution_v2";
  const legacyAttributionKey = "snapcase_marketing_attribution";
  const eventCommands = () =>
    (windowMock.dataLayer ?? [])
      .map((entry) => Array.from(entry))
      .filter((entry) => entry[0] === "event");
  const consentCommands = () =>
    (windowMock.dataLayer ?? [])
      .map((entry) => Array.from(entry))
      .filter((entry) => entry[0] === "consent");
  const dispatchStorage = (key) => {
    const event = new Event("storage");
    Object.defineProperty(event, "key", { value: key });
    windowMock.dispatchEvent(event);
  };

  try {
    storage.set(consentKey, "hostile");
    assert.equal(getAnalyticsConsent(), "unset");
    throwOnRead = true;
    assert.equal(getAnalyticsConsent(), "unset");
    throwOnRead = false;

    throwOnWrite = true;
    assert.equal(setAnalyticsConsent("granted"), false);
    assert.equal(getAnalyticsConsent(), "denied");
    assert.equal(scripts.length, 0);
    assert.equal(
      trackMarketingEvent("view_item_list", { item_list_id: "blocked" }),
      false,
    );
    assert.deepEqual(
      consentCommands().map((command) => [
        command[1],
        command[2].analytics_storage,
      ]),
      [
        ["default", "denied"],
        ["update", "denied"],
      ],
    );
    throwOnWrite = false;

    storage.set(attributionKey, "{\"campaign\":\"private\"}");
    storage.set(legacyAttributionKey, "{\"campaign\":\"legacy\"}");
    assert.equal(setAnalyticsConsent("denied"), true);
    assert.equal(storage.has(attributionKey), false);
    assert.equal(storage.has(legacyAttributionKey), false);
    assert.equal(scripts.length, 0);
    assert.equal(eventCommands().length, 0);

    const observedConsent = [];
    const unsubscribe = subscribeToAnalyticsConsent(() => {
      observedConsent.push(getAnalyticsConsent());
    });
    windowMock.dispatchEvent(
      new TestCustomEvent("snapcase:analytics-consent", {
        detail: "granted",
      }),
    );
    assert.deepEqual(observedConsent, ["denied"]);
    dispatchStorage("unrelated");
    assert.deepEqual(observedConsent, ["denied"]);

    assert.equal(setAnalyticsConsent("granted"), true);
    assert.equal(getAnalyticsConsent(), "granted");
    assert.equal(scripts.length, 1);
    assert.equal(observedConsent.at(-1), "granted");
    assert.equal(setAnalyticsConsent("granted"), true);
    assert.equal(scripts.length, 1);

    for (const command of consentCommands()) {
      assert.equal(command[2].ad_storage, "denied");
      assert.equal(command[2].ad_user_data, "denied");
      assert.equal(command[2].ad_personalization, "denied");
    }

    const catalogDescriptor = {
      eventName: "view_item_list",
      normalizedRoute: "/catalog",
      contractId: "phone_models",
      payload: {
        item_list_id: "phone_models",
        items: [],
      },
    };
    assert.equal(trackMarketingViewOnce(catalogDescriptor), true);
    assert.equal(trackMarketingViewOnce(catalogDescriptor), false);
    assert.equal(
      trackMarketingViewOnce({
        ...catalogDescriptor,
        eventName: "select_item",
        contractId: "interaction_must_not_queue",
      }),
      false,
    );
    assert.equal(
      trackMarketingViewOnce({
        eventName: "view_item",
        normalizedRoute: "/phone-cases/iphone-17-pro-max",
        contractId: "iphone-17-pro-max",
        payload: { items: [] },
      }),
      true,
    );
    const stableGtag = windowMock.gtag;
    windowMock.gtag = () => {
      throw new Error("transport unavailable");
    };
    const transportRecoveryDescriptor = {
      eventName: "view_item",
      normalizedRoute: "/phone-cases/iphone-17-pro",
      contractId: "iphone-17-pro",
      payload: { items: [] },
    };
    assert.equal(trackMarketingViewOnce(transportRecoveryDescriptor), false);
    assert.equal(trackMarketingViewOnce(transportRecoveryDescriptor), false);
    windowMock.gtag = stableGtag;
    assert.equal(trackMarketingViewOnce(transportRecoveryDescriptor), true);
    assert.equal(trackMarketingViewOnce(transportRecoveryDescriptor), false);
    assert.equal(
      eventCommands().filter((entry) => entry[1] === "view_item_list").length,
      1,
    );
    assert.equal(
      eventCommands().filter((entry) => entry[1] === "view_item").length,
      2,
    );

    assert.equal(setAnalyticsConsent("denied"), true);
    const lateDescriptor = {
      eventName: "view_item",
      normalizedRoute: "/phone-cases/galaxy-s24-ultra",
      contractId: "galaxy-s24-ultra",
      payload: { items: [] },
    };
    assert.equal(trackMarketingViewOnce(lateDescriptor), false);
    assert.equal(setAnalyticsConsent("granted"), true);
    assert.equal(trackMarketingViewOnce(lateDescriptor), true);
    assert.equal(
      trackMarketingViewOnce(catalogDescriptor),
      false,
      "A successful view stays deduplicated across deny then grant.",
    );

    storage.set(attributionKey, "{\"utm_source\":\"launch\"}");
    storage.set(legacyAttributionKey, "{\"utm_source\":\"legacy\"}");
    storage.set(consentKey, "denied");
    dispatchStorage(consentKey);
    assert.equal(getAnalyticsConsent(), "denied");
    assert.equal(storage.has(attributionKey), false);
    assert.equal(storage.has(legacyAttributionKey), false);
    assert.equal(consentCommands().at(-1)[2].analytics_storage, "denied");
    assert.equal(trackMarketingEvent("view_item", { items: [] }), false);

    storage.set(consentKey, "granted");
    dispatchStorage(consentKey);
    assert.equal(getAnalyticsConsent(), "granted");

    storage.clear();
    dispatchStorage(null);
    assert.equal(getAnalyticsConsent(), "unset");
    assert.equal(consentCommands().at(-1)[2].analytics_storage, "denied");
    assert.equal(trackMarketingEvent("view_item", { items: [] }), false);

    storage.set(consentKey, "granted");
    dispatchStorage(consentKey);
    assert.equal(getAnalyticsConsent(), "granted");

    storage.set(attributionKey, "{\"utm_source\":\"launch\"}");
    throwOnWrite = true;
    throwOnRemove = true;
    assert.equal(setAnalyticsConsent("denied"), false);
    assert.equal(getAnalyticsConsent(), "denied");
    assert.equal(trackMarketingEvent("view_item", { items: [] }), false);
    assert.equal(getMarketingAttribution(), null);
    assert.equal(consentCommands().at(-1)[2].analytics_storage, "denied");
    dispatchStorage(consentKey);
    assert.equal(
      getAnalyticsConsent(),
      "denied",
      "A failed local decline stays latched despite later storage invalidations.",
    );
    throwOnWrite = false;
    throwOnRemove = false;

    const observationsBeforeUnsubscribe = observedConsent.length;
    unsubscribe();
    windowMock.dispatchEvent(
      new TestCustomEvent("snapcase:analytics-consent", {
        detail: "granted",
      }),
    );
    dispatchStorage(consentKey);
    assert.equal(observedConsent.length, observationsBeforeUnsubscribe);

    const persistedValues = [
      ...storage.values(),
    ].join("\n");
    assert.doesNotMatch(
      persistedValues,
      /view_item|view_item_list|select_item|primary_cta_click/,
    );
  } finally {
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
    globalThis.CustomEvent = previousCustomEvent;
  }
});

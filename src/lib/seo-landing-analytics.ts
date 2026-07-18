import {
  asMarketingItems,
  buildAnalyticsItem,
  buildAnalyticsItems,
} from "./analytics-commerce.ts";
import type { PhoneVariant } from "../data/phoneVariants.ts";
import type { StaticSeoPage } from "../data/seoRoutes.ts";
import type { MarketingEventPayload } from "./marketing.ts";

export type SeoLandingCtaKind =
  | "hero_primary"
  | "hero_secondary"
  | "models_header";

export const getSeoLandingItemListId = (page: StaticSeoPage) =>
  `seo_landing_${page.path
    .split("/")
    .filter(Boolean)
    .join("_")
    .replace(/[^a-z0-9_]/gi, "_")}`;

export const getSeoLandingItemListName = (page: StaticSeoPage) =>
  `${page.eyebrow} starting points`;

export const buildSeoLandingListPayload = (
  page: StaticSeoPage,
  models: PhoneVariant[],
): MarketingEventPayload => ({
  currency: models[0]?.currency ?? "USD",
  item_list_id: getSeoLandingItemListId(page),
  item_list_name: getSeoLandingItemListName(page),
  items: asMarketingItems(
    buildAnalyticsItems(models.map((variant) => ({ variant }))),
  ),
});

export const buildSeoLandingSelectionPayload = (
  page: StaticSeoPage,
  variant: PhoneVariant,
): MarketingEventPayload => ({
  currency: variant.currency,
  item_list_id: getSeoLandingItemListId(page),
  item_list_name: getSeoLandingItemListName(page),
  placement: "seo_landing_popular_models",
  items: asMarketingItems(
    [buildAnalyticsItem({ variant })].filter(Boolean),
  ),
});

export const buildSeoLandingCtaPayload = (
  page: StaticSeoPage,
  kind: SeoLandingCtaKind,
): MarketingEventPayload => {
  if (kind === "hero_primary") {
    return {
      placement: "seo_landing_hero_primary",
      destination: "/catalog",
      label: page.cta,
    };
  }
  if (kind === "hero_secondary") {
    return {
      placement: "seo_landing_hero_secondary",
      destination: "/gifts/custom-phone-case",
      label: "Gift ideas",
    };
  }
  return {
    placement: "seo_landing_models_header",
    destination: "/catalog",
    label: "Browse all cases",
  };
};

import type { PhoneVariant } from "../data/phoneVariants.ts";
import type { MarketingEventValue } from "./marketing.ts";

export type AnalyticsItem = {
  item_id: string;
  item_name: string;
  item_brand: string;
  item_category: string;
  item_variant: string;
  price: number;
  quantity: number;
  discount: number;
};

export type CommerceItemSource = {
  variant?: PhoneVariant;
  variantId?: string | null;
  brand?: string | null;
  model?: string | null;
  price?: number | null;
  quantity?: number | null;
  discount?: number | null;
};

export const buildAnalyticsItem = (
  source: CommerceItemSource,
): AnalyticsItem | null => {
  const itemId = source.variant?.id ?? source.variantId;
  const brand = source.variant?.brand ?? source.brand;
  const model = source.variant?.model ?? source.model;
  const price = source.variant?.price ?? source.price;

  if (!itemId || !brand || !model || typeof price !== "number") {
    return null;
  }

  return {
    item_id: itemId,
    item_name: `${brand} ${model} Custom Case`,
    item_brand: brand,
    item_category: "Custom Phone Case",
    item_variant: model,
    price,
    quantity: Math.max(1, Math.trunc(source.quantity ?? 1)),
    discount: Math.max(0, source.discount ?? 0),
  };
};

export const buildAnalyticsItems = (
  sources: CommerceItemSource[],
): AnalyticsItem[] =>
  sources
    .map(buildAnalyticsItem)
    .filter((item): item is AnalyticsItem => item !== null);

export const asMarketingItems = (
  items: Array<AnalyticsItem | null>,
): MarketingEventValue[] => items.filter((item): item is AnalyticsItem => item !== null);

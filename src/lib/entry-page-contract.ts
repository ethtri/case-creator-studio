import {
  formatProductPrice,
  type PhoneVariant,
} from "../data/phoneVariants.ts";

export const HOME_PRIMARY_CTA = {
  destination: "/catalog",
  label: "Choose your phone",
  placement: "home_hero",
} as const;

export const HOME_STARTING_MODELS = {
  itemListId: "home_starting_models",
  itemListName: "Starting models",
  placement: "home_starting_models",
} as const;

export const getCatalogResultCopy = (count: number) =>
  `${count} phone ${count === 1 ? "model" : "models"} shown.`;

export const getSharedCatalogPriceContext = (
  variants: Pick<PhoneVariant, "price" | "currency">[],
) => {
  const firstVariant = variants[0];
  if (!firstVariant) return null;

  const hasSharedOffer = variants.every(
    (variant) =>
      variant.price === firstVariant.price &&
      variant.currency === firstVariant.currency,
  );

  return hasSharedOffer
    ? `Cases ${formatProductPrice(firstVariant)}`
    : null;
};

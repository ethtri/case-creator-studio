import { SNAPCASE_DEFAULT_PRODUCT_PRICE } from "./catalog-pricing.ts";

export const LIFECYCLE_RECOVERY_CONTRACT_VERSION = "1.0.0";
export const RECOVERY_TOKEN_PATTERN = /^[0-9a-f]{64}$/;

export const SUPPORTED_RECOVERY_VARIANTS = new Set([
  "iphone-17-pro-max", "iphone-17-pro", "iphone-17-air", "iphone-17",
  "iphone-16-pro-max", "iphone-16-pro", "iphone-16-plus", "iphone-16",
  "iphone-15-pro-max", "iphone-15-pro", "iphone-15-plus", "iphone-15",
  "iphone-14-pro-max", "iphone-14-pro", "iphone-14",
  "galaxy-s24-ultra", "galaxy-s24-plus", "galaxy-s24",
]);

export type RecoveryFlow = "abandoned_design" | "abandoned_cart";
export type RecoveryPublicStatus =
  | "already_purchased"
  | "already_used"
  | "deleted"
  | "expired"
  | "generic_failure"
  | "invalid"
  | "ready"
  | "repriced"
  | "revoked"
  | "stale_revision"
  | "unavailable_model";

export type RecoveryCartItem = {
  designId: string | null;
  designPreview: string;
  edmTemplateId: number;
  externalProductId: string | null;
  quantity: number;
  unitPrice: number;
  variantId: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const nullableBoundedString = (value: unknown, maximum: number): string | null =>
  typeof value === "string" && value.length > 0 && value.length <= maximum
    ? value
    : null;

export function validateRecoveryToken(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const token = value.trim().toLowerCase();
  return RECOVERY_TOKEN_PATTERN.test(token) ? token : null;
}

export function buildRecoveryCartItems(value: unknown): {
  items: RecoveryCartItem[];
  repriced: boolean;
} | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 50) return null;
  const items: RecoveryCartItem[] = [];
  let repriced = false;

  for (const raw of value) {
    if (!isRecord(raw)) return null;
    const variantId = nullableBoundedString(raw.variantId, 100);
    const edmTemplateId = Number(raw.edmTemplateId);
    const quantity = Number(raw.quantity);
    const previousPrice = Number(raw.price);
    const designPreview = nullableBoundedString(raw.designPreview, 5000);
    if (
      !variantId || !SUPPORTED_RECOVERY_VARIANTS.has(variantId) ||
      !Number.isInteger(edmTemplateId) || edmTemplateId <= 0 ||
      !Number.isInteger(quantity) || quantity < 1 || quantity > 100 ||
      !designPreview
    ) return null;

    if (!Number.isFinite(previousPrice) || previousPrice !== SNAPCASE_DEFAULT_PRODUCT_PRICE) {
      repriced = true;
    }
    items.push({
      designId: nullableBoundedString(raw.designId, 100),
      designPreview,
      edmTemplateId,
      externalProductId: nullableBoundedString(raw.externalProductId, 200),
      quantity,
      unitPrice: SNAPCASE_DEFAULT_PRODUCT_PRICE,
      variantId,
    });
  }

  return { items, repriced };
}

export function safeRecoveryAnalytics(input: {
  flow?: unknown;
  outcome: RecoveryPublicStatus;
  repriced?: boolean;
}) {
  const flow = input.flow === "abandoned_design" || input.flow === "abandoned_cart"
    ? input.flow
    : "unknown";
  return {
    flow,
    outcome: input.outcome,
    repriced: input.repriced === true,
  };
}

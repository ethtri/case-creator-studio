import {
  getKexiaozhanFulfillmentMethod,
  parseKexiaozhanPaymentNotificationExtraFields,
} from "./kexiaozhan-payment.ts";

export const KEXIAOZHAN_EXPIRED_PAYMENT_REVIEW_STATUS = "payment_review";
export const KEXIAOZHAN_EXPIRED_FULFILLMENT_STATUS =
  "kexiaozhan_handoff_expired";
export const KEXIAOZHAN_EXPIRED_HANDOFF_ERROR =
  "Stripe payment completed after Kexiaozhan handoff expired; do not fulfill automatically";

type OrderItemWithKexiaozhanPayment = {
  vendorDesign?: {
    kexiaozhanPayment?: {
      outTradeNo?: string | null;
    } | null;
  } | null;
};

export type KexiaozhanHandoffExpiryRecord = {
  expires_at?: unknown;
};

export function extractKexiaozhanOutTradeNo(items: unknown): string | null {
  if (!Array.isArray(items)) return null;

  for (const item of items as OrderItemWithKexiaozhanPayment[]) {
    const outTradeNo = item?.vendorDesign?.kexiaozhanPayment?.outTradeNo;
    if (typeof outTradeNo === "string" && outTradeNo.trim()) {
      return outTradeNo.trim();
    }
  }

  return null;
}

export function parseKexiaozhanHandoffExpiresAt(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;

  const expiresAt = new Date(value);
  if (Number.isNaN(expiresAt.getTime())) return null;

  return expiresAt;
}

export function isKexiaozhanHandoffExpired(
  handoff: KexiaozhanHandoffExpiryRecord | null | undefined,
  now = new Date(),
): boolean {
  const expiresAt = parseKexiaozhanHandoffExpiresAt(handoff?.expires_at);
  return expiresAt !== null && now.getTime() > expiresAt.getTime();
}

export function shouldBlockExpiredKexiaozhanHandoff(
  handoff: KexiaozhanHandoffExpiryRecord | null | undefined,
  extraFieldsJson: string | null | undefined,
  now = new Date(),
): boolean {
  if (!isKexiaozhanHandoffExpired(handoff, now)) return false;

  try {
    return getKexiaozhanFulfillmentMethod(
      parseKexiaozhanPaymentNotificationExtraFields(extraFieldsJson),
    ) !== "deferredPrint";
  } catch {
    // An invalid print-mode configuration must keep the original fail-closed rule.
    return true;
  }
}

export function buildExpiredKexiaozhanOrderUpdate(
  paymentFields: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...paymentFields,
    status: KEXIAOZHAN_EXPIRED_PAYMENT_REVIEW_STATUS,
    fulfillment_status: KEXIAOZHAN_EXPIRED_FULFILLMENT_STATUS,
    fulfillment_last_error: KEXIAOZHAN_EXPIRED_HANDOFF_ERROR,
    printful_status: KEXIAOZHAN_EXPIRED_FULFILLMENT_STATUS,
    printful_last_error: KEXIAOZHAN_EXPIRED_HANDOFF_ERROR,
    printful_next_attempt_at: null,
  };
}

import { parseKexiaozhanHandoffExpiresAt } from "./kexiaozhan-payment-guard.ts";

export const KEXIAOZHAN_CHECKOUT_EXPIRED_ERROR =
  "Stripe Checkout Session expired before Kexiaozhan unpaid-order TTL";

const ACTIVE_HANDOFF_STATUSES = new Set(["received", "checkout_created"]);

export type KexiaozhanCheckoutExpiryCandidate = {
  status?: unknown;
  expires_at?: unknown;
};

export function parseKexiaozhanCheckoutExpiryLeewaySeconds(
  rawValue: string | null | undefined,
  fallback: number,
): number {
  const text = rawValue?.trim();
  if (!text) return fallback;

  const value = Number(text);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(
      "KEXIAOZHAN_CHECKOUT_EXPIRY_LEEWAY_SECONDS must be a non-negative integer",
    );
  }
  return value;
}

export function shouldExpireKexiaozhanCheckout(
  handoff: KexiaozhanCheckoutExpiryCandidate,
  now: Date,
  leewaySeconds: number,
): boolean {
  if (typeof handoff.status !== "string") return false;
  if (!ACTIVE_HANDOFF_STATUSES.has(handoff.status)) return false;

  const expiresAt = parseKexiaozhanHandoffExpiresAt(handoff.expires_at);
  if (!expiresAt) return false;

  return now.getTime() + leewaySeconds * 1000 >= expiresAt.getTime();
}

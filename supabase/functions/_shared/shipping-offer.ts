// Server-owned policy. A browser quote is informational, never authorization.
export const SHIPPING_OFFER_ID = "us-standard-20261009";
export const OFFER_SLOT_LIMIT = 10;
export const OFFER_WAIVER_CENTS = 499;
export const OFFER_DURATION_SECONDS = 7 * 24 * 60 * 60;
export const OFFER_MIN_SESSION_SECONDS = 31 * 60;
export const OFFER_SESSION_SECONDS = 60 * 60;

export type OfferConfig = {
  id: string;
  enabled: boolean;
  starts_at: string | null;
  ends_at: string | null;
  eligible_variants: Record<string, number>;
  published_us_rate_verified: boolean;
  cost_evidence: string | null;
};
export type OfferItem = { variantId: string; quantity: number };
export function isOfferEligible(config: OfferConfig | null, input: {
  items: OfferItem[]; hasPromo: boolean; provider: string; synthetic: boolean;
}, nowSeconds: number): boolean {
  if (!config || config.id !== SHIPPING_OFFER_ID || !config.enabled ||
    !config.published_us_rate_verified || !config.cost_evidence?.trim() ||
    input.hasPromo || input.synthetic || input.provider !== "printful" ||
    input.items.length !== 1 || input.items[0].quantity !== 1 || input.items[0].variantId !== "iphone-15") return false;
  const variant = config.eligible_variants[input.items[0].variantId];
  const start = Date.parse(config.starts_at ?? "") / 1000;
  const end = Date.parse(config.ends_at ?? "") / 1000;
  return variant === 17722 &&
    Number.isSafeInteger(start) && Number.isSafeInteger(end) &&
    end - start === OFFER_DURATION_SECONDS && nowSeconds >= start &&
    nowSeconds + OFFER_MIN_SESSION_SECONDS < end;
}
export function offerSessionExpiry(nowSeconds: number, endSeconds: number): number {
  const expiry = Math.min(Math.floor(nowSeconds) + OFFER_SESSION_SECONDS, endSeconds);
  if (expiry <= nowSeconds + OFFER_MIN_SESSION_SECONDS) throw new Error("Offer checkout window closed");
  return expiry;
}
export type OfferSession = {
  id: string; status?: string | null; payment_status?: string;
  metadata?: Record<string, string> | null;
};
// A failure event is not proof the payment can never succeed. Release only a
// freshly retrieved expired/unpaid Session; pending/unknown/refunded slots stay held.
export function offerLifecycle(session: OfferSession): "paid" | "released" | "reserved" {
  if (session.status === "complete" && session.payment_status === "paid") return "paid";
  if (session.status === "expired" && session.payment_status === "unpaid") return "released";
  return "reserved";
}
export async function offerRequestHash(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

import {
  SHIPPING_OFFER_ID, OFFER_WAIVER_CENTS, isOfferEligible, offerRequestHash,
  offerLifecycle, type OfferConfig,
} from "./shipping-offer.ts";
import { SNAPCASE_DEFAULT_PRODUCT_PRICE, SNAPCASE_DEFAULT_PRODUCT_PRICE_CENTS } from "./catalog-pricing.ts";

type Dependencies = { db: any; stripe: any; enabled: boolean; origin: string };
export async function quoteShippingOffer(db: any, enabled: boolean, input: any) {
  if (!enabled) return { shippingCents: OFFER_WAIVER_CENTS };
  const { data: config, error } = await db.from("shipping_offer_config").select("*")
    .eq("id", SHIPPING_OFFER_ID).maybeSingle();
  if (error) throw new Error("Offer quote unavailable");
  if (!isOfferEligible(config as OfferConfig, input, Date.now() / 1000)) {
    return { shippingCents: OFFER_WAIVER_CENTS };
  }
  const { count, error: countError } = await db.from("shipping_offer_reservations")
    .select("attempt_id", { count: "exact", head: true }).neq("state", "released");
  if (countError) throw new Error("Offer quote unavailable");
  return { shippingCents: count < 10 ? 0 : OFFER_WAIVER_CENTS,
    endsAt: config.ends_at };
}

export async function reconcileShippingOffer(db: any, stripe: any, eventSession: any) {
  if (eventSession.metadata?.shippingOfferId !== SHIPPING_OFFER_ID) return;
  // Provider readback avoids releasing on stale/out-of-order event snapshots.
  const current = await stripe.checkout.sessions.retrieve(eventSession.id);
  if (current.metadata?.shippingOfferId !== SHIPPING_OFFER_ID) throw new Error("Offer session mismatch");
  const { error } = await db.rpc("settle_shipping_offer", {
    p_attempt_id: current.metadata.checkoutAttemptId,
    p_request_hash: current.metadata.shippingOfferRequestHash,
    p_session_id: current.id,
    p_state: offerLifecycle(current),
  });
  if (error) throw new Error("Offer reconciliation unavailable");
}

// Separate from normal checkout: no coupon/payment-method/attribution changes
// for non-offer purchases. Every retry uses the same server-pinned expiry/key.
export async function createOfferCheckout(deps: Dependencies, input: any) {
  const { db, stripe, enabled, origin } = deps;
  const { request, email, userId, provider, synthetic } = input;
  if (!request.checkoutAttemptId) throw new Error("Invalid offer checkout attempt");
  const items = request.items.map((item: any) => ({ ...item, price: SNAPCASE_DEFAULT_PRODUCT_PRICE }));
  const requestHash = await offerRequestHash({ items, email, userId, origin,
    promoCode: request.promoCode ?? null,
    marketingAttribution: request.marketingAttribution ?? null,
    analyticsConsent: request.analyticsConsent ?? "unset",
    analyticsClientId: request.analyticsClientId ?? null });
  if (!enabled || synthetic || provider !== "printful" || request.promoCode) {
    return { quoteChanged: true, shippingCents: OFFER_WAIVER_CENTS };
  }
  const { data: reservation, error: reservationError } = await db.rpc("reserve_shipping_offer", {
    p_attempt_id: request.checkoutAttemptId, p_request_hash: requestHash,
    p_items: items.map((i: any) => ({ variantId: i.variantId, quantity: i.quantity })),
  });
  if (reservationError) throw new Error("Offer checkout unavailable. Retry without changing your cart.");
  if (!reservation) return { quoteChanged: true, shippingCents: OFFER_WAIVER_CENTS };
  if (reservation.state === "released") return { quoteChanged: true, shippingCents: OFFER_WAIVER_CENTS };
  if (reservation.state !== "reserved") throw new Error("Offer checkout is already paid. Check your order confirmation before ordering again.");

  const params = {
    customer_email: email,
    line_items: items.map((item: any) => ({ price_data: {
      currency: "usd", product_data: { name: `${item.brand} ${item.model} Custom Case`,
        description: "Custom designed phone case", metadata: { variantId: item.variantId } },
      unit_amount: SNAPCASE_DEFAULT_PRODUCT_PRICE_CENTS,
    }, quantity: 1 })),
    allow_promotion_codes: false,
    automatic_tax: { enabled: false }, mode: "payment",
    expires_at: reservation.expires_at_seconds,
    after_expiration: { recovery: { enabled: false } },
    success_url: `${origin}/order-success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/checkout`,
    shipping_address_collection: { allowed_countries: ["US"] },
    shipping_options: [{ shipping_rate_data: { type: "fixed_amount",
      fixed_amount: { amount: 0, currency: "usd" }, display_name: "Free standard US shipping" } }],
    metadata: { source: "snapcase_site", checkoutAttemptId: request.checkoutAttemptId,
      shippingOfferId: SHIPPING_OFFER_ID, shippingOfferRequestHash: requestHash,
      promotionCode: "", itemsJson: JSON.stringify(items.map((i: any) => ({
        variantId: i.variantId, quantity: 1, edmTemplateId: i.edmTemplateId,
        designId: i.designId ?? null, externalProductId: i.externalProductId ?? null }))) },
  };
  // Never recreate an unknown Session after the pinned expiry / idempotency window.
  if (reservation.expires_at_seconds <= Date.now() / 1000) {
    return { quoteChanged: true, shippingCents: OFFER_WAIVER_CENTS };
  }
  const session = reservation.session_id
    ? await stripe.checkout.sessions.retrieve(reservation.session_id)
    : await stripe.checkout.sessions.create(params, { idempotencyKey: `shipping-offer:${request.checkoutAttemptId}` });
  if (session.metadata?.shippingOfferRequestHash !== requestHash || session.status !== "open" ||
    session.expires_at !== reservation.expires_at_seconds || session.total_details?.amount_shipping !== 0) {
    throw new Error("Offer checkout requires reconciliation");
  }
  const { error: bindError } = await db.rpc("bind_shipping_offer_session", {
    p_attempt_id: request.checkoutAttemptId, p_request_hash: requestHash, p_session_id: session.id,
  });
  if (bindError) throw new Error("Offer session binding unavailable"); // Keep slot, never guess failure.
  const { error: attemptError } = await db.from("checkout_attempts").upsert({
    id: request.checkoutAttemptId, status: "request_received", is_synthetic: false,
  }, { onConflict: "id", ignoreDuplicates: true });
  if (attemptError) throw new Error("Offer attempt persistence unavailable");
  const { error: orderError } = await db.from("orders").upsert({
    stripe_session_id: session.id, checkout_attempt_id: request.checkoutAttemptId,
    is_synthetic: false, customer_email: email, user_id: userId, items,
    subtotal: SNAPCASE_DEFAULT_PRODUCT_PRICE, shipping_cost: 0, discount_total: 0,
    total: SNAPCASE_DEFAULT_PRODUCT_PRICE, status: "pending", fulfillment_provider: "printful",
    marketing_attribution: request.marketingAttribution ?? null,
    analytics_client_id: request.analyticsClientId ?? null,
    analytics_consent: request.analyticsConsent ?? "unset",
  }, { onConflict: "stripe_session_id", ignoreDuplicates: true });
  if (orderError) throw new Error("Offer order persistence unavailable");
  const { data: order, error: lookupError } = await db.from("orders").select("id,checkout_attempt_id")
    .eq("stripe_session_id", session.id).single();
  if (lookupError || order?.checkout_attempt_id !== request.checkoutAttemptId) throw new Error("Offer order binding unavailable");
  const { error: completionError } = await db.from("checkout_attempts").update({
    order_id: order.id, status: "server_completed",
    session_path_variant: /^\/([cf])\/pay\//.exec(new URL(session.url).pathname)?.[1] ?? null,
    server_completed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", request.checkoutAttemptId);
  if (completionError) throw new Error("Offer attempt completion unavailable");
  // Same consent-aware recovery registration as normal checkout; not an analytics enablement.
  const { error: recoveryError } = await db.rpc("register_abandoned_cart_recovery", { p_email: email, p_order_id: order.id });
  if (recoveryError) console.warn("[SHIPPING-OFFER] Recovery eligibility could not be staged.");
  return { url: session.url, sessionId: session.id, checkoutAttemptId: request.checkoutAttemptId,
    shippingCents: 0 };
}

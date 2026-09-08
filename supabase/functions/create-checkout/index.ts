import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { getCorsHeaders, requireAllowedOrigin } from "../_shared/cors.ts";
import { GA4_BROWSER_CLIENT_ID_PATTERN } from "../_shared/ga4-client-id.ts";
import { getStripeSecretKey } from "../_shared/stripe-config.ts";
import {
  SNAPCASE_DEFAULT_CURRENCY,
  SNAPCASE_DEFAULT_PRODUCT_PRICE,
  SNAPCASE_DEFAULT_PRODUCT_PRICE_CENTS,
  SNAPCASE_DEFAULT_SHIPPING,
  SNAPCASE_DEFAULT_SHIPPING_CENTS,
  SNAPCASE_STANDARD_SHIPPING_DISPLAY_NAME,
} from "../_shared/catalog-pricing.ts";
import {
  assertCheckoutQuantityAllowed,
  type CheckoutFulfillmentProvider,
} from "../_shared/checkout-fulfillment.ts";

const TRUE_VALUES = new Set(["1", "true", "yes"]);
type SupabaseAdminClient = ReturnType<typeof createClient<any>>;

type CheckoutAttemptErrorCode =
  | "invalid_request"
  | "origin_rejected"
  | "promotion_rejected"
  | "internal_failure";

function classifyCheckoutAttemptError(
  error: unknown,
): CheckoutAttemptErrorCode {
  const message = error instanceof Error ? error.message : String(error);
  const lowered = message.toLowerCase();
  if (lowered.includes("origin")) return "origin_rejected";
  if (lowered.includes("promo") || lowered.includes("first-time")) {
    return "promotion_rejected";
  }
  if (
    lowered.includes("validation") ||
    lowered.includes("invalid order") ||
    lowered.includes("no items") ||
    lowered.includes("one case per checkout")
  ) {
    return "invalid_request";
  }
  return "internal_failure";
}

function checkoutSessionPathVariant(value: string | null): "c" | "f" | null {
  if (!value) return null;
  try {
    const match = new URL(value).pathname.match(/^\/(c|f)\/pay\//);
    return match?.[1] === "c" || match?.[1] === "f" ? match[1] : null;
  } catch {
    return null;
  }
}

function logCheckoutAttempt(
  level: "info" | "warn" | "error",
  event: string,
  checkoutAttemptId: string,
  fields: Record<string, unknown> = {},
): void {
  const message = JSON.stringify({
    level,
    event,
    checkoutAttemptId,
    ...fields,
  });
  if (level === "error") console.error(message);
  else if (level === "warn") console.warn(message);
  else console.log(message);
}

function getFulfillmentProvider(): CheckoutFulfillmentProvider {
  const provider = (
    Deno.env.get("FULFILLMENT_PROVIDER") ??
      Deno.env.get("ROUTE_FULFILLMENT_PROVIDER") ??
      "printful"
  ).trim().toLowerCase();

  if (provider === "onshore_manual" && !isOnshoreManualEnabled()) {
    console.error(
      "[CREATE-CHECKOUT] onshore_manual requested without ALLOW_ONSHORE_MANUAL=true; using printful",
    );
    return "printful";
  }

  if (provider === "printful" || provider === "onshore_manual") {
    return provider;
  }

  console.error(
    "[CREATE-CHECKOUT] Unsupported fulfillment provider:",
    provider,
  );
  return "printful";
}

function isOnshoreManualEnabled(): boolean {
  return TRUE_VALUES.has(
    (Deno.env.get("ALLOW_ONSHORE_MANUAL") ?? "").trim().toLowerCase(),
  );
}

// Shipping is flat-rate for now; Stripe collects the address.

// Safe error messages that don't expose internal details
function getSafeErrorMessage(error: unknown): string {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const lowered = errorMessage.toLowerCase();

  // Return safe, generic messages to client
  if (
    errorMessage.includes("Customer email is required") ||
    errorMessage.includes("email")
  ) {
    return "Customer email is required";
  }
  if (errorMessage.includes("No items") || errorMessage.includes("items")) {
    return "Cart cannot be empty";
  }
  if (lowered.includes("promo")) {
    return errorMessage;
  }
  if (lowered.includes("first-time")) {
    return "Promo code is for first-time customers only.";
  }
  if (lowered.includes("minimum")) {
    return errorMessage;
  }
  if (lowered.includes("one case per checkout")) {
    return errorMessage;
  }
  if (lowered.includes("customer")) {
    return "Promo code is not valid for this customer.";
  }
  if (lowered.includes("origin")) {
    return "This checkout origin is not allowed.";
  }
  if (errorMessage.includes("validation") || errorMessage.includes("Invalid")) {
    return "Invalid order data. Please check your information and try again.";
  }
  if (errorMessage.toLowerCase().includes("stripe")) {
    return "Payment processing error. Please try again or contact support.";
  }
  if (
    errorMessage.toLowerCase().includes("supabase") ||
    errorMessage.toLowerCase().includes("database")
  ) {
    return "Unable to process your request. Please try again.";
  }

  // Default safe message for unknown errors
  return "An unexpected error occurred. Please contact support if the issue persists.";
}

// Validation schemas
const itemSchema = z.object({
  variantId: z.string().min(1).max(100),
  brand: z.string().min(1).max(100),
  model: z.string().min(1).max(100),
  price: z.number().positive().max(10000),
  quantity: z.number().int().positive().max(100),
  designPreview: z.string().max(5000),
  edmTemplateId: z.number().int().positive(),
  designId: z.string().max(100).nullable().optional(),
  externalProductId: z.string().max(200).nullable().optional(),
});

const promoCodeSchema = z.object({
  code: z.string().min(1).max(50),
});

const marketingTouchSchema = z.object({
  utm_source: z.string().max(500).optional(),
  utm_medium: z.string().max(500).optional(),
  utm_campaign: z.string().max(500).optional(),
  utm_term: z.string().max(500).optional(),
  utm_content: z.string().max(500).optional(),
  gclid: z.string().max(500).optional(),
  fbclid: z.string().max(500).optional(),
  ttclid: z.string().max(500).optional(),
  referrer: z.string().max(500).optional(),
  landingPath: z.string().max(500),
  capturedAt: z.string().max(100),
});

const marketingAttributionSchema = z.union([
  marketingTouchSchema,
  z.object({
    firstTouch: marketingTouchSchema,
    lastTouch: marketingTouchSchema,
  }),
]).nullable().optional();

const checkoutRequestSchema = z.object({
  checkoutAttemptId: z.string().uuid().optional(),
  items: z.array(itemSchema).min(1).max(50),
  customerEmail: z.string().email().max(255),
  promoCode: promoCodeSchema.optional(),
  marketingAttribution: marketingAttributionSchema,
  analyticsClientId: z.string()
    .trim()
    .regex(GA4_BROWSER_CLIENT_ID_PATTERN, "Invalid analytics client ID")
    .max(41)
    .nullable()
    .optional(),
  analyticsConsent: z.enum(["granted", "denied", "unset"]).optional(),
});

type PromoResolution = {
  code: string;
  promotionCodeId: string;
  couponId: string;
  discountAmount: number;
};

function computeDiscount(orderTotal: number, coupon: Stripe.Coupon): number {
  if (!coupon.valid) return 0;
  if (typeof coupon.percent_off === "number") {
    return orderTotal * (coupon.percent_off / 100);
  }
  if (typeof coupon.amount_off === "number") {
    if ((coupon.currency ?? "").toLowerCase() !== "usd") {
      return 0;
    }
    return coupon.amount_off / 100;
  }
  return 0;
}

async function hasPaidOrder(
  supabaseClient: SupabaseAdminClient,
  email: string,
): Promise<boolean> {
  const { data, error } = await supabaseClient
    .from("orders")
    .select("id")
    .eq("customer_email", email)
    .not("stripe_payment_intent_id", "is", null)
    .limit(1);

  if (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "checkout_promotion_history_lookup_failed",
      errorCode: "database_lookup_failed",
    }));
    throw new Error("Unable to validate promo code right now.");
  }

  return (data?.length ?? 0) > 0;
}

async function resolvePromotionCode(
  stripe: Stripe,
  supabaseClient: SupabaseAdminClient,
  code: string,
  orderTotal: number,
  customerEmail: string,
): Promise<PromoResolution> {
  const promotionCodes = await stripe.promotionCodes.list({
    code,
    active: true,
    limit: 1,
  });

  if (!promotionCodes.data.length) {
    throw new Error("Promo code is invalid or expired.");
  }

  const promotionCode = promotionCodes.data[0];
  const coupon = promotionCode.coupon;

  if (
    promotionCode.expires_at &&
    promotionCode.expires_at < Math.floor(Date.now() / 1000)
  ) {
    throw new Error("Promo code is invalid or expired.");
  }

  if (
    typeof promotionCode.max_redemptions === "number" &&
    promotionCode.times_redeemed >= promotionCode.max_redemptions
  ) {
    throw new Error("Promo code has reached its redemption limit.");
  }

  if (promotionCode.restrictions?.minimum_amount) {
    const minimum = promotionCode.restrictions.minimum_amount / 100;
    if (orderTotal < minimum) {
      throw new Error(
        `Minimum order amount is $${minimum.toFixed(2)} for this promo code.`,
      );
    }
    const currency = promotionCode.restrictions.minimum_amount_currency ??
      "usd";
    if (currency.toLowerCase() !== "usd") {
      throw new Error("Promo code is not valid for this currency.");
    }
  }

  if (promotionCode.restrictions?.first_time_transaction) {
    const hasPaid = await hasPaidOrder(
      supabaseClient,
      customerEmail.trim().toLowerCase(),
    );
    if (hasPaid) {
      throw new Error("Promo code is for first-time customers only.");
    }
  }

  if (promotionCode.customer) {
    const customers = await stripe.customers.list({
      email: customerEmail.trim(),
      limit: 1,
    });
    const customerId = customers.data[0]?.id;
    if (!customerId || customerId !== promotionCode.customer) {
      throw new Error("Promo code is not valid for this customer.");
    }
  }

  if (coupon.applies_to?.products?.length) {
    throw new Error("Promo code is not valid for these items.");
  }

  const discountAmount = computeDiscount(orderTotal, coupon);
  if (discountAmount <= 0) {
    throw new Error("Promo code is invalid or expired.");
  }

  return {
    code: promotionCode.code ?? code,
    promotionCodeId: promotionCode.id,
    couponId: coupon.id,
    discountAmount: Number(Math.min(discountAmount, orderTotal).toFixed(2)),
  };
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  const startedAt = Date.now();
  let checkoutAttemptId: string = crypto.randomUUID();
  let attemptPersisted = false;
  let supabaseClient: SupabaseAdminClient | null = null;

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const rawBody = await req.json();

    // Validate request data with Zod
    const validationResult = checkoutRequestSchema.safeParse(rawBody);
    if (!validationResult.success) {
      logCheckoutAttempt(
        "warn",
        "checkout_request_rejected",
        checkoutAttemptId,
        { errorCode: "invalid_request" },
      );
      throw new Error("Invalid order data");
    }

    const {
      checkoutAttemptId: requestedCheckoutAttemptId,
      items: requestItems,
      customerEmail,
      promoCode,
      marketingAttribution,
      analyticsClientId,
      analyticsConsent,
    } = validationResult.data;
    checkoutAttemptId = requestedCheckoutAttemptId ?? checkoutAttemptId;
    const fulfillmentProvider = getFulfillmentProvider();
    const totalQuantity = requestItems.reduce(
      (sum, item) => sum + item.quantity,
      0,
    );
    assertCheckoutQuantityAllowed(fulfillmentProvider, totalQuantity);

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const authHeader = req.headers.get("authorization") ||
      req.headers.get("Authorization") || "";
    let authUserId: string | null = null;
    let authUserEmail: string | null = null;

    if (supabaseUrl && supabaseAnonKey && authHeader) {
      const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: authData, error: authError } = await supabaseAuth.auth
        .getUser();
      if (authError) {
        logCheckoutAttempt(
          "warn",
          "checkout_optional_auth_lookup_failed",
          checkoutAttemptId,
          { errorCode: "auth_lookup_failed" },
        );
      } else {
        authUserId = authData?.user?.id ?? null;
        authUserEmail = authData?.user?.email ?? null;
      }
    }

    const resolvedEmail = authUserEmail ?? customerEmail;

    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Database order creation failed");
    }

    supabaseClient = createClient<any>(supabaseUrl, supabaseServiceKey);
    const configuredCanarySecret =
      Deno.env.get("CHECKOUT_CANARY_AUTH_SECRET") ?? "";
    const suppliedCanarySecret =
      req.headers.get("x-snapcase-checkout-canary") ?? "";
    const isSynthetic = configuredCanarySecret.length >= 32 &&
      suppliedCanarySecret === configuredCanarySecret;

    const { error: attemptInsertError } = await supabaseClient
      .from("checkout_attempts")
      .insert({
        id: checkoutAttemptId,
        status: "request_received",
        is_synthetic: isSynthetic,
      });
    if (attemptInsertError) {
      logCheckoutAttempt(
        "error",
        "checkout_attempt_persistence_failed",
        checkoutAttemptId,
        { errorCode: "database_insert_failed" },
      );
      throw new Error("Database order creation failed");
    }
    attemptPersisted = true;
    logCheckoutAttempt("info", "checkout_request_received", checkoutAttemptId, {
      itemCount: requestItems.length,
      totalQuantity,
      fulfillmentProvider,
      isSynthetic,
    });

    const stripe = new Stripe(getStripeSecretKey("CREATE-CHECKOUT"), {
      apiVersion: "2025-08-27.basil",
    });

    // Normalize items using server-side pricing
    const items = requestItems.map((item) => ({
      ...item,
      price: SNAPCASE_DEFAULT_PRODUCT_PRICE,
    }));

    // Calculate totals using server-side pricing
    const subtotal = items.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0,
    );
    const shippingCost = SNAPCASE_DEFAULT_SHIPPING;
    if (promoCode && !supabaseClient) {
      throw new Error("Unable to validate promo code right now.");
    }

    const promo = promoCode
      ? await resolvePromotionCode(
        stripe,
        supabaseClient,
        promoCode.code.trim(),
        subtotal,
        resolvedEmail,
      )
      : null;
    const discountTotal = promo?.discountAmount ?? 0;
    const total = Math.max(
      subtotal + shippingCost - discountTotal,
      shippingCost,
    );

    // Create line items for Stripe using server-side pricing
    const lineItems = items.map((item) => ({
      price_data: {
        currency: SNAPCASE_DEFAULT_CURRENCY,
        product_data: {
          name: `${item.brand} ${item.model} Custom Case`,
          description: "Custom designed phone case",
          metadata: {
            variantId: item.variantId,
          },
        },
        unit_amount: SNAPCASE_DEFAULT_PRODUCT_PRICE_CENTS,
      },
      quantity: item.quantity,
    }));

    // Check if customer exists
    const customers = await stripe.customers.list({
      email: resolvedEmail,
      limit: 1,
    });
    let customerId: string | undefined;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
    }

    const checkoutOrigin = requireAllowedOrigin(req, "CREATE-CHECKOUT");

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : resolvedEmail,
      line_items: lineItems,
      ...(promo
        ? { discounts: [{ promotion_code: promo.promotionCodeId }] }
        : { allow_promotion_codes: false }),
      automatic_tax: { enabled: false },
      mode: "payment",
      success_url:
        `${checkoutOrigin}/order-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${checkoutOrigin}/checkout`,
      shipping_address_collection: {
        allowed_countries: ["US"],
      },
      shipping_options: [
        {
          shipping_rate_data: {
            type: "fixed_amount",
            fixed_amount: {
              amount: SNAPCASE_DEFAULT_SHIPPING_CENTS,
              currency: SNAPCASE_DEFAULT_CURRENCY,
            },
            display_name: SNAPCASE_STANDARD_SHIPPING_DISPLAY_NAME,
          },
        },
      ],
      metadata: {
        source: "snapcase_site",
        checkoutAttemptId,
        itemsJson: JSON.stringify(items.map((i) => ({
          variantId: i.variantId,
          quantity: i.quantity,
          edmTemplateId: i.edmTemplateId,
          designId: i.designId ?? null,
          externalProductId: i.externalProductId ?? null,
        }))),
        promotionCode: promo?.code ?? "",
      },
    });

    const sessionPathVariant = checkoutSessionPathVariant(session.url);
    const { error: sessionUpdateError } = await supabaseClient
      .from("checkout_attempts")
      .update({
        status: "session_created",
        session_path_variant: sessionPathVariant,
        updated_at: new Date().toISOString(),
      })
      .eq("id", checkoutAttemptId)
      .eq("status", "request_received");
    if (sessionUpdateError) {
      logCheckoutAttempt(
        "error",
        "checkout_session_observation_failed",
        checkoutAttemptId,
        { errorCode: "database_update_failed" },
      );
    }

    const { data: createdOrder, error: orderError } = await supabaseClient.from(
      "orders",
    ).insert({
      stripe_session_id: session.id,
      checkout_attempt_id: checkoutAttemptId,
      is_synthetic: isSynthetic,
      customer_email: resolvedEmail,
      user_id: authUserId,
      items: items,
      subtotal: subtotal,
      shipping_cost: shippingCost,
      discount_total: discountTotal,
      promotion_code: promo?.code ?? null,
      promotion_code_id: promo?.promotionCodeId ?? null,
      coupon_id: promo?.couponId ?? null,
      marketing_attribution: marketingAttribution ?? null,
      analytics_client_id: analyticsClientId ?? null,
      analytics_consent: analyticsConsent ?? "unset",
      total: total,
      status: "pending",
      fulfillment_provider: fulfillmentProvider,
    }).select("id").single();

    if (orderError || !createdOrder?.id) {
      logCheckoutAttempt(
        "error",
        "checkout_order_persistence_failed",
        checkoutAttemptId,
        { errorCode: "database_insert_failed" },
      );
      try {
        await stripe.checkout.sessions.expire(session.id);
      } catch {
        logCheckoutAttempt(
          "error",
          "checkout_orphan_session_expiry_failed",
          checkoutAttemptId,
          { errorCode: "provider_expiry_failed" },
        );
      }
      throw new Error("Database order creation failed");
    }

    if (createdOrder?.id && !isSynthetic) {
      const { error: recoveryError } = await supabaseClient.rpc(
        "register_abandoned_cart_recovery",
        { p_email: resolvedEmail, p_order_id: createdOrder.id },
      );
      if (recoveryError) {
        console.warn(
          "[CREATE-CHECKOUT] Recovery eligibility could not be staged.",
        );
      }
    }

    const completedAt = new Date().toISOString();
    const { error: completionError } = await supabaseClient
      .from("checkout_attempts")
      .update({
        order_id: createdOrder.id,
        status: "server_completed",
        server_completed_at: completedAt,
        updated_at: completedAt,
      })
      .eq("id", checkoutAttemptId);
    if (completionError) {
      logCheckoutAttempt(
        "error",
        "checkout_completion_observation_failed",
        checkoutAttemptId,
        { errorCode: "database_update_failed" },
      );
    }

    logCheckoutAttempt("info", "checkout_server_completed", checkoutAttemptId, {
      durationMs: Date.now() - startedAt,
      sessionPathVariant,
      isSynthetic,
    });

    return new Response(
      JSON.stringify({
        url: session.url,
        sessionId: session.id,
        checkoutAttemptId,
      }),
      {
        headers: {
          ...corsHeaders,
          "Access-Control-Expose-Headers": "x-snapcase-checkout-attempt-id",
          "Content-Type": "application/json",
          "x-snapcase-checkout-attempt-id": checkoutAttemptId,
        },
        status: 200,
      },
    );
  } catch (error: unknown) {
    const corsHeaders = getCorsHeaders(req);
    const errorCode = classifyCheckoutAttemptError(error);
    if (attemptPersisted && supabaseClient) {
      const failedAt = new Date().toISOString();
      const { error: attemptUpdateError } = await supabaseClient
        .from("checkout_attempts")
        .update({
          status: "server_failed",
          error_code: errorCode,
          updated_at: failedAt,
        })
        .eq("id", checkoutAttemptId);
      if (attemptUpdateError) {
        logCheckoutAttempt(
          "error",
          "checkout_failure_observation_failed",
          checkoutAttemptId,
          { errorCode: "database_update_failed" },
        );
      }
    }
    logCheckoutAttempt("error", "checkout_server_failed", checkoutAttemptId, {
      durationMs: Date.now() - startedAt,
      errorCode,
    });
    const safeMessage = getSafeErrorMessage(error);
    return new Response(
      JSON.stringify({
        error: safeMessage,
        checkoutAttemptId,
      }),
      {
        headers: {
          ...corsHeaders,
          "Access-Control-Expose-Headers": "x-snapcase-checkout-attempt-id",
          "Content-Type": "application/json",
          "x-snapcase-checkout-attempt-id": checkoutAttemptId,
        },
        status: 500,
      },
    );
  }
});

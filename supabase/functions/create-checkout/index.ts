import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { getCorsHeaders, requireAllowedOrigin } from "../_shared/cors.ts";
import { getStripeSecretKey } from "../_shared/stripe-config.ts";

const FULFILLMENT_PROVIDERS = new Set(["printful", "onshore_manual"]);
const TRUE_VALUES = new Set(["1", "true", "yes"]);

function getFulfillmentProvider(): string {
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

  if (FULFILLMENT_PROVIDERS.has(provider)) {
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

  // Log full error details server-side for debugging
  console.error("[CREATE-CHECKOUT] Full error details:", {
    message: errorMessage,
    stack: error instanceof Error ? error.stack : undefined,
    timestamp: new Date().toISOString(),
  });

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

const marketingAttributionSchema = z.object({
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
}).nullable().optional();

const checkoutRequestSchema = z.object({
  items: z.array(itemSchema).min(1).max(50),
  customerEmail: z.string().email().max(255),
  promoCode: promoCodeSchema.optional(),
  marketingAttribution: marketingAttributionSchema,
});

// Server-side pricing - single source of truth
const PRODUCT_PRICE = 29.99;
const SHIPPING_COST = 4.99;

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
  supabaseClient: ReturnType<typeof createClient>,
  email: string,
): Promise<boolean> {
  const { data, error } = await supabaseClient
    .from("orders")
    .select("id")
    .eq("customer_email", email)
    .not("stripe_payment_intent_id", "is", null)
    .limit(1);

  if (error) {
    console.error("[CREATE-CHECKOUT] Failed to check order history:", error);
    throw new Error("Unable to validate promo code right now.");
  }

  return (data?.length ?? 0) > 0;
}

async function resolvePromotionCode(
  stripe: Stripe,
  supabaseClient: ReturnType<typeof createClient>,
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

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const rawBody = await req.json();

    // Validate request data with Zod
    const validationResult = checkoutRequestSchema.safeParse(rawBody);
    if (!validationResult.success) {
      console.error(
        "[CREATE-CHECKOUT] Validation error:",
        validationResult.error.errors,
      );
      throw new Error("Invalid order data");
    }

    const {
      items: requestItems,
      customerEmail,
      promoCode,
      marketingAttribution,
    } = validationResult.data;

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
        console.warn(
          "[CREATE-CHECKOUT] Auth lookup failed:",
          authError.message,
        );
      } else {
        authUserId = authData?.user?.id ?? null;
        authUserEmail = authData?.user?.email ?? null;
      }
    }

    const resolvedEmail = authUserEmail ?? customerEmail;

    console.log("[CREATE-CHECKOUT] Processing checkout for:", resolvedEmail);
    console.log("[CREATE-CHECKOUT] Items count:", requestItems.length);

    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Database order creation failed");
    }

    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

    const stripe = new Stripe(getStripeSecretKey("CREATE-CHECKOUT"), {
      apiVersion: "2025-08-27.basil",
    });

    // Normalize items using server-side pricing
    const items = requestItems.map((item) => ({
      ...item,
      price: PRODUCT_PRICE,
    }));

    // Calculate totals using server-side pricing
    const subtotal = items.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0,
    );
    const shippingCost = SHIPPING_COST;
    if (promoCode && !supabaseClient) {
      throw new Error("Unable to validate promo code right now.");
    }

    const promo = promoCode
      ? await resolvePromotionCode(
        stripe,
        supabaseClient as ReturnType<typeof createClient>,
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
        currency: "usd",
        product_data: {
          name: `${item.brand} ${item.model} Custom Case`,
          description: "Custom designed phone case",
          metadata: {
            variantId: item.variantId,
          },
        },
        unit_amount: Math.round(item.price * 100), // Convert to cents - use server price
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
        : { allow_promotion_codes: true }),
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
              amount: Math.round(SHIPPING_COST * 100),
              currency: "usd",
            },
            display_name: "Standard shipping",
            delivery_estimate: {
              minimum: { unit: "business_day", value: 2 },
              maximum: { unit: "business_day", value: 4 },
            },
          },
        },
      ],
      metadata: {
        source: "snapcase_site",
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

    const { error: orderError } = await supabaseClient.from("orders").insert({
      stripe_session_id: session.id,
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
      total: total,
      status: "pending",
      fulfillment_provider: getFulfillmentProvider(),
    });

    if (orderError) {
      console.error("[CREATE-CHECKOUT] Error creating order:", orderError);
      try {
        await stripe.checkout.sessions.expire(session.id);
      } catch (expireError) {
        console.error(
          "[CREATE-CHECKOUT] Failed to expire orphaned Checkout session:",
          expireError,
        );
      }
      throw new Error("Database order creation failed");
    }

    console.log("[CREATE-CHECKOUT] Order created successfully");
    console.log("[CREATE-CHECKOUT] Checkout session created:", session.id);

    return new Response(
      JSON.stringify({ url: session.url, sessionId: session.id }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error: unknown) {
    const corsHeaders = getCorsHeaders(req);
    const safeMessage = getSafeErrorMessage(error);
    return new Response(JSON.stringify({ error: safeMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

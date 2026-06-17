import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { getStripeSecretKey } from "../_shared/stripe-config.ts";

const PRODUCT_PRICE = 29.99;

function getSafeErrorMessage(error: unknown): string {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const lowered = errorMessage.toLowerCase();

  if (lowered.includes("minimum")) {
    return errorMessage;
  }
  if (lowered.includes("redemption")) {
    return "Promo code has reached its redemption limit.";
  }
  if (lowered.includes("currency")) {
    return "Promo code is not valid for this currency.";
  }
  if (lowered.includes("validate")) {
    return "Unable to validate that promo code right now.";
  }
  return "Promo code is invalid or expired.";
}

const itemSchema = z.object({
  variantId: z.string().min(1).max(100),
  quantity: z.number().int().positive().max(100),
});

const optionalEmailSchema = z.preprocess(
  (value) => {
    if (typeof value !== "string") {
      return value;
    }
    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
  },
  z.string().email().max(255).optional(),
);

const requestSchema = z.object({
  code: z.string().min(1).max(50),
  items: z.array(itemSchema).min(1).max(50),
  customerEmail: optionalEmailSchema,
});

type PromoResolution = {
  code: string;
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

async function resolvePromotionCode(
  stripe: Stripe,
  code: string,
  orderTotal: number,
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

  if (coupon.applies_to?.products?.length) {
    throw new Error("Promo code is not valid for these items.");
  }

  const discountAmount = computeDiscount(orderTotal, coupon);
  if (discountAmount <= 0) {
    throw new Error("Promo code is invalid or expired.");
  }

  return {
    code: promotionCode.code ?? code,
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
    const validationResult = requestSchema.safeParse(rawBody);
    if (!validationResult.success) {
      console.error(
        "[VALIDATE-PROMO] Validation error:",
        validationResult.error.errors,
      );
      throw new Error("Invalid promo request");
    }

    const { code, items } = validationResult.data;
    const normalizedCode = code.trim();

    const subtotal = items.reduce(
      (sum, item) => sum + PRODUCT_PRICE * item.quantity,
      0,
    );
    const orderTotal = subtotal;

    const stripe = new Stripe(getStripeSecretKey("VALIDATE-PROMO"), {
      apiVersion: "2025-08-27.basil",
    });

    const promo = await resolvePromotionCode(
      stripe,
      normalizedCode,
      orderTotal,
    );

    return new Response(JSON.stringify({ valid: true, promo }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: unknown) {
    const safeMessage = getSafeErrorMessage(error);
    return new Response(JSON.stringify({ error: safeMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const ALLOWED_ORIGINS = [
  "https://snapcase.ai",
  "https://www.snapcase.ai",
  "https://snapcaseappv2.vercel.app",
];

const VERCEL_PROJECT_PREFIXES = ["snapcaseappv2"];
const STRIPE_MODE = (Deno.env.get("STRIPE_MODE") ?? "").toLowerCase();

const PRODUCT_PRICE = 29.99;

function getStripeSecretKey(): string {
  if (STRIPE_MODE === "test") {
    return (
      Deno.env.get("STRIPE_SECRET_KEY_TEST") ??
      Deno.env.get("STRIPE_SECRET_KEY") ??
      ""
    );
  }
  return Deno.env.get("STRIPE_SECRET_KEY") ?? "";
}

function isAllowedOrigin(origin: string): boolean {
  if (!origin) {
    return false;
  }

  if (ALLOWED_ORIGINS.includes(origin)) {
    return true;
  }

  if (origin.startsWith("http://localhost") || origin.startsWith("http://127.0.0.1")) {
    return true;
  }

  if (origin.endsWith(".vercel.app")) {
    return VERCEL_PROJECT_PREFIXES.some((prefix) => origin.includes(prefix));
  }

  return false;
}

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") || "";
  const allowedOrigin = isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0];

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}

function getSafeErrorMessage(error: unknown): string {
  const errorMessage = error instanceof Error ? error.message : String(error);
  if (errorMessage.toLowerCase().includes("promo")) {
    return "Promo code is invalid or expired.";
  }
  if (errorMessage.toLowerCase().includes("minimum")) {
    return errorMessage;
  }
  return "Unable to apply that promo code.";
}

const itemSchema = z.object({
  variantId: z.string().min(1).max(100),
  quantity: z.number().int().positive().max(100),
});

const requestSchema = z.object({
  code: z.string().min(1).max(50),
  items: z.array(itemSchema).min(1).max(50),
});

type PromoResolution = {
  code: string;
  promotionCodeId: string;
  couponId: string;
  discountAmount: number;
  discountType: "percent" | "amount";
  percentOff: number | null;
  amountOff: number | null;
};

function computeDiscount(orderTotal: number, coupon: Stripe.Coupon): PromoResolution | null {
  if (!coupon.valid) return null;
  let discountAmount = 0;
  let discountType: PromoResolution["discountType"] | null = null;
  let percentOff: number | null = null;
  let amountOff: number | null = null;

  if (typeof coupon.percent_off === "number") {
    percentOff = coupon.percent_off;
    discountAmount = orderTotal * (coupon.percent_off / 100);
    discountType = "percent";
  } else if (typeof coupon.amount_off === "number") {
    if ((coupon.currency ?? "").toLowerCase() !== "usd") {
      return null;
    }
    amountOff = coupon.amount_off / 100;
    discountAmount = amountOff;
    discountType = "amount";
  }

  if (!discountType) return null;

  const cappedDiscount = Math.min(discountAmount, orderTotal);
  return {
    code: "",
    promotionCodeId: "",
    couponId: coupon.id,
    discountAmount: Number(cappedDiscount.toFixed(2)),
    discountType,
    percentOff,
    amountOff,
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
      console.error("[VALIDATE-PROMO] Validation error:", validationResult.error.errors);
      throw new Error("Invalid promo request");
    }

    const { code, items } = validationResult.data;
    const normalizedCode = code.trim();

    const subtotal = items.reduce((sum, item) => sum + PRODUCT_PRICE * item.quantity, 0);
    const orderTotal = subtotal;

    const stripe = new Stripe(getStripeSecretKey(), {
      apiVersion: "2025-08-27.basil",
    });

    const promotionCodes = await stripe.promotionCodes.list({
      code: normalizedCode,
      active: true,
      limit: 1,
    });

    if (!promotionCodes.data.length) {
      throw new Error("Promo code is invalid or expired.");
    }

    const promotionCode = promotionCodes.data[0];
    const coupon = promotionCode.coupon;

    if (promotionCode.expires_at && promotionCode.expires_at < Math.floor(Date.now() / 1000)) {
      throw new Error("Promo code is invalid or expired.");
    }

    if (promotionCode.restrictions?.minimum_amount) {
      const minimum = promotionCode.restrictions.minimum_amount / 100;
      if (orderTotal < minimum) {
        throw new Error(`Minimum order amount is $${minimum.toFixed(2)} for this promo code.`);
      }
      const currency = promotionCode.restrictions.minimum_amount_currency ?? "usd";
      if (currency.toLowerCase() !== "usd") {
        throw new Error("Promo code is not valid for this currency.");
      }
    }

    if (coupon.applies_to?.products?.length) {
      throw new Error("Promo code is not valid for these items.");
    }

    const discount = computeDiscount(orderTotal, coupon);
    if (!discount) {
      throw new Error("Promo code is invalid or expired.");
    }

    const response: PromoResolution = {
      ...discount,
      code: promotionCode.code ?? normalizedCode,
      promotionCodeId: promotionCode.id,
      couponId: coupon.id,
    };

    return new Response(JSON.stringify({ valid: true, promo: response }), {
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

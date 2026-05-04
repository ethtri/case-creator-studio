import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { isAllowedOrigin, resolveAllowedOrigin } from "../_shared/cors.ts";
import { getStripeSecretKey } from "../_shared/stripe-config.ts";

const PRODUCT_PRICE = 29.99;
const SHIPPING_COST = 4.99;
const SIGNATURE_TOLERANCE_MS = 5 * 60 * 1000;
const TRUE_VALUES = new Set(["1", "true", "yes"]);
const DEFAULT_PREVIEW_URL =
  "https://snapcase.ai/placeholder-vendor-preview.png";

const skuSchema = z.object({
  brandId: z.string().min(1).max(200).optional(),
  goodsSkuId: z.string().min(1).max(200),
  materialIds: z.array(z.string().min(1).max(200)).max(20).default([]),
  caseType: z.enum(["ordinary", "magnetic"]).optional(),
}).strict();

const designSchema = z.object({
  previewUrl: z.string().url().max(5000).optional(),
  filePath: z.string().min(1).max(1000),
  sku: skuSchema,
}).strict();

const handoffSchema = z.object({
  customerEmail: z.string().email().max(255),
  variantId: z.string().min(1).max(100),
  brand: z.string().min(1).max(100),
  model: z.string().min(1).max(100),
  productName: z.string().min(1).max(200).optional(),
  quantity: z.number().int().min(1).max(1).default(1),
  handoffId: z.string().min(1).max(200),
  design: designSchema,
}).strict();

type HandoffPayload = z.infer<typeof handoffSchema>;

function isOnshoreManualEnabled(): boolean {
  return TRUE_VALUES.has(
    (Deno.env.get("ALLOW_ONSHORE_MANUAL") ?? "").trim().toLowerCase(),
  );
}

function getFulfillmentProvider(): string {
  return (
    Deno.env.get("FULFILLMENT_PROVIDER") ??
      Deno.env.get("ROUTE_FULFILLMENT_PROVIDER") ??
      "printful"
  ).trim().toLowerCase();
}

function blockBrowserRequests(req: Request): Response | null {
  if (!req.headers.get("origin")) return null;

  return new Response(
    JSON.stringify({ error: "This endpoint is not accessible from browsers" }),
    {
      status: 403,
      headers: { "Content-Type": "application/json" },
    },
  );
}

function normalizeSignature(signature: string): string {
  return signature.trim().replace(/^sha256=/i, "").toLowerCase();
}

function timingSafeEqual(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  if (leftBytes.length !== rightBytes.length) return false;

  let diff = 0;
  for (let i = 0; i < leftBytes.length; i += 1) {
    diff |= leftBytes[i] ^ rightBytes[i];
  }
  return diff === 0;
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message),
  );
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function validateTimestamp(timestamp: string): boolean {
  const timestampMs = Date.parse(timestamp);
  if (!Number.isFinite(timestampMs)) return false;
  return Math.abs(Date.now() - timestampMs) <= SIGNATURE_TOLERANCE_MS;
}

function assertNoSecretLikeVendorData(payload: HandoffPayload): void {
  const serialized = JSON.stringify(payload).toLowerCase();
  const forbiddenPatterns = [
    "token=",
    "bearer ",
    "sk_test_",
    "sk_live_",
    "whsec_",
  ];
  if (forbiddenPatterns.some((pattern) => serialized.includes(pattern))) {
    throw new Error("Vendor handoff contains secret-like data");
  }
}

function getCheckoutOrigin(): string {
  const configuredOrigin = Deno.env.get("VENDOR_HANDOFF_CHECKOUT_ORIGIN") ??
    Deno.env.get("SNAPCASE_CHECKOUT_ORIGIN") ??
    "";
  if (configuredOrigin && !isAllowedOrigin(configuredOrigin)) {
    throw new Error("Configured checkout origin is not allowed");
  }

  return configuredOrigin
    ? resolveAllowedOrigin(configuredOrigin)
    : "https://snapcase.ai";
}

async function verifySignature(req: Request, rawBody: string): Promise<void> {
  const secret = Deno.env.get("FAKE_VENDOR_HANDOFF_SECRET")?.trim();
  if (!secret) {
    throw new Error("Fake vendor handoff secret is not configured");
  }

  const timestamp = req.headers.get("x-snapcase-handoff-timestamp") ?? "";
  const signature = req.headers.get("x-snapcase-handoff-signature") ?? "";
  if (!timestamp || !signature || !validateTimestamp(timestamp)) {
    throw new Error("Invalid handoff signature");
  }

  const expected = await hmacSha256Hex(secret, `${timestamp}.${rawBody}`);
  if (!timingSafeEqual(expected, normalizeSignature(signature))) {
    throw new Error("Invalid handoff signature");
  }
}

function buildOrderItem(payload: HandoffPayload): Record<string, unknown> {
  return {
    variantId: payload.variantId,
    brand: payload.brand,
    model: payload.model,
    price: PRODUCT_PRICE,
    quantity: payload.quantity,
    designPreview: payload.design.previewUrl ?? DEFAULT_PREVIEW_URL,
    edmTemplateId: null,
    designId: `vendor_fake_${payload.handoffId}`.slice(0, 100),
    externalProductId: payload.design.sku.goodsSkuId,
    designSource: "vendor_fake",
    vendorDesign: {
      provider: "vendor_fake",
      handoffId: payload.handoffId,
      filePath: payload.design.filePath,
      sku: payload.design.sku,
    },
  };
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const browserResponse = blockBrowserRequests(req);
  if (browserResponse) return browserResponse;

  if (getFulfillmentProvider() !== "onshore_manual") {
    return new Response(
      JSON.stringify({ error: "Fake vendor handoff requires onshore_manual" }),
      { status: 409, headers: { "Content-Type": "application/json" } },
    );
  }

  if (!isOnshoreManualEnabled()) {
    return new Response(
      JSON.stringify({ error: "Onshore manual fulfillment is not enabled" }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    const rawBody = await req.text();
    await verifySignature(req, rawBody);

    const payload = handoffSchema.parse(JSON.parse(rawBody));
    assertNoSecretLikeVendorData(payload);

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Database order creation failed");
    }

    const stripe = new Stripe(getStripeSecretKey("FAKE-VENDOR-HANDOFF"), {
      apiVersion: "2025-08-27.basil",
    });
    const supabaseClient = createClient(supabaseUrl, serviceRoleKey);
    const checkoutOrigin = getCheckoutOrigin();
    const subtotal = PRODUCT_PRICE * payload.quantity;
    const total = subtotal + SHIPPING_COST;
    const item = buildOrderItem(payload);

    const session = await stripe.checkout.sessions.create({
      customer_email: payload.customerEmail,
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: payload.productName ??
                `${payload.brand} ${payload.model} Custom Case`,
              description: "Custom designed phone case",
              metadata: {
                variantId: payload.variantId,
                handoffId: payload.handoffId,
              },
            },
            unit_amount: Math.round(PRODUCT_PRICE * 100),
          },
          quantity: payload.quantity,
        },
      ],
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
        source: "fake_vendor_handoff",
        handoffId: payload.handoffId,
        goodsSkuId: payload.design.sku.goodsSkuId,
      },
    }, {
      idempotencyKey: `fake-vendor-handoff-${payload.handoffId}`,
    });

    const orderPayload = {
      stripe_session_id: session.id,
      customer_email: payload.customerEmail,
      items: [item],
      subtotal,
      shipping_cost: SHIPPING_COST,
      discount_total: 0,
      marketing_attribution: {
        source: "fake_vendor_handoff",
        provider: "vendor_fake",
        handoffId: payload.handoffId,
        goodsSkuId: payload.design.sku.goodsSkuId,
        receivedAt: new Date().toISOString(),
      },
      total,
      status: "pending",
      fulfillment_provider: "onshore_manual",
    };

    const { error: orderError } = await supabaseClient.from("orders").insert(
      orderPayload,
    );
    if (orderError && orderError.code !== "23505") {
      console.error("[FAKE-VENDOR-HANDOFF] Order insert failed:", orderError);
      try {
        await stripe.checkout.sessions.expire(session.id);
      } catch (expireError) {
        console.error(
          "[FAKE-VENDOR-HANDOFF] Failed to expire orphaned session:",
          expireError,
        );
      }
      throw new Error("Database order creation failed");
    }

    return new Response(
      JSON.stringify({
        success: true,
        provider: "onshore_manual",
        handoffId: payload.handoffId,
        sessionId: session.id,
        checkoutUrl: session.url,
        existingOrder: orderError?.code === "23505",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[FAKE-VENDOR-HANDOFF] Failed:", error);
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes("signature")
      ? 401
      : message.includes("secret")
      ? 500
      : 400;
    return new Response(JSON.stringify({ error: "Invalid vendor handoff" }), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }
});

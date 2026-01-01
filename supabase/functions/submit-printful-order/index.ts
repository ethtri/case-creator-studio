import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { sendOrderEmail } from "../_shared/email.ts";

// This endpoint should NOT be callable from browsers - it's server-side only
// Block requests with an origin header (browser requests)
function blockBrowserRequests(req: Request): Response | null {
  const origin = req.headers.get("origin");
  if (origin) {
    console.error("[SUBMIT-PRINTFUL] Blocked browser request from origin:", origin);
    return new Response(JSON.stringify({ error: "This endpoint is not accessible from browsers" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }
  return null;
}

function authorizeServiceRole(req: Request): Response | null {
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!serviceRoleKey) {
    console.error("[SUBMIT-PRINTFUL] Missing SUPABASE_SERVICE_ROLE_KEY");
    return new Response(JSON.stringify({ error: "Server not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
  const apiKey = req.headers.get("apikey");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (bearerToken !== serviceRoleKey && apiKey !== serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  return null;
}

// Safe error messages that don't expose internal details
function getSafeErrorMessage(error: unknown): string {
  const errorMessage = error instanceof Error ? error.message : String(error);
  
  // Log full error details server-side for debugging
  console.error("[SUBMIT-PRINTFUL] Full error details:", {
    message: errorMessage,
    stack: error instanceof Error ? error.stack : undefined,
    timestamp: new Date().toISOString()
  });
  
  // Return safe, generic messages
  if (errorMessage.includes("Order ID is required")) {
    return "Order ID is required";
  }
  if (errorMessage.includes("Order not found")) {
    return "Order not found";
  }
  if (errorMessage.includes("Order must be paid")) {
    return "Order cannot be processed at this time";
  }
  if (errorMessage.toLowerCase().includes("shipping address")) {
    return "Shipping address is required to fulfill this order.";
  }
  if (errorMessage.includes("Unknown variant")) {
    return "One or more items could not be fulfilled. Our team has been notified.";
  }
  if (errorMessage.toLowerCase().includes("printful")) {
    return "Order fulfillment error. Our team has been notified.";
  }
  if (errorMessage.toLowerCase().includes("supabase") || errorMessage.toLowerCase().includes("database")) {
    return "Unable to process order. Please try again.";
  }
  
  // Default safe message
  return "An unexpected error occurred. Our team has been notified.";
}

// Printful Store ID: 17088301 (Snapcase)
const PRINTFUL_STORE_ID = "17088301";
const PRINTFUL_API_BASE = "https://api.printful.com/v2";
const PRINTFUL_API_V1_BASE = "https://api.printful.com";
const PRINTFUL_DEFAULT_TECHNIQUE = "sublimation";
const MAX_PRINTFUL_ATTEMPTS = 4;
const PRINTFUL_RETRY_DELAY_MS = 5 * 60 * 1000;
const STRIPE_MODE = (Deno.env.get("STRIPE_MODE") ?? "").toLowerCase();
const variantConfigCache = new Map<number, { placement: string; technique: string }>();
const productConfigCache = new Map<number, { placements: string[]; techniques: string[] }>();

function getPrintfulHeaders(apiKey: string): HeadersInit {
  return {
    "Authorization": `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "X-PF-Store-ID": PRINTFUL_STORE_ID,
  };
}

function getPrintfulV1Headers(apiKey: string): HeadersInit {
  return {
    "Authorization": `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

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

function withStoreId(url: string): string {
  if (!PRINTFUL_STORE_ID) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}store_id=${PRINTFUL_STORE_ID}`;
}

function extractStringList(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        if (typeof entry === "string") return entry;
        if (entry && typeof entry === "object") {
          const candidate = (entry as any).placement ?? (entry as any).name ?? (entry as any).key ?? null;
          return typeof candidate === "string" ? candidate : null;
        }
        return null;
      })
      .filter((entry): entry is string => Boolean(entry));
  }
  if (value && typeof value === "object") {
    const candidate = (value as any).placement ?? (value as any).name ?? (value as any).key ?? null;
    return typeof candidate === "string" ? [candidate] : [];
  }
  if (typeof value === "string") return [value];
  return [];
}

function pickPreferredValue(values: string[], preferred: string[]): string | null {
  const normalized = values.map((value) => value.toLowerCase());
  for (const option of preferred) {
    const matchIndex = normalized.indexOf(option.toLowerCase());
    if (matchIndex >= 0) return values[matchIndex];
  }
  return values[0] ?? null;
}

async function getProductConfig(productId: number, apiKey: string): Promise<{ placements: string[]; techniques: string[] }> {
  const cached = productConfigCache.get(productId);
  if (cached) return cached;

  try {
    const response = await fetch(`${PRINTFUL_API_BASE}/catalog-products/${productId}`, {
      headers: getPrintfulHeaders(apiKey),
    });

    if (!response.ok) {
      const fallback = { placements: [], techniques: [] };
      productConfigCache.set(productId, fallback);
      return fallback;
    }

    const payload = await response.json();
    const data = payload?.result ?? payload?.data ?? payload ?? {};
    const placements = extractStringList(data?.placements ?? data?.placement_types ?? data?.placement);
    const techniques = extractStringList(data?.techniques ?? data?.technique_keys ?? data?.technique);
    const resolved = { placements, techniques };
    productConfigCache.set(productId, resolved);
    return resolved;
  } catch {
    const fallback = { placements: [], techniques: [] };
    productConfigCache.set(productId, fallback);
    return fallback;
  }
}

function normalizeCountryCode(value: string | null | undefined): string {
  if (!value) return "US";
  const trimmed = value.trim();
  if (trimmed.length === 2) {
    return trimmed.toUpperCase();
  }
  if (trimmed.toLowerCase() === "united states") {
    return "US";
  }
  return trimmed;
}

function hasRequiredShippingFields(shippingAddress: any): boolean {
  return Boolean(
    shippingAddress?.address &&
      shippingAddress?.city &&
      shippingAddress?.zip &&
      shippingAddress?.country &&
      shippingAddress?.state
  );
}

async function confirmPrintfulOrder(orderId: string, apiKey: string): Promise<{ status: string | null }> {
  const response = await fetch(withStoreId(`${PRINTFUL_API_V1_BASE}/orders/${orderId}/confirm`), {
    method: "POST",
    headers: getPrintfulV1Headers(apiKey),
  });

  const payload = await response.json();
  if (!response.ok) {
    const errorDetail = payload?.error?.message ?? payload?.error ?? payload?.message ?? "Printful confirm error";
    throw new Error(`Printful confirm error: ${errorDetail}`);
  }

  const result = payload?.result ?? payload?.data ?? payload;
  const status = result?.status ?? null;
  return { status };
}

async function getVariantConfig(catalogVariantId: number, apiKey: string): Promise<{ placement: string; technique: string }> {
  const cached = variantConfigCache.get(catalogVariantId);
  if (cached) return cached;

  try {
    const response = await fetch(`${PRINTFUL_API_BASE}/catalog-variants/${catalogVariantId}`, {
      headers: getPrintfulHeaders(apiKey),
    });

    if (!response.ok) {
      const fallback = { placement: "front", technique: PRINTFUL_DEFAULT_TECHNIQUE };
      variantConfigCache.set(catalogVariantId, fallback);
      return fallback;
    }

    const payload = await response.json();
    const data = payload?.result ?? payload?.data ?? payload ?? {};
    let placements = extractStringList(
      data?.placements ?? data?.placement_types ?? data?.placement ?? data?.placement_dimensions
    );
    let techniques = extractStringList(data?.techniques ?? data?.technique_keys ?? data?.technique);

    if ((placements.length === 0 || techniques.length === 0) && typeof data?.catalog_product_id === "number") {
      const productConfig = await getProductConfig(data.catalog_product_id, apiKey);
      if (placements.length === 0) placements = productConfig.placements;
      if (techniques.length === 0) techniques = productConfig.techniques;
    }

    const placement = pickPreferredValue(placements, ["front", "outside", "back", "default"]) ?? "front";
    const technique = pickPreferredValue(techniques, [PRINTFUL_DEFAULT_TECHNIQUE, "uv_print"]) ?? PRINTFUL_DEFAULT_TECHNIQUE;
    const resolved = { placement, technique };
    variantConfigCache.set(catalogVariantId, resolved);
    return resolved;
  } catch {
    const fallback = { placement: "front", technique: PRINTFUL_DEFAULT_TECHNIQUE };
    variantConfigCache.set(catalogVariantId, fallback);
    return fallback;
  }
}

// Printful variant mapping - verified against Printful API v2-beta
const PRINTFUL_VARIANT_MAP: Record<string, number> = {
  // iPhone 17 Series (Product ID: 683)
  "iphone-17-pro-max": 34015,
  "iphone-17-pro": 34013,
  "iphone-17-air": 34011,
  "iphone-17": 34009,
  // iPhone 16 Series (Product ID: 683)
  "iphone-16-pro-max": 20297,
  "iphone-16-pro": 20296,
  "iphone-16-plus": 20295,
  "iphone-16": 20294,
  // iPhone 15 Series (Product ID: 683)
  "iphone-15-pro-max": 17728,
  "iphone-15-pro": 17726,
  "iphone-15-plus": 17724,
  "iphone-15": 17722,
  // iPhone 14 Series (Product ID: 683)
  "iphone-14-pro-max": 16916,
  "iphone-14-pro": 16912,
  "iphone-14": 16910,
  // Samsung Galaxy S24 Series (Product ID: 684)
  "galaxy-s24-ultra": 18739,
  "galaxy-s24-plus": 18738,
  "galaxy-s24": 18737,
};

interface PrintfulRecipient {
  name: string;
  address1: string;
  address2?: string;
  city: string;
  state_code: string;
  country_code: string;
  zip: string;
  email: string;
}

// Validation schema
const submitOrderSchema = z.object({
  orderId: z.string().uuid(),
});

serve(async (req) => {
  // Block browser requests - this is a server-side only endpoint
  const blockResponse = blockBrowserRequests(req);
  if (blockResponse) return blockResponse;

  const authResponse = authorizeServiceRole(req);
  if (authResponse) return authResponse;
  
  // No CORS headers for this endpoint since it shouldn't be called from browsers

  let supabaseClient: ReturnType<typeof createClient> | null = null;
  let order: any | null = null;
  let orderId: string | null = null;
  let attemptNumber: number | null = null;

  try {
    const rawBody = await req.json();
    
    // Validate request data
    const validationResult = submitOrderSchema.safeParse(rawBody);
    if (!validationResult.success) {
      console.error("[SUBMIT-PRINTFUL] Validation error:", validationResult.error.errors);
      throw new Error("Order ID is required");
    }
    
    orderId = validationResult.data.orderId;

    console.log("[SUBMIT-PRINTFUL] Processing order:", orderId);

    supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Get order from database
    const { data: orderData, error: orderError } = await supabaseClient
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .single();

    if (orderError || !orderData) {
      throw new Error("Order not found");
    }

    order = orderData;

    const existingPrintfulOrderId = order.printful_order_id ? String(order.printful_order_id) : null;
    const needsConfirm =
      existingPrintfulOrderId &&
      (!order.printful_status || order.printful_status === "draft" || order.printful_status === "retry");

    if (!needsConfirm && order.status !== "paid") {
      throw new Error("Order must be paid before submitting to Printful");
    }

    if (existingPrintfulOrderId && !needsConfirm) {
      console.log("[SUBMIT-PRINTFUL] Order already submitted to Printful");
      return new Response(JSON.stringify({ 
        success: true, 
        message: "Order already submitted",
      }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    }

    const shippingAddress = order.shipping_address as any;
    if (!hasRequiredShippingFields(shippingAddress)) {
      await supabaseClient
        .from("orders")
        .update({
          printful_status: "needs_shipping",
          printful_last_error: "Missing shipping address",
          printful_next_attempt_at: null,
        })
        .eq("id", orderId);
      throw new Error("Missing shipping address");
    }

    if (order.printful_attempts >= MAX_PRINTFUL_ATTEMPTS) {
      attemptNumber = order.printful_attempts ?? MAX_PRINTFUL_ATTEMPTS;
      throw new Error("Order fulfillment retries exhausted");
    }

    attemptNumber = (order.printful_attempts ?? 0) + 1;
    const attemptTimestamp = new Date().toISOString();
    let claimQuery = supabaseClient
      .from("orders")
      .update({
        printful_status: needsConfirm ? "confirming" : "submitting",
        printful_attempts: attemptNumber,
        printful_last_attempt_at: attemptTimestamp,
        printful_next_attempt_at: null,
        printful_last_error: null,
      })
      .eq("id", orderId);

    if (needsConfirm) {
      claimQuery = claimQuery.eq("printful_order_id", existingPrintfulOrderId);
    } else {
      claimQuery = claimQuery.is("printful_order_id", null);
    }

    if (order.printful_status) {
      claimQuery = claimQuery.eq("printful_status", order.printful_status);
    } else {
      claimQuery = claimQuery.is("printful_status", null);
    }

    const { data: claimedRows, error: claimError } = await claimQuery.select("id");
    if (claimError || !claimedRows || claimedRows.length === 0) {
      console.warn("[SUBMIT-PRINTFUL] Order already processing or state changed:", orderId);
      return new Response(JSON.stringify({ success: true, message: "Order already processing" }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    }

    const printfulApiKey = Deno.env.get("PRINTFUL_API_KEY");
    if (!printfulApiKey) {
      throw new Error("Printful integration error");
    }

    if (needsConfirm && existingPrintfulOrderId) {
      const confirmResult = await confirmPrintfulOrder(existingPrintfulOrderId, printfulApiKey);
      const resolvedStatus = confirmResult.status ?? "pending";
      if (resolvedStatus === "draft") {
        throw new Error("Printful order still in draft after confirm");
      }

      const { data: updatedOrder } = await supabaseClient
        .from("orders")
        .update({
          printful_status: resolvedStatus,
          status: "processing",
          printful_next_attempt_at: null,
          printful_last_error: null,
        })
        .eq("id", orderId)
        .select()
        .single();

      if (updatedOrder?.id) {
        try {
          await sendOrderEmail(supabaseClient, "order_processing", updatedOrder);
        } catch (emailError) {
          console.error("[SUBMIT-PRINTFUL] Failed to send processing email:", emailError);
        }
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Build Printful order
    const recipient: PrintfulRecipient = {
      name: order.customer_name || "Customer",
      address1: shippingAddress?.address || "",
      address2: shippingAddress?.address2 || undefined,
      city: shippingAddress?.city || "",
      state_code: shippingAddress?.state || "",
      country_code: normalizeCountryCode(shippingAddress?.country),
      zip: shippingAddress?.zip || "",
      email: order.customer_email,
    };

    // Map cart items to Printful order items (v1)
    const orderItems = await Promise.all((order.items as any[]).map(async (item) => {
      const catalogVariantId = PRINTFUL_VARIANT_MAP[item.variantId];
      if (!catalogVariantId) {
        console.error("[SUBMIT-PRINTFUL] Unknown variant:", item.variantId);
        throw new Error("Unknown variant ID");
      }

      if (item.edmTemplateId) {
        return {
          variant_id: catalogVariantId,
          product_template_id: item.edmTemplateId,
          quantity: item.quantity,
        };
      }

      if (item.externalProductId) {
        return {
          variant_id: catalogVariantId,
          external_product_id: item.externalProductId,
          quantity: item.quantity,
        };
      }

      const variantConfig = await getVariantConfig(catalogVariantId, printfulApiKey);
      const fileType = ["front", "back", "default"].includes(variantConfig.placement)
        ? variantConfig.placement
        : "default";

      return {
        variant_id: catalogVariantId,
        quantity: item.quantity,
        files: [
          {
            type: fileType,
            url: item.designPreview,
          },
        ],
      };
    }));

    console.log("[SUBMIT-PRINTFUL] Submitting to Printful store:", PRINTFUL_STORE_ID);
    console.log("[SUBMIT-PRINTFUL] Items count:", orderItems.length);

    const discountTotal = Number(order.discount_total ?? 0);
    const retailSubtotal = Math.max(Number(order.subtotal) - discountTotal, 0);

    // Submit to Printful API (v1) for order creation (supports product templates)
    const printfulResponse = await fetch(withStoreId(`${PRINTFUL_API_V1_BASE}/orders`), {
      method: "POST",
      headers: getPrintfulV1Headers(printfulApiKey),
      body: JSON.stringify({
        confirm: true,
        external_id: orderId,
        recipient,
        shipping: order.shipping_method_id || undefined,
        items: orderItems,
        retail_costs: {
          subtotal: retailSubtotal.toString(),
          shipping: order.shipping_cost.toString(),
          total: order.total.toString(),
        },
      }),
    });

    const printfulData = await printfulResponse.json();

    if (!printfulResponse.ok) {
      const errorDetail = printfulData?.error?.message ?? printfulData?.error ?? printfulData?.message ?? "Printful API error";
      console.error("[SUBMIT-PRINTFUL] Printful API error:", printfulData);
      throw new Error(`Printful API error: ${errorDetail}`);
    }

    const printfulResult = printfulData?.result ?? printfulData?.data ?? printfulData;
    const printfulOrderId = printfulResult?.id ?? printfulResult?.order?.id ?? null;
    let printfulStatus = printfulResult?.status ?? printfulResult?.order?.status ?? null;

    if (printfulOrderId && (printfulStatus === "draft" || !printfulStatus)) {
      const confirmResult = await confirmPrintfulOrder(String(printfulOrderId), printfulApiKey);
      printfulStatus = confirmResult.status ?? printfulStatus;
      if (printfulStatus === "draft") {
        throw new Error("Printful order still in draft after confirm");
      }
    }

    console.log("[SUBMIT-PRINTFUL] Printful order created:", printfulOrderId);

    // Update order with Printful info
    if (printfulOrderId) {
      const shouldProcess = printfulStatus && printfulStatus !== "draft";
      const { data: updatedOrder } = await supabaseClient
        .from("orders")
        .update({
          printful_order_id: String(printfulOrderId),
          printful_status: printfulStatus ?? "submitted",
          status: shouldProcess ? "processing" : order.status,
          printful_next_attempt_at: null,
          printful_last_error: null,
        })
        .eq("id", orderId)
        .select()
        .single();

      if (shouldProcess && updatedOrder?.id) {
        try {
          await sendOrderEmail(supabaseClient, "order_processing", updatedOrder);
        } catch (emailError) {
          console.error("[SUBMIT-PRINTFUL] Failed to send processing email:", emailError);
        }
      }
    } else {
      console.warn("[SUBMIT-PRINTFUL] Printful response missing order id", printfulData);
    }

    return new Response(JSON.stringify({ 
      success: true, 
    }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: unknown) {
    if (supabaseClient && orderId && attemptNumber !== null) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const maxAttemptsReached = attemptNumber >= MAX_PRINTFUL_ATTEMPTS;
      const nextAttemptAt = maxAttemptsReached
        ? null
        : new Date(Date.now() + PRINTFUL_RETRY_DELAY_MS).toISOString();

      const updatePayload: Record<string, unknown> = {
        printful_status: maxAttemptsReached ? "failed" : "retry",
        printful_last_error: errorMessage,
        printful_next_attempt_at: nextAttemptAt,
      };

      if (maxAttemptsReached) {
        updatePayload.status = "failed";

        try {
          if (order?.stripe_payment_intent_id && !order?.printful_refund_id) {
            const stripe = new Stripe(getStripeSecretKey(), {
              apiVersion: "2025-08-27.basil",
            });
            const refund = await stripe.refunds.create({
              payment_intent: order.stripe_payment_intent_id,
              reason: "failed",
            });
            updatePayload.printful_refund_id = refund.id;
          }
        } catch (refundError) {
          const refundMessage = refundError instanceof Error ? refundError.message : String(refundError);
          updatePayload.printful_last_error = `${errorMessage}; Refund failed: ${refundMessage}`;
        }
      }

      const { data: updatedOrder } = await supabaseClient
        .from("orders")
        .update(updatePayload)
        .eq("id", orderId)
        .select()
        .single();

      if (maxAttemptsReached && updatedOrder?.id) {
        try {
          await sendOrderEmail(supabaseClient, "order_failed", updatedOrder);
        } catch (emailError) {
          console.error("[SUBMIT-PRINTFUL] Failed to send failure email:", emailError);
        }
      }
    }

    const safeMessage = getSafeErrorMessage(error);
    return new Response(JSON.stringify({ error: safeMessage }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }
});

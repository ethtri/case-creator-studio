import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { getStripeSecretKey } from "../_shared/stripe-config.ts";
import {
  isStripeCheckoutPaymentFulfilled,
} from "../_shared/stripe-checkout-payment.ts";
import {
  classifyPaymentVerificationOrder,
} from "../_shared/order-verification-state.ts";

// Safe error messages that don't expose internal details
function getSafeErrorMessage(error: unknown): string {
  const errorMessage = error instanceof Error ? error.message : String(error);

  // Log full error details server-side for debugging
  console.error("[VERIFY-PAYMENT] Full error details:", {
    message: errorMessage,
    stack: error instanceof Error ? error.stack : undefined,
    timestamp: new Date().toISOString(),
  });

  // Return safe, generic messages to client
  if (errorMessage.includes("Session ID is required")) {
    return "Session ID is required";
  }
  if (errorMessage.toLowerCase().includes("stripe")) {
    return "Payment verification error. Please try again or contact support.";
  }
  if (
    errorMessage.toLowerCase().includes("supabase") ||
    errorMessage.toLowerCase().includes("database")
  ) {
    return "Unable to verify payment. Please try again.";
  }

  // Default safe message for unknown errors
  return "An unexpected error occurred. Please contact support if the issue persists.";
}

// Validation schema
const verifyPaymentSchema = z.object({
  sessionId: z.string().min(1).max(500),
});

const formatSupportReference = (orderId: unknown): string | null => {
  if (
    typeof orderId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(orderId)
  ) {
    return null;
  }

  return `SC-${orderId.replaceAll("-", "").slice(0, 12).toUpperCase()}`;
};

const buildPublicOrderSummary = (order: unknown) => {
  if (!order || typeof order !== "object" || Array.isArray(order)) return null;
  const record = order as Record<string, unknown>;
  if (
    record.total === null ||
    record.total === undefined ||
    (typeof record.total === "string" && !record.total.trim())
  ) {
    return null;
  }
  const total = typeof record.total === "number"
    ? record.total
    : Number(record.total);
  if (
    !Number.isFinite(total) ||
    typeof record.status !== "string" ||
    !Array.isArray(record.items)
  ) {
    return null;
  }

  return {
    items: record.items.map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return { quantity: 1 };
      }
      const quantity = Number((item as Record<string, unknown>).quantity);
      return {
        quantity: Number.isFinite(quantity)
          ? Math.max(0, Math.trunc(quantity))
          : 1,
      };
    }),
    total,
    status: record.status.slice(0, 64),
  };
};

const jsonResponse = (
  payload: Record<string, unknown>,
  corsHeaders: Record<string, string>,
  status = 200,
) =>
  new Response(JSON.stringify(payload), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });

const buildExistingOrderResponse = (
  order: Record<string, unknown>,
  supportReference: string | null,
  corsHeaders: Record<string, string>,
): Response => {
  const orderState = classifyPaymentVerificationOrder(order.status);

  if (orderState === "verified") {
    return jsonResponse({
      success: true,
      order: buildPublicOrderSummary(order),
      supportReference,
    }, corsHeaders);
  }

  if (orderState === "confirmed_failure") {
    return jsonResponse({
      success: false,
      code: "order_requires_review",
      retryable: false,
      supportReference,
      message:
        "We found the order, but automated processing stopped. Please contact support for review.",
    }, corsHeaders);
  }

  if (orderState === "unknown") {
    return jsonResponse({
      success: false,
      code: "verification_unavailable",
      retryable: true,
      supportReference,
      message: "Unable to confirm the current order state. Please try again.",
    }, corsHeaders);
  }

  return jsonResponse({
    success: false,
    code: "order_record_pending",
    retryable: true,
    supportReference,
    message:
      "Payment is confirmed and the order record is still being finalized. Please try again shortly.",
  }, corsHeaders);
};

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  let supportReference: string | null = null;

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const rawBody = await req.json();

    // Validate request data
    const validationResult = verifyPaymentSchema.safeParse(rawBody);
    if (!validationResult.success) {
      console.error(
        "[VERIFY-PAYMENT] Validation error:",
        validationResult.error.errors,
      );
      throw new Error("Session ID is required");
    }

    const { sessionId } = validationResult.data;

    console.log("[VERIFY-PAYMENT] Verifying session:", sessionId);

    const stripe = new Stripe(getStripeSecretKey("VERIFY-PAYMENT"), {
      apiVersion: "2025-08-27.basil",
    });

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabaseClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: existingOrder, error: orderLookupError } =
      await supabaseClient
        .from("orders")
        .select("*")
        .eq("stripe_session_id", sessionId)
        .single();

    if (orderLookupError || !existingOrder) {
      console.error("[VERIFY-PAYMENT] Error loading order:", orderLookupError);
      throw new Error("Database order lookup failed");
    }
    supportReference = formatSupportReference(existingOrder.id);

    // Retrieve the checkout session
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    console.log("[VERIFY-PAYMENT] Session status:", session.payment_status);

    if (
      !isStripeCheckoutPaymentFulfilled({
        checkoutStatus: session.status,
        paymentStatus: session.payment_status,
        amountTotal: session.amount_total,
      })
    ) {
      return new Response(
        JSON.stringify({
          success: false,
          code: session.status === "expired"
            ? "checkout_expired"
            : "payment_pending",
          retryable: session.status !== "expired",
          supportReference,
          message: session.status === "expired"
            ? "Checkout expired before payment was confirmed"
            : "Payment confirmation is pending",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    // This shopper-triggered endpoint is read-only. Stripe confirms payment
    // truth, while the webhook remains the sole owner of order transitions,
    // email, vendor notification, and fulfillment routing.
    return buildExistingOrderResponse(
      existingOrder as Record<string, unknown>,
      supportReference,
      corsHeaders,
    );
  } catch (error: unknown) {
    const corsHeaders = getCorsHeaders(req);
    const safeMessage = getSafeErrorMessage(error);
    return new Response(JSON.stringify({
      error: safeMessage,
      code: "verification_unavailable",
      retryable: true,
      supportReference,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { sendOrderEmail } from "../_shared/email.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { getStripeSecretKey } from "../_shared/stripe-config.ts";
import {
  buildExpiredKexiaozhanOrderUpdate,
  extractKexiaozhanOutTradeNo,
  KEXIAOZHAN_EXPIRED_HANDOFF_ERROR,
  shouldBlockExpiredKexiaozhanHandoff,
} from "../_shared/kexiaozhan-payment-guard.ts";
import {
  isStripeCheckoutPaymentFulfilled,
} from "../_shared/stripe-checkout-payment.ts";

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

type ShippingDetails = {
  name?: string | null;
  address?: {
    line1?: string | null;
    line2?: string | null;
    city?: string | null;
    state?: string | null;
    postal_code?: string | null;
    country?: string | null;
  } | null;
};

type KexiaozhanHandoffRecord = {
  expires_at?: unknown;
};

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

const extractShippingDetails = (
  session: Stripe.Checkout.Session,
): ShippingDetails | null => {
  const direct = session.shipping_details;
  if (direct?.address) {
    return direct;
  }

  const collected = session.collected_information?.shipping_details as
    | ShippingDetails
    | null
    | undefined;
  if (collected?.address) {
    return collected;
  }

  const customerAddress = session.customer_details?.address;
  if (customerAddress) {
    return {
      name: session.customer_details?.name ?? null,
      address: {
        line1: customerAddress.line1 ?? null,
        line2: customerAddress.line2 ?? null,
        city: customerAddress.city ?? null,
        state: customerAddress.state ?? null,
        postal_code: customerAddress.postal_code ?? null,
        country: customerAddress.country ?? null,
      },
    };
  }

  return null;
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
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["payment_intent"],
    });

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

    // Update order in database
    const paymentIntent = session.payment_intent as Stripe.PaymentIntent;

    const updateData: Record<string, unknown> = {
      status: "paid",
      stripe_payment_intent_id: paymentIntent?.id,
    };

    if (typeof session.amount_total === "number") {
      updateData.total = session.amount_total / 100;
    }

    if (typeof session.total_details?.amount_discount === "number") {
      updateData.discount_total = session.total_details.amount_discount / 100;
    }

    const shippingDetails = extractShippingDetails(session);
    const customerDetails = session.customer_details;
    const shippingAddress = shippingDetails?.address ?? null;

    if (shippingDetails?.name) {
      updateData.customer_name = shippingDetails.name;
    } else if (customerDetails?.name) {
      updateData.customer_name = customerDetails.name;
    }

    if (
      shippingAddress &&
      (shippingAddress.line1 || shippingAddress.city ||
        shippingAddress.postal_code)
    ) {
      const addressLine = [shippingAddress.line1, shippingAddress.line2].filter(
        Boolean,
      ).join(" ");
      updateData.shipping_address = {
        address: addressLine,
        city: shippingAddress.city ?? "",
        state: shippingAddress.state ?? "",
        zip: shippingAddress.postal_code ?? "",
        country: shippingAddress.country ?? "",
      };
    }

    const kexiaozhanOutTradeNo = extractKexiaozhanOutTradeNo(
      existingOrder?.items,
    );

    if (kexiaozhanOutTradeNo) {
      const { data: handoff, error: handoffLookupError } = await supabaseClient
        .from("kexiaozhan_handoffs")
        .select("expires_at")
        .eq("out_trade_no", kexiaozhanOutTradeNo)
        .maybeSingle();

      if (handoffLookupError) {
        console.error(
          "[VERIFY-PAYMENT] Error loading Kexiaozhan handoff:",
          handoffLookupError,
        );
        throw new Error("Kexiaozhan handoff lookup failed");
      }

      if (
        handoff &&
        shouldBlockExpiredKexiaozhanHandoff(
          handoff as KexiaozhanHandoffRecord,
          Deno.env.get("KEXIAOZHAN_PAYMENT_NOTIFY_EXTRA_FIELDS_JSON"),
        )
      ) {
        const expiredOrderUpdate = buildExpiredKexiaozhanOrderUpdate(
          updateData,
        );
        const { error: blockedOrderError } =
          await supabaseClient
            .from("orders")
            .update(expiredOrderUpdate)
            .eq("stripe_session_id", sessionId)
            .select()
            .single();

        if (blockedOrderError) {
          console.error(
            "[VERIFY-PAYMENT] Error blocking expired Kexiaozhan order:",
            blockedOrderError,
          );
          throw new Error("Database update failed");
        }

        const { error: handoffUpdateError } = await supabaseClient
          .from("kexiaozhan_handoffs")
          .update({
            status: "expired",
            snapcase_order_id: existingOrder.id,
            stripe_session_id: sessionId,
            stripe_payment_intent_id: paymentIntent?.id ?? null,
            customer_email: existingOrder.customer_email ??
              customerDetails?.email ?? null,
            last_error: KEXIAOZHAN_EXPIRED_HANDOFF_ERROR,
          })
          .eq("out_trade_no", kexiaozhanOutTradeNo);

        if (handoffUpdateError) {
          console.error(
            "[VERIFY-PAYMENT] Error marking expired Kexiaozhan handoff:",
            handoffUpdateError,
          );
        }

        return new Response(
          JSON.stringify({
            success: false,
            code: "order_requires_review",
            retryable: false,
            supportReference,
            message:
              "Payment received, but the vendor checkout link expired before payment completed. Please contact support so we can review or refund the order.",
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
          },
        );
      }
    }

    const { data: order, error: updateError } = await supabaseClient
      .from("orders")
      .update(updateData)
      .eq("stripe_session_id", sessionId)
      .select()
      .single();

    if (updateError) {
      console.error("[VERIFY-PAYMENT] Error updating order:", updateError);
    } else {
      console.log("[VERIFY-PAYMENT] Order updated to paid:", order?.id);
    }

    if (order?.id) {
      try {
        await sendOrderEmail(supabaseClient, "order_confirmed", order);
      } catch (emailError) {
        console.error(
          "[VERIFY-PAYMENT] Failed to send confirmation email:",
          emailError,
        );
      }
    }

    if (order?.id) {
      const shipping = order.shipping_address as any;
      const hasShipping = Boolean(
        shipping?.address &&
          shipping?.city &&
          shipping?.zip &&
          shipping?.country &&
          shipping?.state,
      );

      if (
        !order.printful_order_id &&
        (!order.fulfillment_provider ||
          order.fulfillment_provider === "printful") &&
        hasShipping &&
        (!order.printful_status || order.printful_status === "needs_shipping")
      ) {
        await supabaseClient
          .from("orders")
          .update({
            printful_status: "pending",
            printful_last_error: null,
            fulfillment_status: "pending",
            fulfillment_last_error: null,
          })
          .eq("id", order.id);
      }

      if (!hasShipping) {
        await supabaseClient
          .from("orders")
          .update({
            printful_status: "needs_shipping",
            printful_last_error: "Missing shipping address",
            fulfillment_status: "needs_shipping",
            fulfillment_last_error: "Missing shipping address",
          })
          .eq("id", order.id);
      }

      if (hasShipping && supabaseUrl && serviceRoleKey) {
        try {
          const routeResponse = await fetch(
            `${supabaseUrl}/functions/v1/route-fulfillment-order`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${serviceRoleKey}`,
                apikey: serviceRoleKey,
              },
              body: JSON.stringify({ orderId: order.id }),
            },
          );

          if (!routeResponse.ok) {
            const body = await routeResponse.text();
            console.error("[VERIFY-PAYMENT] Fulfillment routing failed:", body);
          }
        } catch (routeError) {
          console.error(
            "[VERIFY-PAYMENT] Fulfillment routing error:",
            routeError,
          );
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        order: buildPublicOrderSummary(order),
        supportReference,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
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

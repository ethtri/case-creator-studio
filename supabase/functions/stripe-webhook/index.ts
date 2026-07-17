import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { sendOrderEmail } from "../_shared/email.ts";
import {
  getStripeSecretKey,
  getStripeWebhookSecret,
} from "../_shared/stripe-config.ts";
import {
  buildExpiredKexiaozhanOrderUpdate,
  extractKexiaozhanOutTradeNo,
  KEXIAOZHAN_EXPIRED_HANDOFF_ERROR,
  shouldBlockExpiredKexiaozhanHandoff,
} from "../_shared/kexiaozhan-payment-guard.ts";
import {
  isMissingSupabaseRowError,
  isSnapcaseCheckoutSession,
} from "../_shared/stripe-webhook-ownership.ts";
import {
  isStripeCheckoutPaymentFulfilled,
} from "../_shared/stripe-checkout-payment.ts";
import {
  sendGa4Purchase,
  sendGa4Refund,
  sendGa4CheckoutSignal,
  type Ga4Order,
} from "../_shared/ga4-measurement.ts";

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

type OrderItem = {
  designId?: string | null;
  designPreview?: string | null;
  variantId?: string | null;
  externalProductId?: string | null;
  edmTemplateId?: number | null;
  vendorDesign?: {
    kexiaozhanPayment?: {
      outTradeNo?: string | null;
    } | null;
  } | null;
};

type KexiaozhanHandoffRecord = {
  expires_at?: unknown;
};

type OrderShippingAddress = {
  address?: string | null;
  city?: string | null;
  zip?: string | null;
  country?: string | null;
  state?: string | null;
};

const ALLOWED_STRIPE_EVENTS = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
  "refund.created",
]);

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
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const stripeSignature = req.headers.get("stripe-signature");
  if (!stripeSignature) {
    return new Response("Missing Stripe signature", { status: 400 });
  }

  let stripeSecretKey: string;
  let webhookSecret: string;
  try {
    stripeSecretKey = getStripeSecretKey("STRIPE-WEBHOOK");
    webhookSecret = getStripeWebhookSecret("STRIPE-WEBHOOK");
  } catch (error) {
    console.error("[STRIPE-WEBHOOK] Missing Stripe configuration:", error);
    return new Response("Webhook not configured", { status: 500 });
  }

  const payload = await req.text();
  const stripe = new Stripe(stripeSecretKey, {
    apiVersion: "2025-08-27.basil",
  });

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      payload,
      stripeSignature,
      webhookSecret,
    );
  } catch (error) {
    console.error("[STRIPE-WEBHOOK] Signature verification failed:", error);
    return new Response("Invalid signature", { status: 400 });
  }

  if (!ALLOWED_STRIPE_EVENTS.has(event.type)) {
    console.log(`[STRIPE-WEBHOOK] Ignoring event type: ${event.type}`);
    return new Response("Ignored", { status: 200 });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
  const ga4MeasurementId = Deno.env.get("GA4_MEASUREMENT_ID");
  const ga4ApiSecret = Deno.env.get("GA4_API_SECRET");
  const hasGa4ServerConfig = Boolean(ga4MeasurementId && ga4ApiSecret);
  let analyticsDeliveryFailed = false;

  if (event.type === "refund.created") {
    const refund = event.data.object as Stripe.Refund;
    const refundPaymentIntentId = typeof refund.payment_intent === "string"
      ? refund.payment_intent
      : refund.payment_intent?.id;

    if (!refund.id || !refundPaymentIntentId) {
      console.warn("[STRIPE-WEBHOOK] Ignoring refund without payment intent");
      return new Response("Ignored", { status: 200 });
    }

    const { data: refundOrder, error: refundOrderError } = await supabaseClient
      .from("orders")
      .select("*")
      .eq("stripe_payment_intent_id", refundPaymentIntentId)
      .maybeSingle();

    if (refundOrderError) {
      console.error(
        "[STRIPE-WEBHOOK] Failed to load refunded order:",
        refundOrderError,
      );
      return new Response("Database lookup failed", { status: 500 });
    }
    if (!refundOrder) {
      console.warn(
        "[STRIPE-WEBHOOK] Ignoring refund for unrelated payment intent:",
        refundPaymentIntentId,
      );
      return new Response("Ignored", { status: 200 });
    }

    if (
      refundOrder.analytics_consent === "granted"
    ) {
      try {
        await sendGa4Refund(
          supabaseClient,
          refundOrder as Ga4Order,
          refund.id,
          refund.amount / 100,
          ga4MeasurementId,
          ga4ApiSecret,
        );
      } catch (error) {
        console.error("[STRIPE-WEBHOOK] GA4 refund event failed:", error);
        if (hasGa4ServerConfig) {
          return new Response("Analytics delivery failed", { status: 500 });
        }
      }
    }

    return new Response("OK", { status: 200 });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  if (!session?.id) {
    console.error("[STRIPE-WEBHOOK] Missing session ID in event");
    return new Response("Missing session", { status: 400 });
  }

  if (
    event.type === "checkout.session.async_payment_failed" ||
    event.type === "checkout.session.expired"
  ) {
    const { data: checkoutOrder, error: checkoutOrderError } =
      await supabaseClient
        .from("orders")
        .select("*")
        .eq("stripe_session_id", session.id)
        .maybeSingle();

    if (checkoutOrderError) {
      console.error(
        "[STRIPE-WEBHOOK] Failed to load checkout signal order:",
        checkoutOrderError,
      );
      return new Response("Database lookup failed", { status: 500 });
    }
    if (!checkoutOrder) {
      return new Response("Ignored", { status: 200 });
    }

    if (
      checkoutOrder.analytics_consent === "granted"
    ) {
      const eventName = event.type === "checkout.session.expired"
        ? "checkout_abandoned"
        : "checkout_error";
      const errorCode = event.type === "checkout.session.expired"
        ? "checkout_session_expired"
        : "payment_declined";
      try {
        await sendGa4CheckoutSignal(
          supabaseClient,
          checkoutOrder as Ga4Order,
          event.id,
          eventName,
          errorCode,
          ga4MeasurementId,
          ga4ApiSecret,
        );
      } catch (error) {
        console.error(
          "[STRIPE-WEBHOOK] GA4 checkout signal failed:",
          error,
        );
        if (hasGa4ServerConfig) {
          return new Response("Analytics delivery failed", { status: 500 });
        }
      }
    }

    return new Response("OK", { status: 200 });
  }

  if (
    !isStripeCheckoutPaymentFulfilled({
      checkoutStatus: session.status,
      paymentStatus: session.payment_status,
      amountTotal: session.amount_total,
    })
  ) {
    console.log(
      `[STRIPE-WEBHOOK] Payment is not yet fulfilled for session: ${session.id}`,
    );
    return new Response("Payment pending", { status: 200 });
  }

  const paymentIntentId = typeof session.payment_intent === "string"
    ? session.payment_intent
    : session.payment_intent?.id;
  const shippingDetails = extractShippingDetails(session);
  const customerDetails = session.customer_details;
  const shippingAddress = shippingDetails?.address ?? null;

  const updateData: Record<string, unknown> = {
    status: "paid",
    stripe_payment_intent_id: paymentIntentId ?? null,
  };

  if (typeof session.amount_total === "number") {
    updateData.total = session.amount_total / 100;
  }

  if (typeof session.total_details?.amount_discount === "number") {
    updateData.discount_total = session.total_details.amount_discount / 100;
  }

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

  const { data: existingOrder, error: orderLookupError } = await supabaseClient
    .from("orders")
    .select("*")
    .eq("stripe_session_id", session.id)
    .single();

  if (orderLookupError || !existingOrder) {
    if (
      (!orderLookupError || isMissingSupabaseRowError(orderLookupError)) &&
      !isSnapcaseCheckoutSession(session)
    ) {
      console.warn(
        "[STRIPE-WEBHOOK] Ignoring unrelated Checkout Session:",
        session.id,
      );
      return new Response("Ignored", { status: 200 });
    }

    console.error("[STRIPE-WEBHOOK] Failed to load order:", orderLookupError);
    return new Response("Database lookup failed", { status: 500 });
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
        "[STRIPE-WEBHOOK] Failed to load Kexiaozhan handoff:",
        handoffLookupError,
      );
      return new Response("Kexiaozhan handoff lookup failed", {
        status: 500,
      });
    }

    if (
      handoff &&
      shouldBlockExpiredKexiaozhanHandoff(
        handoff as KexiaozhanHandoffRecord,
        Deno.env.get("KEXIAOZHAN_PAYMENT_NOTIFY_EXTRA_FIELDS_JSON"),
      )
    ) {
      const expiredOrderUpdate = buildExpiredKexiaozhanOrderUpdate(updateData);
      const { error: expiredOrderError } = await supabaseClient
        .from("orders")
        .update(expiredOrderUpdate)
        .eq("stripe_session_id", session.id);

      if (expiredOrderError) {
        console.error(
          "[STRIPE-WEBHOOK] Failed to block expired Kexiaozhan order:",
          expiredOrderError,
        );
        return new Response("Database update failed", { status: 500 });
      }

      const { error: expiredHandoffError } = await supabaseClient
        .from("kexiaozhan_handoffs")
        .update({
          status: "expired",
          snapcase_order_id: existingOrder.id,
          stripe_session_id: session.id,
          stripe_payment_intent_id: paymentIntentId ?? null,
          customer_email: existingOrder.customer_email ??
            customerDetails?.email ?? null,
          last_error: KEXIAOZHAN_EXPIRED_HANDOFF_ERROR,
        })
        .eq("out_trade_no", kexiaozhanOutTradeNo);

      if (expiredHandoffError) {
        console.error(
          "[STRIPE-WEBHOOK] Failed to mark expired Kexiaozhan handoff:",
          expiredHandoffError,
        );
      }

      console.warn(
        "[STRIPE-WEBHOOK] Kexiaozhan payment completed after handoff expiration; fulfillment blocked:",
        kexiaozhanOutTradeNo,
      );
      return new Response("OK", { status: 200 });
    }
  }

  const { data: order, error: updateError } = await supabaseClient
    .from("orders")
    .update(updateData)
    .eq("stripe_session_id", session.id)
    .select()
    .single();

  if (updateError) {
    console.error("[STRIPE-WEBHOOK] Failed to update order:", updateError);
    return new Response("Database update failed", { status: 500 });
  }

  if (
    order.analytics_consent === "granted"
  ) {
    try {
      await sendGa4Purchase(
        supabaseClient,
        order as Ga4Order,
        ga4MeasurementId,
        ga4ApiSecret,
      );
    } catch (error) {
      console.error("[STRIPE-WEBHOOK] GA4 purchase event failed:", error);
      analyticsDeliveryFailed = hasGa4ServerConfig;
    }
  }

  try {
    await sendOrderEmail(supabaseClient, "order_confirmed", order);
  } catch (emailError) {
    console.error(
      "[STRIPE-WEBHOOK] Failed to send confirmation email:",
      emailError,
    );
  }

  if (kexiaozhanOutTradeNo) {
    const { error: handoffUpdateError } = await supabaseClient
      .from("kexiaozhan_handoffs")
      .update({
        status: "paid",
        snapcase_order_id: order.id,
        stripe_session_id: session.id,
        stripe_payment_intent_id: paymentIntentId ?? null,
        customer_email: order.customer_email ?? customerDetails?.email ?? null,
        last_error: null,
      })
      .eq("out_trade_no", kexiaozhanOutTradeNo);

    if (handoffUpdateError) {
      console.error(
        "[STRIPE-WEBHOOK] Failed to update Kexiaozhan handoff:",
        handoffUpdateError,
      );
    }
  }

  if (order?.user_id && Array.isArray(order.items)) {
    const items = order.items as OrderItem[];
    const designRows = items
      .filter((item) =>
        item?.designId && item?.designPreview && item?.variantId
      )
      .map((item) => ({
        user_id: order.user_id,
        design_id: item.designId,
        external_product_id: item.externalProductId ?? null,
        edm_template_id: item.edmTemplateId ?? null,
        variant_id: item.variantId,
        preview_url: item.designPreview,
        source: "purchase",
        order_id: order.id,
      }));

    if (designRows.length > 0) {
      const { error: designError } = await supabaseClient
        .from("designs")
        .upsert(designRows, { onConflict: "user_id,design_id" });

      if (designError) {
        console.error(
          "[STRIPE-WEBHOOK] Failed to save purchase designs:",
          designError,
        );
      }
    }
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (order?.id && supabaseUrl && serviceRoleKey) {
    const shipping = order.shipping_address as OrderShippingAddress | null;
    const hasShipping = Boolean(
      shipping?.address &&
        shipping?.city &&
        shipping?.zip &&
        shipping?.country &&
        shipping?.state,
    );

    if (
      !order.printful_order_id &&
      (!order.fulfillment_provider || order.fulfillment_provider === "printful")
    ) {
      if (
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

      if (!hasShipping && !order.printful_status) {
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
    }

    if (!hasShipping) {
      await supabaseClient
        .from("orders")
        .update({
          fulfillment_status: "needs_shipping",
          fulfillment_last_error: "Missing shipping address",
          printful_status: "needs_shipping",
          printful_last_error: "Missing shipping address",
        })
        .eq("id", order.id);

      console.warn(
        "[STRIPE-WEBHOOK] Missing shipping address; skipping fulfillment routing.",
      );
      return analyticsDeliveryFailed
        ? new Response("Analytics delivery failed", { status: 500 })
        : new Response("OK", { status: 200 });
    }

    try {
      const submitResponse = await fetch(
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

      if (!submitResponse.ok) {
        const body = await submitResponse.text();
        console.error("[STRIPE-WEBHOOK] Fulfillment routing failed:", body);
      }
    } catch (error) {
      console.error("[STRIPE-WEBHOOK] Fulfillment routing error:", error);
    }
  }

  return analyticsDeliveryFailed
    ? new Response("Analytics delivery failed", { status: 500 })
    : new Response("OK", { status: 200 });
});

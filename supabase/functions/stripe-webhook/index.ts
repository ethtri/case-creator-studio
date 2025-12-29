import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

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
};

type OrderShippingAddress = {
  address?: string | null;
  city?: string | null;
  zip?: string | null;
  country?: string | null;
  state?: string | null;
};

const STRIPE_MODE = (Deno.env.get("STRIPE_MODE") ?? "").toLowerCase();

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

function getStripeWebhookSecret(): string | null {
  if (STRIPE_MODE === "test") {
    return (
      Deno.env.get("STRIPE_WEBHOOK_SECRET_TEST") ??
      Deno.env.get("STRIPE_WEBHOOK_SECRET") ??
      null
    );
  }
  return Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? null;
}

const extractShippingDetails = (session: Stripe.Checkout.Session): ShippingDetails | null => {
  const direct = session.shipping_details;
  if (direct?.address) {
    return direct;
  }

  const collected = session.collected_information?.shipping_details as ShippingDetails | null | undefined;
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

  const webhookSecret = getStripeWebhookSecret();
  if (!webhookSecret) {
    console.error("[STRIPE-WEBHOOK] Missing STRIPE_WEBHOOK_SECRET");
    return new Response("Webhook not configured", { status: 500 });
  }

  const payload = await req.text();
  const stripe = new Stripe(getStripeSecretKey(), {
    apiVersion: "2025-08-27.basil",
  });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, stripeSignature, webhookSecret);
  } catch (error) {
    console.error("[STRIPE-WEBHOOK] Signature verification failed:", error);
    return new Response("Invalid signature", { status: 400 });
  }

  if (event.type !== "checkout.session.completed" && event.type !== "checkout.session.async_payment_succeeded") {
    return new Response("Ignored", { status: 200 });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  if (!session?.id) {
    console.error("[STRIPE-WEBHOOK] Missing session ID in event");
    return new Response("Missing session", { status: 400 });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
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

  if (shippingAddress && (shippingAddress.line1 || shippingAddress.city || shippingAddress.postal_code)) {
    const addressLine = [shippingAddress.line1, shippingAddress.line2].filter(Boolean).join(" ");
    updateData.shipping_address = {
      address: addressLine,
      city: shippingAddress.city ?? "",
      state: shippingAddress.state ?? "",
      zip: shippingAddress.postal_code ?? "",
      country: shippingAddress.country ?? "",
    };
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

  if (order?.user_id && Array.isArray(order.items)) {
    const items = order.items as OrderItem[];
    const designRows = items
      .filter((item) => item?.designId && item?.designPreview && item?.variantId)
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
        console.error("[STRIPE-WEBHOOK] Failed to save purchase designs:", designError);
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
        shipping?.state
    );

    if (!order.printful_order_id) {
      if (hasShipping && (!order.printful_status || order.printful_status === "needs_shipping")) {
        await supabaseClient
          .from("orders")
          .update({ printful_status: "pending", printful_last_error: null })
          .eq("id", order.id);
      }

      if (!hasShipping && !order.printful_status) {
        await supabaseClient
          .from("orders")
          .update({ printful_status: "needs_shipping", printful_last_error: "Missing shipping address" })
          .eq("id", order.id);
      }
    }

    if (!hasShipping) {
      console.warn("[STRIPE-WEBHOOK] Missing shipping address; skipping Printful submission.");
      return new Response("OK", { status: 200 });
    }

    try {
      const submitResponse = await fetch(`${supabaseUrl}/functions/v1/submit-printful-order`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceRoleKey}`,
          apikey: serviceRoleKey,
        },
        body: JSON.stringify({ orderId: order.id }),
      });

      if (!submitResponse.ok) {
        const body = await submitResponse.text();
        console.error("[STRIPE-WEBHOOK] Printful submission failed:", body);
      }
    } catch (error) {
      console.error("[STRIPE-WEBHOOK] Printful submission error:", error);
    }
  }

  return new Response("OK", { status: 200 });
});

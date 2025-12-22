import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

// Allowed origins for CORS
const ALLOWED_ORIGINS = [
  "https://snapcase.ai",
  "https://www.snapcase.ai",
  "https://snapcaseappv2.vercel.app",
];

const VERCEL_PROJECT_PREFIXES = ["snapcaseappv2"];

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
  // Allow localhost for development
  const allowedOrigin = isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0];
  
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}

// Safe error messages that don't expose internal details
function getSafeErrorMessage(error: unknown): string {
  const errorMessage = error instanceof Error ? error.message : String(error);
  
  // Log full error details server-side for debugging
  console.error("[VERIFY-PAYMENT] Full error details:", {
    message: errorMessage,
    stack: error instanceof Error ? error.stack : undefined,
    timestamp: new Date().toISOString()
  });
  
  // Return safe, generic messages to client
  if (errorMessage.includes("Session ID is required")) {
    return "Session ID is required";
  }
  if (errorMessage.toLowerCase().includes("stripe")) {
    return "Payment verification error. Please try again or contact support.";
  }
  if (errorMessage.toLowerCase().includes("supabase") || errorMessage.toLowerCase().includes("database")) {
    return "Unable to verify payment. Please try again.";
  }
  
  // Default safe message for unknown errors
  return "An unexpected error occurred. Please contact support if the issue persists.";
}

// Validation schema
const verifyPaymentSchema = z.object({
  sessionId: z.string().min(1).max(500),
});

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const rawBody = await req.json();
    
    // Validate request data
    const validationResult = verifyPaymentSchema.safeParse(rawBody);
    if (!validationResult.success) {
      console.error("[VERIFY-PAYMENT] Validation error:", validationResult.error.errors);
      throw new Error("Session ID is required");
    }
    
    const { sessionId } = validationResult.data;

    console.log("[VERIFY-PAYMENT] Verifying session:", sessionId);

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    // Retrieve the checkout session
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["payment_intent"],
    });

    console.log("[VERIFY-PAYMENT] Session status:", session.payment_status);

    if (session.payment_status !== "paid") {
      return new Response(JSON.stringify({ 
        success: false, 
        message: "Payment not completed" 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Update order in database
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const paymentIntent = session.payment_intent as Stripe.PaymentIntent;

    const updateData: Record<string, unknown> = {
      status: "paid",
      stripe_payment_intent_id: paymentIntent?.id,
    };

    const shippingDetails = session.shipping_details;
    const customerDetails = session.customer_details;
    const shippingAddress = shippingDetails?.address;

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
      .eq("stripe_session_id", sessionId)
      .select()
      .single();

    if (updateError) {
      console.error("[VERIFY-PAYMENT] Error updating order:", updateError);
    } else {
      console.log("[VERIFY-PAYMENT] Order updated to paid:", order?.id);
    }

    return new Response(JSON.stringify({ 
      success: true,
      order: order,
      customerEmail: session.customer_details?.email,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: unknown) {
    const corsHeaders = getCorsHeaders(req);
    const safeMessage = getSafeErrorMessage(error);
    return new Response(JSON.stringify({ error: safeMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

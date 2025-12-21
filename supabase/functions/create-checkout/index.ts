import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

// Allowed origins for CORS
const ALLOWED_ORIGINS = [
  "https://snapcase.ai",
  "https://www.snapcase.ai",
];

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") || "";
  // Allow localhost for development
  const isLocalhost = origin.startsWith("http://localhost") || origin.startsWith("http://127.0.0.1");
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) || isLocalhost ? origin : ALLOWED_ORIGINS[0];
  
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}

// Safe error messages that don't expose internal details
function getSafeErrorMessage(error: unknown): string {
  const errorMessage = error instanceof Error ? error.message : String(error);
  
  // Log full error details server-side for debugging
  console.error("[CREATE-CHECKOUT] Full error details:", {
    message: errorMessage,
    stack: error instanceof Error ? error.stack : undefined,
    timestamp: new Date().toISOString()
  });
  
  // Return safe, generic messages to client
  if (errorMessage.includes("Customer email is required") || errorMessage.includes("email")) {
    return "Customer email is required";
  }
  if (errorMessage.includes("No items") || errorMessage.includes("items")) {
    return "Cart cannot be empty";
  }
  if (errorMessage.includes("validation") || errorMessage.includes("Invalid")) {
    return "Invalid order data. Please check your information and try again.";
  }
  if (errorMessage.toLowerCase().includes("stripe")) {
    return "Payment processing error. Please try again or contact support.";
  }
  if (errorMessage.toLowerCase().includes("supabase") || errorMessage.toLowerCase().includes("database")) {
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
  edmTemplateId: z.number().int().positive().nullable().optional(),
  designId: z.string().max(100).nullable().optional(),
});

const addressSchema = z.object({
  address: z.string().min(1).max(200),
  city: z.string().min(1).max(100),
  state: z.string().min(1).max(50),
  zip: z.string().min(1).max(20),
  country: z.string().min(1).max(50),
});

const checkoutRequestSchema = z.object({
  items: z.array(itemSchema).min(1).max(50),
  customerEmail: z.string().email().max(255),
  customerName: z.string().min(1).max(100),
  shippingAddress: addressSchema,
});

// Server-side pricing - single source of truth
const PRODUCT_PRICE = 24.99;
const SHIPPING_COST = 4.99;

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
      console.error("[CREATE-CHECKOUT] Validation error:", validationResult.error.errors);
      throw new Error("Invalid order data");
    }
    
    const { items, customerEmail, customerName, shippingAddress } = validationResult.data;

    console.log("[CREATE-CHECKOUT] Processing checkout for:", customerEmail);
    console.log("[CREATE-CHECKOUT] Items count:", items.length);

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    // Calculate totals using SERVER-SIDE pricing (ignore client prices)
    const subtotal = items.reduce((sum, item) => sum + PRODUCT_PRICE * item.quantity, 0);
    const total = subtotal + SHIPPING_COST;

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
        unit_amount: Math.round(PRODUCT_PRICE * 100), // Convert to cents - use server price
      },
      quantity: item.quantity,
    }));

    // Add shipping as a line item
    lineItems.push({
      price_data: {
        currency: "usd",
        product_data: {
          name: "Shipping",
          description: "Standard shipping (2-4 business days)",
          metadata: {
            variantId: "shipping",
          },
        },
        unit_amount: Math.round(SHIPPING_COST * 100),
      },
      quantity: 1,
    });

    // Check if customer exists
    const customers = await stripe.customers.list({ email: customerEmail, limit: 1 });
    let customerId: string | undefined;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
    }

    const origin = req.headers.get("origin") || "https://snapcase.ai";

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : customerEmail,
      line_items: lineItems,
      mode: "payment",
      success_url: `${origin}/order-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/checkout`,
      shipping_address_collection: {
        allowed_countries: ["US", "CA", "GB", "AU"],
      },
      metadata: {
        customerName,
        itemsJson: JSON.stringify(items.map(i => ({
          variantId: i.variantId,
          brand: i.brand,
          model: i.model,
          quantity: i.quantity,
          designPreview: i.designPreview,
          edmTemplateId: i.edmTemplateId ?? null,
          designId: i.designId ?? null,
        }))),
      },
    });

    // Create order record in database
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { error: orderError } = await supabaseClient.from("orders").insert({
      stripe_session_id: session.id,
      customer_email: customerEmail,
      customer_name: customerName,
      shipping_address: shippingAddress,
      items: items,
      subtotal: subtotal,
      shipping_cost: SHIPPING_COST,
      total: total,
      status: "pending",
    });

    if (orderError) {
      console.error("[CREATE-CHECKOUT] Error creating order:", orderError);
    } else {
      console.log("[CREATE-CHECKOUT] Order created successfully");
    }

    console.log("[CREATE-CHECKOUT] Checkout session created:", session.id);

    return new Response(JSON.stringify({ url: session.url, sessionId: session.id }), {
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

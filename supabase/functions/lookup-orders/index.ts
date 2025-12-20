import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

// Allowed origins for CORS
const ALLOWED_ORIGINS = [
  "https://snapcase.ai",
  "https://www.snapcase.ai",
];

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") || "";
  const isLocalhost = origin.startsWith("http://localhost") || origin.startsWith("http://127.0.0.1");
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) || isLocalhost ? origin : ALLOWED_ORIGINS[0];
  
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}

// Safe error messages
function getSafeErrorMessage(error: unknown): string {
  const errorMessage = error instanceof Error ? error.message : String(error);
  
  console.error("[LOOKUP-ORDERS] Full error details:", {
    message: errorMessage,
    stack: error instanceof Error ? error.stack : undefined,
    timestamp: new Date().toISOString()
  });
  
  if (errorMessage.includes("email")) {
    return "Please provide a valid email address";
  }
  if (errorMessage.includes("validation") || errorMessage.includes("Invalid")) {
    return "Invalid request. Please check your information.";
  }
  
  return "Unable to look up orders. Please try again.";
}

// Validation schema
const lookupRequestSchema = z.object({
  email: z.string().email().max(255).transform(e => e.toLowerCase().trim()),
});

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const rawBody = await req.json();
    
    // Validate request data
    const validationResult = lookupRequestSchema.safeParse(rawBody);
    if (!validationResult.success) {
      console.error("[LOOKUP-ORDERS] Validation error:", validationResult.error.errors);
      return new Response(JSON.stringify({ error: "Please provide a valid email address" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }
    
    const { email } = validationResult.data;

    console.log("[LOOKUP-ORDERS] Looking up orders for email:", email);

    // Use service role to query orders
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: orders, error: queryError } = await supabaseClient
      .from("orders")
      .select("id, created_at, status, printful_status, total, items, shipping_cost, subtotal")
      .eq("customer_email", email)
      .order("created_at", { ascending: false })
      .limit(50);

    if (queryError) {
      console.error("[LOOKUP-ORDERS] Database error:", queryError);
      throw new Error("Database query failed");
    }

    console.log("[LOOKUP-ORDERS] Found", orders?.length || 0, "orders for email");

    // Transform orders for client (don't expose internal IDs directly in URLs)
    const safeOrders = (orders || []).map(order => ({
      id: order.id.substring(0, 8).toUpperCase(), // Show truncated ID
      date: order.created_at,
      status: order.printful_status || order.status,
      total: order.total,
      subtotal: order.subtotal,
      shippingCost: order.shipping_cost,
      items: order.items,
    }));

    return new Response(JSON.stringify({ orders: safeOrders }), {
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

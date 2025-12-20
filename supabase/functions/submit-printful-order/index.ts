import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Printful Store ID: 17088301 (Snapcase)
const PRINTFUL_STORE_ID = "17088301";

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
  city: string;
  state_code: string;
  country_code: string;
  zip: string;
  email: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { orderId } = await req.json();

    if (!orderId) {
      throw new Error("Order ID is required");
    }

    console.log("[SUBMIT-PRINTFUL] Processing order:", orderId);

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Get order from database
    const { data: order, error: orderError } = await supabaseClient
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .single();

    if (orderError || !order) {
      throw new Error(`Order not found: ${orderError?.message}`);
    }

    if (order.status !== "paid") {
      throw new Error("Order must be paid before submitting to Printful");
    }

    if (order.printful_order_id) {
      console.log("[SUBMIT-PRINTFUL] Order already submitted to Printful");
      return new Response(JSON.stringify({ 
        success: true, 
        message: "Order already submitted",
        printfulOrderId: order.printful_order_id 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const printfulApiKey = Deno.env.get("PRINTFUL_API_KEY");
    if (!printfulApiKey) {
      throw new Error("Printful API key not configured");
    }

    // Build Printful order
    const shippingAddress = order.shipping_address as any;
    const recipient: PrintfulRecipient = {
      name: order.customer_name || "Customer",
      address1: shippingAddress?.address || "",
      city: shippingAddress?.city || "",
      state_code: shippingAddress?.state || "",
      country_code: shippingAddress?.country === "United States" ? "US" : shippingAddress?.country || "US",
      zip: shippingAddress?.zip || "",
      email: order.customer_email,
    };

    // Map cart items to Printful items
    const items = (order.items as any[]).map((item) => {
      const variantId = PRINTFUL_VARIANT_MAP[item.variantId];
      if (!variantId) {
        console.error("[SUBMIT-PRINTFUL] Unknown variant:", item.variantId);
        throw new Error(`Unknown variant ID: ${item.variantId}`);
      }
      return {
        variant_id: variantId,
        quantity: item.quantity,
        files: [
          {
            type: "default",
            url: item.designPreview,
          },
        ],
      };
    });

    console.log("[SUBMIT-PRINTFUL] Submitting to Printful store:", PRINTFUL_STORE_ID);
    console.log("[SUBMIT-PRINTFUL] Items:", JSON.stringify(items));

    // Submit to Printful API with store ID
    const printfulResponse = await fetch(`https://api.printful.com/stores/${PRINTFUL_STORE_ID}/orders`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${printfulApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        recipient,
        items,
        retail_costs: {
          subtotal: order.subtotal.toString(),
          shipping: order.shipping_cost.toString(),
          total: order.total.toString(),
        },
      }),
    });

    const printfulData = await printfulResponse.json();

    if (!printfulResponse.ok) {
      console.error("[SUBMIT-PRINTFUL] Printful API error:", printfulData);
      throw new Error(`Printful API error: ${printfulData.error?.message || JSON.stringify(printfulData)}`);
    }

    console.log("[SUBMIT-PRINTFUL] Printful order created:", printfulData.result?.id);

    // Update order with Printful info
    await supabaseClient
      .from("orders")
      .update({
        printful_order_id: printfulData.result?.id?.toString(),
        printful_status: printfulData.result?.status,
        status: "processing",
      })
      .eq("id", orderId);

    return new Response(JSON.stringify({ 
      success: true, 
      printfulOrderId: printfulData.result?.id,
      printfulStatus: printfulData.result?.status,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[SUBMIT-PRINTFUL] Error:", errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

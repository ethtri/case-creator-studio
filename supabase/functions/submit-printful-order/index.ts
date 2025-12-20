import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

interface PrintfulItem {
  variant_id: number; // Printful variant ID
  quantity: number;
  files: Array<{
    type: string;
    url: string;
  }>;
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
    // Note: You'll need to map your variant IDs to Printful product variant IDs
    const items = (order.items as any[]).map((item) => ({
      // This is a placeholder - you'll need to map your variants to Printful variant IDs
      // For example, iPhone 16 Pro Max case might be variant_id: 12345
      variant_id: getPrintfulVariantId(item.variantId),
      quantity: item.quantity,
      files: [
        {
          type: "default",
          url: item.designPreview, // The design image URL
        },
      ],
    }));

    // Submit to Printful API
    const printfulResponse = await fetch("https://api.printful.com/orders", {
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
      throw new Error(`Printful API error: ${printfulData.error?.message || "Unknown error"}`);
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

// Helper function to map your variant IDs to Printful variant IDs
// You'll need to update this with your actual Printful product variant IDs
function getPrintfulVariantId(variantId: string): number {
  // This is a placeholder mapping - you'll need to update with real Printful variant IDs
  // You can find these in your Printful dashboard under Products
  const variantMap: Record<string, number> = {
    // iPhone 16 series
    "iphone-16-pro-max": 0, // Replace with actual Printful variant ID
    "iphone-16-pro": 0,
    "iphone-16-plus": 0,
    "iphone-16": 0,
    // Add more mappings as needed
  };

  return variantMap[variantId] || 0;
}

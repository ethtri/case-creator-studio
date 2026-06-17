import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCorsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  // Handle CORS preflight requests
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const printfulApiKey = Deno.env.get("PRINTFUL_API_KEY");

    if (!printfulApiKey) {
      console.error("PRINTFUL_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Printful API key not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const { externalProductId, productId } = await req.json();

    if (!externalProductId) {
      return new Response(
        JSON.stringify({ error: "externalProductId is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    console.log(
      `Requesting EDM nonce for externalProductId: ${externalProductId}, productId: ${productId}`,
    );

    // Request nonce from Printful API
    const response = await fetch(
      "https://api.printful.com/embedded-designer/nonces",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${printfulApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          external_product_id: externalProductId,
        }),
      },
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Printful API error:", data);
      return new Response(
        JSON.stringify({
          error: data.error?.message || "Failed to get nonce from Printful",
          details: data,
        }),
        {
          status: response.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    console.log(
      "Nonce received successfully:",
      data.result?.nonce ? "yes" : "no",
    );

    const rawNonce = data.result?.nonce;
    const nonceValue = typeof rawNonce === "string"
      ? rawNonce
      : rawNonce?.nonce;
    const templateId = typeof rawNonce === "object" && rawNonce
      ? rawNonce.template_id
      : data.result?.template_id;
    const expiresAt = typeof rawNonce === "object" && rawNonce
      ? rawNonce.expires_at
      : data.result?.expires_at;

    return new Response(
      JSON.stringify({
        nonce: nonceValue,
        templateId,
        expiresAt,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    const errorMessage = error instanceof Error
      ? error.message
      : "Internal server error";
    console.error("Error in edm-nonce function:", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});

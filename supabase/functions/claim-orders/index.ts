import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

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
  const allowedOrigin = isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0];

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}

const claimSchema = z.object({
  zip: z.string().min(2).max(20).transform((value) => value.trim()),
});

type OrderItem = {
  designId?: string | null;
  designPreview?: string | null;
  variantId?: string | null;
  externalProductId?: string | null;
  edmTemplateId?: number | null;
};

const isVerifiedEmail = (user: { email_confirmed_at?: string | null; confirmed_at?: string | null; user_metadata?: Record<string, unknown> } | null) => {
  if (!user) return false;
  if (user.email_confirmed_at || user.confirmed_at) return true;
  return user.user_metadata?.email_verified === true;
};

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization") || "";

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
    return new Response(JSON.stringify({ error: "Server not configured" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }

  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 401,
    });
  }

  let payload: { zip: string };
  try {
    payload = claimSchema.parse(await req.json());
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }

  const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: authData, error: authError } = await supabaseAuth.auth.getUser();

  if (authError || !authData?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 401,
    });
  }

  if (!isVerifiedEmail(authData.user)) {
    return new Response(JSON.stringify({ error: "Email not verified" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 403,
    });
  }

  const email = authData.user.email;
  if (!email) {
    return new Response(JSON.stringify({ error: "Email required" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
  const { data: orders, error: claimError } = await supabaseAdmin
    .from("orders")
    .update({ user_id: authData.user.id })
    .eq("customer_email", email)
    .is("user_id", null)
    .eq("shipping_address->>zip", payload.zip)
    .select("id, items");

  if (claimError) {
    console.error("[CLAIM-ORDERS] Update failed:", claimError);
    return new Response(JSON.stringify({ error: "Unable to claim orders" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }

  const claimedCount = orders?.length ?? 0;

  if (claimedCount > 0) {
    const designRows = (orders || [])
      .flatMap((order) => {
        const items = Array.isArray(order.items) ? (order.items as OrderItem[]) : [];
        return items
          .filter((item) => item?.designId && item?.designPreview && item?.variantId)
          .map((item) => ({
            user_id: authData.user.id,
            design_id: item.designId,
            external_product_id: item.externalProductId ?? null,
            edm_template_id: item.edmTemplateId ?? null,
            variant_id: item.variantId,
            preview_url: item.designPreview,
            source: "purchase",
            order_id: order.id,
          }));
      });

    if (designRows.length > 0) {
      const { error: designError } = await supabaseAdmin
        .from("designs")
        .upsert(designRows, { onConflict: "user_id,design_id" });
      if (designError) {
        console.error("[CLAIM-ORDERS] Design upsert failed:", designError);
      }
    }
  }

  return new Response(JSON.stringify({ claimedCount }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status: 200,
  });
});

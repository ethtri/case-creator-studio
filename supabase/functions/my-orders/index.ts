import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

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

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
  const { data: orders, error: queryError } = await supabaseAdmin
    .from("orders")
    .select("id, created_at, status, printful_status, total, items, shipping_cost, subtotal")
    .eq("user_id", authData.user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (queryError) {
    console.error("[MY-ORDERS] Query failed:", queryError);
    return new Response(JSON.stringify({ error: "Unable to fetch orders" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }

  const orderIds = (orders || []).map((order) => order.id).filter(Boolean);
  const previewByOrderId = new Map<string, string>();

  if (orderIds.length > 0) {
    const { data: designs, error: designsError } = await supabaseAdmin
      .from("designs")
      .select("order_id, preview_url")
      .in("order_id", orderIds)
      .eq("user_id", authData.user.id);

    if (designsError) {
      console.error("[MY-ORDERS] Failed to fetch design previews:", designsError);
    } else {
      (designs || []).forEach((design) => {
        if (design?.order_id && design?.preview_url && !previewByOrderId.has(design.order_id)) {
          previewByOrderId.set(design.order_id, design.preview_url);
        }
      });
    }
  }

  const safeOrders = (orders || []).map((order) => ({
    id: order.id,
    date: order.created_at,
    status: order.printful_status || order.status,
    total: order.total,
    subtotal: order.subtotal,
    shippingCost: order.shipping_cost,
    items: order.items,
    previewUrl: previewByOrderId.get(order.id) ?? null,
  }));

  return new Response(JSON.stringify({ orders: safeOrders }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status: 200,
  });
});

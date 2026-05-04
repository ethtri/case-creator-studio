import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { getCorsHeaders } from "../_shared/cors.ts";

const isVerifiedEmail = (
  user: {
    email_confirmed_at?: string | null;
    confirmed_at?: string | null;
    user_metadata?: Record<string, unknown>;
  } | null,
) => {
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
    return new Response("Method not allowed", {
      status: 405,
      headers: corsHeaders,
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const authHeader = req.headers.get("authorization") ||
    req.headers.get("Authorization") || "";

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
  const { data: authData, error: authError } = await supabaseAuth.auth
    .getUser();

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
  const { data: designs, error: queryError } = await supabaseAdmin
    .from("designs")
    .select(
      "id, design_id, variant_id, edm_template_id, external_product_id, preview_url, preview_url_angled, source, updated_at",
    )
    .eq("user_id", authData.user.id)
    .order("updated_at", { ascending: false })
    .limit(50);

  if (queryError) {
    console.error("[LIST-DESIGNS] Query failed:", queryError);
    return new Response(JSON.stringify({ error: "Unable to fetch designs" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }

  const safeDesigns = (designs || []).map((design) => ({
    id: design.id,
    designId: design.design_id,
    variantId: design.variant_id,
    edmTemplateId: design.edm_template_id,
    externalProductId: design.external_product_id,
    previewUrl: design.preview_url,
    previewUrlAngled: design.preview_url_angled,
    source: design.source,
    updatedAt: design.updated_at,
  }));

  return new Response(JSON.stringify({ designs: safeDesigns }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status: 200,
  });
});

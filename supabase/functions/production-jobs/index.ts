import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const ALLOWED_ORIGINS = [
  "https://snapcase.ai",
  "https://www.snapcase.ai",
  "https://snapcaseappv2.vercel.app",
];

const VERCEL_PROJECT_PREFIXES = ["snapcaseappv2"];
const JOB_STATUSES = [
  "queued",
  "artwork_ready",
  "printed",
  "packed",
  "shipped",
  "failed",
] as const;

const listSchema = z.object({
  status: z.enum(JOB_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

function isAllowedOrigin(origin: string): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  if (
    origin.startsWith("http://localhost") ||
    origin.startsWith("http://127.0.0.1")
  ) return true;
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
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };
}

function getOperatorEmails(): Set<string> {
  return new Set(
    (Deno.env.get("OPERATOR_EMAILS") ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

function isVerifiedEmail(
  user: {
    email_confirmed_at?: string | null;
    confirmed_at?: string | null;
    user_metadata?: Record<string, unknown>;
  } | null,
): boolean {
  if (!user) return false;
  if (user.email_confirmed_at || user.confirmed_at) return true;
  return user.user_metadata?.email_verified === true;
}

async function requireOperator(
  req: Request,
  supabaseUrl: string,
  anonKey: string,
): Promise<{ email: string } | Response> {
  const authHeader = req.headers.get("authorization") ||
    req.headers.get("Authorization") || "";
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }

  const supabaseAuth = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: authData, error: authError } = await supabaseAuth.auth
    .getUser();

  if (authError || !authData?.user || !authData.user.email) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }

  if (!isVerifiedEmail(authData.user)) {
    return new Response(JSON.stringify({ error: "Email not verified" }), {
      status: 403,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }

  const email = authData.user.email.toLowerCase();
  if (!getOperatorEmails().has(email)) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }

  return { email };
}

async function parseListRequest(
  req: Request,
): Promise<z.infer<typeof listSchema>> {
  if (req.method === "GET") {
    const url = new URL(req.url);
    return listSchema.parse({
      status: url.searchParams.get("status") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    });
  }

  const body = await req.json().catch(() => ({}));
  return listSchema.parse(body);
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Server not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const operator = await requireOperator(req, supabaseUrl, anonKey);
  if (operator instanceof Response) return operator;

  let filters: z.infer<typeof listSchema>;
  try {
    filters = await parseListRequest(req);
  } catch (error) {
    console.error("[PRODUCTION-JOBS] Invalid request:", error);
    return new Response(JSON.stringify({ error: "Invalid request" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
  let query = supabaseAdmin
    .from("production_jobs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(filters.limit);

  if (filters.status) {
    query = query.eq("status", filters.status);
  }

  const { data: jobs, error } = await query;

  if (error) {
    console.error("[PRODUCTION-JOBS] Query failed:", error);
    return new Response(
      JSON.stringify({ error: "Unable to fetch production jobs" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const safeJobs = (jobs ?? []).map((job) => ({
    id: job.id,
    orderId: job.order_id,
    orderNumber: String(job.order_id).slice(0, 8).toUpperCase(),
    createdAt: job.created_at,
    updatedAt: job.updated_at,
    status: job.status,
    fulfillmentProvider: job.provider,
    fulfillmentStatus: job.fulfillment_status,
    customerEmail: job.customer_email,
    customerName: job.customer_name,
    total: job.total,
    items: Array.isArray(job.items) ? job.items : [],
    shippingAddress: job.shipping_address,
    trackingNumber: job.tracking_number,
    trackingCarrier: job.tracking_carrier,
    trackingUrl: job.tracking_url,
    operatorNotes: job.operator_notes,
  }));

  return new Response(JSON.stringify({ jobs: safeJobs }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
